import { matchFormula, type AccountFormula, type AccountRow, isBalanceLeaf, isSelectableAop } from "@/lib/account-map"
import { attachPublicFiling, type PublicFiling } from "@/lib/ajpes-public"
import { chart } from "@/lib/charts"
import { rollup } from "@/lib/compute"
import { incomeKind, postsInterestMemo, rollupIncome } from "@/lib/income"
import { legalFormOf, resultAops, type LegalForm } from "@/lib/legal-form"

export type Statement = {
  company: string
  period: string
  currentDate: string
  previousDate: string
  sourceName: string
  balance: {
    current: Record<string, number>
    previous: Record<string, number>
  }
  /** Javna objava AJPES za primerjalni stolpec, kadar je za družbo na voljo. */
  publicPrevious?: PublicFiling
  income: Record<string, number>
  notes: string[]
  warnings: string[]
  /** Izbrani podpis na dnu obrazca. */
  signatory?: string
  /** Pravna oblika določa shemo AJPES. */
  legalForm?: LegalForm
}

type Side = "asset" | "liability"

type Account = {
  code: string
  name: string
  openDebit: number
  openCredit: number
  turnDebit: number
  turnCredit: number
  closeDebit: number
  closeCredit: number
}

const AMOUNT = String.raw`(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`
const AMOUNT_LINE = new RegExp(`^${AMOUNT}(?:\\s+${AMOUNT}){7}$`)
const INLINE = new RegExp(`^(\\d+)\\s+(.+?)\\s+(${AMOUNT}(?:\\s+${AMOUNT}){7})$`)
const ACCOUNT_LINE = /^(\d+)\s+(.+)$/

export class TrialBalanceError extends Error {}

/** Ročni vnos tekočega leta. Seštevki se izračunajo na obrazcu; dobiček obdobja ostane povezan z bilanco. */
export function applyCurrentAmount(
  statement: Statement,
  obrazec: "bilanca" | "izkaz",
  aop: string,
  cents: number,
): Statement {
  const amount = Math.round(cents)
  if (obrazec === "bilanca") {
    const leaves = { ...statement.balance.current }
    if (amount === 0) delete leaves[aop]
    else leaves[aop] = amount
    return { ...statement, balance: { ...statement.balance, current: leaves } }
  }

  const income = { ...statement.income }
  if (amount === 0) delete income[aop]
  else income[aop] = amount
  const form = legalFormOf(statement)
  const pair = resultAops(form)
  const before = rollupIncome(statement.income, form)
  const previousResult = (before[pair.profit] ?? 0) - (before[pair.loss] ?? 0)
  const leaves = { ...statement.balance.current }
  if (form === "drustvo") {
    if ((leaves["056a"] ?? 0) === previousResult) {
      const rolled = rollupIncome(income, form)
      const result = (rolled[pair.profit] ?? 0) - (rolled[pair.loss] ?? 0)
      if (result === 0) delete leaves["056a"]
      else leaves["056a"] = result
    }
    return { ...statement, income, balance: { ...statement.balance, current: leaves } }
  }
  const linked = (leaves["070"] ?? 0) - (leaves["071"] ?? 0) === previousResult
  if (linked) {
    const rolled = rollupIncome(income, form)
    const result = (rolled[pair.profit] ?? 0) - (rolled[pair.loss] ?? 0)
    delete leaves["070"]
    delete leaves["071"]
    if (result > 0) leaves["070"] = result
    if (result < 0) leaves["071"] = -result
  }
  return { ...statement, income, balance: { ...statement.balance, current: leaves } }
}

