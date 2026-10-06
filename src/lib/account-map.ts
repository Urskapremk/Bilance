import { INCOME_LINES, incomeKind } from "@/lib/income"
import { isCalculated, LEAF_AOPS, LINE_BY_AOP } from "@/lib/schema"

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

export function isBalanceLeaf(aop: string): boolean {
  const line = LINE_BY_AOP[aop]
  return Boolean(line && !isCalculated(aop))
}

export function isSelectableAop(aop: string): boolean {
  return isBalanceLeaf(aop) || incomeKind(aop) !== null
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
    const aop = /^\d+$/.test(rawAop) ? rawAop.padStart(3, "0") : ""
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

export const AOP_CHOICES: { bilanca: AopChoice[]; izkaz: AopChoice[] } = {
  bilanca: LEAF_AOPS.map((aop) => ({ aop, label: LINE_BY_AOP[aop]?.label ?? aop })),
  izkaz: INCOME_LINES.filter((line) => incomeKind(line.aop) !== null).map((line) => ({
    aop: line.aop,
    label: line.label,
  })),
}
