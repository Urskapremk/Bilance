import { samePeriod } from "@/lib/archive-period"
import { chart } from "@/lib/charts"
import { rollup } from "@/lib/compute"
import { parseCents, parseSloveneDate, splitPeriod } from "@/lib/format"
import { incomeCalculatedOrder, incomeLines, rollupIncome } from "@/lib/income"
import { LEGAL_FORMS, legalFormOf, type LegalForm } from "@/lib/legal-form"
import { LINES } from "@/lib/schema"
import type { Statement } from "@/lib/trial"

const BALANCE_AOPS = new Set<string>([
  ...LINES.map((line) => line.aop),
  "056a",
  "060a",
  "060b",
])

const INCOME_AOPS = new Set<string>()
for (const form of LEGAL_FORMS) {
  for (const line of incomeLines(form)) INCOME_AOPS.add(line.aop)
}

const AOP_CODE = String.raw`148a|148b|060a|060b|056a|0\d{2}|1\d{2}|301`
const AMOUNT_CENTS = String.raw`(?:\(\s*)?-?(?:\d{1,3}(?:[.\u00a0 ]\d{3})+|\d+),\d{2}(?:\s*\))?`
const AMOUNT_WHOLE = String.raw`-?(?:\d{1,3}(?:[.\u00a0 ]\d{3})+|\d+)`

type RawRow = {
  aop: string
  current: number
  /** Null pomeni, da vrstica nima primerjalnega stolpca. */
  previous: number | null
}

export class AjpesFormError extends Error {}

export type AjpesParse = {
  balance: RawRow[]
  income: RawRow[]
}

/**
 * Naložitev izdelanega obrazca ne sme prepisati že shranjenega obdobja.
 * Obrazec AJPES, ki je že odprt, sme dobiti še drugi obrazec istega obdobja.
 */
export function ajpesUploadBlocked(
  statement: { company: string; period: string; sourceKind?: string },
  saved: { company: string; period: string }[],
  phase: "primer" | "osnutek" | "arhiv",
): boolean {
  if (statement.sourceKind === "ajpes") return false
  if (phase === "arhiv") return true
  return saved.some((item) => samePeriod(item, statement))
}

export function parseAjpesText(text: string): AjpesParse {
  const source = text.replace(/\u00a0/g, " ").replace(/\u2212/g, "-")
  if (!/bilanc|izkaz|poslovn|\bAOP\b/i.test(source)) {
    throw new AjpesFormError(
      "Te datoteke ne prepoznam kot izdelan obrazec AJPES. Naložite bilanco stanja in izkaz poslovnega izida z oznakami AOP in zneski.",
    )
  }

  const currentFirst = columnCurrentFirst(source)
  const balance = new Map<string, RawRow>()
  const income = new Map<string, RawRow>()

  for (const line of source.split(/\n/)) {
    const rows = rowsOnLine(line, currentFirst)
    for (const row of rows) {
      if (BALANCE_AOPS.has(row.aop)) balance.set(row.aop, row)
      else if (INCOME_AOPS.has(row.aop)) income.set(row.aop, row)
    }
  }

  if (balance.size + income.size < 3) {
    throw new AjpesFormError(
      "Te datoteke ne prepoznam kot izdelan obrazec AJPES. Naložite bilanco stanja in izkaz poslovnega izida z oznakami AOP in zneski.",
    )
  }

  return { balance: [...balance.values()], income: [...income.values()] }
}

