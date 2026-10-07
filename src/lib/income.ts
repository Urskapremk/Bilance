import type { LegalForm } from "@/lib/legal-form"

export type IncomeLine = {
  aop: string
  label: string
  depth: 0 | 1 | 2 | 3
}

export const INCOME_LINES: IncomeLine[] = [
  { aop: "110", label: "A. Čisti prihodki od prodaje", depth: 0 },
  { aop: "111", label: "I. Čisti prihodki od prodaje na domačem trgu", depth: 1 },
  { aop: "112", label: "1. Čisti prihodki od prodaje proizvodov in storitev razen najemnin", depth: 2 },
  { aop: "113", label: "2. Čisti prihodki od najemnin", depth: 2 },
  { aop: "114", label: "3. Čisti prihodki od prodaje blaga in materiala", depth: 2 },
  { aop: "115", label: "II. Čisti prihodki od prodaje na trgu EU", depth: 1 },
  { aop: "116", label: "1. Čisti prihodki od prodaje proizvodov in storitev", depth: 2 },
  { aop: "117", label: "2. Čisti prihodki od prodaje blaga in materiala", depth: 2 },
  { aop: "118", label: "III. Čisti prihodki od prodaje na trgu izven EU", depth: 1 },
  { aop: "119", label: "1. Čisti prihodki od prodaje proizvodov in storitev", depth: 2 },
  { aop: "120", label: "2. Čisti prihodki od prodaje blaga in materiala", depth: 2 },
  { aop: "121", label: "B. Povečanje vrednosti zalog proizvodov in nedokončane proizvodnje", depth: 0 },
  { aop: "122", label: "C. Zmanjšanje vrednosti zalog proizvodov in nedokončane proizvodnje", depth: 0 },
  { aop: "123", label: "Č. Usredstveni lastni proizvodi in lastne storitve", depth: 0 },
  {
    aop: "124",
    label: "D. Subvencije, dotacije, regresi, kompenzacije in drugi prihodki, povezani s poslovnimi učinki",
    depth: 0,
  },
  { aop: "125", label: "E. Drugi poslovni prihodki", depth: 0 },
  { aop: "126", label: "F. Kosmati donos od poslovanja", depth: 0 },
  { aop: "127", label: "G. Poslovni odhodki", depth: 0 },
  { aop: "128", label: "I. Stroški blaga, materiala in storitev", depth: 1 },
  { aop: "129", label: "1. Nabavna vrednost prodanega blaga in materiala", depth: 2 },
  { aop: "130", label: "2. Stroški porabljenega materiala", depth: 2 },
  { aop: "131", label: "a) Stroški materiala", depth: 3 },
  { aop: "132", label: "b) Stroški energije", depth: 3 },
  { aop: "133", label: "c) Drugi stroški materiala", depth: 3 },
  { aop: "134", label: "3. Stroški storitev", depth: 2 },
  { aop: "135", label: "a) Transportne storitve", depth: 3 },
  { aop: "136", label: "b) Najemnine", depth: 3 },
  { aop: "137", label: "c) Povračila stroškov zaposlenim v zvezi z delom", depth: 3 },
  { aop: "138", label: "č) Drugi stroški storitev", depth: 3 },
  { aop: "139", label: "II. Stroški dela", depth: 1 },
  { aop: "140", label: "1. Stroški plač", depth: 2 },
  { aop: "141", label: "2. Stroški pokojninskih zavarovanj", depth: 2 },
  { aop: "142", label: "3. Stroški drugih socialnih zavarovanj", depth: 2 },
  { aop: "143", label: "4. Drugi stroški dela", depth: 2 },
  { aop: "144", label: "III. Odpisi vrednosti", depth: 1 },
  { aop: "145", label: "1. Amortizacija", depth: 2 },
  {
    aop: "146",
    label: "2. Prevrednotovalni poslovni odhodki pri neopredmetenih sredstvih in opredmetenih osnovnih sredstvih",
    depth: 2,
  },
  { aop: "147", label: "3. Prevrednotovalni poslovni odhodki pri obratnih sredstvih", depth: 2 },
  { aop: "148", label: "IV. Drugi poslovni odhodki", depth: 1 },
  { aop: "149", label: "1. Rezervacije", depth: 2 },
  { aop: "150", label: "2. Drugi stroški", depth: 2 },
  { aop: "151", label: "H. Dobiček iz poslovanja", depth: 0 },
  { aop: "152", label: "I. Izguba iz poslovanja", depth: 0 },
  { aop: "153", label: "J. Finančni prihodki", depth: 0 },
  { aop: "154", label: "Finančni prihodki od obresti (že vključeni v J.)", depth: 1 },
  { aop: "155", label: "I. Finančni prihodki iz deležev", depth: 1 },
  { aop: "160", label: "II. Finančni prihodki iz danih posojil", depth: 1 },
  { aop: "163", label: "III. Finančni prihodki iz poslovnih terjatev", depth: 1 },
  { aop: "166", label: "K. Finančni odhodki", depth: 0 },
  { aop: "167", label: "Finančni odhodki za obresti (že vključeni v K.)", depth: 1 },
  { aop: "168", label: "I. Finančni odhodki iz oslabitve in odpisov finančnih naložb", depth: 1 },
  { aop: "169", label: "II. Finančni odhodki iz finančnih obveznosti", depth: 1 },
  { aop: "170", label: "1. Finančni odhodki iz posojil, prejetih od družb v skupini", depth: 2 },
  { aop: "171", label: "2. Finančni odhodki iz posojil, prejetih od bank", depth: 2 },
  { aop: "172", label: "3. Finančni odhodki iz izdanih obveznic", depth: 2 },
  { aop: "173", label: "4. Finančni odhodki iz drugih finančnih obveznosti", depth: 2 },
  { aop: "174", label: "III. Finančni odhodki iz poslovnih obveznosti", depth: 1 },
  { aop: "175", label: "1. Finančni odhodki iz poslovnih obveznosti do družb v skupini", depth: 2 },
  { aop: "176", label: "2. Finančni odhodki iz obveznosti do dobaviteljev in meničnih obveznosti", depth: 2 },
  { aop: "177", label: "3. Finančni odhodki iz drugih poslovnih obveznosti", depth: 2 },
  { aop: "178", label: "L. Drugi prihodki", depth: 0 },
  { aop: "179", label: "I. Subvencije, dotacije in podobni prihodki, ki niso povezani s poslovnimi učinki", depth: 1 },
  { aop: "180", label: "II. Ostali prihodki", depth: 1 },
  { aop: "181", label: "M. Drugi odhodki", depth: 0 },
  { aop: "182", label: "N. Celotni dobiček", depth: 0 },
  { aop: "183", label: "O. Celotna izguba", depth: 0 },
  { aop: "184", label: "P. Davek iz dobička", depth: 0 },
  { aop: "185", label: "R. Odloženi davki", depth: 0 },
  { aop: "186", label: "S. Čisti dobiček obračunskega obdobja", depth: 0 },
  { aop: "187", label: "Š. Čista izguba obračunskega obdobja", depth: 0 },
]

