import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { disclosureCells, findBankCell } from "./bank-form.ts"
import { fillDhWorkbook } from "./bank-xlsx.ts"
import { disclosureWorkbookName } from "./razkritja.ts"
import JSZip from "jszip"

const TEMPLATE = path.join(process.cwd(), "data/templates/dh/razkritja/FRP_EXCEL_DH.xlsx")

async function sheets(workbook: Buffer) {
  const zip = await JSZip.loadAsync(workbook)
  const names = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  const parts = await Promise.all(names.map(async (name) => zip.file(name)!.async("string")))
  return parts.join("\n")
}

test("znani zneski AOP padejo v celice razkritij Delavske hranilnice", async () => {
  const period = "1. 1. 2026–31. 7. 2026"
  const cells = disclosureCells({
    company: "Severnica trgovina d.o.o.",
    period,
    currentDate: "31. 7. 2026",
    legalForm: "doo",
    registration: "1234567000",
    balance: {
      current: { "014": 123456, "050": 10000 },
      previous: { "014": 100000 },
    },
    income: { "112": 250000 },
  })
  assert.equal(findBankCell(cells, "BS", "G22")?.euros, 123456)
  assert.equal(findBankCell(cells, "BS", "H22")?.euros, 100000)
  assert.equal(findBankCell(cells, "BS", "G58")?.euros, 10000)
  assert.equal(findBankCell(cells, "BS", "H58"), undefined)
  assert.equal(findBankCell(cells, "IPI", "G11")?.euros, 250000)
  assert.equal(findBankCell(cells, "IPI", "H11"), undefined)
  assert.equal(findBankCell(cells, "010 Opred.OS", "C11")?.euros, 100000)
  assert.equal(findBankCell(cells, "010 Opred.OS", "D11")?.euros, 23456)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D8")?.text, "Severnica trgovina d.o.o.")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D10")?.text, "1234567000")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D13")?.text, "GD")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D11")?.clear, true)
  assert.equal(
    disclosureWorkbookName("Severnica trgovina d.o.o.", period, "31. 7. 2026"),
    "Severnica_trgovina_d.o.o._Razkritja_Delavska_hranilnica_01.01.2026-31.07.2026.xlsx",
  )

  const filled = await fillDhWorkbook(await readFile(TEMPLATE), cells, { dropStaleText: true })
  const xml = await sheets(filled)
  assert.match(xml, /<c r="G22"[^>]*><v>1234\.56<\/v><\/c>/)
  assert.match(xml, /<c r="H22"[^>]*><v>1000<\/v><\/c>/)
  assert.match(xml, /<c r="G58"[^>]*><v>100<\/v><\/c>/)
  assert.match(xml, /<c r="G11"[^>]*><v>2500<\/v><\/c>/)
  assert.match(xml, /<c r="D11"[^>]*><v>234\.56<\/v><\/c>/)
  assert.match(xml, /Severnica trgovina d\.o\.o\./)
  assert.match(xml, /1234567000/)
  assert.doesNotMatch(xml, /FORTUN/)
  assert.doesNotMatch(xml, /15048969/)
  assert.doesNotMatch(xml, /VOJKOVA/)
  assert.doesNotMatch(xml, /NIKA PRPAR/)
  assert.doesNotMatch(xml, /9020004000/)
  assert.doesNotMatch(xml, /<c r="H11"[^>]*>\s*<v>/)
})

test("prazna bilanca ne izmisli zneskov", async () => {
  const cells = disclosureCells({
    company: "Prazna d.o.o.",
    period: "1. 1. 2026–31. 12. 2026",
    currentDate: "31. 12. 2026",
    legalForm: "doo",
    balance: { current: {}, previous: {} },
    income: {},
  })
  assert.equal(
    cells.some((cell) => cell.euros !== undefined),
    false,
  )
  assert.equal(findBankCell(cells, "Osnovni podatki", "D11")?.clear, true)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D14")?.clear, true)
  assert.equal(findBankCell(cells, "BS", "G22"), undefined)
  assert.equal(findBankCell(cells, "IPI", "G11"), undefined)

  const filled = await fillDhWorkbook(await readFile(TEMPLATE), cells, { dropStaleText: true })
  const xml = await sheets(filled)
  assert.match(xml, /<c r="G22"[^/]*\/>/)
  assert.match(xml, /<c r="H22"[^/]*\/>/)
  assert.match(xml, /<c r="G58"[^/]*\/>/)
  assert.match(xml, /Prazna d\.o\.o\./)
  assert.doesNotMatch(xml, /FORTUN/)
  assert.doesNotMatch(xml, /15048969/)
  assert.doesNotMatch(xml, /VOJKOVA/)
  assert.doesNotMatch(xml, /NIKA PRPAR/)
  assert.doesNotMatch(xml, /9020004000/)
  assert.doesNotMatch(xml, /<c r="G22"[^>]*>\s*<v>/)
  assert.doesNotMatch(xml, /<c r="G11"[^>]*>\s*<v>/)
})
