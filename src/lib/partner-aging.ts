import JSZip from "jszip"

import type { BankCell } from "@/lib/bank-form"
import { parseCents } from "@/lib/format"

/** Starostna razčlenitev kupcev ali dobaviteljev, zneski v centih. */
export type AgingParty = {
  name: string
  taxNumber: string
  terjatve: number
  stanje: number
  nezapadlo: number
  zapadlo: number
  do30: number
  d60: number
  d90: number
  d150: number
  nad150: number
  nerazporejeno: number
}

export type AgingKind = "kupci" | "dobavitelji"

export type DisclosurePartners = {
  kupci?: AgingParty[]
  dobavitelji?: AgingParty[]
}

/** Predloga ima deset imenskih vrstic, enajsta je Ostali. */
export const AGING_NAME_SLOTS = 10
const FIRST_ROW = 8
const OSTALI_ROW = 18

export class AgingTableError extends Error {}

/** Ključ obdobja v bazi stranke. Drugo obdobje iste stranke ima svoj zapis. */
export function partnerPeriodKey(period: string): string {
  return period.trim()
}

export function agingTotalCents(rows: AgingParty[]): number {
  return rows.reduce((sum, row) => sum + Math.round(row.stanje), 0)
}

export function isOstaliName(name: string): boolean {
  const clean = name.trim().toLocaleLowerCase("sl")
  return clean === "ostali" || clean.startsWith("ostali ")
}

/** Imenovane vrstice od vrha. Ostali in preostanek, ko zmanjka vrstic, gresta v skupno vrstico. */
export function layoutAging(rows: AgingParty[]): { named: AgingParty[]; ostali: AgingParty | null } {
  const named: AgingParty[] = []
  const bucket: AgingParty[] = []
  for (const row of rows) {
    if (isOstaliName(row.name)) bucket.push(row)
    else named.push(row)
  }
  const visible = named.slice(0, AGING_NAME_SLOTS)
  const overflow = named.slice(AGING_NAME_SLOTS)
  const merged = [...overflow, ...bucket]
  if (!merged.length) return { named: visible, ostali: null }
  return { named: visible, ostali: sumParties(merged) }
}

/**
 * Vpis v list predloge. Stanje, zapadlo in nerazporejeno, kjer so formule, pusti formulam.
 * Prazni razredi ostanejo prazni.
 */
export function agingSheetCells(sheet: string, kind: AgingKind, rows: AgingParty[]): BankCell[] {
  const { named, ostali } = layoutAging(rows)
  const cells: BankCell[] = []
  named.forEach((party, index) => writeParty(cells, sheet, kind, FIRST_ROW + index, party, false))
  if (ostali) writeParty(cells, sheet, kind, OSTALI_ROW, ostali, true)
  return cells
}

export async function parseAgingWorkbook(data: ArrayBuffer | Uint8Array, expected: AgingKind): Promise<AgingParty[]> {
  let sheets: string[][][]
  try {
    sheets = await workbookGrids(data)
  } catch (error) {
    if (error instanceof AgingTableError) throw error
    throw new AgingTableError("Datoteka naj bo Excel (.xlsx).")
  }
  if (!sheets.length) throw new AgingTableError("Datoteka naj bo Excel (.xlsx).")
  let found: AgingParty[] | null = null
  let failure: AgingTableError | null = null
  for (const grid of sheets) {
    try {
      const rows = parseAgingGrid(grid, expected)
      if (rows.length) {
        found = rows
        break
      }
    } catch (error) {
      if (error instanceof AgingTableError) failure = error
    }
  }
  if (found?.length) return found
  if (failure) throw failure
  throw new AgingTableError(expected === "kupci" ? "V tabeli ni kupcev." : "V tabeli ni dobaviteljev.")
}

