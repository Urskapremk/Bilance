import type { AjpesHeader } from "@/lib/ajpes-header"
import { clientKey } from "@/lib/clients"
import { agingSheetCells, type DisclosurePartners } from "@/lib/partner-aging"
import { parseSloveneDate, splitPeriod } from "@/lib/format"
import { rollupIncome } from "@/lib/income"
import { inferLegalForm, legalFormOf, parseLegalForm, type LegalForm } from "@/lib/legal-form"
import {
  ADREMA_31_07_2025_TEKOCE,
  ADREMA_DH_COMPANY,
  ADREMA_NALOZBE_POJASNILO,
  type DhCompany,
} from "@/lib/dh-adrema"

export type CivilDate = { year: number; month: number; day: number }

export type BankCell = {
  sheet: string
  cell: string
  /** Znesek v centih. V celico se zapiše v eurih na dve decimalki. */
  euros?: number
  /** Število, ki ni znesek: datumski serijski zapis, velikost, meseci, zaposleni. */
  number?: number
  text?: string
  /** Izprazni celico, da v predlogi ne ostane tuj podatek. */
  clear?: boolean
}

export type BankStatement = {
  company: string
  period: string
  currentDate: string
  legalForm?: LegalForm | null
  balance: { current: Record<string, number>; previous: Record<string, number> }
  income: Record<string, number>
}

export type BankFormInput = {
  company: DhCompany
  currentBalance: Record<string, number>
  currentIncome: Record<string, number>
  previousBalance: Record<string, number>
  previousIncome: Record<string, number>
  legalForm?: LegalForm
  periodStart?: CivilDate
  periodEnd?: CivilDate
  reportedAt?: CivilDate
  operatingMonths?: number
  previousEmployees?: number
  previousMonths?: number
  investmentNote?: string
}

/** Vnosne vrstice bilance. Seštevki ostanejo formule predloge. */
const BS_ROW: Record<string, number> = {
  "005": 13,
  "006": 14,
  "007": 15,
  "008": 16,
  "009": 17,
  "011": 19,
  "012": 20,
  "013": 21,
  "014": 22,
  "015": 23,
  "016": 24,
  "017": 25,
  "018": 26,
  "021": 29,
  "022": 30,
  "023": 31,
  "025": 33,
  "026": 34,
  "028": 36,
  "029": 37,
  "030": 38,
  "031": 39,
  "033": 41,
  "035": 43,
  "036": 44,
  "037": 45,
  "038": 46,
  "039": 47,
  "042": 50,
  "043": 51,
  "044": 52,
  "046": 54,
  "047": 55,
  "049": 57,
  "050": 58,
  "051": 59,
  "052": 60,
  "053": 61,
  "054": 62,
  "058": 68,
  "059": 69,
  "060": 70,
  "060a": 71,
  "060b": 72,
  "062": 74,
  "063": 75,
  "064": 76,
  "065": 77,
  "066": 78,
  "067": 79,
  "301": 80,
  "068": 81,
  "069": 82,
  "070": 83,
  "071": 84,
  "073": 86,
  "074": 87,
  "077": 90,
  "078": 91,
  "079": 92,
  "081": 94,
  "082": 95,
  "083": 96,
  "084": 97,
  "086": 99,
  "088": 101,
  "089": 102,
  "090": 103,
  "092": 105,
  "093": 106,
  "094": 107,
  "095": 108,
  "096": 109,
}

/** Vnosne vrstice izkaza. 188 in 189 sta števili, ne zneska. */
const IPI_ROW: Record<string, number> = {
  "112": 11,
  "113": 12,
  "114": 13,
  "116": 15,
  "117": 16,
  "119": 18,
  "120": 19,
  "121": 20,
  "122": 21,
  "123": 22,
  "124": 23,
  "125": 24,
  "129": 28,
  "131": 30,
  "132": 31,
  "133": 32,
  "135": 34,
  "136": 35,
  "137": 36,
  "138": 37,
  "140": 39,
  "141": 40,
  "142": 41,
  "143": 42,
  "145": 44,
  "146": 45,
  "147": 46,
  "148a": 48,
  "148b": 49,
  "149": 50,
  "150": 51,
  "156": 57,
  "157": 58,
  "158": 59,
  "159": 60,
  "161": 62,
  "162": 63,
  "164": 65,
  "165": 66,
  "168": 69,
  "170": 71,
  "171": 72,
  "172": 73,
  "173": 74,
  "175": 76,
  "176": 77,
  "177": 78,
  "179": 80,
  "180": 81,
  "181": 82,
  "184": 85,
  "185": 86,
}