export function buildStatement(
  text: string,
  sourceName: string,
  formulas: AccountFormula[] = [],
  form: LegalForm = "doo",
): Statement {
  const accounts = parseAccounts(text)
  if (accounts.length < 3) {
    throw new TrialBalanceError(
      "Te datoteke ne prepoznam kot bruto bilanco. Pričakovan je izpis s konti in osmimi stolpci zneskov.",
    )
  }

  const period = readPeriod(text)
  const current = column(accounts, "close", formulas, form)
  const previous = column(accounts, "open", formulas, form)
  const income = incomeLeaves(accounts, formulas, form)
  const rolledIncome = rollupIncome(income.leaves, form)
  const pair = resultAops(form)
  const result = (rolledIncome[pair.profit] ?? 0) - (rolledIncome[pair.loss] ?? 0)
  const gap = (rollup(current.leaves, form)["001"] ?? 0) - (rollup(current.leaves, form)["055"] ?? 0)

  if (form === "drustvo") {
    if (result !== 0 && gap === result) add(current.leaves, "056a", result)
  } else {
    if (result > 0 && gap === result) current.leaves["070"] = result
    if (result < 0 && gap === result) current.leaves["071"] = -result
  }

  const warnings = [...current.warnings, ...previous.warnings, ...income.warnings]
  if (gap !== 0 && gap !== result) {
    warnings.push(
      `Sredstva in obveznosti do virov se razlikujejo za ${eur(gap)} €. Preverite konte, ki niso razporejeni.`,
    )
  }

  const notes = notesFor(accounts, result !== 0 && gap === result, result > 0, form).filter((note) => {
    if (!note.includes("kontu 758")) return true
    return !accounts.some((account) => account.code.startsWith("758") && incomeOverride(account, formulas, form) !== null)
  })

  return attachPublicFiling({
    company: readCompany(text),
    period: `${pretty(period.start)}–${pretty(period.end)}`,
    currentDate: pretty(period.end),
    previousDate: pretty(previousDate(period.start)),
    sourceName,
    balance: { current: current.leaves, previous: previous.leaves },
    income: income.leaves,
    notes: [...notes, ...formulaNotes(accounts, formulas, form)],
    warnings,
    legalForm: form,
  })
}

export function accountRows(text: string, formulas: AccountFormula[] = [], form: LegalForm = "doo"): AccountRow[] {
  let accounts: Account[]
  try {
    accounts = parseAccounts(text)
  } catch {
    return []
  }
  if (accounts.length < 3) return []

  const rows = new Map<string, AccountRow>()
  for (const account of balancePostingAccounts(accounts)) {
    const field = net(account, "close") !== 0 ? "close" : "open"
    const suggested = standardAop(account, field, form) ?? class93Suggestion(account, field, form) ?? ""
    const formula = matchFormula(account.code, formulas)
    const aop = formula?.aop || suggested
    rows.set(account.code, {
      code: account.code,
      name: account.name,
      amount: displayBalance(account, field, aop || suggested, form),
      aop,
      suggested,
      obrazec: incomeKind(aop, form) ? "izkaz" : "bilanca",
      saved: Boolean(formula),
    })
  }

  for (const account of incomePostingParts(accounts)) {
    if (rows.has(account.code)) continue
    const signed = account.turnDebit - account.turnCredit
    if (signed === 0 && net(account, "close") === 0 && net(account, "open") === 0) continue
    const suggested = resolveIncome(account.code, account.name, form)?.aop ?? ""
    const formula = matchFormula(account.code, formulas)
    const aop = formula?.aop || suggested
    rows.set(account.code, {
      code: account.code,
      name: account.name,
      amount: displayIncome(account, aop || suggested, form),
      aop,
      suggested,
      obrazec: isBalanceLeaf(aop, form) && !incomeKind(aop, form) ? "bilanca" : "izkaz",
      saved: Boolean(formula),
    })
  }

  return [...rows.values()].sort((left, right) => left.code.localeCompare(right.code, "sl", { numeric: true }))
}

export function accountQuestions(text: string, formulas: AccountFormula[] = [], form: LegalForm = "doo"): AccountRow[] {
  return accountRows(text, formulas, form).filter((row) => !row.saved)
}

