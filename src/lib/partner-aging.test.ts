import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import JSZip from "jszip"

import { disclosureCells, findBankCell } from "./bank-form.ts"
import { fillDhWorkbook } from "./bank-xlsx.ts"
import { clientDatabaseName } from "./browser-book.ts"
import {
  agingSheetCells,
  agingTotalCents,
  parseAgingGrid,
  parseAgingWorkbook,
  partnerPeriodKey,
  type AgingParty,
} from "./partner-aging.ts"

const TEMPLATE = path.join(process.cwd(), "data/templates/dh/razkritja/FRP_EXCEL_DH.xlsx")
const KUPCI = "050 Krat.ter.kupci"
const DOBAVITELJI = "093 Krat.obvez.dobav."

const HEADERS = [
  "zap.",
  "Kupec",
  "davčna",
  "terjatve",
  "Stanje",
  "nezapadlo",
  "zapadlo",
  "do 30",
  "30-60",
  "61-90",
  "91-150",
  "nad 150",
  "nerazporejeno",
]

/** Enajst vrstic iz tabele, ki jo Urška doda h kupcem. Zneski so evri. */
const CUSTOMER_ROWS: (string | number | null)[][] = [
  ["1", "Telemach d.o.o.", "66863627", "", 43923.32, 43923.32, "", "", "", "", "", "", ""],
  ["2", "Zavarovalnica Triglav d.d.", "80040306", "", 27718.4, 27718.4, "", "", "", "", "", "", ""],
  ["3", "Triglav med d.o.o.", "95307320", "", 27718.4, 27718.4, "", "", "", "", "", "", ""],
  ["4", "SŽ Express d.o.o.", "20643691", "", 8285.02, "", 8285.02, "", "", "", "", 8285.02, ""],
  ["5", "Planeta d.o.o.", "74697706", "", 5709.6, 5709.6, "", "", "", "", "", "", ""],
  ["6", "Lienela d.o.o.", "76531384", "", 5600, 5600, "", "", "", "", "", "", ""],
  ["7", "Lienelia d.o.o.", "78073642", "", 2400, 2400, "", "", "", "", "", "", ""],
  ["8", "PBGW3 d.o.o.", "84088982", "", 1880.94, 1880.94, "", "", "", "", "", "", ""],
  ["9", "Ayvens Slovenija d.o.o.", "26485141", "", 1625.5, "", 1625.5, 1625.5, "", "", "", "", ""],
  ["10", "Pivovarna Laško d.o.o.", "90355580", "", 243.37, "", 243.37, "", "", "", "", 243.37, ""],
  ["11", "ostali", "", "", 52.11, "", 52.11, "", "", "", "", 52.11, ""],
  ["", "SKUPAJ", "", "", 125156.66, "", "", "", "", "", "", "", ""],
]

