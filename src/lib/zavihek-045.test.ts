import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import JSZip from "jszip"

import { disclosureCells, excelSerial, findBankCell } from "./bank-form.ts"
import { fillDhWorkbook } from "./bank-xlsx.ts"
import {
  SHEET_045,
  applySheet045,
  loan045Cells,
  loan045ForPeriod,
  parseLoanTsv,
  type LoanAnalyticalLine,
} from "./zavihek-045.ts"

const TEMPLATE = path.join(process.cwd(), "data/templates/dh/razkritja/FRP_EXCEL_DH.xlsx")

const THREE_LINES: LoanAnalyticalLine[] = [
  {
    name: "Ana Novak d.o.o.",
    taxNumber: "12345678",
    openingCents: 10050,
    increaseCents: 2000,
    purpose: "obratna sredstva",
  },
  {
    name: "Borut Kralj",
    taxNumber: "87654321",
    closingCents: 25075,
    installmentCents: 1500,
    paymentPeriod: "mesečno",
    maturity: "31. 12. 2026",
  },
  {
    name: "Cvetka Hribar s.p.",
    taxNumber: "11223344",
    openingCents: 100000,
    decreaseCents: 5000,
  },
]

test("tri analitične vrstice padejo na zavihek 045", async () => {
  const cells = loan045Cells(THREE_LINES)
  assert.equal(findBankCell(cells, SHEET_045, "B8")?.text, "Ana Novak d.o.o.")
  assert.equal(findBankCell(cells, SHEET_045, "C8")?.text, "12345678")
  assert.equal(findBankCell(cells, SHEET_045, "D8")?.euros, 10050)
  assert.equal(findBankCell(cells, SHEET_045, "E8")?.euros, 2000)
  assert.equal(findBankCell(cells, SHEET_045, "F8"), undefined)
  assert.equal(findBankCell(cells, SHEET_045, "G8"), undefined)
  assert.equal(findBankCell(cells, SHEET_045, "K8")?.text, "obratna sredstva")
  assert.equal(findBankCell(cells, SHEET_045, "B9")?.text, "Borut Kralj")
  assert.equal(findBankCell(cells, SHEET_045, "D9"), undefined)
  assert.equal(findBankCell(cells, SHEET_045, "G9")?.euros, 25075)
  assert.equal(findBankCell(cells, SHEET_045, "H9")?.euros, 1500)
  assert.equal(findBankCell(cells, SHEET_045, "I9")?.text, "mesečno")
  assert.equal(findBankCell(cells, SHEET_045, "J9")?.number, excelSerial({ day: 31, month: 12, year: 2026 }))
  assert.equal(findBankCell(cells, SHEET_045, "B10")?.text, "Cvetka Hribar s.p.")
  assert.equal(findBankCell(cells, SHEET_045, "D10")?.euros, 100000)
  assert.equal(findBankCell(cells, SHEET_045, "F10")?.euros, 5000)
  assert.equal(findBankCell(cells, SHEET_045, "G10"), undefined)
  assert.equal(findBankCell(cells, SHEET_045, "B11"), undefined)
  assert.equal(findBankCell(cells, SHEET_045, "D18"), undefined)
  assert.equal(findBankCell(cells, SHEET_045, "B18"), undefined)

  const base = disclosureCells({
    company: "Fortun d.o.o.",
    period: "1. 1. 2025–31. 12. 2025",
    currentDate: "31. 12. 2025",
    legalForm: "doo",
    balance: { current: { "046": 99999, "047": 1 }, previous: {} },
    income: {},
  })
  assert.equal(findBankCell(base, SHEET_045, "E18")?.euros, 100000)
  const applied = applySheet045(base, THREE_LINES)
  assert.equal(findBankCell(applied, SHEET_045, "E18"), undefined)
  assert.equal(findBankCell(applied, SHEET_045, "D18"), undefined)
  assert.equal(findBankCell(applied, SHEET_045, "B8")?.text, "Ana Novak d.o.o.")
  assert.equal(findBankCell(applied, "BS", "G54")?.euros, 99999)

  const filled = await fillDhWorkbook(await readFile(TEMPLATE), applied, { dropStaleText: true })
  const zip = await JSZip.loadAsync(filled)
  const xml = await zip.file("xl/worksheets/sheet14.xml")!.async("string")
  assert.match(xml, /<c r="B8"[^>]*t="inlineStr"[^>]*>[\s\S]*Ana Novak d\.o\.o\./)
  assert.match(xml, /<c r="D8"[^>]*><v>100\.50<\/v><\/c>/)
  assert.match(xml, /<c r="E8"[^>]*><v>20<\/v><\/c>/)
  assert.match(xml, /<c r="G9"[^>]*><v>250\.75<\/v><\/c>/)
  assert.match(xml, /<c r="H9"[^>]*><v>15<\/v><\/c>/)
  assert.match(xml, /<c r="B10"[^>]*>[\s\S]*Cvetka Hribar s\.p\./)
  assert.match(xml, /<c r="D10"[^>]*><v>1000<\/v><\/c>/)
  assert.match(xml, /<c r="F10"[^>]*><v>50<\/v><\/c>/)
  assert.match(xml, /<c r="G8"[^>]*>[\s\S]*<f>D8\+E8-F8<\/f>/)
  assert.match(xml, /<f t="shared" ref="G10:G18" si="0">D10\+E10-F10<\/f>/)
  assert.match(xml, /<c r="G11"[^>]*><f t="shared" si="0"\/>/)
  assert.match(xml, /<c r="B11"[^/]*\/>/)
  assert.doesNotMatch(xml, /ref="L10:L18"/)
  assert.doesNotMatch(xml, /<c r="D18"[^>]*>\s*<v>/)
})