export function parseAgingGrid(grid: string[][], expected: AgingKind): AgingParty[] {
  const header = findHeader(grid, expected)
  const rows: AgingParty[] = []
  for (let index = header.row + 1; index < grid.length; index += 1) {
    const line = grid[index] ?? []
    if (line.some((cell) => isTotal(cell))) break
    const name = (line[header.name] ?? "").trim()
    if (!name || isTotal(name)) continue
    rows.push({
      name,
      taxNumber: taxText(line[header.davcna] ?? ""),
      terjatve: header.terjatve === undefined ? 0 : centsOf(line[header.terjatve] ?? ""),
      stanje: centsOf(line[header.stanje] ?? ""),
      nezapadlo: centsOf(line[header.nezapadlo] ?? ""),
      zapadlo: centsOf(line[header.zapadlo] ?? ""),
      do30: centsOf(line[header.do30] ?? ""),
      d60: centsOf(line[header.d60] ?? ""),
      d90: centsOf(line[header.d90] ?? ""),
      d150: centsOf(line[header.d150] ?? ""),
      nad150: centsOf(line[header.nad150] ?? ""),
      nerazporejeno: centsOf(line[header.nerazporejeno] ?? ""),
    })
  }
  if (!rows.length) throw new AgingTableError(expected === "kupci" ? "V tabeli ni kupcev." : "V tabeli ni dobaviteljev.")
  return rows
}

export function sanitizeAgingParties(value: unknown): AgingParty[] | null {
  if (!Array.isArray(value)) return null
  const rows: AgingParty[] = []
  for (const item of value.slice(0, 400)) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === "string" ? record.name.trim().slice(0, 200) : ""
    if (!name) continue
    const tax = typeof record.taxNumber === "string" ? record.taxNumber.replace(/\s/g, "").slice(0, 32) : ""
    rows.push({
      name,
      taxNumber: tax,
      terjatve: centsField(record.terjatve),
      stanje: centsField(record.stanje),
      nezapadlo: centsField(record.nezapadlo),
      zapadlo: centsField(record.zapadlo),
      do30: centsField(record.do30),
      d60: centsField(record.d60),
      d90: centsField(record.d90),
      d150: centsField(record.d150),
      nad150: centsField(record.nad150),
      nerazporejeno: centsField(record.nerazporejeno),
    })
  }
  return rows
}

type HeaderMap = {
  row: number
  name: number
  davcna: number
  stanje: number
  nezapadlo: number
  zapadlo: number
  do30: number
  d60: number
  d90: number
  d150: number
  nad150: number
  nerazporejeno: number
  terjatve?: number
}

function findHeader(grid: string[][], expected: AgingKind): HeaderMap {
  const limit = Math.min(grid.length, 40)
  for (let row = 0; row < limit; row += 1) {
    const line = grid[row] ?? []
    const columns = new Map<string, number>()
    line.forEach((cell, index) => {
      const kind = classifyHeader(cell)
      if (kind && !columns.has(kind)) columns.set(kind, index)
    })
    if (!columns.has("kupec") && !columns.has("dobavitelj")) continue
    if (!columns.has("stanje")) continue
    const nameKind = columns.has("kupec") ? "kupec" : "dobavitelj"
    if (columns.has("kupec") && columns.has("dobavitelj")) {
      throw new AgingTableError("Tabela naj ima stolpec Kupec ali stolpec Dobavitelj.")
    }
    if (expected === "kupci" && nameKind === "dobavitelj") {
      throw new AgingTableError("V tej tabeli so dobavitelji. Za kupce naložite tabelo s stolpcem Kupec.")
    }
    if (expected === "dobavitelji" && nameKind === "kupec") {
      throw new AgingTableError("V tej tabeli so kupci. Za dobavitelje naložite tabelo s stolpcem Dobavitelj.")
    }
    const required = ["davcna", "stanje", "nezapadlo", "zapadlo", "do30", "d60", "d90", "d150", "nad150", "nerazporejeno"] as const
    if (required.some((key) => !columns.has(key))) {
      const who = expected === "kupci" ? "Kupec" : "Dobavitelj"
      throw new AgingTableError(
        `Tabela naj ima stolpce ${who}, davčna, Stanje, nezapadlo, zapadlo, do 30, 30-60, 61-90, 91-150, nad 150 in nerazporejeno.`,
      )
    }
    return {
      row,
      name: columns.get(nameKind) ?? 0,
      davcna: columns.get("davcna") ?? 0,
      stanje: columns.get("stanje") ?? 0,
      nezapadlo: columns.get("nezapadlo") ?? 0,
      zapadlo: columns.get("zapadlo") ?? 0,
      do30: columns.get("do30") ?? 0,
      d60: columns.get("d60") ?? 0,
      d90: columns.get("d90") ?? 0,
      d150: columns.get("d150") ?? 0,
      nad150: columns.get("nad150") ?? 0,
      nerazporejeno: columns.get("nerazporejeno") ?? 0,
      terjatve: columns.get("terjatve"),
    }
  }
  const who = expected === "kupci" ? "Kupec" : "Dobavitelj"
  throw new AgingTableError(
    `Tabela naj ima stolpce ${who}, davčna, Stanje, nezapadlo, zapadlo, do 30, 30-60, 61-90, 91-150, nad 150 in nerazporejeno.`,
  )
}

