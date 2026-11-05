import type { BankCell } from "@/lib/bank-form"
import { civilDate, excelSerial } from "@/lib/bank-form"
import { clientKey } from "@/lib/clients"
import { parseCents, parseSloveneDate } from "@/lib/format"

/** List 045 v predlogi razkritij Delavske hranilnice. */
export const SHEET_045 = "045 Krat.posojila"

/** Predloga ima deset imenskih vrstic. Enajsta je OSTALI. */
export const LOAN_045_NAME_SLOTS = 10
const FIRST_ROW = 8
const OSTALI_ROW = 18

/** Ena analitična vrstica kratkoročno danega posojila. Zneski so v centih. Prazno polje ostane izpuščeno. */
export type LoanAnalyticalLine = {
  name?: string
  taxNumber?: string
  openingCents?: number
  increaseCents?: number
  decreaseCents?: number
  closingCents?: number
  installmentCents?: number
  paymentPeriod?: string
  maturity?: string
  purpose?: string
}

type LoanField =
  | "name"
  | "tax"
  | "opening"
  | "increase"
  | "decrease"
  | "closing"
  | "installment"
  | "period"
  | "maturity"
  | "purpose"

const AMOUNT_FIELDS: LoanField[] = ["opening", "increase", "decrease", "closing", "installment"]

const HEADER_SPECS: { field: LoanField; re: RegExp }[] = [
  { field: "name", re: /posojil|jemal|naziv|partner/i },
  { field: "tax", re: /dav[cč]|števil|stevil/i },
  { field: "opening", re: /za[cč]et|a[cč]etn/i },
  { field: "increase", re: /pove[cč]|ve[cč]an/i },
  { field: "decrease", re: /zmanj/i },
  { field: "closing", re: /kon[cč]n/i },
  { field: "installment", re: /obrok|znesek|nesek/i },
  { field: "period", re: /obdob|dobje/i },
  { field: "maturity", re: /zapad/i },
  { field: "purpose", re: /namen/i },
]

const MONEY = /^-?\d{1,3}(?:[.\s]\d{3})*,\d{2}$|^-?\d+,\d{2}$/
const TOTAL = /^(skupaj|vsota|skupni)\b/i

export function isOstaliLoan(name: string): boolean {
  const clean = name.trim().toLocaleLowerCase("sl")
  return clean === "ostali" || clean === "ostalo" || clean === "ostalih" || clean.startsWith("ostali ")
}

export function loanLineHasData(line: LoanAnalyticalLine): boolean {
  return Boolean(
    line.name ||
      line.taxNumber ||
      line.paymentPeriod ||
      line.maturity ||
      line.purpose ||
      line.openingCents != null ||
      line.increaseCents != null ||
      line.decreaseCents != null ||
      line.closingCents != null ||
      line.installmentCents != null,
  )
}

/** Ključ stranke in obdobja. Drugo obdobje, na primer Fortun 1. 1. 2026–31. 8. 2026, ima svoj posnetek. */
export function loan045Key(company: string, period: string): string {
  return `${clientKey(company)}\0${period.trim()}`
}

export function loan045ForPeriod<T extends { company: string; period: string }>(
  records: readonly T[],
  company: string,
  period: string,
): T | null {
  const key = loan045Key(company, period)
  return records.find((record) => loan045Key(record.company, record.period) === key) ?? null
}

type Placed = { named: LoanAnalyticalLine[]; ostali: LoanAnalyticalLine | null }

/** Imenovane vrstice od vrha. Ostali in preostanek, ko zmanjka vrstic, gresta na zadnjo vrstico OSTALI. */
export function layoutLoan045(lines: readonly LoanAnalyticalLine[]): Placed {
  const named: LoanAnalyticalLine[] = []
  const bucket: LoanAnalyticalLine[] = []
  for (const line of lines) {
    if (!loanLineHasData(line)) continue
    if (line.name && isOstaliLoan(line.name)) bucket.push(line)
    else named.push(line)
  }
  const visible = named.slice(0, LOAN_045_NAME_SLOTS)
  const overflow = named.slice(LOAN_045_NAME_SLOTS)
  const merged = [...overflow, ...bucket]
  if (!merged.length) return { named: visible, ostali: null }
  return { named: visible, ostali: sumLines(merged) }
}

