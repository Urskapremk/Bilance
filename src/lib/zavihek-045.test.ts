import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import JSZip from "jszip"

import { disclosureCells, excelSerial, findBankCell } from "./bank-form.ts"
import { fillDhWorkbook } from "./bank-xlsx.ts"
import {
  SHEET_045,
  SHEET_076,
  applyLoanSheet,
  applySheet045,
  loan045Cells,
  loan045ForPeriod,
  loanSheetCells,
  parseAnalyticalGrid,
  parseAnalyticalTsv,
  parseLoanGrid,
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

const AGING_HEADERS = [
  "zap.",
  "Posojilodajalec",
  "davčna",
  "Stanje",
  "Nezapadlo",
  "Zapadlo",
  "do 30",
  "31-60",
  "61-90",
  "91-150",
  "nad 150",
]

test("dve vrstici gresta na zavihek 045 in dve na zavihek 076", async () => {
  const loans: LoanAnalyticalLine[] = [
    { name: "Ana Novak d.o.o.", taxNumber: "12345678", openingCents: 10050, increaseCents: 2000 },
    { name: "Borut Kralj", taxNumber: "87654321", closingCents: 25075 },
  ]
  const sheet045 = loanSheetCells(SHEET_045, loans)
  assert.equal(findBankCell(sheet045, SHEET_045, "B8")?.text, "Ana Novak d.o.o.")
  assert.equal(findBankCell(sheet045, SHEET_045, "C8")?.text, "12345678")
  assert.equal(findBankCell(sheet045, SHEET_045, "D8")?.euros, 10050)
  assert.equal(findBankCell(sheet045, SHEET_045, "E8")?.euros, 2000)
  assert.equal(findBankCell(sheet045, SHEET_045, "F8"), undefined)
  assert.equal(findBankCell(sheet045, SHEET_045, "G8"), undefined)
  assert.equal(findBankCell(sheet045, SHEET_045, "B9")?.text, "Borut Kralj")
  assert.equal(findBankCell(sheet045, SHEET_045, "D9"), undefined)
  assert.equal(findBankCell(sheet045, SHEET_045, "G9")?.euros, 25075)
  assert.equal(findBankCell(sheet045, SHEET_045, "B10"), undefined)

  const fromScreen = parseAnalyticalGrid([
    AGING_HEADERS,
    ["1", "Sid banka d.d.", "12345678", "1.500,25", "1.000,00", "500,25", "500,25", "", "", "", ""],
    ["2", "NLB d.d.", "87654321", "80,10", "", "80,10", "", "", "", "", "80,10"],
    ["", "SKUPAJ", "", "1.580,35", "", "", "", "", "", "", ""],
  ])
  assert.equal(fromScreen.length, 2)
  assert.equal(fromScreen[0]?.name, "Sid banka d.d.")
  assert.equal(fromScreen[0]?.taxNumber, "12345678")
  assert.equal(fromScreen[0]?.closingCents, 150025)
  assert.equal(fromScreen[0]?.openingCents, undefined)
  assert.equal(fromScreen[0]?.increaseCents, undefined)
  assert.equal(fromScreen[1]?.name, "NLB d.d.")
  assert.equal(fromScreen[1]?.closingCents, 8010)
  assert.equal(fromScreen[1]?.decreaseCents, undefined)

  const tsvLines = parseAnalyticalTsv(
    [
      tsvWord("Posojilojemalec", 40, 20, 120),
      tsvWord("davčna", 220, 20, 70),
      tsvWord("Stanje", 340, 20, 70),
      tsvWord("Nezapadlo", 460, 20, 80),
      tsvWord("Zapadlo", 580, 20, 70),
      tsvWord("do 30", 700, 20, 50),
      tsvWord("31-60", 800, 20, 50),
      tsvWord("61-90", 900, 20, 50),
      tsvWord("91-150", 1000, 20, 60),
      tsvWord("nad 150", 1120, 20, 60),
      tsvWord("Mojposoj", 40, 52, 80),
      tsvWord("11223344", 220, 52, 80),
      tsvWord("10,50", 340, 52, 50),
      tsvWord("10,50", 460, 52, 50),
      tsvWord("Drugposoj", 40, 84, 80),
      tsvWord("44332211", 220, 84, 80),
      tsvWord("2,25", 340, 84, 40),
      tsvWord("2,25", 580, 84, 40),
    ].join("\n"),
  )
  assert.equal(tsvLines.length, 2)
  assert.equal(tsvLines[0]?.name, "Mojposoj")
  assert.equal(tsvLines[0]?.closingCents, 1050)
  assert.equal(tsvLines[0]?.openingCents, undefined)
  assert.equal(tsvLines[1]?.name, "Drugposoj")
  assert.equal(tsvLines[1]?.closingCents, 225)

  const sheet076 = loanSheetCells(SHEET_076, fromScreen)
  assert.equal(findBankCell(sheet076, SHEET_076, "B8")?.text, "Sid banka d.d.")
  assert.equal(findBankCell(sheet076, SHEET_076, "C8")?.text, "12345678")
  assert.equal(findBankCell(sheet076, SHEET_076, "G8")?.euros, 150025)
  assert.equal(findBankCell(sheet076, SHEET_076, "D8"), undefined)
  assert.equal(findBankCell(sheet076, SHEET_076, "E8"), undefined)
  assert.equal(findBankCell(sheet076, SHEET_076, "H8"), undefined)
  assert.equal(findBankCell(sheet076, SHEET_076, "B9")?.text, "NLB d.d.")
  assert.equal(findBankCell(sheet076, SHEET_076, "G9")?.euros, 8010)
  assert.equal(findBankCell(sheet076, SHEET_076, "D9"), undefined)
  assert.equal(sheet076.some((cell) => cell.sheet !== SHEET_076), false)
  assert.equal(sheet076.some((cell) => cell.euros === 100000), false)

  const fortun = disclosureCells({
    company: "Fortun d.o.o.",
    period: "1. 1. 2026–31. 8. 2026",
    currentDate: "31. 8. 2026",
    legalForm: "doo",
    balance: { current: { "046": 11100, "077": 22200 }, previous: {} },
    income: {},
  })
  const kept = applyLoanSheet(applyLoanSheet(fortun, SHEET_045, []), SHEET_076, null)
  assert.equal(findBankCell(kept, SHEET_045, "E18")?.euros, 11100)
  assert.equal(findBankCell(kept, SHEET_076, "E18")?.euros, 22200)
  const records = [
    { company: "Fortun d.o.o.", period: "1. 1. 2025–31. 12. 2025", lines: fromScreen },
    { company: "Fortun d.o.o.", period: "1. 1. 2026–31. 8. 2026", lines: [] as LoanAnalyticalLine[] },
  ]
  assert.equal(loan045ForPeriod(records, "FORTUN d.o.o.", "1. 1. 2026–31. 8. 2026")?.lines.length, 0)
  assert.equal(loan045ForPeriod(records, "Fortun d.o.o.", "1. 1. 2025–31. 12. 2025")?.lines[0]?.name, "Sid banka d.d.")

  const applied = applyLoanSheet(applyLoanSheet(fortun, SHEET_045, loans), SHEET_076, fromScreen)
  assert.equal(findBankCell(applied, SHEET_045, "E18"), undefined)
  assert.equal(findBankCell(applied, SHEET_076, "E18"), undefined)
  assert.equal(findBankCell(applied, SHEET_045, "D8")?.euros, 10050)
  assert.equal(findBankCell(applied, SHEET_076, "G8")?.euros, 150025)

  const filled = await fillDhWorkbook(await readFile(TEMPLATE), applied, { dropStaleText: true })
  const zip = await JSZip.loadAsync(filled)
  const loansXml = await zip.file("xl/worksheets/sheet14.xml")!.async("string")
  const liabilitiesXml = await zip.file("xl/worksheets/sheet22.xml")!.async("string")
  assert.match(loansXml, /<c r="D8"[^>]*><v>100\.50<\/v><\/c>/)
  assert.match(loansXml, /<c r="E8"[^>]*><v>20<\/v><\/c>/)
  assert.match(loansXml, /<c r="G9"[^>]*><v>250\.75<\/v><\/c>/)
  assert.match(loansXml, /Ana Novak d\.o\.o\./)
  assert.match(liabilitiesXml, /<c r="G8"[^>]*><v>1500\.25<\/v><\/c>/)
  assert.match(liabilitiesXml, /<c r="G9"[^>]*><v>80\.10<\/v><\/c>/)
  assert.match(liabilitiesXml, /Sid banka d\.d\./)
  assert.match(liabilitiesXml, /NLB d\.d\./)
  assert.doesNotMatch(liabilitiesXml, /<c r="E8"[^>]*>\s*<v>/)
  assert.doesNotMatch(liabilitiesXml, /<c r="D18"[^>]*>\s*<v>/)
})

function tsvWord(text: string, x: number, y: number, w: number): string {
  return ["5", "1", "1", "1", "1", "1", String(x), String(y), String(w), "16", "90", text].join("\t")
}

test("kratka tabela posojilodajalcev obdrži lastnika brez davčne in cente", () => {
  const lines = parseLoanGrid([
    ["", "posojilodajalec", "", ""],
    ["1", "lastnik", "", "19,40"],
    ["2", "Nutralis group d.o.o.", "14702215", "19.300,00"],
    ["3", "Lienelia", "78073642", "6.000,00"],
    ["", "", "", "25.319,40"],
  ])
  assert.equal(lines.length, 3)
  assert.equal(lines[0]?.name, "lastnik")
  assert.equal(lines[0]?.taxNumber, undefined)
  assert.equal(lines[0]?.closingCents, 1940)
  assert.equal(lines[0]?.openingCents, undefined)
  assert.equal(lines[0]?.increaseCents, undefined)
  assert.equal(lines[0]?.decreaseCents, undefined)
  assert.equal(lines[0]?.installmentCents, undefined)
  assert.equal(lines[1]?.name, "Nutralis group d.o.o.")
  assert.equal(lines[1]?.taxNumber, "14702215")
  assert.equal(lines[1]?.closingCents, 1_930_000)
  assert.equal(lines[2]?.name, "Lienelia")
  assert.equal(lines[2]?.taxNumber, "78073642")
  assert.equal(lines[2]?.closingCents, 600_000)
  assert.equal(
    lines.reduce((sum, line) => sum + (line.closingCents ?? 0), 0),
    2_531_940,
  )
  const cells = loanSheetCells(SHEET_076, lines)
  assert.equal(findBankCell(cells, SHEET_076, "B8")?.text, "lastnik")
  assert.equal(findBankCell(cells, SHEET_076, "C8"), undefined)
  assert.equal(findBankCell(cells, SHEET_076, "G8")?.euros, 1940)
  assert.equal(findBankCell(cells, SHEET_076, "D8"), undefined)
  assert.equal(findBankCell(cells, SHEET_076, "H8"), undefined)
  assert.equal(findBankCell(cells, SHEET_076, "B9")?.text, "Nutralis group d.o.o.")
  assert.equal(findBankCell(cells, SHEET_076, "C9")?.text, "14702215")
  assert.equal(findBankCell(cells, SHEET_076, "G9")?.euros, 1_930_000)
  assert.equal(findBankCell(cells, SHEET_076, "B10")?.text, "Lienelia")
  assert.equal(findBankCell(cells, SHEET_076, "G10")?.euros, 600_000)
  assert.equal(findBankCell(cells, SHEET_076, "B11"), undefined)
  assert.equal(findBankCell(cells, SHEET_076, "G11"), undefined)
})

test("pika namesto vejice v enem znesku ostane pri centih", () => {
  const lines = parseLoanGrid([
    ["znesek", "posojilodajalec"],
    ["19.40", "lastnik"],
  ])
  assert.equal(lines[0]?.name, "lastnik")
  assert.equal(lines[0]?.closingCents, 1940)
  assert.equal(lines[0]?.installmentCents, undefined)
})

test("široka tabela zapadlosti na posojila zapiše samo stanje", () => {
  const lines = parseLoanGrid([
    AGING_HEADERS,
    ["1", "Sid banka d.d.", "12345678", "1.500,25", "1.000,00", "500,25", "500,25", "", "", "", ""],
    ["2", "NLB d.d.", "", "80,10", "", "80,10", "", "", "", "", "80,10"],
    ["", "SKUPAJ", "", "1.580,35", "", "", "", "", "", "", ""],
  ])
  assert.equal(lines.length, 2)
  assert.equal(lines[0]?.name, "Sid banka d.d.")
  assert.equal(lines[0]?.taxNumber, "12345678")
  assert.equal(lines[0]?.closingCents, 150025)
  assert.equal(lines[0]?.openingCents, undefined)
  assert.equal(lines[0]?.increaseCents, undefined)
  assert.equal(lines[0]?.decreaseCents, undefined)
  assert.equal(lines[0]?.installmentCents, undefined)
  assert.equal(lines[1]?.name, "NLB d.d.")
  assert.equal(lines[1]?.taxNumber, undefined)
  assert.equal(lines[1]?.closingCents, 8010)
})