const SHEET = {
  osnovni: "Osnovni podatki",
  bs: "BS",
  ipi: "IPI",
  neopred: "003 Neopred.OS",
  opred: "010 Opred.OS",
  neprem: "018 Nalož.neprem.",
  nalozbe: "020 Dolg.fin.naložbe",
  posojilaDolg: "024 Dolg.posojila",
  terjatveDolg: "027 Dolg.posl.ter.",
  zaloge: "034 Zaloge",
  nalozbeKrat: "041 Krat.fin.naložbe",
  posojilaKrat: "045 Krat.posojila",
  terjatveSkupina: "049 Krat.ter.druzbe.v.sk.",
  kupci: "050 Krat.ter.kupci",
  terjatveDrugi: "051 Krat.ter.drugi",
  acr: "053 Krat.AČR",
  zabilancno: "054 Zabil.sreds.",
  kapital: "056 Kapital",
  rezervacije: "072 Rez.dolg.PČR",
  obveznostiDolg: "076 Dolg.fin.obvez.",
  obveznostiPosl: "080 Dolg.posl.obvez.",
  obveznostiKrat: "087 Krat.fin.obvez.",
  obveznostiSkupina: "092 Krat.obvez.druzb.v.sk.",
  dobavitelji: "093 Krat.obvez.dobav.",
  obveznostiDruge: "094 Krat.obvez.druge",
  pcr: "095 Krat.PČR",
} as const

export function hasDhBankPack(company: string): boolean {
  const key = clientKey(company)
  return key === "adrema" || key.startsWith("adrema ")
}

export function excelSerial(date: CivilDate): number {
  const utc = Date.UTC(date.year, date.month - 1, date.day)
  const epoch = Date.UTC(1899, 11, 30)
  return Math.round((utc - epoch) / 86_400_000)
}

export function civilDate(raw: string): CivilDate | null {
  const parsed = parseSloveneDate(raw)
  if (!parsed) return null
  const match = parsed.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) }
}

export function operatingMonths(start: CivilDate, end: CivilDate): number {
  const span = (end.year - start.year) * 12 + (end.month - start.month) + 1
  if (span < 1) return 1
  if (span > 12) return 12
  return span
}

export function findBankCell(cells: BankCell[], sheet: string, cell: string): BankCell | undefined {
  return cells.find((item) => item.sheet === sheet && item.cell === cell)
}

/** Tekoči stolpec iz odprte bilance, prejšnji stolpec iz obrazca 31. 7. 2025. */
export function adremaBankCells(statement: BankStatement): BankCell[] {
  const period = splitPeriod(statement.period)
  const start = period ? civilDate(period.start) : null
  const end = period ? civilDate(period.end) : civilDate(statement.currentDate)
  const reportedAt = civilDate(statement.currentDate) ?? end ?? undefined
  return bankFormCells({
    company: ADREMA_DH_COMPANY,
    currentBalance: statement.balance.current,
    currentIncome: statement.income,
    previousBalance: ADREMA_31_07_2025_TEKOCE.balance,
    previousIncome: ADREMA_31_07_2025_TEKOCE.income,
    legalForm: legalFormOf(statement),
    periodStart: start ?? undefined,
    periodEnd: end ?? undefined,
    reportedAt,
    operatingMonths: start && end ? operatingMonths(start, end) : undefined,
    investmentNote: ADREMA_NALOZBE_POJASNILO,
  })
}

