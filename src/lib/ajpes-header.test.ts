import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { applyAjpesText } from "./ajpes-form.ts"
import { parseAjpesHeader } from "./ajpes-header.ts"
import { disclosureCells, findBankCell } from "./bank-form.ts"
import { fillDhWorkbook } from "./bank-xlsx.ts"
import type { Statement } from "./trial.ts"

const FIXTURE = path.join(process.cwd(), "src/lib/fixtures/ajpes-glava.txt")
const TEMPLATE = path.join(process.cwd(), "data/templates/dh/razkritja/FRP_EXCEL_DH.xlsx")

function empty(company: string, period = "1. 1. 2025–31. 12. 2025"): Statement {
  return {
    company,
    period,
    currentDate: "31. 12. 2025",
    previousDate: "",
    sourceName: "",
    balance: { current: {}, previous: {} },
    income: {},
    notes: [],
    warnings: [],
    legalForm: "doo",
  }
}

test("glava AJPES gre v osnovne podatke razkritij", async () => {
  const text = await readFile(FIXTURE, "utf8")
  const header = parseAjpesHeader(text)
  assert.equal(header.name, "SEVERNICA TRGOVINA D.O.O.")
  assert.equal(header.seat, "Vojkova cesta 58, 1000 Ljubljana")
  assert.equal(header.registration, "1234567000")
  assert.equal(header.taxNumber, "87654321")
  assert.equal(header.director, "Nika Prpar")
  assert.equal(header.kind, "GD")
  assert.equal(header.size, 1)
  assert.equal(header.accounting, 2)
  assert.equal(header.place, "Ljubljana")
  assert.equal(header.contact, "Urška Premk")
  assert.equal(header.phone, "040 350 388")
  assert.equal(header.email, "info@hnatura.com")

  const statement = applyAjpesText(empty("Severnica trgovina d.o.o."), text, "ajpes-glava.pdf")
  assert.equal(statement.company, "Severnica trgovina d.o.o.")
  assert.equal(statement.ajpesHeader?.registration, "1234567000")
  assert.match(statement.notes.join(" "), /Osnovni podatki so prebrani/)

  const cells = disclosureCells(statement)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D8")?.text, "SEVERNICA TRGOVINA D.O.O.")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D9")?.text, "Vojkova cesta 58, 1000 Ljubljana")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D10")?.text, "1234567000")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D11")?.text, "87654321")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D12")?.text, "Nika Prpar")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D13")?.text, "GD")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D14")?.number, 1)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D15")?.number, 2)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D18")?.number, 45658)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D19")?.number, 46022)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D21")?.text, "Ljubljana")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D28")?.text, "Urška Premk")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D29")?.text, "040 350 388")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D30")?.text, "info@hnatura.com")
  assert.equal(findBankCell(cells, "BS", "G60")?.euros, 1_000_000)

  const filled = await fillDhWorkbook(await readFile(TEMPLATE), cells, { dropStaleText: true })
  const zip = await import("jszip")
  const book = await zip.default.loadAsync(filled)
  const xml = await book.file("xl/worksheets/sheet2.xml")!.async("string")
  assert.match(xml, /SEVERNICA TRGOVINA D\.O\.O\./)
  assert.match(xml, /Vojkova cesta 58, 1000 Ljubljana/)
  assert.match(xml, /1234567000/)
  assert.match(xml, /87654321/)
  assert.doesNotMatch(xml, /VOJKOVA/)
  assert.doesNotMatch(xml, /9020004000/)
  assert.doesNotMatch(xml, /15048969/)
  assert.doesNotMatch(xml, /FORTUN/)
})

