/**
 * Poenoteni obrazec bilance stanja za gospodarske družbe.
 * Oznake AOP in členitev: struktura letnih poročil AJPES za leto 2025
 * (šifrant bilance stanja, AOP 001–096 in AOP 301).
 * Seštevki za gospodarske družbe so usklajeni z obrazcem, na katerega
 * se sklicuje tudi četrtletno poročanje (001 = 002 + 032 + 053,
 * 055 = 056 + 072 + 075 + 085 + 095, 096 = 054).
 */

export type Side = "sredstva" | "viri"

export type LineDef = {
  aop: string
  label: string
  depth: 0 | 1 | 2 | 3 | 4
  side: Side
  /** Vpisuje se kot pozitivni znesek in se v nadrejeni postavki odšteje. */
  deductible?: boolean
  /** AJPES pri AOP 301 izrecno dopušča negativen znesek. */
  allowNegative?: boolean
  /** Ni del vsote sredstev oziroma obveznosti do virov sredstev. */
  offBalance?: boolean
}

export type Formula = {
  add: string[]
  sub?: string[]
}

export const LINES: LineDef[] = [
  { aop: "001", label: "Sredstva", depth: 0, side: "sredstva" },
  { aop: "002", label: "A. Dolgoročna sredstva", depth: 1, side: "sredstva" },
  {
    aop: "003",
    label: "I. Neopredmetena sredstva in dolgoročne aktivne časovne razmejitve",
    depth: 2,
    side: "sredstva",
  },
  { aop: "004", label: "1. Neopredmetena sredstva", depth: 3, side: "sredstva" },
  { aop: "005", label: "a) Dolgoročne premoženjske pravice", depth: 4, side: "sredstva" },
  { aop: "006", label: "b) Dobro ime", depth: 4, side: "sredstva" },
  { aop: "007", label: "c) Dolgoročno odloženi stroški razvijanja", depth: 4, side: "sredstva" },
  { aop: "008", label: "č) Druga neopredmetena sredstva", depth: 4, side: "sredstva" },
  { aop: "009", label: "2. Dolgoročne aktivne časovne razmejitve", depth: 3, side: "sredstva" },
  { aop: "010", label: "II. Opredmetena osnovna sredstva", depth: 2, side: "sredstva" },
  { aop: "011", label: "1. Zemljišča", depth: 3, side: "sredstva" },
  { aop: "012", label: "2. Zgradbe", depth: 3, side: "sredstva" },
  { aop: "013", label: "3. Proizvajalne naprave in stroji", depth: 3, side: "sredstva" },
  {
    aop: "014",
    label: "4. Druge naprave in oprema, drobni inventar in druga opredmetena osnovna sredstva",
    depth: 3,
    side: "sredstva",
  },
  { aop: "015", label: "5. Biološka sredstva", depth: 3, side: "sredstva" },
  { aop: "016", label: "6. Opredmetena osnovna sredstva v gradnji in izdelavi", depth: 3, side: "sredstva" },
  { aop: "017", label: "7. Predujmi za pridobitev opredmetenih osnovnih sredstev", depth: 3, side: "sredstva" },
  { aop: "018", label: "III. Naložbene nepremičnine", depth: 2, side: "sredstva" },
  { aop: "019", label: "IV. Dolgoročne finančne naložbe", depth: 2, side: "sredstva" },
  { aop: "020", label: "1. Dolgoročne finančne naložbe, razen posojil", depth: 3, side: "sredstva" },
  { aop: "021", label: "a) Delnice in deleži v družbah v skupini", depth: 4, side: "sredstva" },
  { aop: "022", label: "b) Druge delnice in deleži", depth: 4, side: "sredstva" },
  { aop: "023", label: "c) Druge dolgoročne finančne naložbe", depth: 4, side: "sredstva" },
  { aop: "024", label: "2. Dolgoročna posojila", depth: 3, side: "sredstva" },
  { aop: "025", label: "a) Dolgoročna posojila družbam v skupini", depth: 4, side: "sredstva" },
  { aop: "026", label: "b) Druga dolgoročna posojila", depth: 4, side: "sredstva" },
  { aop: "027", label: "V. Dolgoročne poslovne terjatve", depth: 2, side: "sredstva" },
  { aop: "028", label: "1. Dolgoročne poslovne terjatve do družb v skupini", depth: 3, side: "sredstva" },
  { aop: "029", label: "2. Dolgoročne poslovne terjatve do kupcev", depth: 3, side: "sredstva" },
  { aop: "030", label: "3. Dolgoročne poslovne terjatve do drugih", depth: 3, side: "sredstva" },
  { aop: "031", label: "VI. Odložene terjatve za davek", depth: 2, side: "sredstva" },
  { aop: "032", label: "B. Kratkoročna sredstva", depth: 1, side: "sredstva" },
  { aop: "033", label: "I. Sredstva (skupine za odtujitev) za prodajo", depth: 2, side: "sredstva" },
  { aop: "034", label: "II. Zaloge", depth: 2, side: "sredstva" },
  { aop: "035", label: "1. Material", depth: 3, side: "sredstva" },
  { aop: "036", label: "2. Nedokončana proizvodnja", depth: 3, side: "sredstva" },
  { aop: "037", label: "3. Proizvodi", depth: 3, side: "sredstva" },
  { aop: "038", label: "4. Trgovsko blago", depth: 3, side: "sredstva" },
  { aop: "039", label: "5. Predujmi za zaloge", depth: 3, side: "sredstva" },
  { aop: "040", label: "III. Kratkoročne finančne naložbe", depth: 2, side: "sredstva" },
  { aop: "041", label: "1. Kratkoročne finančne naložbe, razen posojil", depth: 3, side: "sredstva" },
  { aop: "042", label: "a) Delnice in deleži v družbah v skupini", depth: 4, side: "sredstva" },
  { aop: "043", label: "b) Druge delnice in deleži", depth: 4, side: "sredstva" },
  { aop: "044", label: "c) Druge kratkoročne finančne naložbe", depth: 4, side: "sredstva" },
  { aop: "045", label: "2. Kratkoročna posojila", depth: 3, side: "sredstva" },
  { aop: "046", label: "a) Kratkoročna posojila družbam v skupini", depth: 4, side: "sredstva" },
  { aop: "047", label: "b) Druga kratkoročna posojila", depth: 4, side: "sredstva" },
  { aop: "048", label: "IV. Kratkoročne poslovne terjatve", depth: 2, side: "sredstva" },
  { aop: "049", label: "1. Kratkoročne poslovne terjatve do družb v skupini", depth: 3, side: "sredstva" },
  { aop: "050", label: "2. Kratkoročne poslovne terjatve do kupcev", depth: 3, side: "sredstva" },
  { aop: "051", label: "3. Kratkoročne poslovne terjatve do drugih", depth: 3, side: "sredstva" },
  { aop: "052", label: "V. Denarna sredstva", depth: 2, side: "sredstva" },
  { aop: "053", label: "C. Kratkoročne aktivne časovne razmejitve", depth: 1, side: "sredstva" },
  {
    aop: "054",
    label: "Zunajbilančna sredstva",
    depth: 1,
    side: "sredstva",
    offBalance: true,
  },
  { aop: "055", label: "Obveznosti do virov sredstev", depth: 0, side: "viri" },
  { aop: "056", label: "A. Kapital", depth: 1, side: "viri" },
  { aop: "057", label: "I. Vpoklicani kapital", depth: 2, side: "viri" },
  { aop: "058", label: "1. Osnovni kapital", depth: 3, side: "viri" },
  {
    aop: "059",
    label: "2. Nevpoklicani kapital (kot odbitna postavka)",
    depth: 3,
    side: "viri",
    deductible: true,
  },
  { aop: "060", label: "II. Kapitalske rezerve", depth: 2, side: "viri" },
  { aop: "061", label: "III. Rezerve iz dobička", depth: 2, side: "viri" },
  { aop: "062", label: "1. Zakonske rezerve", depth: 3, side: "viri" },
  {
    aop: "063",
    label: "2. Rezerve za lastne delnice in lastne poslovne deleže",
    depth: 3,
    side: "viri",
  },
  {
    aop: "064",
    label: "3. Lastne delnice in lastni poslovni deleži (kot odbitna postavka)",
    depth: 3,
    side: "viri",
    deductible: true,
  },
  { aop: "065", label: "4. Statutarne rezerve", depth: 3, side: "viri" },
  { aop: "066", label: "5. Druge rezerve iz dobička", depth: 3, side: "viri" },
  { aop: "067", label: "IV. Revalorizacijske rezerve", depth: 2, side: "viri" },
  {
    aop: "301",
    label: "V. Rezerve, nastale zaradi vrednotenja po pošteni vrednosti",
    depth: 2,
    side: "viri",
    allowNegative: true,
  },
  { aop: "068", label: "VI. Preneseni čisti dobiček", depth: 2, side: "viri" },
  {
    aop: "069",
    label: "VII. Prenesena čista izguba",
    depth: 2,
    side: "viri",
    deductible: true,
  },
  { aop: "070", label: "VIII. Čisti dobiček poslovnega leta", depth: 2, side: "viri" },
  {
    aop: "071",
    label: "IX. Čista izguba poslovnega leta",
    depth: 2,
    side: "viri",
    deductible: true,
  },
  {
    aop: "072",
    label: "B. Rezervacije in dolgoročne pasivne časovne razmejitve",
    depth: 1,
    side: "viri",
  },
  { aop: "073", label: "1. Rezervacije", depth: 2, side: "viri" },
  { aop: "074", label: "2. Dolgoročne pasivne časovne razmejitve", depth: 2, side: "viri" },
  { aop: "075", label: "C. Dolgoročne obveznosti", depth: 1, side: "viri" },
  { aop: "076", label: "I. Dolgoročne finančne obveznosti", depth: 2, side: "viri" },
  { aop: "077", label: "1. Dolgoročne finančne obveznosti do družb v skupini", depth: 3, side: "viri" },
  { aop: "078", label: "2. Dolgoročne finančne obveznosti do bank", depth: 3, side: "viri" },
  { aop: "079", label: "3. Druge dolgoročne finančne obveznosti", depth: 3, side: "viri" },
  { aop: "080", label: "II. Dolgoročne poslovne obveznosti", depth: 2, side: "viri" },
  { aop: "081", label: "1. Dolgoročne poslovne obveznosti do družb v skupini", depth: 3, side: "viri" },
  { aop: "082", label: "2. Dolgoročne poslovne obveznosti do dobaviteljev", depth: 3, side: "viri" },
  { aop: "083", label: "3. Druge dolgoročne poslovne obveznosti", depth: 3, side: "viri" },
  { aop: "084", label: "III. Odložene obveznosti za davek", depth: 2, side: "viri" },
  { aop: "085", label: "Č. Kratkoročne obveznosti", depth: 1, side: "viri" },
  { aop: "086", label: "I. Obveznosti, vključene v skupine za odtujitev", depth: 2, side: "viri" },
  { aop: "087", label: "II. Kratkoročne finančne obveznosti", depth: 2, side: "viri" },
  { aop: "088", label: "1. Kratkoročne finančne obveznosti do družb v skupini", depth: 3, side: "viri" },
  { aop: "089", label: "2. Kratkoročne finančne obveznosti do bank", depth: 3, side: "viri" },
  { aop: "090", label: "3. Druge kratkoročne finančne obveznosti", depth: 3, side: "viri" },
  { aop: "091", label: "III. Kratkoročne poslovne obveznosti", depth: 2, side: "viri" },
  { aop: "092", label: "1. Kratkoročne poslovne obveznosti do družb v skupini", depth: 3, side: "viri" },
  { aop: "093", label: "2. Kratkoročne poslovne obveznosti do dobaviteljev", depth: 3, side: "viri" },
  { aop: "094", label: "3. Druge kratkoročne poslovne obveznosti", depth: 3, side: "viri" },
  { aop: "095", label: "D. Kratkoročne pasivne časovne razmejitve", depth: 1, side: "viri" },
  {
    aop: "096",
    label: "Zunajbilančne obveznosti",
    depth: 1,
    side: "viri",
    offBalance: true,
  },
]

