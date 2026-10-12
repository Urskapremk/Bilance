import { chart } from "@/lib/charts"
import { incomeLines } from "@/lib/income"
import { LEGAL_FORMS, type LegalForm } from "@/lib/legal-form"

export type AccountFormula = {
  code: string
  aop: string
}

export type AccountObrazec = "bilanca" | "izkaz"

export type AccountRow = {
  code: string
  name: string
  /** Znesek v centih, ki pade na izbrani AOP. */
  amount: number
  /** Shranjena formula ali predlog, če formula še ni shranjena. */
  aop: string
  suggested: string
  obrazec: AccountObrazec
  saved: boolean
}

export type AopChoice = {
  aop: string
  label: string
}

/** Iskanje v oknu »Kam gre konto?«. Šifra, naziv ali AOP. Krajša šifra najde tudi analitične konte. */
export function filterAccountRows<T extends { code: string; name: string; aop?: string }>(
  rows: T[],
  query: string,
  choices?: Record<string, string>,
): T[] {
  const needle = query.trim().toLocaleLowerCase("sl")
  if (!needle) return rows
  return rows.filter((row) => {
    const code = row.code.toLocaleLowerCase("sl")
    const name = row.name.toLocaleLowerCase("sl")
    const aop = (choices?.[row.code] ?? row.aop ?? "").toLocaleLowerCase("sl")
    return code.includes(needle) || name.includes(needle) || aop.includes(needle)
  })
}

export function matchFormula(code: string, formulas: AccountFormula[]): AccountFormula | undefined {
  let best: AccountFormula | undefined
  for (const formula of formulas) {
    if (!formula.code) continue
    if (code !== formula.code && !code.startsWith(formula.code)) continue
    if (!best || formula.code.length > best.code.length) best = formula
  }
  return best
}

/** Konto se ne vpiše na nobeno postavko obrazca. */
export const NIKAMOR = "nikamor"

export function isNikamor(value: string): boolean {
  const text = value.trim().toLocaleLowerCase("sl").replace(/\s+/g, " ")
  return text === NIKAMOR || text === "ne vpiši nikamor" || text === "ne vpisi nikamor"
}

export function canonAop(value: string): string {
  const match = /^(\d+)([a-z])?$/i.exec(value.trim())
  if (!match?.[1]) return ""
  return `${match[1].padStart(3, "0")}${match[2]?.toLowerCase() ?? ""}`
}

export function isBalanceLeaf(aop: string, form: LegalForm = "doo"): boolean {
  const canon = canonAop(aop)
  const spec = chart(form)
  const line = spec.lineByAop[canon]
  return Boolean(line && !(canon in spec.formulas))
}

/** Postavka je na bilanci te pravne oblike, tudi če je seštevek podpostavk. */
export function isBalanceLine(aop: string, form: LegalForm = "doo"): boolean {
  const canon = canonAop(aop)
  return Boolean(canon && chart(form).lineByAop[canon])
}

function lineOnForm(aop: string, form: LegalForm): boolean {
  return isBalanceLine(aop, form) || incomeLines(form).some((line) => line.aop === aop)
}

/**
 * Vsaka oznaka, ki je na obrazcu te pravne oblike.
 * Seštevki, na primer AOP 004, so veljavni. Oznaka, ki je ni na obrazcu, ni.
 */
export function isSelectableAop(aop: string, form?: LegalForm): boolean {
  const canon = canonAop(aop)
  if (!canon) return false
  if (form) return lineOnForm(canon, form)
  return LEGAL_FORMS.some((item) => lineOnForm(canon, item))
}

export function normalizeFormulas(input: unknown): AccountFormula[] {
  if (!Array.isArray(input)) return []
  const out: AccountFormula[] = []
  for (const item of input) {
    if (!item || typeof item !== "object") continue
    const record = item as { code?: unknown; aop?: unknown }
    const code = typeof record.code === "string" ? record.code.trim() : ""
    const rawAop = typeof record.aop === "string" ? record.aop.trim() : ""
    if (!/^\d{3,12}$/.test(code)) continue
    const aop = isNikamor(rawAop) ? NIKAMOR : canonAop(rawAop)
    if (aop !== NIKAMOR && !isSelectableAop(aop)) continue
    const next = { code, aop }
    const index = out.findIndex((formula) => formula.code === code)
    if (index >= 0) out[index] = next
    else out.push(next)
  }
  return out
}

export function mergeFormulas(saved: AccountFormula[], incoming: AccountFormula[]): AccountFormula[] {
  return normalizeFormulas([...saved, ...incoming])
}

/** Celoten zemljevid po popravku v oknu formul. Konti v vrsticah zamenjajo prejšnji vnos. */
export function formulasForEditor(
  stored: AccountFormula[],
  rows: AccountRow[],
  choices: Record<string, string>,
  form: LegalForm = "doo",
): AccountFormula[] {
  const touched = new Set(rows.map((row) => row.code))
  const kept = stored.filter((formula) => !touched.has(formula.code))
  const chosen: AccountFormula[] = []
  for (const row of rows) {
    const raw = choices[row.code] ?? ""
    if (isNikamor(raw)) {
      if (row.suggested !== NIKAMOR) chosen.push({ code: row.code, aop: NIKAMOR })
      continue
    }
    const aop = canonAop(raw)
    if (!isSelectableAop(aop, form) || aop === row.suggested) continue
    chosen.push({ code: row.code, aop })
  }
  return normalizeFormulas([...kept, ...chosen])
}

export function choicesFor(form: LegalForm = "doo"): { bilanca: AopChoice[]; izkaz: AopChoice[] } {
  const spec = chart(form)
  return {
    bilanca: spec.lines.map((line) => ({ aop: line.aop, label: line.label })),
    izkaz: incomeLines(form).map((line) => ({ aop: line.aop, label: line.label })),
  }
}

export const AOP_CHOICES: { bilanca: AopChoice[]; izkaz: AopChoice[] } = choicesFor("doo")