function column(accounts: Account[], field: "open" | "close", formulas: AccountFormula[], form: LegalForm) {
  const leaves: Record<string, number> = {}
  const warnings: string[] = []
  let retained = 0
  const relevant = accounts.filter((account) => "01239".includes(account.code[0] ?? ""))

  for (const account of balancePostings(relevant, field)) {
    const netDebit = net(account, field)
    const override = balanceOverride(account, formulas, field, form)
    if (override) {
      if (isBalanceLeaf(override, form)) postBalance(leaves, override, netDebit, form)
      continue
    }
    const root = account.code.slice(0, 3)
    if (root.length < 3) {
      if (netDebit !== 0) {
        warnings.push(`Konto ${account.code} ${account.name} ni razporejen v bilanco stanja.`)
      }
      continue
    }
    if (root.startsWith("93")) {
      retained -= netDebit
      continue
    }
    const target = balanceTarget(root, form)
    if (!target) {
      if (netDebit !== 0) warnings.push(`Konto ${account.code} ${account.name} ni razporejen v bilanco stanja.`)
      continue
    }
    if (target.side === "liability" && netDebit > 0 && root.startsWith("2")) {
      add(leaves, "051", netDebit)
      continue
    }
    if (target.aop === "059" || target.aop === "064") {
      if (netDebit > 0) add(leaves, target.aop, netDebit)
      continue
    }
    if (target.side === "liability") add(leaves, target.aop, -netDebit)
    else add(leaves, target.aop, netDebit)
  }

  for (const account of incomePostingParts(accounts)) {
    const override = incomeOverride(account, formulas, form)
    if (override && isBalanceLeaf(override, form)) postBalance(leaves, override, net(account, field), form)
  }

  if (form === "sp") {
    if (retained !== 0) add(leaves, "060b", retained)
  } else if (form === "drustvo") {
    if (retained !== 0) add(leaves, "056a", retained)
  } else if (retained > 0) add(leaves, "068", retained)
  else if (retained < 0) add(leaves, "069", -retained)

  return { leaves, warnings }
}

function balancePostings(accounts: Account[], field: "open" | "close"): Account[] {
  const roots = accounts.filter(
    (account) =>
      !accounts.some((other) => account.code.startsWith(other.code) && other.code.length < account.code.length),
  )
  return roots.flatMap((account) => partitionBalance(account, accounts, field))
}

function partitionBalance(account: Account, all: Account[], field: "open" | "close"): Account[] {
  const deeper = all.filter((other) => other.code.startsWith(account.code) && other.code.length > account.code.length)
  const immediate = deeper.filter(
    (child) =>
      !deeper.some(
        (mid) =>
          child.code.startsWith(mid.code) && mid.code.length > account.code.length && mid.code.length < child.code.length,
      ),
  )
  if (!immediate.length) return [account]
  const parent = net(account, field)
  const children = immediate.reduce((sum, child) => sum + net(child, field), 0)
  if (parent === 0 && children !== 0) return immediate.flatMap((child) => partitionBalance(child, all, field))
  if (children !== parent) return [account]
  return immediate.flatMap((child) => partitionBalance(child, all, field))
}

function incomeLeaves(accounts: Account[], formulas: AccountFormula[], form: LegalForm) {
  const leaves: Record<string, number> = {}
  const warnings: string[] = []

  for (const part of incomePostingParts(accounts)) {
    const override = incomeOverride(part, formulas, form)
    if (override) {
      if (incomeKind(override, form)) postIncome(leaves, part, override, form)
      continue
    }
    const rule = resolveIncome(part.code, part.name, form)
    const signed = part.turnDebit - part.turnCredit
    if (!rule) {
      if (signed !== 0) {
        warnings.push(`Konto ${part.code} ${part.name} ni razporejen v izkaz poslovnega izida.`)
      }
      continue
    }
    const movement = rule.kind === "expense" ? signed : -signed
    if (movement !== 0) add(leaves, rule.aop, movement)
    if (rule.interest && movement > 0) add(leaves, "167", movement)
  }

  const relevant = accounts.filter((account) => "01239".includes(account.code[0] ?? ""))
  for (const account of balancePostings(relevant, "close")) {
    const override = balanceOverride(account, formulas, "close", form)
    if (override && incomeKind(override, form)) postIncome(leaves, account, override, form)
  }

  return { leaves, warnings }
}