function classifyHeader(value: string): string | null {
  const header = normHeader(value)
  if (!header || header === "zap" || header === "zap.") return null
  if (header === "kupec" || header.startsWith("kupec ") || header === "kupci") return "kupec"
  if (header === "dobavitelj" || header.startsWith("dobavitelj")) return "dobavitelj"
  if (header.includes("davc") || header === "stevilka" || header.endsWith(" stevilka")) return "davcna"
  if (header.includes("terjat")) return "terjatve"
  if (header.includes("stanje")) return "stanje"
  if (header.includes("nezapad")) return "nezapadlo"
  if (header.includes("nerazp")) return "nerazporejeno"
  if (header.includes("zapad")) return "zapadlo"
  if (/do\s*30/.test(header)) return "do30"
  if (/31\s*-\s*60|30\s*-\s*60/.test(header)) return "d60"
  if (/61\s*-\s*90/.test(header)) return "d90"
  if (/91\s*-\s*150/.test(header)) return "d150"
  if (/nad\s*150/.test(header)) return "nad150"
  return null
}

function normHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
}

function isTotal(value: string): boolean {
  const clean = normHeader(value)
  return clean === "skupaj" || clean.startsWith("skupaj ")
}

function centsOf(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === "-" || trimmed === "—" || trimmed === "–") return 0
  if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 100)
  return parseCents(trimmed) ?? 0
}

function taxText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  if (/^\d+\.0+$/.test(trimmed)) return trimmed.replace(/\.0+$/, "")
  return trimmed.replace(/\s/g, "")
}

function centsField(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.round(value)
}

function sumParties(rows: AgingParty[]): AgingParty {
  const total: AgingParty = {
    name: "OSTALI",
    taxNumber: "",
    terjatve: 0,
    stanje: 0,
    nezapadlo: 0,
    zapadlo: 0,
    do30: 0,
    d60: 0,
    d90: 0,
    d150: 0,
    nad150: 0,
    nerazporejeno: 0,
  }
  for (const row of rows) {
    total.terjatve += row.terjatve
    total.stanje += row.stanje
    total.nezapadlo += row.nezapadlo
    total.zapadlo += row.zapadlo
    total.do30 += row.do30
    total.d60 += row.d60
    total.d90 += row.d90
    total.d150 += row.d150
    total.nad150 += row.nad150
    total.nerazporejeno += row.nerazporejeno
  }
  const taxes = rows.map((row) => row.taxNumber.trim()).filter(Boolean)
  if (rows.length === 1 && taxes.length === 1) total.taxNumber = taxes[0] ?? ""
  return total
}