/** Zneski gredo v odprto bilanco. Od in Do, ki sta že vpisana, ostaneta. */
export function applyAjpesText(base: Statement, text: string, sourceName: string): Statement {
  const parsed = parseAjpesText(text)
  const form = legalFormOf(base)
  const typed = splitPeriod(base.period)
  const read = typed ? null : periodFromText(text)

  const balance = parsed.balance.length
    ? {
        current: projectBalance(reported(parsed.balance, "current"), form),
        previous: parsed.balance.some((row) => row.previous !== null)
          ? projectBalance(reported(parsed.balance, "previous"), form)
          : {},
      }
    : base.balance

  const income = parsed.income.length ? projectIncome(reported(parsed.income, "current"), form) : base.income
  const previousIncome = parsed.income.length
    ? parsed.income.some((row) => row.previous !== null)
      ? projectIncome(reported(parsed.income, "previous"), form)
      : undefined
    : base.previousIncome

  const balancePresent = parsed.balance.length > 0 || hasAmounts(balance.current) || hasAmounts(balance.previous)
  const incomePresent = parsed.income.length > 0 || hasAmounts(income) || hasAmounts(previousIncome)
  const hasPrevious =
    parsed.balance.some((row) => row.previous !== null) ||
    parsed.income.some((row) => row.previous !== null) ||
    (parsed.balance.length === 0 && hasAmounts(balance.previous)) ||
    (parsed.income.length === 0 && hasAmounts(previousIncome))

  const notes = ["Zneski so prebrani iz izdelanega obrazca AJPES."]
  if (balancePresent && !incomePresent) {
    notes.push("Naložena je bilanca stanja. Izkaz poslovnega izida dodate z istim gumbom.")
  }
  if (incomePresent && !balancePresent) {
    notes.push("Naložen je izkaz poslovnega izida. Bilanco stanja dodate z istim gumbom.")
  }
  if (hasPrevious) notes.push("Primerjalni stolpec je prebran iz obrazca.")

  const next: Statement = {
    company: base.company,
    period: typed ? base.period : read ? `${read.start}–${read.end}` : base.period,
    currentDate: typed ? base.currentDate : read?.end || base.currentDate,
    previousDate: base.previousDate,
    sourceName: sourceName || base.sourceName,
    sourceKind: "ajpes",
    balance,
    income,
    notes,
    warnings: [],
    signatory: base.signatory,
    subtitle: base.subtitle,
    legalForm: base.legalForm,
    ekartica: base.ekartica,
    davcni: base.davcni,
  }
  if (previousIncome && hasAmounts(previousIncome)) next.previousIncome = previousIncome
  return next
}

function hasAmounts(map: Record<string, number> | undefined): boolean {
  return !!map && Object.values(map).some((value) => value !== 0)
}

function reported(rows: RawRow[], column: "current" | "previous"): Record<string, number> {
  const amounts: Record<string, number> = {}
  for (const row of rows) {
    const value = column === "current" ? row.current : row.previous
    if (value === null) continue
    amounts[row.aop] = value
  }
  return amounts
}

/**
 * Na obrazcu se pokaže vsota podpostavk. Če vpišemo še seštevek z obrazca, se znesek podvoji.
 * Zato shranimo liste. Seštevek z obrazca shranimo samo, kadar ga podpostavke ne dajo.
 */
function projectAmounts(
  amounts: Record<string, number>,
  calculated: string[],
  roll: (leaves: Record<string, number>) => Record<string, number>,
): Record<string, number> {
  const skip = new Set(calculated)
  const leaves: Record<string, number> = {}
  for (const [aop, value] of Object.entries(amounts)) {
    if (skip.has(aop) || value === 0) continue
    leaves[aop] = value
  }
  for (const aop of calculated) {
    if (!(aop in amounts)) continue
    const residual = amounts[aop] - (roll(leaves)[aop] ?? 0)
    if (residual !== 0) leaves[aop] = residual
  }
  return leaves
}

function projectBalance(amounts: Record<string, number>, form: LegalForm): Record<string, number> {
  const spec = chart(form)
  return projectAmounts(amounts, spec.formulaOrder, (leaves) => rollup(leaves, form))
}

function projectIncome(amounts: Record<string, number>, form: LegalForm): Record<string, number> {
  return projectAmounts(amounts, incomeCalculatedOrder(), (leaves) => rollupIncome(leaves, form))
}

/**
 * Na obrazcu je levi znesek tekoče leto, desni prejšnje.
 * Pojasnila pred obrazcem omenijo preteklo leto, še preden pride glava.
 * Zato gleda samo vrstico, kjer sta oba stolpca drug ob drugem.
 */
