import { rollup } from "@/lib/compute"
import { rollupIncome } from "@/lib/income"
import { legalFormOf } from "@/lib/legal-form"
import type { Statement } from "@/lib/trial"

function hasAmounts(map: Record<string, number> | undefined): boolean {
  return !!map && Object.values(map).some((value) => value !== 0)
}

/** Obrazec ima primerjalni stolpec, če je v njem vsaj en znesek. */
export function hasPriorYear(statement: Pick<Statement, "balance" | "previousIncome">): boolean {
  return hasAmounts(statement.balance.previous) || hasAmounts(statement.previousIncome)
}

/** Izdelan obrazec AJPES s preteklim letom ga na izkazu pokaže, dokler ga ne skrijete. */
export function defaultShowPriorYear(
  statement: Pick<Statement, "balance" | "previousIncome" | "sourceKind">,
): boolean {
  return statement.sourceKind === "ajpes" && hasPriorYear(statement)
}

export type ShownColumns = {
  showPrior: boolean
  currentBalance: Record<string, number>
  priorBalance: Record<string, number> | null
  currentIncome: Record<string, number>
  priorIncome: Record<string, number> | null
}

/**
 * Skritje preteklega leta spremeni samo prikaz.
 * Shranjeni zneski, tudi primerjalni, ostanejo na bilanci.
 */
export function shownColumns(statement: Statement, showPrior: boolean): ShownColumns {
  const form = legalFormOf(statement)
  const visible = showPrior && hasPriorYear(statement)
  return {
    showPrior: visible,
    currentBalance: rollup(statement.balance.current, form),
    priorBalance: visible ? rollup(statement.balance.previous, form) : null,
    currentIncome: rollupIncome(statement.income, form),
    priorIncome: visible ? rollupIncome(statement.previousIncome ?? {}, form) : null,
  }
}

/** Vrstica ostane, če ima znesek tekoče leto, preteklo leto ali podpostavko. */
export function rowHasAmount(
  aop: string,
  current: Record<string, number>,
  prior: Record<string, number> | null,
  leaves: readonly string[] = [],
): boolean {
  if ((current[aop] ?? 0) !== 0) return true
  if (prior && (prior[aop] ?? 0) !== 0) return true
  return leaves.some((leaf) => (current[leaf] ?? 0) !== 0 || (prior ? (prior[leaf] ?? 0) !== 0 : false))
}