function incomePostingParts(accounts: Account[]): Account[] {
  const incomeAccounts = accounts.filter(
    (account) => account.code.startsWith("4") || account.code.startsWith("7"),
  )
  const roots = incomeAccounts.filter(
    (account) =>
      !incomeAccounts.some(
        (other) => account.code.startsWith(other.code) && other.code.length < account.code.length,
      ),
  )
  return roots.flatMap((account) => partition(account, accounts))
}

function balancePostingAccounts(accounts: Account[]): Account[] {
  const relevant = accounts.filter((account) => "01239".includes(account.code[0] ?? ""))
  const found = new Map<string, Account>()
  for (const field of ["close", "open"] as const) {
    for (const account of balancePostings(relevant, field)) {
      if (net(account, "open") === 0 && net(account, "close") === 0) continue
      found.set(account.code, account)
    }
  }
  return [...found.values()]
}

function balanceOverride(account: Account, formulas: AccountFormula[], field: "open" | "close", form: LegalForm): string | null {
  const formula = matchFormula(account.code, formulas)
  if (!formula || !isSelectableAop(formula.aop, form)) return null
  if (account.code.startsWith("93")) {
    const auto = class93Suggestion(account, field, form)
    if ((auto && formula.aop === auto) || formula.aop === "068" || formula.aop === "069") return null
  }
  const standard = standardAop(account, field, form)
  if (standard && formula.aop === standard) return null
  return formula.aop
}

function incomeOverride(account: Account, formulas: AccountFormula[], form: LegalForm): string | null {
  const formula = matchFormula(account.code, formulas)
  if (!formula || !isSelectableAop(formula.aop, form)) return null
  const standard = resolveIncome(account.code, account.name, form)?.aop
  if (standard && formula.aop === standard) return null
  return formula.aop
}

function standardAop(account: Account, field: "open" | "close", form: LegalForm): string | null {
  const netDebit = net(account, field)
  const root = account.code.slice(0, 3)
  if (root.length < 3 || root.startsWith("93")) return null
  const target = balanceTarget(root, form)
  if (!target) return null
  if (target.side === "liability" && netDebit > 0 && root.startsWith("2")) return "051"
  if ((target.aop === "059" || target.aop === "064") && netDebit <= 0) return null
  return target.aop
}

function class93Suggestion(account: Account, field: "open" | "close", form: LegalForm): string | null {
  if (!account.code.startsWith("93")) return null
  if (form === "sp") return "060b"
  if (form === "drustvo") return "056a"
  const netDebit = net(account, field)
  if (netDebit > 0) return "069"
  if (netDebit < 0) return "068"
  return null
}

function postBalance(leaves: Record<string, number>, aop: string, netDebit: number, form: LegalForm) {
  const line = chart(form).lineByAop[aop]
  if (!line || netDebit === 0) return
  if (line.deductible) {
    if (netDebit > 0) add(leaves, aop, netDebit)
    return
  }
  if (line.side === "viri") add(leaves, aop, -netDebit)
  else add(leaves, aop, netDebit)
}

function postIncome(leaves: Record<string, number>, account: Account, aop: string, form: LegalForm) {
  const kind = incomeKind(aop, form)
  if (!kind) return
  const turn = account.turnDebit - account.turnCredit
  const signed = turn !== 0 ? turn : net(account, "close")
  const movement = kind === "expense" ? signed : -signed
  if (movement !== 0) add(leaves, aop, movement)
  if (postsInterestMemo(aop, account.name) && movement > 0) add(leaves, "167", movement)
}