test("tiskana glava AJPES in dvostolpčna glava data iste celice", () => {
  const printed = [
    "IME PRAVNE OSEBE",
    "ZASEBNEGA PRAVA: Danes je nov dan",
    "SEDEŽ PRAVNE OSEBE",
    "ZASEBNEGA PRAVA: Resljeva cesta 25, 1000 Ljubljana",
    "Matična številka: 6468594000",
    "Davčna številka: SI54561710",
    "Velikost: 1",
    "Računovodimo:",
    "SRS – Slovenski računovodski standardi (2024)",
    "Oseba, odgovorna za sestavljanje bilance: Špela Kariž",
    "Telefonska številka za komunikacijo v zvezi s",
    "predložitvijo bilance: 051301281",
    "Vodja pravne osebe: Maja Cimerman",
    "Elektronski naslov kontaktne osebe: spelakariz@9gmail.com",
    "Elektronski naslov uporabnika portala: rok@primer.si",
    "Kraj: Ljubljana",
  ].join("\n")
  const header = parseAjpesHeader(printed)
  assert.equal(header.name, "Danes je nov dan")
  assert.equal(header.seat, "Resljeva cesta 25, 1000 Ljubljana")
  assert.equal(header.registration, "6468594000")
  assert.equal(header.taxNumber, "54561710")
  assert.equal(header.director, "Maja Cimerman")
  assert.equal(header.size, 1)
  assert.equal(header.accounting, 2)
  assert.equal(header.place, "Ljubljana")
  assert.equal(header.contact, "Špela Kariž")
  assert.equal(header.phone, "051301281")
  assert.equal(header.email, "spelakariz@9gmail.com")
  assert.equal(header.kind, undefined)

  const columns = [
    "Ime poslovnega subjekta: Matična številka:",
    "ZAVOD IZRIIS 1888374000",
    "Sedež: Davčna številka:",
    "Beljaška ulica 28, 1000 Ljubljana 53157532",
    "Velikost (1-mikro, 2-majhna,",
    "3-srednja, 4-velika):",
    "1",
    "Vodja poslovnega subjekta Neja Samar Brenčič",
  ].join("\n")
  const side = parseAjpesHeader(columns)
  assert.equal(side.name, "ZAVOD IZRIIS")
  assert.equal(side.seat, "Beljaška ulica 28, 1000 Ljubljana")
  assert.equal(side.registration, "1888374000")
  assert.equal(side.taxNumber, "53157532")
  assert.equal(side.size, 1)
  assert.equal(side.director, "Neja Samar Brenčič")

  const repeated = [
    printed,
    "SEDEŽ NEPRIDOBITNE ORGANIZACIJE -",
    "PRAVNE OSEBE ZASEBNEGA PRAVA:",
    "Kraj: Zastopnik društva:",
    "LJUBLJANA KRALJ TOMAŽ",
  ].join("\n")
  const kept = parseAjpesHeader(repeated)
  assert.equal(kept.seat, "Resljeva cesta 25, 1000 Ljubljana")
  assert.equal(kept.place, "Ljubljana")
  assert.equal(kept.name, "Danes je nov dan")
})

test("česar na obrazcu ni, v razkritjih ostane prazno", () => {
  const text = [
    "Vrsta: Društvo",
    "Matična številka 5137560000",
    "Ime poslovnega subjekta NAMIZNOTENIŠKA ZVEZA SLOVENIJE",
    "Sedež (ulica, hišna številka in kraj) Celovška cesta 25, 1000 Ljubljana",
    "Elektronski naslov uporabnika portala rok.zupan@olympic.si",
    "PODATKI IZ BILANCE STANJA",
    "AOP Tekočega leta",
    "001 SREDSTVA 5.000,00",
    "052 Denarna sredstva 5.000,00",
    "058 Osnovni kapital 5.000,00",
  ].join("\n")
  const statement = applyAjpesText(empty("Zveza"), text, "drustvo.pdf")
  const cells = disclosureCells(statement)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D8")?.text, "NAMIZNOTENIŠKA ZVEZA SLOVENIJE")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D9")?.text, "Celovška cesta 25, 1000 Ljubljana")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D10")?.text, "5137560000")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D11")?.clear, true)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D12")?.clear, true)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D13")?.clear, true)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D14")?.clear, true)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D15")?.clear, true)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D21")?.clear, true)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D30"), undefined)
  assert.equal(statement.ajpesHeader?.email, undefined)
  assert.equal(statement.ajpesHeader?.kind, "")
})

test("drugi obrazec brez glave ne zbriše že prebranih osnovnih podatkov", async () => {
  const first = await readFile(FIXTURE, "utf8")
  const opened = applyAjpesText(empty("Severnica trgovina d.o.o."), first, "glava.pdf")
  const second = applyAjpesText(
    opened,
    [
      "IZKAZ POSLOVNEGA IZIDA",
      "AOP Tekočega leta",
      "140 Stroški plač 900,00",
      "112 Čisti prihodki od prodaje proizvodov in storitev razen najemnin 900,00",
      "110 Čisti prihodki od prodaje 900,00",
    ].join(
      "\n",
    ),
    "izkaz.pdf",
  )
  assert.equal(second.ajpesHeader?.name, "SEVERNICA TRGOVINA D.O.O.")
  assert.equal(second.ajpesHeader?.taxNumber, "87654321")
  assert.equal(second.income["140"], 90_000)
  const cells = disclosureCells(second)
  assert.equal(findBankCell(cells, "Osnovni podatki", "D11")?.text, "87654321")
  assert.equal(findBankCell(cells, "Osnovni podatki", "D9")?.text, "Vojkova cesta 58, 1000 Ljubljana")
})