/** Analitične vrstice v celice lista 045. Prazna polja se ne zapišejo. Formule za končno stanje in delež ostanejo, kadar znesek sledi iz njih. */
export function loan045Cells(lines: readonly LoanAnalyticalLine[]): BankCell[] {
  const { named, ostali } = layoutLoan045(lines)
  const cells: BankCell[] = []
  named.forEach((line, index) => writeLine(cells, FIRST_ROW + index, line, true))
  if (ostali) writeLine(cells, OSTALI_ROW, ostali, false)
  return cells
}

/**
 * Ko je posnetek naložen, se skupni znesek na vrstici OSTALI umakne.
 * Na njegovo mesto pridejo analitične vrstice. Brez posnetka ostane dosedanji vpis.
 */
export function applySheet045(cells: BankCell[], lines: LoanAnalyticalLine[] | null | undefined): BankCell[] {
  if (!lines?.length) return cells
  const kept = cells.filter((cell) => !(cell.sheet === SHEET_045 && /^(?:D|E|F)18$/.test(cell.cell)))
  return [...kept, ...loan045Cells(lines)]
}

export function sanitizeLoanLines(value: unknown): LoanAnalyticalLine[] | null {
  if (!Array.isArray(value)) return null
  const lines: LoanAnalyticalLine[] = []
  for (const item of value.slice(0, 400)) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const line: LoanAnalyticalLine = {}
    const name = textField(record.name, 200)
    const tax = textField(record.taxNumber, 32).replace(/\s/g, "")
    const period = textField(record.paymentPeriod, 80)
    const maturity = textField(record.maturity, 40)
    const purpose = textField(record.purpose, 200)
    if (name) line.name = name
    if (tax) line.taxNumber = tax
    if (period) line.paymentPeriod = period
    if (maturity) line.maturity = maturity
    if (purpose) line.purpose = purpose
    const opening = centsField(record.openingCents)
    const increase = centsField(record.increaseCents)
    const decrease = centsField(record.decreaseCents)
    const closing = centsField(record.closingCents)
    const installment = centsField(record.installmentCents)
    if (opening != null) line.openingCents = opening
    if (increase != null) line.increaseCents = increase
    if (decrease != null) line.decreaseCents = decrease
    if (closing != null) line.closingCents = closing
    if (installment != null) line.installmentCents = installment
    if (loanLineHasData(line)) lines.push(line)
  }
  return lines
}

type OcrWord = { x: number; y: number; w: number; h: number; text: string }
type OcrCell = { x0: number; x1: number; y: number; text: string }
type Column = { x0: number; x1: number; field?: LoanField }

/** Besede iz TSV izpisa prebere v analitične vrstice. Praznih vrstic ne doda. */
export function parseLoanTsv(tsv: string): LoanAnalyticalLine[] {
  return linesFromWords(tsvWords(tsv))
}

export function linesFromWords(words: readonly OcrWord[]): LoanAnalyticalLine[] {
  const rows = clusterRows(words)
  const prepared = rows.map((row) => mergeCells(row))
  const dataIndexes = prepared
    .map((cells, index) => ({ index, cells }))
    .filter((row) => row.cells.some((cell) => isMoney(cell.text) || isTax(cell.text)))
    .map((row) => row.index)
  if (!dataIndexes.length) return []
  const dataCells = dataIndexes.flatMap((index) => prepared[index] ?? [])
  const columns = clusterColumns(dataCells)
  const headerWords = rows.filter((_, index) => !dataIndexes.includes(index)).flat()
  labelColumns(columns, headerWords, prepared.filter((_, index) => dataIndexes.includes(index)))
  const lines: LoanAnalyticalLine[] = []
  for (const index of dataIndexes) {
    const cells = prepared[index] ?? []
    const joined = cells.map((cell) => cell.text).join(" ")
    if (TOTAL.test(joined.trim())) break
    const line = lineFromCells(cells, columns)
    if (line && loanLineHasData(line)) lines.push(line)
  }
  return lines
}