function displayBalance(account: Account, field: "open" | "close", aop: string, form: LegalForm): number {
  const netDebit = net(account, field)
  const line = chart(form).lineByAop[aop]
  if (!line) return netDebit
  if (line.deductible) return netDebit
  if (line.side === "viri") return -netDebit
  return netDebit
}

function displayIncome(account: Account, aop: string, form: LegalForm): number {
  const turn = account.turnDebit - account.turnCredit
  const signed = turn !== 0 ? turn : net(account, "close")
  return incomeKind(aop, form) === "revenue" ? -signed : signed
}

function formulaNotes(accounts: Account[], formulas: AccountFormula[], form: LegalForm): string[] {
  const notes: string[] = []
  const seen = new Set<string>()
  for (const account of balancePostingAccounts(accounts)) {
    const field = net(account, "close") !== 0 ? "close" : "open"
    const override = balanceOverride(account, formulas, field, form)
    if (!override) continue
    seen.add(account.code)
    notes.push(`Konto ${account.code} ${account.name} je po formuli stranke na AOP ${override}.`)
  }
  for (const account of incomePostingParts(accounts)) {
    if (seen.has(account.code)) continue
    const override = incomeOverride(account, formulas, form)
    if (!override) continue
    notes.push(`Konto ${account.code} ${account.name} je po formuli stranke na AOP ${override}.`)
  }
  return notes
}

function partition(account: Account, all: Account[]): Account[] {
  const deeper = all.filter((other) => other.code.startsWith(account.code) && other.code.length > account.code.length)
  const immediate = deeper.filter(
    (child) =>
      !deeper.some(
        (mid) =>
          child.code.startsWith(mid.code) && mid.code.length > account.code.length && mid.code.length < child.code.length,
      ),
  )
  if (!immediate.length) return [account]
  const parent = account.turnDebit - account.turnCredit
  const children = immediate.reduce((sum, child) => sum + child.turnDebit - child.turnCredit, 0)
  if (children !== parent) return [account]
  return immediate.flatMap((child) => partition(child, all))
}

function resolveIncome(code: string, name: string, form: LegalForm) {
  let current = code
  while (current.length >= 3) {
    const rule = incomeRule(current, name, form)
    if (rule) return rule
    current = current.slice(0, -1)
  }
  return null
}

function incomeRule(code: string, name: string, form: LegalForm): { aop: string; kind: "expense" | "revenue"; interest?: boolean } | null {
  if (code.startsWith("474")) {
    const pension = code.endsWith("001") || /8[,.]85/.test(name)
    return { aop: pension ? "141" : "142", kind: "expense" }
  }
  if (/^47[012]/.test(code)) return { aop: "140", kind: "expense" }
  if (code.startsWith("473") || /^47[5-9]/.test(code)) return { aop: "143", kind: "expense" }
  if (code.startsWith("43")) return { aop: "145", kind: "expense" }
  if (code.startsWith("44")) return { aop: "147", kind: "expense" }
  if (code.startsWith("48")) {
    if (form === "sp") {
      const social = /podjetnik/i.test(name) && /prispev|social/i.test(name)
      return { aop: social ? "148a" : "148b", kind: "expense" }
    }
    return { aop: "150", kind: "expense" }
  }
  if (code.startsWith("45")) return { aop: "176", kind: "expense", interest: true }
  if (code.startsWith("740")) return { aop: "170", kind: "expense", interest: /obrest/i.test(name) }
  if (code.startsWith("741")) return { aop: "171", kind: "expense", interest: /obrest/i.test(name) }
  if (code.startsWith("742")) return { aop: "172", kind: "expense", interest: /obrest/i.test(name) }
  if (code.startsWith("743") || code.startsWith("749")) return { aop: "173", kind: "expense" }
  if (code.startsWith("758")) return { aop: "181", kind: "expense" }
  if (code.startsWith("768")) return { aop: "124", kind: "revenue" }
  if (code.startsWith("769")) return { aop: "125", kind: "revenue" }
  if (code.startsWith("760") || code.startsWith("761")) return { aop: "112", kind: "revenue" }
  if (code.startsWith("762")) return { aop: "113", kind: "revenue" }
  if (code.startsWith("763")) return { aop: "114", kind: "revenue" }
  if (code.startsWith("787") || code.startsWith("788") || code.startsWith("789")) {
    return { aop: "180", kind: "revenue" }
  }
  if (code.startsWith("402")) return { aop: "132", kind: "expense" }
  if (code.startsWith("40")) return { aop: "131", kind: "expense" }
  if (code.startsWith("411")) return { aop: "135", kind: "expense" }
  if (code.startsWith("413")) return { aop: "136", kind: "expense" }
  if (code.startsWith("414")) return { aop: "137", kind: "expense" }
  if (code.startsWith("41")) return { aop: "138", kind: "expense" }
  return null
}