type Formula = { add: string[]; sub?: string[] }

const FORMULAS: Record<string, Formula> = {
  "111": { add: ["112", "113", "114"] },
  "115": { add: ["116", "117"] },
  "118": { add: ["119", "120"] },
  "110": { add: ["111", "115", "118"] },
  "126": { add: ["110", "121", "123", "124", "125"], sub: ["122"] },
  "130": { add: ["131", "132", "133"] },
  "134": { add: ["135", "136", "137", "138"] },
  "128": { add: ["129", "130", "134"] },
  "139": { add: ["140", "141", "142", "143"] },
  "144": { add: ["145", "146", "147"] },
  "148": { add: ["149", "150"] },
  "127": { add: ["128", "139", "144", "148"] },
  "155": { add: ["156", "157", "158", "159"] },
  "160": { add: ["161", "162"] },
  "163": { add: ["164", "165"] },
  "153": { add: ["155", "160", "163"] },
  "169": { add: ["170", "171", "172", "173"] },
  "174": { add: ["175", "176", "177"] },
  "166": { add: ["168", "169", "174"] },
  "178": { add: ["179", "180"] },
}

const FORMULA_ORDER = [
  "111",
  "115",
  "118",
  "110",
  "130",
  "134",
  "128",
  "139",
  "144",
  "148",
  "127",
  "126",
  "155",
  "160",
  "163",
  "153",
  "169",
  "174",
  "166",
  "178",
]

const SP_FORMULAS: Record<string, Formula> = { ...FORMULAS, "148": { add: ["148a", "148b"] } }

const SP_LABELS: Record<string, string> = {
  "151": "H. Dobiček iz poslovanja",
  "152": "I. Izguba iz poslovanja",
  "182": "N. Podjetnikov dohodek",
  "183": "O. Negativni poslovni izid",
}

const DRUSTVO_LABELS: Record<string, string> = {
  "151": "H. Presežek poslovnih prihodkov",
  "152": "I. Presežek poslovnih odhodkov",
  "182": "N. Presežek prihodkov",
  "183": "O. Presežek odhodkov",
  "184": "P. Davek od dohodkov",
  "186": "R. Čisti presežek prihodkov",
  "187": "S. Čisti presežek odhodkov",
}