test("enajst kupcev pade v prve vrstice razkritij, skupaj je 125.156,66", async () => {
  const parties = await parseAgingWorkbook(await sheetWorkbook([HEADERS, ...CUSTOMER_ROWS]), "kupci")
  assert.equal(parties.length, 11)
  assert.equal(parties[0]?.name, "Telemach d.o.o.")
  assert.equal(parties[0]?.taxNumber, "66863627")
  assert.equal(parties[0]?.nezapadlo, 4_392_332)
  assert.equal(parties[0]?.stanje, 4_392_332)
  assert.equal(parties[3]?.name, "SŽ Express d.o.o.")
  assert.equal(parties[3]?.d150, 0)
  assert.equal(parties[3]?.nad150, 828_502)
  assert.equal(parties[3]?.zapadlo, 828_502)
  assert.equal(parties[8]?.do30, 162_550)
  assert.equal(parties[9]?.nad150, 24_337)
  assert.equal(parties[10]?.name, "ostali")
  assert.equal(parties[10]?.nezapadlo, 0)
  assert.equal(parties[10]?.zapadlo, 5_211)
  assert.equal(parties[10]?.nad150, 5_211)
  assert.equal(agingTotalCents(parties), 12_515_666)

  const statement = {
    company: "Severnica trgovina d.o.o.",
    period: "1. 1. 2026–31. 7. 2026",
    currentDate: "31. 7. 2026",
    legalForm: "doo" as const,
    balance: { current: { "050": 999 }, previous: {} },
    income: {},
  }
  const before = structuredClone(statement)
  const cells = disclosureCells(statement, { kupci: parties })
  assert.deepEqual(statement, before)
  assert.equal(findBankCell(cells, "BS", "G58")?.euros, 999)
  assert.equal(findBankCell(cells, KUPCI, "B8")?.text, "Telemach d.o.o.")
  assert.equal(findBankCell(cells, KUPCI, "C8")?.text, "66863627")
  assert.equal(findBankCell(cells, KUPCI, "G8")?.euros, 4_392_332)
  assert.equal(findBankCell(cells, KUPCI, "D8")?.euros, 4_392_332)
  assert.equal(findBankCell(cells, KUPCI, "B11")?.text, "SŽ Express d.o.o.")
  assert.equal(findBankCell(cells, KUPCI, "L11"), undefined)
  assert.equal(findBankCell(cells, KUPCI, "M11")?.euros, 828_502)
  assert.equal(findBankCell(cells, KUPCI, "I16")?.euros, 162_550)
  assert.equal(findBankCell(cells, KUPCI, "M17")?.euros, 24_337)
  assert.equal(findBankCell(cells, KUPCI, "B18"), undefined)
  assert.equal(findBankCell(cells, KUPCI, "D18")?.euros, 5_211)
  assert.equal(findBankCell(cells, KUPCI, "G18"), undefined)
  assert.equal(findBankCell(cells, KUPCI, "M18")?.euros, 5_211)
  const written = cells
    .filter((cell) => cell.sheet === KUPCI && cell.euros !== undefined && /^D\d+$/.test(cell.cell))
    .reduce((sum, cell) => sum + (cell.euros ?? 0), 0)
  assert.equal(written, 12_515_666)

  const filled = await fillDhWorkbook(await readFile(TEMPLATE), cells, { dropStaleText: true })
  const zip = await JSZip.loadAsync(filled)
  const xml = await zip.file("xl/worksheets/sheet16.xml")!.async("string")
  assert.equal(cellValue(xml, "B8"), "Telemach d.o.o.")
  assert.equal(cellValue(xml, "G8"), "43923.32")
  assert.equal(cellValue(xml, "M11"), "8285.02")
  assert.doesNotMatch(xml, /<c r="L11"[^/>]*>\s*<v>/)
  assert.equal(cellValue(xml, "M18"), "52.11")
  assert.match(cellInner(xml, "F8"), /<f>D8-E8<\/f>/)
  assert.match(cellInner(xml, "H8"), /<f>SUM\(I8:M8\)<\/f>/)
  let total = 0
  for (let row = 8; row <= 18; row += 1) total += Math.round(Number(cellValue(xml, `D${row}`) ?? "0") * 100)
  assert.equal(total, 12_515_666)
})

test("kartica Fortuna 2026 ostane brez kupcev drugega obdobja", () => {
  const period2026 = "1. 1. 2026–31. 8. 2026"
  const period2025 = "1. 1. 2025–31. 12. 2025"
  assert.notEqual(partnerPeriodKey(period2026), partnerPeriodKey(period2025))
  assert.notEqual(clientDatabaseName("FORTUN d.o.o."), clientDatabaseName("Severnica trgovina d.o.o."))
  const fortun = disclosureCells({
    company: "FORTUN d.o.o.",
    period: period2026,
    currentDate: "31. 8. 2026",
    legalForm: "doo",
    balance: { current: { "050": 1000 }, previous: {} },
    income: {},
  })
  assert.equal(findBankCell(fortun, KUPCI, "B8"), undefined)
  assert.equal(findBankCell(fortun, KUPCI, "D18")?.euros, 1000)
  assert.equal(
    fortun.some((cell) => cell.text?.includes("Telemach")),
    false,
  )
})