/** Oznaka obdobja za ime datoteke, npr. 01.01.2026-31.07.2026. */
export function statementFileStamp(period: string, currentDate: string): string {
  const parts = splitPeriod(period)
  const start = parts ? civilDate(parts.start) : null
  const end = parts ? civilDate(parts.end) : civilDate(currentDate)
  const stamp = (date: CivilDate) =>
    `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`
  if (start && end) return `${stamp(start)}-${stamp(end)}`
  if (end) return stamp(end)
  return ""
}

export function dhWorkbookName(period: string, currentDate: string): string {
  const stamp = statementFileStamp(period, currentDate)
  return stamp ? `ADREMA_FRP_EXCEL_DH_${stamp}.xlsx` : "ADREMA_FRP_EXCEL_DH.xlsx"
}

export function dhApplicationName(period: string, currentDate: string): string {
  const stamp = statementFileStamp(period, currentDate)
  return stamp
    ? `ADREMA_Vloga_za_odobritev_financiranja_${stamp}.pdf`
    : "ADREMA_Vloga_za_odobritev_financiranja.pdf"
}

/** Vzorčni podatki v predlogi razkritij. Če jih ne zamenjamo, jih zbrišemo. */
const SAMPLE_COMPANY_CELLS = ["D8", "D9", "D10", "D11", "D12", "D13", "D14", "D15", "D18", "D19", "D20", "D21", "D28"]

const EMPTY_COMPANY: DhCompany = {
  name: "",
  seat: "",
  registration: "",
  taxNumber: "",
  director: "",
  kind: "",
  size: 0,
  accounting: 0,
  place: "",
  accountant: "",
  contact: "",
  phone: "",
  email: "",
}

/**
 * Razkritja za katero koli stranko.
 * Tekoči stolpec je odprta bilanca, prejšnji je primerjalni stolpec, kadar ima zneske.
 * Podatki o firmi se vpišejo samo, če jih stranka ima. Ostale celice ostanejo prazne.
 */
export function disclosureCells(
  statement: BankStatement & {
    registration?: string
    previousIncome?: Record<string, number>
    ajpesHeader?: AjpesHeader
  },
  partners?: DisclosurePartners,
): BankCell[] {
  const period = splitPeriod(statement.period || "")
  const start = period ? civilDate(period.start) : null
  const end = period ? civilDate(period.end) : civilDate(statement.currentDate || "")
  const reportedAt = civilDate(statement.currentDate || "") ?? end ?? undefined
  const form = legalFormOf(statement)
  const header = statement.ajpesHeader
  const writes: BankCell[] = []
  text(writes, SHEET.osnovni, "D8", header?.name?.trim() || statement.company.trim())
  text(writes, SHEET.osnovni, "D9", header?.seat?.trim() ?? "")
  text(writes, SHEET.osnovni, "D10", header?.registration?.trim() || statement.registration?.trim() || "")
  text(writes, SHEET.osnovni, "D11", header?.taxNumber?.trim() ?? "")
  text(writes, SHEET.osnovni, "D12", header?.director?.trim() ?? "")
  text(writes, SHEET.osnovni, "D13", header?.kind !== undefined ? header.kind : disclosureKind(statement))
  if (header?.size) writes.push({ sheet: SHEET.osnovni, cell: "D14", number: header.size })
  if (header?.accounting) writes.push({ sheet: SHEET.osnovni, cell: "D15", number: header.accounting })
  text(writes, SHEET.osnovni, "D21", header?.place?.trim() ?? "")
  text(writes, SHEET.osnovni, "D28", header?.contact?.trim() ?? "")
  text(writes, SHEET.osnovni, "D29", header?.phone?.trim() ?? "")
  text(writes, SHEET.osnovni, "D30", header?.email?.trim() ?? "")
  if (start) writes.push({ sheet: SHEET.osnovni, cell: "D18", number: excelSerial(start) })
  if (end) writes.push({ sheet: SHEET.osnovni, cell: "D19", number: excelSerial(end) })
  if (reportedAt) writes.push({ sheet: SHEET.osnovni, cell: "D20", number: excelSerial(reportedAt) })
  writeStatement(writes, SHEET.bs, BS_ROW, "G", statement.balance.current)
  writeStatement(writes, SHEET.bs, BS_ROW, "H", statement.balance.previous)
  writeStatement(writes, SHEET.ipi, IPI_ROW, "G", statement.income)
  if (statement.previousIncome) writeStatement(writes, SHEET.ipi, IPI_ROW, "H", statement.previousIncome)
  if (start && end) writes.push({ sheet: SHEET.ipi, cell: "G90", number: operatingMonths(start, end) })
  writeDisclosures(
    writes,
    {
      company: EMPTY_COMPANY,
      currentBalance: statement.balance.current,
      currentIncome: statement.income,
      previousBalance: statement.balance.previous,
      previousIncome: statement.previousIncome ?? {},
      legalForm: form,
    },
    form,
    partners,
  )
  const filled = new Set(writes.filter((item) => item.sheet === SHEET.osnovni).map((item) => item.cell))
  const clears: BankCell[] = SAMPLE_COMPANY_CELLS.filter((cell) => !filled.has(cell)).map((cell) => ({
    sheet: SHEET.osnovni,
    cell,
    clear: true,
  }))
  return [...clears, ...writes]
}

