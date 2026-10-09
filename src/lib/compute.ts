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
  const text = message.toLowerCase().replace(/\s+/g, " ")
  const talksAboutBothSides = text.includes("sredstva") && text.includes("obveznosti")
  const saysTheyDiffer = text.includes("razlik") || text.includes("niso enaka") || text.includes("neusklajen")
  return (
    (talksAboutBothSides && saysTheyDiffer) ||
    text.includes("preverite konte") ||
    text.includes("razlika v bilanci") ||
    text.includes("sredstva (aop 001)") ||
    (text.includes("sredstva so ") && text.includes("obveznosti do virov so "))
  )
}

/** Na zaslonu je isti znesek, tudi če se shranjeni centi razlikujejo za drobec. */
export function sameDisplayedTotal(assets: number, sources: number): boolean {
  return formatCents(assets) === formatCents(sources)
}

/** Konto, ki ima znesek, a nima vrstice na bilanci. */
export function isUnmappedAccountWarning(message: string): boolean {
  const text = message.toLowerCase()
  return text.includes("ni v bilanci") || text.includes("nima svoje vrstice na bilanci")
}

/** Oba zneska, ki ju vidi na bilanci, in razlika med njima. */
export function balanceDifferenceSentence(assets: number, sources: number): string {
  return `Sredstva so ${formatCents(assets)} €, obveznosti do virov so ${formatCents(sources)} €. Razlikujejo se za ${formatCents(Math.abs(assets - sources))} €.`
}

/**
 * Rdeče vrstice pod bilanco.
 * Če sta prikazani vsoti enaki, stavek o razliki izgine, tudi če je ostal shranjen od prej.
 * Če se razlikujeta, stavek pove oba zneska.
 */
export function sheetWarnings(warnings: string[], assets: number, sources: number): string[] {
  const accounts = warnings.filter((warning) => isUnmappedAccountWarning(warning) && !isImbalanceWarning(warning))
  const other = warnings.filter((warning) => !isImbalanceWarning(warning) && !isUnmappedAccountWarning(warning))
  if (sameDisplayedTotal(assets, sources)) return [...other, ...accounts]
  return [balanceDifferenceSentence(assets, sources), ...accounts, ...other]
}

/** Rdeče vrstice iz tekoče bilance, ne iz shranjene razlike. */
export function warningsForSheet(warnings: string[], leaves: AmountMap, form: LegalForm = "doo"): string[] {
  const shown = rollup(leaves, form)
  return sheetWarnings(warnings, shown["001"] ?? 0, shown["055"] ?? 0)
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
  const balanced = sameDisplayedTotal(assets, equity)
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