test("preostanek gre samo na vrstico OSTALI", () => {
  const lines: LoanAnalyticalLine[] = Array.from({ length: 12 }, (_, index) => ({
    name: `Posojilo ${index + 1}`,
    openingCents: 100,
  }))
  lines.push({ name: "Ostali", decreaseCents: 40 })
  const cells = loan045Cells(lines)
  assert.equal(findBankCell(cells, SHEET_045, "B8")?.text, "Posojilo 1")
  assert.equal(findBankCell(cells, SHEET_045, "B17")?.text, "Posojilo 10")
  assert.equal(findBankCell(cells, SHEET_045, "B18"), undefined)
  assert.equal(findBankCell(cells, SHEET_045, "D18")?.euros, 200)
  assert.equal(findBankCell(cells, SHEET_045, "F18")?.euros, 40)
  assert.equal(findBankCell(cells, SHEET_045, "B19"), undefined)
})

test("prazna polja ostanejo prazna in drugo obdobje se ne zamenja", () => {
  const cells = loan045Cells([{ name: "Samo naziv" }, {}])
  assert.equal(findBankCell(cells, SHEET_045, "B8")?.text, "Samo naziv")
  assert.equal(cells.filter((cell) => cell.cell !== "B8").length, 0)

  const year2025: LoanAnalyticalLine[] = [{ name: "Lanski", openingCents: 500 }]
  const records = [
    { company: "Fortun d.o.o.", period: "1. 1. 2025–31. 12. 2025", lines: year2025 },
    { company: "Fortun d.o.o.", period: "1. 1. 2026–31. 8. 2026", lines: [] as LoanAnalyticalLine[] },
  ]
  assert.equal(loan045ForPeriod(records, "FORTUN d.o.o.", "1. 1. 2026–31. 8. 2026")?.lines.length, 0)
  assert.equal(loan045ForPeriod(records, "Fortun d.o.o.", "1. 1. 2025–31. 12. 2025")?.lines[0]?.name, "Lanski")
  assert.equal(applySheet045([{ sheet: SHEET_045, cell: "D18", euros: 500 }], []).length, 1)
})

test("tsv posnetka da tri analitične vrstice", async () => {
  const tsv = await readFile(path.join(process.cwd(), "src/lib/fixtures/posojila-045.tsv"), "utf8")
  const lines = parseLoanTsv(tsv)
  assert.equal(lines.length, 3)
  assert.equal(lines[0]?.name, "Ana Novak d.o.o.")
  assert.equal(lines[0]?.taxNumber, "12345678")
  assert.equal(lines[0]?.openingCents, 10050)
  assert.equal(lines[0]?.increaseCents, 2000)
  assert.equal(lines[0]?.closingCents, 12050)
  assert.equal(lines[0]?.purpose, "obratna sredstva")
  assert.equal(lines[1]?.name, "Borut Kralj")
  assert.equal(lines[1]?.taxNumber, "87654321")
  assert.equal(lines[1]?.closingCents, 25075)
  assert.equal(lines[1]?.installmentCents, 1500)
  assert.equal(lines[1]?.paymentPeriod, "mesečno")
  assert.equal(lines[1]?.maturity, "31. 12. 2026")
  assert.equal(lines[2]?.name, "Cvetka Hribar s.p.")
  assert.equal(lines[2]?.openingCents, 100000)
  assert.equal(lines[2]?.decreaseCents, 5000)
  assert.equal(lines[2]?.closingCents, 95000)
  const cells = loan045Cells(lines)
  assert.equal(findBankCell(cells, SHEET_045, "B8")?.text, "Ana Novak d.o.o.")
  assert.equal(findBankCell(cells, SHEET_045, "B9")?.text, "Borut Kralj")
  assert.equal(findBankCell(cells, SHEET_045, "B10")?.text, "Cvetka Hribar s.p.")
  assert.equal(findBankCell(cells, SHEET_045, "G8"), undefined)
  assert.equal(findBankCell(cells, SHEET_045, "G9")?.euros, 25075)
})