/** Šifra vrste samo, kadar jo iz stranke res poznamo. Privzeti d.o.o. se ne vpiše. */
function disclosureKind(statement: { legalForm?: string | null; company?: string }): string {
  const form = parseLegalForm(statement.legalForm) ?? inferLegalForm(statement.company ?? "")
  if (form === "doo") return "GD"
  if (form === "sp") return "SP"
  return ""
}

/**
 * Preslikava zneskov v celice praznega FRP.
 * Stolpec G je tekoče obdobje, stolpec H je prejšnje obdobje.
 * Pozitivni zneski se vpisujejo kot pozitivna števila, odbitne postavke odšteje formula.
 */
export function bankFormCells(input: BankFormInput): BankCell[] {
  const cells: BankCell[] = []
  const form = input.legalForm ?? "doo"
  writeCompany(cells, input)
  writeStatement(cells, SHEET.bs, BS_ROW, "G", input.currentBalance)
  writeStatement(cells, SHEET.bs, BS_ROW, "H", input.previousBalance)
  writeStatement(cells, SHEET.ipi, IPI_ROW, "G", input.currentIncome)
  writeStatement(cells, SHEET.ipi, IPI_ROW, "H", input.previousIncome)
  if (input.operatingMonths) cells.push({ sheet: SHEET.ipi, cell: "G90", number: input.operatingMonths })
  if (input.previousEmployees) cells.push({ sheet: SHEET.ipi, cell: "H89", number: input.previousEmployees })
  if (input.previousMonths) cells.push({ sheet: SHEET.ipi, cell: "H90", number: input.previousMonths })
  writeDisclosures(cells, input, form)
  return cells
}

function writeCompany(cells: BankCell[], input: BankFormInput) {
  const company = input.company
  text(cells, SHEET.osnovni, "D8", company.name)
  text(cells, SHEET.osnovni, "D9", company.seat)
  text(cells, SHEET.osnovni, "D10", company.registration)
  text(cells, SHEET.osnovni, "D11", company.taxNumber)
  text(cells, SHEET.osnovni, "D12", company.director)
  text(cells, SHEET.osnovni, "D13", company.kind)
  cells.push({ sheet: SHEET.osnovni, cell: "D14", number: company.size })
  cells.push({ sheet: SHEET.osnovni, cell: "D15", number: company.accounting })
  if (input.periodStart) cells.push({ sheet: SHEET.osnovni, cell: "D18", number: excelSerial(input.periodStart) })
  if (input.periodEnd) cells.push({ sheet: SHEET.osnovni, cell: "D19", number: excelSerial(input.periodEnd) })
  if (input.reportedAt) cells.push({ sheet: SHEET.osnovni, cell: "D20", number: excelSerial(input.reportedAt) })
  text(cells, SHEET.osnovni, "D21", company.place)
  text(cells, SHEET.osnovni, "D27", company.accountant)
  text(cells, SHEET.osnovni, "D28", company.contact)
  text(cells, SHEET.osnovni, "D29", company.phone)
  text(cells, SHEET.osnovni, "D30", company.email)
}