test("preostali kupci, ko zmanjka vrstic, gredo v Ostale", () => {
  const rows: AgingParty[] = Array.from({ length: 12 }, (_, index) => party(`Kupec ${index + 1}`, 100))
  const cells = agingSheetCells(KUPCI, "kupci", rows)
  assert.equal(findBankCell(cells, KUPCI, "B8")?.text, "Kupec 1")
  assert.equal(findBankCell(cells, KUPCI, "B17")?.text, "Kupec 10")
  assert.equal(findBankCell(cells, KUPCI, "B18"), undefined)
  assert.equal(findBankCell(cells, KUPCI, "D18")?.euros, 200)
})

test("dobavitelji gredo v stolpce lista obveznosti", async () => {
  const headers = ["Dobavitelj", "davčna", "Stanje", "nezapadlo", "zapadlo", "do 30", "31-60", "61-90", "91-150", "nad 150", "nerazporejeno"]
  const file = await sheetWorkbook([
    ["Seznam"],
    headers,
    ["Ena d.o.o.", "11112222", "10,50", "4,00", "6,50", "6,50", "", "", "", "", ""],
    ["SKUPAJ", "", "10,50", "", "", "", "", "", "", "", ""],
  ])
  const parties = await parseAgingWorkbook(file, "dobavitelji")
  assert.equal(parties[0]?.stanje, 1_050)
  assert.equal(parties[0]?.nezapadlo, 400)
  assert.equal(parties[0]?.do30, 650)
  const cells = agingSheetCells(DOBAVITELJI, "dobavitelji", parties)
  assert.equal(findBankCell(cells, DOBAVITELJI, "B8")?.text, "Ena d.o.o.")
  assert.equal(findBankCell(cells, DOBAVITELJI, "D8")?.euros, 1_050)
  assert.equal(findBankCell(cells, DOBAVITELJI, "E8")?.euros, 400)
  assert.equal(findBankCell(cells, DOBAVITELJI, "G8")?.euros, 650)
  await assert.rejects(parseAgingWorkbook(file, "kupci"), /dobavitelji/)
})

/** Enajst dobaviteljev s posnetka. Stolpca nerazporejeno ni. Prazni razredi ostanejo prazni. */
const SUPPLIER_GRID: string[][] = [
  ["zap.", "Dobavitelj", "Davčna", "Stanje", "Nezapadlo", "Zapadlo", "do 30", "31-60", "61-90", "91-150", "nad 150"],
  ["1", "Medikospot d.o.o.", "44322895", "19.764,00", "", "19.764,00", "19.764,00", "", "", "", ""],
  ["2", "Top Relax srl", "IT 03865270262", "9.564,03", "", "9.564,03", "", "", "", "", "9.564,03"],
  ["3", "MF4L D.O.O.", "63557932", "8.900,00", "8.900,00", "", "", "", "", "", ""],
  ["4", "Uroš Dimnik s.p.", "43672540", "7.200,00", "7.200,00", "", "", "", "", "", ""],
  ["5", "Klemen Janežič s.p.", "45155682", "4.600,00", "4.600,00", "", "", "", "", "", ""],
  ["6", "Studio C6 LTD", "GB", "4.550,00", "4.550,00", "", "", "", "", "", ""],
  ["7", "VENKS d.n.o.", "69427968", "1.952,00", "1.952,00", "", "", "", "", "", ""],
  ["8", "Zavarovalnica Sava d.d.", "44814631", "1.404,16", "1.404,16", "", "", "", "", "", ""],
  ["9", "Bitnet d.o.o.", "55681140", "1.320,04", "1.320,04", "", "", "", "", "", ""],
  ["10", "Hnatura d.o.o.", "31141544", "603,05", "603,05", "", "", "", "", "", ""],
  ["11", "ostali", "", "1.737,22", "936,56", "800,66", "136,00", "", "", "126,36", "538,30"],
  ["", "SKUPAJ", "", "61.594,50", "31.465,81", "30.128,69", "", "", "", "", ""],
]

