import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { disclosureCells, findBankCell } from "./bank-form.ts"
import { rollup } from "./compute.ts"
import { rollupIncome } from "./income.ts"
import { ajpesUploadBlocked, applyAjpesText, parseAjpesText } from "./ajpes-form.ts"
import type { Statement } from "./trial.ts"

const FIXTURE = path.join(process.cwd(), "src/lib/fixtures/ajpes-obrazec.txt")

function empty(company: string, period = "", form: Statement["legalForm"] = "doo"): Statement {
  const parts = period.split("–")
  return {
    company,
    period,
    currentDate: parts[1]?.trim() ?? "",
    previousDate: "",
    sourceName: "",
    balance: { current: {}, previous: {} },
    income: {},
    notes: [],
    warnings: [],
    legalForm: form,
  }
}

test("izdelan obrazec AJPES prebere AOP in evre, brez števila zaposlenih in dodatnih oznak", async () => {
  const text = await readFile(FIXTURE, "utf8")
  const parsed = parseAjpesText(text)
  const balance = Object.fromEntries(parsed.balance.map((row) => [row.aop, row]))
  const income = Object.fromEntries(parsed.income.map((row) => [row.aop, row]))

  assert.equal(balance["001"]?.current, 40_575_075)
  assert.equal(balance["001"]?.previous, 26_342_678)
  assert.equal(balance["052"]?.current, 11_512_725)
  assert.equal(balance["014"]?.current, 0)
  assert.equal(balance["014"]?.previous, 20_099)
  assert.equal(balance["056a"]?.current, 18_000)
  assert.equal(income["110"]?.current, 7_663_227)
  assert.equal(income["110"]?.previous, 9_423_756)
  assert.equal(income["140"]?.current, 18_004_214)
  assert.equal(income["186"]?.current, 2_615_067)
  assert.equal(income["187"]?.previous, 8_980_147)
  assert.equal(income["188"], undefined)
  assert.equal(income["189"], undefined)
  assert.equal(balance["501"], undefined)
  assert.equal(income["501"], undefined)
  assert.equal(balance["506"], undefined)
})

test("seštevki z obrazca se ne podvojijo, primerjalni stolpec ostane", async () => {
  const text = await readFile(FIXTURE, "utf8")
  const statement = applyAjpesText(empty("Zavod Primer", "", "zavod"), text, "ajpes-2025.pdf")
  const current = rollup(statement.balance.current, "zavod")
  const previous = rollup(statement.balance.previous, "zavod")
  const income = rollupIncome(statement.income, "zavod")
  const previousIncome = rollupIncome(statement.previousIncome ?? {}, "zavod")

  assert.equal(current["001"], 40_575_075)
  assert.equal(previous["001"], 26_342_678)
  assert.equal(current["052"], 11_512_725)
  assert.equal(current["014"], 0)
  assert.equal(previous["014"], 20_099)
  assert.equal(statement.balance.current["001"], undefined)
  assert.equal(income["110"], 7_663_227)
  assert.equal(income["126"], 39_163_688)
  assert.equal(income["186"], 2_615_067)
  assert.equal(previousIncome["110"], 9_423_756)
  assert.equal(previousIncome["187"], 8_980_147)
  assert.equal(statement.income["188"], undefined)
  assert.equal(statement.company, "Zavod Primer")
  assert.equal(statement.period, "1. 1. 2025–31. 12. 2025")
  assert.equal(statement.currentDate, "31. 12. 2025")
  assert.equal(statement.sourceKind, "ajpes")
  assert.match(statement.notes.join(" "), /Primerjalni stolpec je prebran iz obrazca/)
})

test("vpisano obdobje ostane, tudi če je na obrazcu drug datum", async () => {
  const text = await readFile(FIXTURE, "utf8")
  const statement = applyAjpesText(
    empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025", "doo"),
    text,
    "fortun-ajpes.pdf",
  )
  assert.equal(statement.company, "FORTUN d.o.o.")
  assert.equal(statement.period, "1. 1. 2025–31. 12. 2025")
  assert.equal(statement.currentDate, "31. 12. 2025")
  assert.equal(statement.balance.current["052"], 11_512_725)
})