function writeStatement(
  cells: BankCell[],
  sheet: string,
  rows: Record<string, number>,
  column: "G" | "H",
  amounts: Record<string, number>,
) {
  for (const [aop, row] of Object.entries(rows)) {
    pushEuros(cells, sheet, `${column}${row}`, amounts[aop])
  }
}

function writeDisclosures(
  cells: BankCell[],
  input: BankFormInput,
  form: LegalForm,
  partners?: DisclosurePartners,
) {
  const current = input.currentBalance
  const previous = input.previousBalance
  move(cells, SHEET.neopred, 8, previous["006"], current["006"])
  move(cells, SHEET.neopred, 9, previous["007"], current["007"])
  move(cells, SHEET.neopred, 10, previous["005"], current["005"])
  move(cells, SHEET.neopred, 11, previous["008"], current["008"])
  move(cells, SHEET.neopred, 12, previous["009"], current["009"])

  move(cells, SHEET.opred, 7, previous["011"], current["011"])
  move(cells, SHEET.opred, 8, previous["012"], current["012"])
  move(cells, SHEET.opred, 11, sum(previous, ["013", "014"]), sum(current, ["013", "014"]))
  move(cells, SHEET.opred, 13, previous["015"], current["015"])
  move(cells, SHEET.opred, 17, previous["016"], current["016"])
  move(cells, SHEET.opred, 19, previous["017"], current["017"])

  move(cells, SHEET.neprem, 8, previous["018"], current["018"])
  move(cells, SHEET.nalozbe, 8, previous["021"], current["021"])
  move(cells, SHEET.nalozbe, 9, previous["022"], current["022"])
  move(cells, SHEET.nalozbe, 10, previous["023"], current["023"])
  if (
    input.investmentNote &&
    (sum(current, ["021", "022", "023"]) || sum(previous, ["021", "022", "023"]))
  ) {
    text(cells, SHEET.nalozbe, "B16", input.investmentNote)
  }

  move(cells, SHEET.zaloge, 8, previous["035"], current["035"])
  move(cells, SHEET.zaloge, 9, previous["036"], current["036"])
  move(cells, SHEET.zaloge, 10, previous["037"], current["037"])
  move(cells, SHEET.zaloge, 11, previous["038"], current["038"])
  move(cells, SHEET.zaloge, 12, previous["039"], current["039"])

  move(cells, SHEET.nalozbeKrat, 8, previous["042"], current["042"])
  move(cells, SHEET.nalozbeKrat, 9, previous["043"], current["043"])
  move(cells, SHEET.nalozbeKrat, 10, previous["044"], current["044"])

  loan(cells, SHEET.posojilaDolg, sum(previous, ["025", "026"]), sum(current, ["025", "026"]))
  loan(cells, SHEET.posojilaKrat, sum(previous, ["046", "047"]), sum(current, ["046", "047"]))
  loan(cells, SHEET.obveznostiDolg, sum(previous, ["077", "078", "079"]), sum(current, ["077", "078", "079"]))
  loan(cells, SHEET.obveznostiKrat, sum(previous, ["088", "089", "090"]), sum(current, ["088", "089", "090"]))

  balanceOnly(cells, SHEET.terjatveDolg, sum(current, ["028", "029", "030"]))
  balanceOnly(cells, SHEET.terjatveSkupina, current["049"])
  if (partners?.kupci?.length) cells.push(...agingSheetCells(SHEET.kupci, "kupci", partners.kupci))
  else balanceOnly(cells, SHEET.kupci, current["050"])
  balanceOnly(cells, SHEET.obveznostiPosl, sum(current, ["081", "082", "083"]))
  balanceOnly(cells, SHEET.obveznostiSkupina, current["092"])
  if (partners?.dobavitelji?.length) cells.push(...agingSheetCells(SHEET.dobavitelji, "dobavitelji", partners.dobavitelji))
  else balanceOnly(cells, SHEET.dobavitelji, current["093"])

  move(cells, SHEET.terjatveDrugi, 8, previous["051"], current["051"])
  move(cells, SHEET.acr, 8, previous["053"], current["053"])
  move(cells, SHEET.zabilancno, 8, previous["054"], current["054"])
  move(cells, SHEET.rezervacije, 16, sum(previous, ["073", "074"]), sum(current, ["073", "074"]))
  move(cells, SHEET.obveznostiDruge, 8, previous["094"], current["094"])
  move(cells, SHEET.pcr, 11, previous["095"], current["095"])
  writeCapital(cells, input, form)
}