test("enajst dobaviteljev s posnetka pade na zavihek 093, skupaj je 61.594,50", async () => {
  const parties = parseAgingGrid(SUPPLIER_GRID, "dobavitelji")
  assert.equal(parties.length, 11)
  assert.equal(parties.some((row) => row.name.toLowerCase() === "skupaj"), false)
  assert.equal(parties[0]?.name, "Medikospot d.o.o.")
  assert.equal(parties[0]?.taxNumber, "44322895")
  assert.equal(parties[0]?.stanje, 1_976_400)
  assert.equal(parties[0]?.nezapadlo, 0)
  assert.equal(parties[0]?.zapadlo, 1_976_400)
  assert.equal(parties[0]?.do30, 1_976_400)
  assert.equal(parties[0]?.d60, 0)
  assert.equal(parties[0]?.d90, 0)
  assert.equal(parties[0]?.d150, 0)
  assert.equal(parties[0]?.nad150, 0)
  assert.equal(parties[0]?.nerazporejeno, 0)
  assert.equal(parties[1]?.name, "Top Relax srl")
  assert.equal(parties[1]?.taxNumber, "IT03865270262")
  assert.equal(parties[1]?.stanje, 956_403)
  assert.equal(parties[1]?.nezapadlo, 0)
  assert.equal(parties[1]?.nad150, 956_403)
  assert.equal(parties[1]?.do30, 0)
  assert.equal(parties[2]?.name, "MF4L D.O.O.")
  assert.equal(parties[2]?.nezapadlo, 890_000)
  assert.equal(parties[2]?.zapadlo, 0)
  assert.equal(parties[5]?.name, "Studio C6 LTD")
  assert.equal(parties[5]?.taxNumber, "GB")
  assert.equal(parties[5]?.stanje, 455_000)
  assert.equal(parties[5]?.nezapadlo, 455_000)
  assert.equal(parties[7]?.stanje, 140_416)
  assert.equal(parties[7]?.nezapadlo, 140_416)
  assert.equal(parties[9]?.name, "Hnatura d.o.o.")
  assert.equal(parties[9]?.stanje, 60_305)
  assert.equal(parties[10]?.name, "ostali")
  assert.equal(parties[10]?.taxNumber, "")
  assert.equal(parties[10]?.stanje, 173_722)
  assert.equal(parties[10]?.nezapadlo, 93_656)
  assert.equal(parties[10]?.zapadlo, 80_066)
  assert.equal(parties[10]?.do30, 13_600)
  assert.equal(parties[10]?.d60, 0)
  assert.equal(parties[10]?.d90, 0)
  assert.equal(parties[10]?.d150, 12_636)
  assert.equal(parties[10]?.nad150, 53_830)
  for (const row of parties) {
    assert.equal(row.do30 + row.d60 + row.d90 + row.d150 + row.nad150, row.zapadlo)
    assert.equal(row.nezapadlo + row.zapadlo + row.nerazporejeno, row.stanje)
  }
  assert.equal(agingTotalCents(parties), 6_159_450)

  const statement = {
    company: "Severnica trgovina d.o.o.",
    period: "1. 1. 2026–31. 7. 2026",
    currentDate: "31. 7. 2026",
    legalForm: "doo" as const,
    balance: { current: {}, previous: {} },
    income: {},
  }
  const cells = disclosureCells(statement, { dobavitelji: parties })
  assert.equal(findBankCell(cells, DOBAVITELJI, "B8")?.text, "Medikospot d.o.o.")
  assert.equal(findBankCell(cells, DOBAVITELJI, "C8")?.text, "44322895")
  assert.equal(findBankCell(cells, DOBAVITELJI, "D8")?.euros, 1_976_400)
  assert.equal(findBankCell(cells, DOBAVITELJI, "E8"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "F8"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "G8")?.euros, 1_976_400)
  assert.equal(findBankCell(cells, DOBAVITELJI, "H8"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "I8"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "J8"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "K8"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "L8"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "B9")?.text, "Top Relax srl")
  assert.equal(findBankCell(cells, DOBAVITELJI, "C9")?.text, "IT03865270262")
  assert.equal(findBankCell(cells, DOBAVITELJI, "D9")?.euros, 956_403)
  assert.equal(findBankCell(cells, DOBAVITELJI, "K9")?.euros, 956_403)
  assert.equal(findBankCell(cells, DOBAVITELJI, "G9"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "E10")?.euros, 890_000)
  assert.equal(findBankCell(cells, DOBAVITELJI, "B13")?.text, "Studio C6 LTD")
  assert.equal(findBankCell(cells, DOBAVITELJI, "C13")?.text, "GB")
  assert.equal(findBankCell(cells, DOBAVITELJI, "D17")?.euros, 60_305)
  assert.equal(findBankCell(cells, DOBAVITELJI, "E17")?.euros, 60_305)
  assert.equal(findBankCell(cells, DOBAVITELJI, "B18"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "C18"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "D18")?.euros, 173_722)
  assert.equal(findBankCell(cells, DOBAVITELJI, "E18")?.euros, 93_656)
  assert.equal(findBankCell(cells, DOBAVITELJI, "G18")?.euros, 13_600)
  assert.equal(findBankCell(cells, DOBAVITELJI, "H18"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "I18"), undefined)
  assert.equal(findBankCell(cells, DOBAVITELJI, "J18")?.euros, 12_636)
  assert.equal(findBankCell(cells, DOBAVITELJI, "K18")?.euros, 53_830)
  assert.equal(findBankCell(cells, DOBAVITELJI, "F18"), undefined)
  const written = cells
    .filter((cell) => cell.sheet === DOBAVITELJI && cell.euros !== undefined && /^D\d+$/.test(cell.cell))
    .reduce((sum, cell) => sum + (cell.euros ?? 0), 0)
  assert.equal(written, 6_159_450)
  assert.equal(
    cells.some((cell) => cell.sheet.startsWith("045") && cell.text?.includes("Medikospot")),
    false,
  )
  assert.equal(
    cells.some((cell) => cell.sheet === KUPCI && cell.text?.includes("Medikospot")),
    false,
  )

  const filled = await fillDhWorkbook(await readFile(TEMPLATE), cells, { dropStaleText: true })
  const zip = await JSZip.loadAsync(filled)
  const xml = await zip.file("xl/worksheets/sheet26.xml")!.async("string")
  assert.equal(cellValue(xml, "B8"), "Medikospot d.o.o.")
  assert.equal(cellValue(xml, "C8"), "44322895")
  assert.equal(cellValue(xml, "D8"), "19764")
  assert.equal(cellValue(xml, "G8"), "19764")
  assert.equal(cellValue(xml, "E8"), null)
  assert.equal(cellValue(xml, "K8"), null)
  assert.equal(cellValue(xml, "D9"), "9564.03")
  assert.equal(cellValue(xml, "K9"), "9564.03")
  assert.equal(cellValue(xml, "C9"), "IT03865270262")
  assert.equal(cellValue(xml, "C13"), "GB")
  assert.equal(cellValue(xml, "E15"), "1404.16")
  assert.equal(cellValue(xml, "D16"), "1320.04")
  assert.equal(cellValue(xml, "D17"), "603.05")
  assert.equal(cellValue(xml, "D18"), "1737.22")
  assert.equal(cellValue(xml, "E18"), "936.56")
  assert.equal(cellValue(xml, "G18"), "136")
  assert.equal(cellValue(xml, "J18"), "126.36")
  assert.equal(cellValue(xml, "K18"), "538.30")
  assert.equal(cellValue(xml, "H18"), null)
  assert.equal(cellValue(xml, "I18"), null)
  assert.match(xml, /<c r="B18"[^>]*t="s"/)
  assert.match(cellInner(xml, "F8"), /<f>SUM\(G8:K8\)<\/f>/)
  assert.match(cellInner(xml, "F9"), /<f t="shared" ref="F9:F17"/)
  assert.match(cellInner(xml, "F18"), /<f>SUM\(G18:K18\)<\/f>/)
  assert.match(cellInner(xml, "L8"), /<f>D8-E8-F8<\/f>/)
  assert.match(cellInner(xml, "L9"), /<f t="shared" ref="L9:L18"/)
  assert.match(cellInner(xml, "D19"), /ROUND\(SUM\(D8:D18\),2\)/)
  let total = 0
  for (let row = 8; row <= 18; row += 1) total += Math.round(Number(cellValue(xml, `D${row}`) ?? "0") * 100)
  assert.equal(total, 6_159_450)
  let nezapadlo = 0
  for (let row = 8; row <= 18; row += 1) nezapadlo += Math.round(Number(cellValue(xml, `E${row}`) ?? "0") * 100)
  assert.equal(nezapadlo, 3_146_581)
  const loans = await zip.file("xl/worksheets/sheet14.xml")!.async("string")
  assert.doesNotMatch(loans, /Medikospot/)
  const buyers = await zip.file("xl/worksheets/sheet16.xml")!.async("string")
  assert.doesNotMatch(buyers, /Medikospot/)
})