test("ena vrstica z dvema zneskoma napolni tekoči in prejšnji stolpec razkritij", () => {
  const text = [
    "BILANCA STANJA",
    "AOP Postavka Tekočega leta Prejšnjega leta",
    "001 SREDSTVA 10.000,00 8.000,00",
    "052 Denarna sredstva 10.000,00 8.000,00",
    "058 Osnovni kapital 10.000,00 8.000,00",
    "IZKAZ POSLOVNEGA IZIDA",
    "112 Čisti prihodki od prodaje proizvodov in storitev razen najemnin 8.000,00 7.000,00",
    "140 Stroški plač 3.000,00 2.500,00",
  ].join("\n")
  const statement = applyAjpesText(empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025"), text, "oba.pdf")
  assert.equal(rollup(statement.balance.current)["001"], 1_000_000)
  assert.equal(statement.balance.current["001"], undefined)
  assert.equal(rollup(statement.balance.previous)["001"], 800_000)
  assert.equal(statement.previousIncome?.["112"], 700_000)

  const cells = disclosureCells(statement)
  assert.equal(findBankCell(cells, "BS", "G60")?.euros, 1_000_000)
  assert.equal(findBankCell(cells, "BS", "H60")?.euros, 800_000)
  assert.equal(findBankCell(cells, "IPI", "G11")?.euros, 800_000)
  assert.equal(findBankCell(cells, "IPI", "H11")?.euros, 700_000)
})

test("obrazec brez primerjalnega stolpca ne izmisli prejšnjega leta", () => {
  const text = [
    "BILANCA STANJA",
    "AOP Postavka Tekočega leta",
    "001 SREDSTVA 5.000,00",
    "052 Denarna sredstva 5.000,00",
    "058 Osnovni kapital 5.000,00",
    "112 Čisti prihodki od prodaje proizvodov in storitev razen najemnin 1.200,50",
  ].join("\n")
  const statement = applyAjpesText(empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025"), text, "samo-tekoci.pdf")
  assert.equal(statement.balance.previous["052"], undefined)
  assert.equal(statement.previousIncome, undefined)
  assert.equal(statement.balance.current["052"], 500_000)
  assert.equal(statement.income["112"], 120_050)
  assert.doesNotMatch(statement.notes.join(" "), /Primerjalni/)

  const cells = disclosureCells(statement)
  assert.equal(findBankCell(cells, "BS", "G60")?.euros, 500_000)
  assert.equal(findBankCell(cells, "BS", "H60"), undefined)
  assert.equal(findBankCell(cells, "IPI", "G11")?.euros, 120_050)
  assert.equal(findBankCell(cells, "IPI", "H11"), undefined)
})

test("dva obrazca se združita, drugi ne zbriše prvega", () => {
  const balance = [
    "PODATKI IZ BILANCE STANJA",
    "AOP Tekočega leta",
    "052 Denarna sredstva 4.200,00",
    "058 Osnovni kapital 4.200,00",
    "001 SREDSTVA 4.200,00",
  ].join("\n")
  const income = [
    "PODATKI IZ IZKAZA POSLOVNEGA IZIDA",
    "AOP Tekočega leta",
    "140 Stroški plač 900,00",
    "112 Čisti prihodki od prodaje proizvodov in storitev razen najemnin 900,00",
    "110 Čisti prihodki od prodaje 900,00",
  ].join("\n")
  const first = applyAjpesText(empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025"), balance, "bilanca.pdf")
  assert.match(first.notes.join(" "), /Izkaz poslovnega izida dodate/)
  const second = applyAjpesText(first, income, "izkaz.pdf")
  assert.equal(second.balance.current["052"], 420_000)
  assert.equal(second.income["140"], 90_000)
  assert.equal(second.income["112"], 90_000)
  assert.equal(rollupIncome(second.income)["110"], 90_000)
  assert.doesNotMatch(second.notes.join(" "), /dodate/)
})

test("že shranjeno obdobje bruto bilance se ne prepiše z nalaganjem AJPES", () => {
  const saved = [
    { company: "FORTUN d.o.o.", period: "1. 1. 2026–31. 8. 2026" },
    { company: "FORTUN d.o.o.", period: "1. 1. 2025–31. 12. 2025" },
  ]
  const year2026 = empty("FORTUN d.o.o.", "1. 1. 2026–31. 8. 2026")
  const year2025 = empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025")
  assert.equal(ajpesUploadBlocked(year2026, saved, "arhiv"), true)
  assert.equal(ajpesUploadBlocked(year2026, saved, "osnutek"), true)
  assert.equal(ajpesUploadBlocked(year2025, [saved[0]!], "osnutek"), false)
  const ajpes = { ...year2025, sourceKind: "ajpes" as const }
  assert.equal(ajpesUploadBlocked(ajpes, saved, "arhiv"), false)
})

test("zavrnitvena datoteka brez oznak AOP ne da zneskov", () => {
  assert.throws(
    () => parseAjpesText("Bruto bilanca\n1200 Kupci 0,00 0,00 1.000,00 0,00 1.000,00 0,00 0,00 0,00"),
    /izdelan obrazec AJPES/,
  )
})