/**
 * Začetno stanje kapitala je celoten prejšnji kapital, kot na lanskem obrazcu.
 * Tekoči dobiček priteče iz izkaza (D18 = IPI!G87). Razlika, ki ni dobiček, gre na preneseni dobiček.
 */
function writeCapital(cells: BankCell[], input: BankFormInput, form: LegalForm) {
  const income = incomeLeaves(input.currentIncome)
  const rolled = rollupIncome(income, form)
  const profit = rolled["186"] ?? 0
  const loss = rolled["187"] ?? 0
  const previousEquity = equityCents(input.previousBalance)
  const currentEquity = equityCents(input.currentBalance)
  const plug = currentEquity - previousEquity - (profit - loss)
  pushEuros(cells, SHEET.kapital, "C16", previousEquity)
  if (plug > 0) pushEuros(cells, SHEET.kapital, "D16", plug)
  if (plug < 0) pushEuros(cells, SHEET.kapital, "E16", -plug)
}

function incomeLeaves(income: Record<string, number>): Record<string, number> {
  const leaves: Record<string, number> = {}
  for (const [aop, value] of Object.entries(income)) {
    if (IPI_ROW[aop]) leaves[aop] = value
  }
  return leaves
}

/** Enaka predznaka kot formula kapitala na listu BS (G66). AOP 059 se prišteje, 064, 069 in 071 se odštejejo. */
function equityCents(amounts: Record<string, number>): number {
  const value = (aop: string) => amounts[aop] ?? 0
  const called = value("058") + value("059")
  const reserves = value("062") + value("063") - value("064") + value("065") + value("066")
  return (
    called +
    value("060") +
    value("060a") +
    value("060b") +
    reserves +
    value("067") +
    value("301") +
    value("068") -
    value("069") +
    value("070") -
    value("071")
  )
}

function move(
  cells: BankCell[],
  sheet: string,
  row: number,
  opening: number | undefined,
  closing: number | undefined,
) {
  const open = Math.round(opening ?? 0)
  const close = Math.round(closing ?? 0)
  if (!open && !close) return
  const delta = close - open
  pushEuros(cells, sheet, `C${row}`, open)
  if (delta > 0) pushEuros(cells, sheet, `D${row}`, delta)
  if (delta < 0) pushEuros(cells, sheet, `E${row}`, -delta)
}

function loan(cells: BankCell[], sheet: string, opening: number, closing: number) {
  const open = Math.round(opening)
  const close = Math.round(closing)
  if (!open && !close) return
  const delta = close - open
  pushEuros(cells, sheet, "D18", open)
  if (delta > 0) pushEuros(cells, sheet, "E18", delta)
  if (delta < 0) pushEuros(cells, sheet, "F18", -delta)
}

function balanceOnly(cells: BankCell[], sheet: string, closing: number | undefined) {
  pushEuros(cells, sheet, "D18", closing)
}

function sum(amounts: Record<string, number>, aops: string[]): number {
  let total = 0
  for (const aop of aops) total += amounts[aop] ?? 0
  return total
}

function pushEuros(cells: BankCell[], sheet: string, cell: string, cents: number | undefined) {
  const amount = Math.round(cents ?? 0)
  if (!amount) return
  cells.push({ sheet, cell, euros: amount })
}

function text(cells: BankCell[], sheet: string, cell: string, value: string) {
  if (!value) return
  cells.push({ sheet, cell, text: value })
}
