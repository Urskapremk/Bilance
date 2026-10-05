import { FORMULA_ORDER, FORMULAS, LEAF_AOPS } from "@/lib/schema"

export type AmountMap = Record<string, number>

export type Issue = {
  severity: "error" | "warning"
  message: string
}

export function emptyAmounts(): AmountMap {
  return Object.fromEntries(LEAF_AOPS.map((aop) => [aop, 0]))
}

export function rollup(leaves: AmountMap): AmountMap {
  const values: AmountMap = { ...emptyAmounts(), ...leaves }
  for (const aop of FORMULA_ORDER) {
    const formula = FORMULAS[aop]
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
  if (assets !== equity) {
    const gap = assets - equity
    issues.push({
      severity: "error",
      message: `${column}: sredstva (AOP 001) niso enaka obveznostim do virov sredstev (AOP 055). Razlika je ${gap.toLocaleString("sl-SI")} €.`,
    })
  }

  const offAssets = values["054"] ?? 0
  const offEquity = values["096"] ?? 0
  if (offAssets !== offEquity) {
    issues.push({
      severity: "error",
      message: `${column}: zunajbilančna sredstva (AOP 054) niso enaka zunajbilančnim obveznostim (AOP 096).`,
    })
  }

  const retainedLoss = values["069"] ?? 0
  const profit = values["070"] ?? 0
  const loss = values["071"] ?? 0
  if (profit > 0 && loss > 0) {
    issues.push({
      severity: "error",
      message: `${column}: čisti dobiček (AOP 070) in čista izguba (AOP 071) ne moreta biti hkrati večja od nič.`,
    })
  } else if (profit > 0 && retainedLoss !== 0) {
    issues.push({
      severity: "error",
      message: `${column}: če je čisti dobiček poslovnega leta (AOP 070) večji od nič, mora biti prenesena čista izguba (AOP 069) enaka nič.`,
    })
  }

  const retainedProfit = values["068"] ?? 0
  if (retainedProfit > 0 && retainedLoss > 0) {
    issues.push({
      severity: "warning",
      message: `${column}: preneseni čisti dobiček (AOP 068) in prenesena čista izguba (AOP 069) sta hkrati izpolnjena. Običajno se izkaže le eden od njiju.`,
    })
  }

  return issues
}

export function columnHasEntries(leaves: AmountMap): boolean {
  return LEAF_AOPS.some((aop) => (leaves[aop] ?? 0) !== 0)
}