function writeLine(cells: BankCell[], row: number, line: LoanAnalyticalLine, writeName: boolean) {
  if (writeName && line.name) text(cells, `B${row}`, line.name)
  if (line.taxNumber) text(cells, `C${row}`, line.taxNumber)
  euros(cells, `D${row}`, line.openingCents)
  euros(cells, `E${row}`, line.increaseCents)
  euros(cells, `F${row}`, line.decreaseCents)
  const movement =
    line.openingCents != null || line.increaseCents != null || line.decreaseCents != null
  const formula = (line.openingCents ?? 0) + (line.increaseCents ?? 0) - (line.decreaseCents ?? 0)
  if (line.closingCents != null && (!movement || line.closingCents !== formula)) {
    euros(cells, `G${row}`, line.closingCents)
  }
  euros(cells, `H${row}`, line.installmentCents)
  if (line.paymentPeriod) text(cells, `I${row}`, line.paymentPeriod)
  if (line.maturity) writeMaturity(cells, row, line.maturity)
  if (line.purpose) text(cells, `K${row}`, line.purpose)
}

function writeMaturity(cells: BankCell[], row: number, value: string) {
  const parsed = civilDate(value)
  if (parsed) {
    cells.push({ sheet: SHEET_045, cell: `J${row}`, number: excelSerial(parsed) })
    return
  }
  text(cells, `J${row}`, value)
}

function sumLines(lines: LoanAnalyticalLine[]): LoanAnalyticalLine {
  const summed: LoanAnalyticalLine = {}
  const opening = sumCents(lines, "openingCents")
  const increase = sumCents(lines, "increaseCents")
  const decrease = sumCents(lines, "decreaseCents")
  const closing = sumCents(lines, "closingCents")
  const installment = sumCents(lines, "installmentCents")
  if (opening != null) summed.openingCents = opening
  if (increase != null) summed.increaseCents = increase
  if (decrease != null) summed.decreaseCents = decrease
  if (closing != null) summed.closingCents = closing
  if (installment != null) summed.installmentCents = installment
  if (lines.length === 1) {
    const only = lines[0]
    if (only?.taxNumber) summed.taxNumber = only.taxNumber
    if (only?.paymentPeriod) summed.paymentPeriod = only.paymentPeriod
    if (only?.maturity) summed.maturity = only.maturity
    if (only?.purpose) summed.purpose = only.purpose
    return summed
  }
  copyIfSame(summed, lines, "taxNumber")
  copyIfSame(summed, lines, "paymentPeriod")
  copyIfSame(summed, lines, "maturity")
  copyIfSame(summed, lines, "purpose")
  return summed
}

function sumCents(
  lines: LoanAnalyticalLine[],
  key: "openingCents" | "increaseCents" | "decreaseCents" | "closingCents" | "installmentCents",
): number | undefined {
  let seen = false
  let total = 0
  for (const line of lines) {
    const value = line[key]
    if (value == null) continue
    seen = true
    total += value
  }
  return seen ? total : undefined
}

function copyIfSame(
  target: LoanAnalyticalLine,
  lines: LoanAnalyticalLine[],
  key: "taxNumber" | "paymentPeriod" | "maturity" | "purpose",
) {
  const values = lines.map((line) => line[key]).filter((value): value is string => Boolean(value))
  if (!values.length) return
  if (values.every((value) => value === values[0])) target[key] = values[0]
}

function euros(cells: BankCell[], cell: string, cents: number | undefined) {
  if (cents == null || !Number.isFinite(cents) || cents === 0) return
  cells.push({ sheet: SHEET_045, cell, euros: Math.round(cents) })
}

function text(cells: BankCell[], cell: string, value: string) {
  const clean = value.trim()
  if (!clean) return
  cells.push({ sheet: SHEET_045, cell, text: clean })
}

function textField(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : ""
}

function centsField(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  const amount = Math.round(value)
  if (amount === 0) return undefined
  return amount
}