function balanceTarget(code: string, form: LegalForm = "doo"): { aop: string; side: Side } | null {
  const n = Number(code)
  if (code.startsWith("0")) {
    if (n <= 3) return { aop: "005", side: "asset" }
    if (n === 4) return { aop: "006", side: "asset" }
    if (n >= 5 && n <= 7) return { aop: "008", side: "asset" }
    if (n === 8) return { aop: "007", side: "asset" }
    if (n === 9) return { aop: "009", side: "asset" }
    if (n >= 10 && n <= 19) return { aop: "008", side: "asset" }
    if (n === 20) return { aop: "011", side: "asset" }
    if (n >= 21 && n <= 29) return { aop: "012", side: "asset" }
    if (n >= 30 && n <= 39) return { aop: "012", side: "asset" }
    if (n >= 40 && n <= 46) return { aop: "014", side: "asset" }
    if (n === 47) return { aop: "016", side: "asset" }
    if (n === 48) return { aop: "017", side: "asset" }
    if (n >= 50 && n <= 59) return { aop: "014", side: "asset" }
    if (n >= 60 && n <= 64) return { aop: "021", side: "asset" }
    if (n >= 65 && n <= 66) return { aop: "026", side: "asset" }
    if (n >= 67 && n <= 69) return { aop: "023", side: "asset" }
    if (n >= 70 && n <= 79) return { aop: "030", side: "asset" }
    if (n >= 80 && n <= 99) return { aop: "009", side: "asset" }
  }
  if (code.startsWith("1")) {
    if (n <= 119) return { aop: "052", side: "asset" }
    if (n <= 129) return { aop: "050", side: "asset" }
    if (n <= 139) return { aop: "049", side: "asset" }
    if (n <= 149) return { aop: "051", side: "asset" }
    if (n <= 154) return { aop: "044", side: "asset" }
    if (n <= 159) return { aop: "047", side: "asset" }
    if (n <= 189) return { aop: "051", side: "asset" }
    return { aop: "053", side: "asset" }
  }
  if (code.startsWith("3")) {
    if (n <= 309) return { aop: "035", side: "asset" }
    if (n <= 319) return { aop: "036", side: "asset" }
    if (n <= 329) return { aop: "037", side: "asset" }
    if (n <= 339) return { aop: "038", side: "asset" }
    return { aop: "039", side: "asset" }
  }
  if (code.startsWith("2")) {
    if (n >= 220 && n <= 221) return { aop: "093", side: "liability" }
    if (n >= 222 && n <= 229) return { aop: "092", side: "liability" }
    if (n === 270) return { aop: "088", side: "liability" }
    if (n >= 271 && n <= 274) return { aop: "089", side: "liability" }
    if (n >= 275 && n <= 279) return { aop: "090", side: "liability" }
    if (n >= 290 && n <= 299) return { aop: "095", side: "liability" }
    return { aop: "094", side: "liability" }
  }
  if (code.startsWith("9")) {
    if (form === "sp") {
      if (n <= 909) return { aop: "058", side: "liability" }
      if (n <= 919) return { aop: "060a", side: "liability" }
      if (n <= 929) return { aop: "060b", side: "liability" }
      if (n <= 949) return { aop: "067", side: "liability" }
    } else if (form === "drustvo") {
      if (n <= 929) return { aop: "056a", side: "liability" }
      if (n <= 949) return { aop: "067", side: "liability" }
    } else if (form === "zavod") {
      if (n <= 929) return { aop: "056a", side: "liability" }
      if (n <= 949) return { aop: "301", side: "liability" }
    } else {
      if (n === 902) return { aop: "059", side: "liability" }
      if (n <= 909) return { aop: "058", side: "liability" }
      if (n <= 919) return { aop: "060", side: "liability" }
      if (n === 920) return { aop: "062", side: "liability" }
      if (n === 921) return { aop: "063", side: "liability" }
      if (n === 922) return { aop: "064", side: "liability" }
      if (n === 923) return { aop: "065", side: "liability" }
      if (n <= 929) return { aop: "066", side: "liability" }
      if (n <= 949) return { aop: "067", side: "liability" }
    }
    if (n <= 959) return { aop: "073", side: "liability" }
    if (n <= 964) return { aop: "077", side: "liability" }
    if (n <= 969) return { aop: "078", side: "liability" }
    if (n <= 974) return { aop: "082", side: "liability" }
    if (n <= 979) return { aop: "083", side: "liability" }
    if (n <= 989) return { aop: "074", side: "liability" }
    return { aop: "095", side: "liability" }
  }
  return null
}