function writeParty(
  cells: BankCell[],
  sheet: string,
  kind: AgingKind,
  row: number,
  party: AgingParty,
  ostali: boolean,
) {
  if (!ostali) text(cells, sheet, `B${row}`, party.name)
  if (party.taxNumber) text(cells, sheet, `C${row}`, party.taxNumber)
  if (kind === "kupci") {
    if (party.terjatve) {
      euros(cells, sheet, `D${row}`, party.terjatve)
      euros(cells, sheet, `E${row}`, party.terjatve - party.stanje)
    } else {
      euros(cells, sheet, `D${row}`, party.stanje)
    }
    euros(cells, sheet, `G${row}`, party.nezapadlo)
    euros(cells, sheet, `I${row}`, party.do30)
    euros(cells, sheet, `J${row}`, party.d60)
    euros(cells, sheet, `K${row}`, party.d90)
    euros(cells, sheet, `L${row}`, party.d150)
    euros(cells, sheet, `M${row}`, party.nad150)
    return
  }
  euros(cells, sheet, `D${row}`, party.stanje)
  euros(cells, sheet, `E${row}`, party.nezapadlo)
  euros(cells, sheet, `G${row}`, party.do30)
  euros(cells, sheet, `H${row}`, party.d60)
  euros(cells, sheet, `I${row}`, party.d90)
  euros(cells, sheet, `J${row}`, party.d150)
  euros(cells, sheet, `K${row}`, party.nad150)
}

function euros(cells: BankCell[], sheet: string, cell: string, cents: number) {
  const amount = Math.round(cents)
  if (!amount) return
  cells.push({ sheet, cell, euros: amount })
}

function text(cells: BankCell[], sheet: string, cell: string, value: string) {
  const clean = value.trim()
  if (!clean) return
  cells.push({ sheet, cell, text: clean })
}

async function workbookGrids(data: ArrayBuffer | Uint8Array): Promise<string[][][]> {
  const zip = await JSZip.loadAsync(data)
  const workbook = await zip.file("xl/workbook.xml")?.async("string")
  const rels = await zip.file("xl/_rels/workbook.xml.rels")?.async("string")
  if (!workbook || !rels) throw new AgingTableError("Datoteka naj bo Excel (.xlsx).")
  const targets = new Map<string, string>()
  for (const tag of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(tag[0], "Id")
    const target = attr(tag[0], "Target")
    if (!id || !target) continue
    const path = target.replace(/^\//, "").replace(/^xl\//, "")
    targets.set(id, path.startsWith("xl/") ? path : `xl/${path}`)
  }
  const strings = await readSharedStrings(zip)
  const grids: string[][][] = []
  for (const tag of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const id = attr(tag[0], "r:id")
    if (!id) continue
    const path = targets.get(id)
    if (!path) continue
    const xml = await zip.file(path)?.async("string")
    if (!xml) continue
    grids.push(gridFromSheet(xml, strings))
  }
  return grids
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file("xl/sharedStrings.xml")
  if (!file) return []
  const xml = await file.async("string")
  const strings: string[] = []
  for (const item of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...(item[1] ?? "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1] ?? ""))
    strings.push(parts.join(""))
  }
  return strings
}

function gridFromSheet(xml: string, strings: string[]): string[][] {
  const grid: string[][] = []
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
  for (const match of xml.matchAll(cellRe)) {
    const ref = attr(match[1] ?? "", "r")
    if (!ref) continue
    const column = columnIndex(ref)
    const row = rowIndex(ref)
    if (row < 0 || row > 5000 || column < 0 || column > 40) continue
    const value = cellText(match[1] ?? "", match[2] ?? "", strings)
    if (!value) continue
    const line = grid[row] ?? []
    line[column] = value
    grid[row] = line
  }
  return grid
}

function cellText(attrs: string, inner: string, strings: string[]): string {
  const type = attr(attrs, "t")
  if (type === "s") {
    const index = Number(/<v>(\d+)<\/v>/.exec(inner)?.[1] ?? "")
    return strings[index] ?? ""
  }
  if (type === "inlineStr") {
    return [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1] ?? "")).join("")
  }
  const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
  if (!raw) return ""
  if (type === "str") return decodeXml(raw)
  const number = Number(raw)
  if (!Number.isFinite(number)) return decodeXml(raw)
  if (Math.abs(number - Math.round(number)) < 1e-6 && Math.abs(number) < 1e15) return String(Math.round(number))
  return (Math.round(number * 100) / 100).toFixed(2)
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? ""
  let value = 0
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64)
  return value - 1
}

function rowIndex(ref: string): number {
  const row = /\d+$/.exec(ref)?.[0]
  return row ? Number(row) - 1 : -1
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}="([^"]*)"`).exec(tag)
  return match?.[1] ?? null
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
}