function tsvWords(tsv: string): OcrWord[] {
  const words: OcrWord[] = []
  for (const raw of tsv.split(/\r?\n/)) {
    const parts = raw.split("\t")
    if (parts.length < 12 || parts[0] !== "5") continue
    const x = Number(parts[6])
    const y = Number(parts[7])
    const w = Number(parts[8])
    const h = Number(parts[9])
    const text = parts.slice(11).join("\t").trim()
    if (!text || !Number.isFinite(x) || !Number.isFinite(y) || w <= 0) continue
    words.push({ x, y, w, h, text })
  }
  return words
}

function clusterRows(words: readonly OcrWord[]): OcrWord[][] {
  const rows: OcrWord[][] = []
  for (const word of [...words].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const row = rows.find((group) => {
      const anchor = group[0]
      if (!anchor) return false
      return Math.abs(anchor.y - word.y) < Math.max(anchor.h, word.h, 12) * 0.65
    })
    if (row) row.push(word)
    else rows.push([word])
  }
  return rows
}

function mergeCells(words: OcrWord[]): OcrCell[] {
  const sorted = [...words].sort((left, right) => left.x - right.x)
  const cells: OcrCell[] = []
  for (const word of sorted) {
    const last = cells.at(-1)
    const gap = last ? word.x - last.x1 : Number.POSITIVE_INFINITY
    const limit = Math.max(14, word.h * 0.9)
    if (last && gap <= limit) {
      last.x1 = Math.max(last.x1, word.x + word.w)
      last.text = `${last.text} ${word.text}`
      continue
    }
    cells.push({ x0: word.x, x1: word.x + word.w, y: word.y, text: word.text })
  }
  return cells
}

function clusterColumns(cells: OcrCell[]): Column[] {
  const columns: Column[] = []
  for (const cell of [...cells].sort((left, right) => left.x0 - right.x0)) {
    let best: { column: Column; score: number } | null = null
    for (const column of columns) {
      const score = overlap(cell.x0, cell.x1, column.x0, column.x1)
      if (score > 0 && (!best || score > best.score)) best = { column, score }
    }
    const width = Math.max(1, cell.x1 - cell.x0)
    if (best && best.score >= Math.min(12, width * 0.25)) {
      best.column.x0 = Math.min(best.column.x0, cell.x0)
      best.column.x1 = Math.max(best.column.x1, cell.x1)
    } else {
      columns.push({ x0: cell.x0, x1: cell.x1 })
    }
  }
  return columns.sort((left, right) => left.x0 - right.x0)
}

function labelColumns(columns: Column[], headerWords: OcrWord[], dataRows: OcrCell[][]) {
  for (const word of [...headerWords].sort((left, right) => left.x - right.x)) {
    const hits = fieldsIn(word.text)
    if (!hits.length) continue
    const overlapped = columns
      .map((column) => ({ column, score: overlap(word.x, word.x + word.w, column.x0, column.x1) }))
      .filter((item) => item.score > 2)
      .sort((left, right) => left.column.x0 - right.column.x0)
    if (hits.length === 1) {
      const target = [...overlapped].sort((left, right) => right.score - left.score)[0]?.column
      if (target && !target.field && !columns.some((column) => column.field === hits[0])) target.field = hits[0]
      continue
    }
    hits.forEach((field, index) => {
      if (columns.some((column) => column.field === field)) return
      const center = word.x + (word.w * (index + 0.5)) / hits.length
      const nearest = overlapped
        .map((item) => item.column)
        .filter((column) => !column.field)
        .sort((left, right) => Math.abs(centerOf(left) - center) - Math.abs(centerOf(right) - center))[0]
      if (nearest) nearest.field = field
    })
  }
  const used = new Set(columns.map((column) => column.field).filter(Boolean))
  for (const column of columns) {
    if (column.field) continue
    const samples = samplesOf(column, dataRows)
    if (!used.has("tax") && samples.length && samples.every(isTax)) {
      column.field = "tax"
      used.add("tax")
    }
  }
  const unlabeledAmounts = columns.filter((column) => !column.field && looksLikeAmount(column, dataRows))
  const freeAmounts = AMOUNT_FIELDS.filter((field) => !used.has(field))
  if (unlabeledAmounts.length && unlabeledAmounts.length === freeAmounts.length) {
    unlabeledAmounts.forEach((column, index) => {
      column.field = freeAmounts[index]
    })
  } else if (unlabeledAmounts.length === 1 && freeAmounts.length === 1) {
    unlabeledAmounts[0].field = freeAmounts[0]
  } else if (unlabeledAmounts.length === 1 && !used.has("closing")) {
    unlabeledAmounts[0].field = "closing"
  }
  if (!columns.some((column) => column.field === "name")) {
    const textColumn = columns.find((column) => !column.field && !looksLikeAmount(column, dataRows))
    if (textColumn) textColumn.field = "name"
  }
}

