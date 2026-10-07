import type { LegalForm } from "@/lib/legal-form"
import { FORMULA_ORDER, FORMULAS, LINES, type Formula, type LineDef } from "@/lib/schema"

export type Chart = {
  lines: LineDef[]
  formulas: Record<string, Formula>
  formulaOrder: string[]
  lineByAop: Record<string, LineDef>
  leafAops: string[]
}

const cache = new Map<LegalForm, Chart>()

export function chart(form: LegalForm = "doo"): Chart {
  const hit = cache.get(form)
  if (hit) return hit
  const built = buildChart(form)
  cache.set(form, built)
  return built
}

export function isCalculated(aop: string, form: LegalForm = "doo"): boolean {
  return aop in chart(form).formulas
}

export function descendantLeaves(aop: string, form: LegalForm = "doo"): string[] {
  const formula = chart(form).formulas[aop]
  if (!formula) return [aop]
  return [...formula.add, ...(formula.sub ?? [])].flatMap((child) => descendantLeaves(child, form))
}

function buildChart(form: LegalForm): Chart {
  if (form === "doo") return freeze(LINES, FORMULAS, FORMULA_ORDER)
  const capitalStart = LINES.findIndex((line) => line.aop === "055")
  const afterCapital = LINES.findIndex((line) => line.aop === "072")
  const lines = [...LINES.slice(0, capitalStart), ...capitalLines(form), ...LINES.slice(afterCapital)]
  const formulas = balanceFormulas(form)
  const formulaOrder = [...FORMULA_ORDER.filter((aop) => aop in formulas), ...Object.keys(formulas).filter((aop) => !FORMULA_ORDER.includes(aop))]
  return freeze(lines, formulas, formulaOrder)
}

function freeze(lines: LineDef[], formulas: Record<string, Formula>, formulaOrder: string[]): Chart {
  return {
    lines,
    formulas,
    formulaOrder,
    lineByAop: Object.fromEntries(lines.map((line) => [line.aop, line])),
    leafAops: lines.map((line) => line.aop).filter((aop) => !(aop in formulas)),
  }
}

function balanceFormulas(form: LegalForm): Record<string, Formula> {
  const formulas: Record<string, Formula> = {}
  for (const [aop, formula] of Object.entries(FORMULAS)) {
    if (aop === "056" || aop === "057" || aop === "061") continue
    formulas[aop] = formula
  }
  if (form === "sp") formulas["056"] = { add: ["058", "060a", "060b", "067", "301", "070"], sub: ["071"] }
  if (form === "drustvo") formulas["056"] = { add: ["056a", "067", "301"] }
  if (form === "zavod") formulas["056"] = { add: ["056a", "301", "068", "070"], sub: ["069", "071"] }
  return formulas
}

function capitalLines(form: LegalForm): LineDef[] {
  const total: LineDef = { aop: "055", label: "Obveznosti do virov sredstev", depth: 0, side: "viri" }
  if (form === "sp") {
    return [
      total,
      { aop: "056", label: "A. Podjetnikov kapital", depth: 1, side: "viri" },
      { aop: "058", label: "I. Začetni podjetnikov kapital", depth: 2, side: "viri" },
      { aop: "060a", label: "II. Prenosi stvarnega premoženja med opravljanjem dejavnosti", depth: 2, side: "viri" },
      {
        aop: "060b",
        label: "III. Pritoki in odtoki denarnih sredstev",
        depth: 2,
        side: "viri",
        allowNegative: true,
      },
      { aop: "067", label: "IV. Revalorizacijske rezerve", depth: 2, side: "viri" },
      {
        aop: "301",
        label: "V. Rezerve, nastale zaradi vrednotenja po pošteni vrednosti",
        depth: 2,
        side: "viri",
        allowNegative: true,
      },
      { aop: "070", label: "VI. Podjetnikov dohodek", depth: 2, side: "viri" },
      { aop: "071", label: "VII. Negativni poslovni izid", depth: 2, side: "viri", deductible: true },
    ]
  }
  if (form === "drustvo") {
    return [
      total,
      { aop: "056", label: "A. Sklad", depth: 1, side: "viri" },
      { aop: "056a", label: "I. Društveni sklad", depth: 2, side: "viri", allowNegative: true },
      { aop: "067", label: "II. Revalorizacijske rezerve", depth: 2, side: "viri" },
      {
        aop: "301",
        label: "III. Rezerve, nastale zaradi vrednotenja po pošteni vrednosti",
        depth: 2,
        side: "viri",
        allowNegative: true,
      },
    ]
  }
  return [
    total,
    { aop: "056", label: "A. Lastni viri", depth: 1, side: "viri" },
    { aop: "056a", label: "I. Ustanovitveni vložek", depth: 2, side: "viri", allowNegative: true },
    {
      aop: "301",
      label: "II. Rezerve, nastale zaradi vrednotenja po pošteni vrednosti",
      depth: 2,
      side: "viri",
      allowNegative: true,
    },
    { aop: "068", label: "III. Nerazporejeni čisti presežek prihodkov", depth: 2, side: "viri" },
    {
      aop: "069",
      label: "IV. Nerazporejeni čisti presežek odhodkov",
      depth: 2,
      side: "viri",
      deductible: true,
    },
    { aop: "070", label: "V. Čisti presežek prihodkov poslovnega leta", depth: 2, side: "viri" },
    {
      aop: "071",
      label: "VI. Čisti presežek odhodkov poslovnega leta",
      depth: 2,
      side: "viri",
      deductible: true,
    },
  ]
}
