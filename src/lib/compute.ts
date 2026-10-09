import { chart } from "@/lib/charts"
import { formatCents } from "@/lib/format"
import type { LegalForm } from "@/lib/legal-form"
import { LEAF_AOPS } from "@/lib/schema"

export type AmountMap = Record<string, number>

export type Issue = {
  severity: "error" | "warning"
  message: string
  /** Sredstva (AOP 001) in obveznosti do virov (AOP 055) se ne ujemata. */
  imbalance?: boolean
}

/** Besedilo, ki trdi, da sredstva in viri niso enaki. */
export function isImbalanceWarning(message: string): boolean {
  return (
    message.includes("sredstva in obveznosti do virov se razlikujejo") ||
    message.includes("sredstva (AOP 001)") ||
    message.includes("Razlika v bilanci") ||
    message.includes("preverite konte, ki niso razporejeni")
  )
}

export function emptyAmounts(): AmountMap {
  return Object.fromEntries(LEAF_AOPS.map((aop) => [aop, 0]))
}

export function rollup(leaves: AmountMap, form: LegalForm = "doo"): AmountMap {
  const spec = chart(form)
  const values: AmountMap = { ...Object.fromEntries(spec.leafAops.map((aop) => [aop, 0])), ...leaves }
  for (const aop of spec.formulaOrder) {
    const formula = spec.formulas[aop]
    if (!formula) continue
    let sum = 0
    for (const id of formula.add) sum += values[id] ?? 0
    for (const id of formula.sub ?? []) sum -= values[id] ?? 0
    values[aop] = sum
  }
  return values
}

export function reviewColumn(values: AmountMap, column: string): Issue[] {
  const issues: Issue[] = []
  const assets = values["001"] ?? 0
  const equity = values["055"] ?? 0
  const balanced = assets === equity
  if (!balanced) {
    issues.push({
      severity: "error",
      imbalance: true,
      message: `${column}: sredstva in obveznosti do virov se razlikujejo za ${formatCents(Math.abs(assets - equity))} €.`,
    })
  }

  const offAssets = values["054"] ?? 0
  const offEquity = values["096"] ?? 0
  if (offAssets !== offEquity) {
    issues.push({
      severity: "error",
      message: `${column}: evidenca zunaj bilance se ne ujema. Ena stran ima ${formatCents(offAssets)} €, druga ${formatCents(offEquity)} €.`,
    })
  }

  const retainedLoss = values["069"] ?? 0
  const profit = values["070"] ?? 0
  const loss = values["071"] ?? 0
  if (profit > 0 && loss > 0) {
    issues.push({
      severity: "error",
      message: `${column}: hkrati sta vpisana dobiček tega leta in izguba tega leta.`,
    })
  } else if (!balanced && profit > 0 && retainedLoss !== 0) {
    issues.push({
      severity: "error",
      message: `${column}: hkrati sta vpisana dobiček tega leta in izguba iz prejšnjih let.`,
    })
  }

  const retainedProfit = values["068"] ?? 0
  if (retainedProfit > 0 && retainedLoss > 0) {
    issues.push({
      severity: "warning",
      message: `${column}: hkrati sta vpisana dobiček iz prejšnjih let in izguba iz prejšnjih let.`,
    })
  }

  return issues
}

export function columnHasEntries(leaves: AmountMap): boolean {
  return LEAF_AOPS.some((aop) => (leaves[aop] ?? 0) !== 0)
}