function notesFor(accounts: Account[], profitOnBalance: boolean, profit: boolean, form: LegalForm): string[] {
  const codes = new Set(accounts.filter((account) => account.code.length === 3).map((account) => account.code))
  const notes: string[] = []
  if (codes.has("040") || codes.has("045") || codes.has("050")) {
    notes.push(
      "Oprema (040) in druga opredmetena osnovna sredstva (045), zmanjšana za popravek vrednosti (050), sta na AOP 014.",
    )
  }
  if (codes.has("270")) {
    notes.push(
      "Posojila na kontu 270 so na AOP 088, ker so v kontnem načrtu vodena kot posojila družb v skupini.",
    )
  }
  if (codes.has("275") || codes.has("221")) {
    notes.push(
      "Debetni saldo konta obveznosti, na primer 275 ali odprti debetni saldo konta 221, je med terjatvami na AOP 051.",
    )
  }
  if (form === "sp" && [...codes].some((code) => code.startsWith("93"))) {
    notes.push("Preneseni znesek razreda 9 (konto 93) je pri samostojnem podjetniku na AOP 060b.")
  } else if (form === "drustvo" && [...codes].some((code) => code.startsWith("93"))) {
    notes.push("Preneseni znesek razreda 9 (konto 93) je v društvenem skladu na AOP 056a.")
  } else if (codes.has("933") && (codes.has("930") || codes.has("932"))) {
    notes.push("Izguba na kontu 933 se pokrije s prenesnim dobičkom. Na obrazcu ostane neto znesek, AOP 068 ali 069.")
  }
  if (codes.has("450")) {
    notes.push("Zamudne obresti do dobaviteljev (konto 450) so finančni odhodek AOP 176.")
  }
  if ([...accounts].some((account) => account.code.startsWith("758"))) {
    notes.push("Negativne razlike na kontu 758 so drugi odhodek AOP 181.")
  }
  if ([...accounts].some((account) => account.code.startsWith("474"))) {
    notes.push("Delodajalčevi prispevki 8,85 % so na AOP 141, preostanek na AOP 142.")
  }
  if (codes.has("264")) {
    notes.push(
      "Davek iz dobička obdobja se v izkaz vpiše le, če je knjižen med odhodki. Stanje na kontu 264 je med drugimi kratkoročnimi obveznostmi.",
    )
  }
  notes.push("Primerjalnega izkaza poslovnega izida bruto bilanca nima: razreda 4 in 7 sta na začetku obdobja zaprta.")
  if (profitOnBalance) notes.push(resultNote(form, profit))
  return notes
}