test("prazna terjatve se ne vpiše, izpolnjena pa gre v bruto in slabitev", () => {
  const gross = party("Kupec d.o.o.", 8_000)
  gross.terjatve = 10_000
  const cells = agingSheetCells(KUPCI, "kupci", [gross])
  assert.equal(findBankCell(cells, KUPCI, "D8")?.euros, 10_000)
  assert.equal(findBankCell(cells, KUPCI, "E8")?.euros, 2_000)
})

function party(name: string, stanje: number): AgingParty {
  return {
    name,
    taxNumber: "",
    terjatve: 0,
    stanje,
    nezapadlo: stanje,
    zapadlo: 0,
    do30: 0,
    d60: 0,
    d90: 0,
    d150: 0,
    nad150: 0,
    nerazporejeno: 0,
  }
}

function cellInner(xml: string, ref: string): string {
  if (new RegExp(`<c r="${ref}"[^>]*/>`).test(xml)) return ""
  const match = new RegExp(`<c r="${ref}"[^>]*>([\\s\\S]*?)</c>`).exec(xml)
  return match?.[1] ?? ""
}

function cellValue(xml: string, ref: string): string | null {
  const inner = cellInner(xml, ref)
  if (!inner) return null
  return /<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? /<t[^>]*>([^<]*)<\/t>/.exec(inner)?.[1] ?? null
}

async function sheetWorkbook(rows: (string | number | null)[][]): Promise<Uint8Array> {
  const strings: string[] = []
  const indexOf = (value: string) => {
    const found = strings.indexOf(value)
    if (found >= 0) return found
    strings.push(value)
    return strings.length - 1
  }
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, column) => {
          if (value === null || value === "") return ""
          const ref = `${columnName(column)}${rowIndex + 1}`
          if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`
          return `<c r="${ref}" t="s"><v>${indexOf(value)}</v></c>`
        })
        .join("")
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join("")
  const shared = strings
    .map((value) => `<si><t xml:space="preserve">${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</t></si>`)
    .join("")
  const zip = new JSZip()
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
  )
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`)
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Kupci" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  )
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  )
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`,
  )
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${shared}</sst>`,
  )
  return zip.generateAsync({ type: "uint8array" })
}

function columnName(index: number): string {
  let value = index + 1
  let name = ""
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}