function lineFromCells(cells: OcrCell[], columns: Column[]): LoanAnalyticalLine | null {
  const grouped = new Map<LoanField, string[]>()
  for (const cell of cells) {
    const field = fieldForCell(cell, columns)
    if (!field) continue
    const list = grouped.get(field) ?? []
    list.push(cell.text)
    grouped.set(field, list)
  }
  const line: LoanAnalyticalLine = {}
  const name = (grouped.get("name") ?? []).join(" ").trim()
  const tax = (grouped.get("tax") ?? []).join("").replace(/\s/g, "")
  const period = (grouped.get("period") ?? []).join(" ").trim()
  const maturity = (grouped.get("maturity") ?? []).join("").trim()
  const purpose = (grouped.get("purpose") ?? []).join(" ").trim()
  if (name && !TOTAL.test(name)) line.name = name
  if (isTax(tax)) line.taxNumber = tax
  if (period && !isMoney(period)) line.paymentPeriod = period
  if (maturity) line.maturity = parseSloveneDate(maturity) ?? maturity
  if (purpose && !isMoney(purpose)) line.purpose = purpose
  assignCents(line, "openingCents", grouped.get("opening"))
  assignCents(line, "increaseCents", grouped.get("increase"))
  assignCents(line, "decreaseCents", grouped.get("decrease"))
  assignCents(line, "closingCents", grouped.get("closing"))
  assignCents(line, "installmentCents", grouped.get("installment"))
  return loanLineHasData(line) ? line : null
}

function assignCents(
  line: LoanAnalyticalLine,
  key: "openingCents" | "increaseCents" | "decreaseCents" | "closingCents" | "installmentCents",
  parts: string[] | undefined,
) {
  if (!parts?.length) return
  const amount = parseCents(parts.join(""))
  if (amount == null || amount === 0) return
  line[key] = amount
}

function fieldForCell(cell: OcrCell, columns: Column[]): LoanField | undefined {
  let best: { field: LoanField; score: number } | null = null
  for (const column of columns) {
    if (!column.field) continue
    const score = overlap(cell.x0, cell.x1, column.x0, column.x1)
    if (score > 0 && (!best || score > best.score)) best = { field: column.field, score }
  }
  return best?.field
}

function fieldsIn(text: string): LoanField[] {
  const found: { index: number; field: LoanField }[] = []
  for (const spec of HEADER_SPECS) {
    const match = spec.re.exec(text)
    if (match?.index != null) found.push({ index: match.index, field: spec.field })
  }
  found.sort((left, right) => left.index - right.index)
  const fields: LoanField[] = []
  for (const item of found) {
    if (!fields.includes(item.field)) fields.push(item.field)
  }
  return fields
}

function samplesOf(column: Column, rows: OcrCell[][]): string[] {
  const samples: string[] = []
  for (const row of rows) {
    for (const cell of row) {
      if (overlap(cell.x0, cell.x1, column.x0, column.x1) > 0) samples.push(cell.text.trim())
    }
  }
  return samples.filter(Boolean)
}

function looksLikeAmount(column: Column, rows: OcrCell[][]): boolean {
  const samples = samplesOf(column, rows)
  if (!samples.length) return false
  const money = samples.filter(isMoney).length
  return money >= Math.ceil(samples.length / 2)
}

function isMoney(value: string): boolean {
  return MONEY.test(value.trim())
}

function isTax(value: string): boolean {
  return /^\d{8}$/.test(value.replace(/\s/g, ""))
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
}

function centerOf(column: Column): number {
  return (column.x0 + column.x1) / 2
}
