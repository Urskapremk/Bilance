import { chart } from "@/lib/charts"
import { incomeKind, incomeLines } from "@/lib/income"
import type { LegalForm } from "@/lib/legal-form"
import { LINE_BY_AOP, LEAF_AOPS } from "@/lib/schema"

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

export function matchFormula(code: string, formulas: AccountFormula[]): AccountFormula | undefined {
  let best: AccountFormula | undefined
  for (const formula of formulas) {
    if (!formula.code) continue
    if (code !== formula.code && !code.startsWith(formula.code)) continue
    if (!best || formula.code.length > best.code.length) best = formula
  }
  return best
}

export function canonAop(value: string): string {
  const match = /^(\d+)([a-z])?$/i.exec(value.trim())
  if (!match?.[1]) return ""
  return `${match[1].padStart(3, "0")}${match[2]?.toLowerCase() ?? ""}`
}

export function isBalanceLeaf(aop: string, form: LegalForm = "doo"): boolean {
  const spec = chart(form)
  const line = spec.lineByAop[aop]
  return Boolean(line && !(aop in spec.formulas))
}

export function isSelectableAop(aop: string, form?: LegalForm): boolean {
  if (form) return isBalanceLeaf(aop, form) || incomeKind(aop, form) !== null
  return (["doo", "drustvo", "zavod", "sp"] as const).some((item) => isSelectableAop(aop, item))
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
    const aop = canonAop(rawAop)
    if (!isSelectableAop(aop)) continue
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
    const aop = canonAop(choices[row.code] ?? "")
    if (!isSelectableAop(aop, form) || aop === row.suggested) continue
    chosen.push({ code: row.code, aop })
  }
  return normalizeFormulas([...kept, ...chosen])
}

export function choicesFor(form: LegalForm = "doo"): { bilanca: AopChoice[]; izkaz: AopChoice[] } {
  const spec = chart(form)
  return {
    bilanca: spec.leafAops.map((aop) => ({ aop, label: spec.lineByAop[aop]?.label ?? aop })),
    izkaz: incomeLines(form)
      .filter((line) => incomeKind(line.aop, form) !== null)
      .map((line) => ({ aop: line.aop, label: line.label })),
  }
}

export const AOP_CHOICES: { bilanca: AopChoice[]; izkaz: AopChoice[] } = {
  bilanca: LEAF_AOPS.map((aop) => ({ aop, label: LINE_BY_AOP[aop]?.label ?? aop })),
  izkaz: choicesFor("doo").izkaz,
}