/** Nadrejene postavke. Vrstni red je od listov proti vsoti. */
export const FORMULAS: Record<string, Formula> = {
  "004": { add: ["005", "006", "007", "008"] },
  "003": { add: ["004", "009"] },
  "010": { add: ["011", "012", "013", "014", "015", "016", "017"] },
  "020": { add: ["021", "022", "023"] },
  "024": { add: ["025", "026"] },
  "019": { add: ["020", "024"] },
  "027": { add: ["028", "029", "030"] },
  "002": { add: ["003", "010", "018", "019", "027", "031"] },
  "034": { add: ["035", "036", "037", "038", "039"] },
  "041": { add: ["042", "043", "044"] },
  "045": { add: ["046", "047"] },
  "040": { add: ["041", "045"] },
  "048": { add: ["049", "050", "051"] },
  "032": { add: ["033", "034", "040", "048", "052"] },
  "001": { add: ["002", "032", "053"] },
  "057": { add: ["058"], sub: ["059"] },
  "061": { add: ["062", "063", "065", "066"], sub: ["064"] },
  "056": { add: ["057", "060", "061", "067", "301", "068", "070"], sub: ["069", "071"] },
  "072": { add: ["073", "074"] },
  "076": { add: ["077", "078", "079"] },
  "080": { add: ["081", "082", "083"] },
  "075": { add: ["076", "080", "084"] },
  "087": { add: ["088", "089", "090"] },
  "091": { add: ["092", "093", "094"] },
  "085": { add: ["086", "087", "091"] },
  "055": { add: ["056", "072", "075", "085", "095"] },
}

export const FORMULA_ORDER = Object.keys(FORMULAS)

export const LINE_BY_AOP: Record<string, LineDef> = Object.fromEntries(
  LINES.map((line) => [line.aop, line]),
)

export function isCalculated(aop: string): boolean {
  return aop in FORMULAS
}

export function formulaLabel(aop: string): string | null {
  const formula = FORMULAS[aop]
  if (!formula) return null
  const add = formula.add.join(" + ")
  if (!formula.sub?.length) return add
  return `${add} − ${formula.sub.join(" − ")}`
}

export function descendantLeaves(aop: string): string[] {
  const formula = FORMULAS[aop]
  if (!formula) return [aop]
  return [...formula.add, ...(formula.sub ?? [])].flatMap(descendantLeaves)
}

export const LEAF_AOPS = LINES.map((line) => line.aop).filter((aop) => !isCalculated(aop))