const ZAVOD_LABELS: Record<string, string> = {
  "151": "H. Presežek poslovnih prihodkov",
  "152": "I. Presežek poslovnih odhodkov",
  "182": "N. Presežek prihodkov",
  "183": "O. Presežek odhodkov",
  "186": "S. Čisti presežek prihodkov",
  "187": "Š. Čisti presežek odhodkov",
}

const incomeCache = new Map<LegalForm, IncomeLine[]>()

export function incomeLines(form: LegalForm = "doo"): IncomeLine[] {
  const hit = incomeCache.get(form)
  if (hit) return hit
  const lines = buildIncomeLines(form)
  incomeCache.set(form, lines)
  return lines
}

function buildIncomeLines(form: LegalForm): IncomeLine[] {
  if (form === "doo") return INCOME_LINES
  const drop = form === "sp" ? new Set(["149", "150", "184", "185", "186", "187"]) : form === "drustvo" ? new Set(["185"]) : new Set<string>()
  const labels = form === "sp" ? SP_LABELS : form === "drustvo" ? DRUSTVO_LABELS : ZAVOD_LABELS
  const lines: IncomeLine[] = []
  for (const line of INCOME_LINES) {
    if (drop.has(line.aop)) continue
    lines.push(labels[line.aop] ? { ...line, label: labels[line.aop] } : line)
    if (form === "sp" && line.aop === "148") {
      lines.push(
        { aop: "148a", label: "1. Prispevki za socialno varnost podjetnika", depth: 2 },
        { aop: "148b", label: "2. Ostali stroški", depth: 2 },
      )
    }
  }
  return lines
}

export function rollupIncome(leaves: Record<string, number>, form: LegalForm = "doo"): Record<string, number> {
  const values: Record<string, number> = { ...leaves }
  const formulas = form === "sp" ? SP_FORMULAS : FORMULAS
  for (const aop of FORMULA_ORDER) {
    const formula = formulas[aop]
    if (!formula) continue
    let sum = 0
    for (const id of formula.add) sum += values[id] ?? 0
    for (const id of formula.sub ?? []) sum -= values[id] ?? 0
    values[aop] = sum
  }

  const operating = (values["126"] ?? 0) - (values["127"] ?? 0)
  values["151"] = operating > 0 ? operating : 0
  values["152"] = operating < 0 ? -operating : 0

  const total =
    (values["151"] ?? 0) -
    (values["152"] ?? 0) +
    (values["153"] ?? 0) -
    (values["166"] ?? 0) +
    (values["178"] ?? 0) -
    (values["181"] ?? 0)
  values["182"] = total > 0 ? total : 0
  values["183"] = total < 0 ? -total : 0
  if (form === "sp") return values

  const deferredTax = form === "drustvo" ? 0 : (values["185"] ?? 0)
  const net = (values["182"] ?? 0) - (values["183"] ?? 0) - (values["184"] ?? 0) - deferredTax
  values["186"] = net > 0 ? net : 0
  values["187"] = net < 0 ? -net : 0
  return values
}

const INCOME_MEMO = new Set(["154", "167"])
const INCOME_RESULT = new Set(["151", "152", "182", "183", "186", "187"])
const REVENUE_AOPS = new Set([
  "112",
  "113",
  "114",
  "116",
  "117",
  "119",
  "120",
  "121",
  "123",
  "124",
  "125",
  "179",
  "180",
])

const SP_RESULT = new Set(["151", "152", "182", "183"])

function incomeFormulas(form: LegalForm): Record<string, Formula> {
  return form === "sp" ? SP_FORMULAS : FORMULAS
}

function incomeResult(form: LegalForm): Set<string> {
  return form === "sp" ? SP_RESULT : INCOME_RESULT
}

function kindOn(aop: string, form: LegalForm): "expense" | "revenue" | null {
  if (aop in incomeFormulas(form) || INCOME_MEMO.has(aop) || incomeResult(form).has(aop)) return null
  if (!incomeLines(form).some((line) => line.aop === aop)) return null
  return REVENUE_AOPS.has(aop) ? "revenue" : "expense"
}

/** List izkaza, na katerega sme pasti konto. Seštevki in že vključene postavke niso med njimi. */
export function incomeKind(aop: string, form?: LegalForm): "expense" | "revenue" | null {
  if (form) return kindOn(aop, form)
  for (const item of ["doo", "drustvo", "zavod", "sp"] as const) {
    const kind = kindOn(aop, item)
    if (kind) return kind
  }
  return null
}

/** Obresti, ki so že v odhodku, se prikažejo še na AOP 167. */
export function postsInterestMemo(aop: string, name: string): boolean {
  if (aop === "176") return true
  if (aop === "170" || aop === "171" || aop === "172") return /obrest/i.test(name)
  return false
}