function resultNote(form: LegalForm, profit: boolean): string {
  if (form === "sp") {
    return profit
      ? "Podjetnikov dohodek tega obdobja še ni zaprt v razred 9. V bilanci stanja je na AOP 070, da se stranici ujemata."
      : "Negativni poslovni izid tega obdobja še ni zaprt v razred 9. V bilanci stanja je na AOP 071, da se stranici ujemata."
  }
  if (form === "drustvo") {
    return "Presežek tega obdobja še ni zaprt v društveni sklad. Dodan je na AOP 056a, da se stranici ujemata."
  }
  if (form === "zavod") {
    return profit
      ? "Čisti presežek prihodkov tega obdobja še ni zaprt v razred 9. V bilanci stanja je na AOP 070, da se stranici ujemata."
      : "Čisti presežek odhodkov tega obdobja še ni zaprt v razred 9. V bilanci stanja je na AOP 071, da se stranici ujemata."
  }
  return profit
    ? "Čisti dobiček tega obdobja še ni zaprt v razred 9. V bilanci stanja je na AOP 070, da se stranici ujemata."
    : "Čista izguba tega obdobja še ni zaprta v razred 9. V bilanci stanja je na AOP 071, da se stranici ujemata."
}

function parseAccounts(text: string): Account[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
  const accounts: Account[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const inline = INLINE.exec(line)
    if (inline?.[1] && inline[2] && inline[3]) {
      accounts.push(accountFrom(inline[1], inline[2], amounts(inline[3])))
      continue
    }
    const account = ACCOUNT_LINE.exec(line)
    const next = lines[index + 1] ?? ""
    if (account?.[1] && account[2] && AMOUNT_LINE.test(next)) {
      accounts.push(accountFrom(account[1], account[2], amounts(next)))
      index += 1
    }
  }

  return accounts
}

function accountFrom(code: string, name: string, values: number[]): Account {
  return {
    code,
    name: name.trim(),
    openDebit: values[0] ?? 0,
    openCredit: values[1] ?? 0,
    turnDebit: values[2] ?? 0,
    turnCredit: values[3] ?? 0,
    closeDebit: values[6] ?? 0,
    closeCredit: values[7] ?? 0,
  }
}

function amounts(line: string): number[] {
  return [...line.matchAll(new RegExp(AMOUNT, "g"))].map((match) => toCents(match[0]))
}

function toCents(raw: string): number {
  return Math.round(Number(raw.replace(/\./g, "").replace(",", ".")) * 100)
}

function net(account: Account, field: "open" | "close"): number {
  if (field === "open") return account.openDebit - account.openCredit
  return account.closeDebit - account.closeCredit
}

function add(leaves: Record<string, number>, aop: string, cents: number) {
  if (cents === 0) return
  leaves[aop] = (leaves[aop] ?? 0) + cents
}

function readCompany(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("Datum:") && !item.startsWith("Bilanca za obdobje"))
  return line || "Družba"
}

function readPeriod(text: string): { start: string; end: string } {
  const match = text.match(/Bilanca za obdobje\s+(\d{2}\.\d{2}\.\d{4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{4})/)
  if (!match?.[1] || !match[2]) {
    throw new TrialBalanceError("V bruto bilanci ni obdobja v obliki 01.01.2026-31.08.2026.")
  }
  return { start: match[1], end: match[2] }
}

function pretty(value: string): string {
  const [day, month, year] = value.split(".")
  return `${Number(day)}. ${Number(month)}. ${year}`
}

function previousDate(start: string): string {
  const [day, month, year] = start.split(".").map(Number)
  if (!day || !month || !year) return start
  if (day === 1 && month === 1) return `31.12.${year - 1}`
  const date = new Date(Date.UTC(year, month - 1, day) - 86_400_000)
  const d = String(date.getUTCDate()).padStart(2, "0")
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${d}.${m}.${date.getUTCFullYear()}`
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
