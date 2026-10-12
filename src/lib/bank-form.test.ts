import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { fillDhWorkbook } from "./bank-xlsx.ts"
import {
  adremaBankCells,
  bankFormCells,
  excelSerial,
  findBankCell,
  hasDhBankPack,
} from "./bank-form.ts"
import {
  ADREMA_31_07_2025_PREJSNJE,
  ADREMA_31_07_2025_PREJSNJI_MESECI,
  ADREMA_31_07_2025_PREJSNJI_ZAPOSLENI,
  ADREMA_31_07_2025_TEKOCE,
  ADREMA_DH_COMPANY,
  ADREMA_NALOZBE_POJASNILO,
} from "./dh-adrema.ts"
import { rollupIncome } from "./income.ts"

const lastYear = bankFormCells({
  company: ADREMA_DH_COMPANY,
  currentBalance: ADREMA_31_07_2025_TEKOCE.balance,
  currentIncome: ADREMA_31_07_2025_TEKOCE.income,
  previousBalance: ADREMA_31_07_2025_PREJSNJE.balance,
  previousIncome: ADREMA_31_07_2025_PREJSNJE.income,
  legalForm: "doo",
  periodStart: { year: 2025, month: 1, day: 1 },
  periodEnd: { year: 2025, month: 7, day: 31 },
  reportedAt: { year: 2025, month: 9, day: 26 },
  previousEmployees: ADREMA_31_07_2025_PREJSNJI_ZAPOSLENI,
  previousMonths: ADREMA_31_07_2025_PREJSNJI_MESECI,
  investmentNote: ADREMA_NALOZBE_POJASNILO,
})

function euros(sheet: string, cell: string): number | undefined {
  return findBankCell(lastYear, sheet, cell)?.euros
}

test("lanski zneski padejo v iste celice kot na obrazcu 31. 7. 2025", () => {
  assert.equal(euros("BS", "G22"), 286043)
  assert.equal(euros("BS", "H22"), 409104)
  assert.equal(euros("BS", "G29"), 28_095_000)
  assert.equal(euros("BS", "G58"), 2_391_587)
  assert.equal(euros("BS", "H58"), 2_637_691)
  assert.equal(euros("BS", "G60"), 193036)
  assert.equal(euros("BS", "H83"), 50948)
  assert.equal(euros("BS", "G83"), 667951)
  assert.equal(euros("IPI", "G11"), 6_943_659)
  assert.equal(euros("IPI", "H11"), 11_389_932)
  assert.equal(euros("IPI", "G37"), 1_086_493)
  assert.equal(findBankCell(lastYear, "Osnovni podatki", "D8")?.text, "ADREMA D.O.O.")
  assert.equal(findBankCell(lastYear, "Osnovni podatki", "D10")?.text, "2305682000")
  assert.equal(findBankCell(lastYear, "Osnovni podatki", "D11")?.text, "85127035")
  assert.equal(findBankCell(lastYear, "Osnovni podatki", "D18")?.number, 45658)
  assert.equal(findBankCell(lastYear, "Osnovni podatki", "D19")?.number, 45869)
  assert.equal(findBankCell(lastYear, "Osnovni podatki", "D20")?.number, 45926)
  assert.equal(findBankCell(lastYear, "IPI", "H89")?.number, 2)
  assert.equal(findBankCell(lastYear, "IPI", "H90")?.number, 12)
  assert.equal(excelSerial({ year: 2025, month: 1, day: 1 }), 45658)
})

test("razkritja se ujemajo z lanskim gibanjem istih postavk", () => {
  assert.equal(rollupIncome(ADREMA_31_07_2025_TEKOCE.income)["186"], 667951)
  assert.equal(euros("003 Neopred.OS", "C11"), 214027)
  assert.equal(euros("003 Neopred.OS", "E11"), 17549)
  assert.equal(euros("010 Opred.OS", "C11"), 409104)
  assert.equal(euros("010 Opred.OS", "E11"), 123061)
  assert.equal(euros("020 Dolg.fin.naložbe", "C8"), 28_095_000)
  assert.equal(findBankCell(lastYear, "020 Dolg.fin.naložbe", "B16")?.text, ADREMA_NALOZBE_POJASNILO)
  assert.equal(euros("034 Zaloge", "C11"), 1_634_531)
  assert.equal(euros("034 Zaloge", "D11"), 660903)
  assert.equal(euros("051 Krat.ter.drugi", "C8"), 2_097_786)
  assert.equal(euros("051 Krat.ter.drugi", "D8"), 24500)
  assert.equal(euros("056 Kapital", "C16"), 38_607_679)
  assert.equal(findBankCell(lastYear, "056 Kapital", "D16"), undefined)
  assert.equal(findBankCell(lastYear, "056 Kapital", "E16"), undefined)
  assert.equal(euros("094 Krat.obvez.druge", "C8"), 611660)
  assert.equal(euros("094 Krat.obvez.druge", "D8"), 912617)
})

test("novi obrazec vzame tekoči stolpec iz bilance in lanski iz obrazca 31. 7. 2025", () => {
  const cells = adremaBankCells({
    company: "ADREMA d.o.o.",
    period: "1. 1. 2026–31. 7. 2026",
    currentDate: "31. 7. 2026",
    legalForm: "doo",
    balance: { current: { "014": 500000, "050": 100 }, previous: { "014": 1 } },
    income: { "112": 250000 },
  })
  assert.equal(findBankCell(cells, "BS", "G22")?.euros, 500000)
  assert.equal(findBankCell(cells, "BS", "H22")?.euros, 286043)
  assert.equal(findBankCell(cells, "BS", "G58")?.euros, 100)
  assert.equal(findBankCell(cells, "BS", "H58")?.euros, 2_391_587)
  assert.equal(findBankCell(cells, "IPI", "G11")?.euros, 250000)
  assert.equal(findBankCell(cells, "IPI", "H11")?.euros, 6_943_659)
  assert.equal(findBankCell(cells, "IPI", "G90")?.number, 7)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D8")?.text, "ADREMA D.O.O.")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D11")?.text, "85127035")
  assert.equal(hasDhBankPack("ADREMA d.o.o."), true)
  assert.equal(hasDhBankPack("GRAFAM d.o.o."), false)
})

test("izpolnjena predloga ohrani formule in vpiše znane zneske", async () => {
  const template = await readFile(path.join(process.cwd(), "data/templates/dh/FRP_EXCEL_DH.xlsx"))
  const filled = await fillDhWorkbook(template, lastYear)
  const zip = await import("jszip").then((mod) => mod.default.loadAsync(filled))
  const bs = await zip.file("xl/worksheets/sheet4.xml")!.async("string")
  const osnovni = await zip.file("xl/worksheets/sheet2.xml")!.async("string")
  const oprema = await zip.file("xl/worksheets/sheet7.xml")!.async("string")
  assert.match(bs, /<c r="G22" s="103"><v>2860\.43<\/v><\/c>/)
  assert.match(bs, /<c r="H22" s="103"><v>4091\.04<\/v><\/c>/)
  assert.match(bs, /<c r="G9"[^>]*><f>ROUND\(G10\+G40\+G61,2\)<\/f>/)
  assert.match(osnovni, /ADREMA D\.O\.O\./)
  assert.match(osnovni, /<c r="D11"[^>]*t="inlineStr"><is><t>85127035<\/t><\/is><\/c>/)
  assert.match(oprema, /<c r="E11"[^>]*><v>1230\.61<\/v><\/c>/)
  assert.equal(zip.file("xl/calcChain.xml"), null)
})