function columnCurrentFirst(text: string): boolean {
  const currentRe = /tekoč\p{L}*\s+let\p{L}*/u
  const previousRe = /(?:prejšnj|pretekl)\p{L}*\s+let\p{L}*/u
  for (const line of text.split(/\n/)) {
    const lower = line.toLocaleLowerCase("sl")
    const current = currentRe.exec(lower)
    const previous = previousRe.exec(lower)
    if (!current || !previous) continue
    if (Math.abs(current.index - previous.index) > 80) continue
    return current.index < previous.index
  }
  return true
}

function periodFromText(text: string): { start: string; end: string } | null {
  const from = text.match(/obdobje\s+poročanja\s+od:\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)
  const to = text.match(/obdobje\s+poročanja\s+do:\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)
  if (from?.[1] && to?.[1]) {
    const start = parseSloveneDate(from[1])
    const end = parseSloveneDate(to[1])
    if (start && end) return { start, end }
  }
  const onDay = text.match(/na\s+dan\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i)
  const end = onDay?.[1] ? parseSloveneDate(onDay[1]) : null
  if (!end) return null
  const year = end.match(/(\d{4})$/)?.[1]
  if (!year) return null
  return { start: `1. 1. ${year}`, end }
}

function rowsOnLine(line: string, currentFirst: boolean): RawRow[] {
  const trimmed = line.trim()
  if (!trimmed) return []
  const cents = /,\d{2}/.test(trimmed)
  const amount = cents ? AMOUNT_CENTS : AMOUNT_WHOLE
  const direct = directRows(trimmed, amount, currentFirst)
  if (direct.length) return direct
  return startRow(trimmed, amount, currentFirst)
}

function directRows(line: string, amount: string, currentFirst: boolean): RawRow[] {
  const re = new RegExp(`(?<![\\dA-Za-z])(${AOP_CODE})\\s+(${amount})(?:\\s+(${amount}))?(?![\\d])`, "gi")
  const rows: RawRow[] = []
  for (const match of line.matchAll(re)) {
    const row = rowFrom(match[1] ?? "", [match[2], match[3]], currentFirst)
    if (row) rows.push(row)
  }
  return rows
}

function startRow(line: string, amount: string, currentFirst: boolean): RawRow[] {
  const start = line.match(new RegExp(`^(?:AOP\\s+)?(${AOP_CODE})\\b`, "i"))
  if (!start?.[1]) return []
  // »078, del 150« je seznam kontov iz dodatnih podatkov, ne vrstica obrazca.
  if (/^\d{3}[a-z]?\s*,/i.test(line)) return []
  const rest = line.slice(start[0].length)
  const trailing = rest.match(new RegExp(`(${amount})(?:\\s+(${amount}))?\\s*$`, "i"))
  if (!trailing?.[1] || trailing.index === undefined) return []
  const before = rest.slice(0, trailing.index).trimEnd()
  // Znesek pripada oznaki, ki stoji tik pred njim, na primer 302, ne začetni 002.
  if (/(?:^|\s)\d{3}[a-z]?\s*$/i.test(before)) return []
  const row = rowFrom(start[1], [trailing[1], trailing[2]], currentFirst)
  return row ? [row] : []
}

function rowFrom(rawAop: string, rawAmounts: (string | undefined)[], currentFirst: boolean): RawRow | null {
  const aop = rawAop.replace(/[A-Za-z]$/u, (letter) => letter.toLowerCase())
  if (!BALANCE_AOPS.has(aop) && !INCOME_AOPS.has(aop)) return null
  const amounts = rawAmounts.filter((item): item is string => Boolean(item)).map(toCents)
  if (!amounts.length || amounts.some((item) => item === null)) return null
  const values = amounts as number[]
  if (values.length === 1 || currentFirst) {
    return { aop, current: values[0] ?? 0, previous: values.length > 1 ? (values[1] ?? 0) : null }
  }
  return { aop, current: values[1] ?? 0, previous: values[0] ?? 0 }
}

function toCents(raw: string): number | null {
  const trimmed = raw.trim()
  const paren = trimmed.startsWith("(")
  const cleaned = trimmed.replace(/[()]/g, "")
  const cents = parseCents(cleaned, true)
  if (cents === null) return null
  return paren ? -Math.abs(cents) : cents
}
