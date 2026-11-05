import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import fontkit from "@pdf-lib/fontkit"
import { PDFDocument } from "pdf-lib"

import { disclosureCells, findBankCell } from "./bank-form.ts"
import { rollup } from "./compute.ts"
import { rollupIncome } from "./income.ts"
import { ajpesUploadBlocked, applyAjpesText, parseAjpesText } from "./ajpes-form.ts"
import { defaultShowPriorYear, shownColumns } from "./prior-year.ts"
import { pdfToText } from "./pdf-lines.ts"
import type { Statement } from "./trial.ts"

const FIXTURE = path.join(process.cwd(), "src/lib/fixtures/ajpes-obrazec.txt")
const COLUMN_FIXTURE = path.join(process.cwd(), "src/lib/fixtures/ajpes-stolpec.txt")

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

test("pojasnilo o preteklem letu ne zamenja tekočega stolpca s prejšnjim", async () => {
  const text = await readFile(COLUMN_FIXTURE, "utf8")
  const parsed = parseAjpesText(text)
  const balance = Object.fromEntries(parsed.balance.map((row) => [row.aop, row]))
  const income = Object.fromEntries(parsed.income.map((row) => [row.aop, row]))

  assert.equal(balance["001"]?.current, 1_000_000)
  assert.equal(balance["001"]?.previous, 800_000)
  assert.equal(balance["052"]?.current, 1_000_000)
  assert.equal(balance["052"]?.previous, 800_000)
  assert.equal(income["112"]?.current, 800_000)
  assert.equal(income["112"]?.previous, 700_000)
  assert.equal(income["140"]?.current, 300_000)
  assert.equal(income["140"]?.previous, 250_000)

  const statement = applyAjpesText(empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025"), text, "stolpec.pdf")
  assert.equal(rollup(statement.balance.current)["001"], 1_000_000)
  assert.equal(rollup(statement.balance.previous)["001"], 800_000)
  assert.equal(rollupIncome(statement.income)["112"], 800_000)
  assert.equal(statement.previousIncome?.["112"], 700_000)
  assert.equal(statement.income["140"], 300_000)
})

test("štirikrat narisana vrstica obrazca da en tekoči in en prejšnji znesek", async () => {
  const lines = (await readFile(COLUMN_FIXTURE, "utf8")).split(/\n/).filter((line) => line.trim())
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await readFile(new URL("./fonts/DejaVuSans.ttf", import.meta.url)))
  const page = pdf.addPage([595, 842])
  let y = 800
  for (const line of lines) {
    for (const shift of [0, 0.1, 0.2, 0.3]) {
      page.drawText(line, { x: 40 + shift, y, size: 8, font })
    }
    y -= 14
  }
  const text = await pdfToText(await pdf.save())
  assert.equal(text.includes("10.000,00 10.000,00"), false)
  assert.match(text, /SREDSTVA 001 10\.000,00 8\.000,00/)

  const statement = applyAjpesText(empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025"), text, "prekrivano.pdf")
  assert.equal(rollup(statement.balance.current)["052"], 1_000_000)
  assert.equal(rollup(statement.balance.previous)["052"], 800_000)
  assert.equal(statement.income["140"], 300_000)
  assert.equal(statement.previousIncome?.["140"], 250_000)
  assert.equal(rollupIncome(statement.income)["112"], 800_000)
  assert.equal(statement.previousIncome?.["112"], 700_000)
})

test("dodatni podatki o tujini ne prepišejo zneskov bilance in izkaza", () => {
  const text = [
    "PODATKI IZ BILANCE STANJA",
    "AOP Tekočega leta Prejšnjega leta",
    "A. DOLGOROČNA SREDSTVA 002 462,91 611,51",
    "4. Druge naprave in oprema 014 462,91 611,51",
    "2. Dolgoročne finančne obveznosti do bank 078 1.944.607,15 2.855.244,54",
    "SREDSTVA 001 2.407.070,06 2.855.856,05",
    "OBVEZNOSTI DO VIROV SREDSTEV 055 2.407.070,06 2.855.856,05",
    "PODATKI IZ IZKAZA POSLOVNEGA IZIDA",
    "2. Čisti prihodki od najemnin 113 9.519,00 8.795,73",
    "2. Finančni prihodki iz poslovnih terjatev 165 13,30 58,73",
    "2. Finančni odhodki iz obveznosti do dobaviteljev 176 308,34 712,71",
    "R. ODLOŽENI DAVKI 185 0,00 0,00",
    "Dodatni podatki k podatkom iz bilance stanja",
    "002 G. DOLGOROČNO ODLOŽENI 302 0,00 0,00",
    "078, del 150",
    "185, del 186, del 187",
    "165, del 167, del 185",
    "176, del 177, del 178, del 185",
    "113, del 114, del 183",
    "101, del 110, del 111, del 112, VI. Denarna sredstva - devizna 248 0,00 0,00",
    "101 1. Devizna sredstva v blagajni 249 0,00 0,00",
  ].join("\n")
  const parsed = parseAjpesText(text)
  const balance = Object.fromEntries(parsed.balance.map((row) => [row.aop, row]))
  const income = Object.fromEntries(parsed.income.map((row) => [row.aop, row]))
  assert.equal(balance["002"]?.current, 46_291)
  assert.equal(balance["002"]?.previous, 61_151)
  assert.equal(balance["078"]?.current, 194_460_715)
  assert.equal(balance["078"]?.previous, 285_524_454)
  assert.equal(income["113"]?.current, 951_900)
  assert.equal(income["113"]?.previous, 879_573)
  assert.equal(income["165"]?.current, 1_330)
  assert.equal(income["165"]?.previous, 5_873)
  assert.equal(income["176"]?.current, 30_834)
  assert.equal(income["176"]?.previous, 71_271)
  assert.equal(income["185"]?.current, 0)
  assert.equal(income["185"]?.previous, 0)

  const statement = applyAjpesText(empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025"), text, "tujina.pdf")
  assert.equal(rollup(statement.balance.current)["002"], 46_291)
  assert.equal(rollup(statement.balance.current)["078"], 194_460_715)
  assert.equal(rollupIncome(statement.income)["113"], 951_900)
  assert.equal(statement.income["176"], 30_834)
})

test("dvostolpčni obrazec AJPES obdrži tekoče in preteklo leto, skritje zneskov ne zbriše", () => {
  const text = [
    "Pojasnila k izkazom",
    "Prihodki so se glede na preteklo leto znižali.",
    "BILANCA STANJA",
    "AOP Postavka Tekočega leta Prejšnjega leta",
    "001 SREDSTVA 10.050,37 8.020,19",
    "052 Denarna sredstva 10.050,37 8.020,19",
    "058 Osnovni kapital 10.050,37 8.020,19",
    "IZKAZ POSLOVNEGA IZIDA",
    "112 Čisti prihodki od prodaje proizvodov in storitev razen najemnin 4.500,10 3.250,80",
    "140 Stroški plač 1.100,05 900,40",
  ].join("\n")
  const parsed = parseAjpesText(text)
  const balance = Object.fromEntries(parsed.balance.map((row) => [row.aop, row]))
  const income = Object.fromEntries(parsed.income.map((row) => [row.aop, row]))
  assert.equal(balance["052"]?.current, 1_005_037)
  assert.equal(balance["052"]?.previous, 802_019)
  assert.notEqual(balance["052"]?.current, balance["052"]?.previous)
  assert.equal(balance["001"]?.current, 1_005_037)
  assert.equal(balance["001"]?.previous, 802_019)
  assert.equal(income["112"]?.current, 450_010)
  assert.equal(income["112"]?.previous, 325_080)
  assert.equal(income["140"]?.current, 110_005)
  assert.equal(income["140"]?.previous, 90_040)

  const statement = applyAjpesText(empty("FORTUN d.o.o.", "1. 1. 2025–31. 12. 2025"), text, "dva-stolpca.pdf")
  assert.equal(statement.balance.current["052"], 1_005_037)
  assert.equal(statement.balance.previous["052"], 802_019)
  assert.notEqual(statement.balance.current["052"], statement.balance.previous["052"])
  assert.equal(statement.income["112"], 450_010)
  assert.equal(statement.previousIncome?.["112"], 325_080)
  assert.equal(statement.income["140"], 110_005)
  assert.equal(statement.previousIncome?.["140"], 90_040)
  assert.equal(rollup(statement.balance.current)["001"], 1_005_037)
  assert.equal(rollup(statement.balance.previous)["001"], 802_019)
  assert.equal(defaultShowPriorYear(statement), true)

  const shown = shownColumns(statement, true)
  assert.equal(shown.showPrior, true)
  assert.equal(shown.currentBalance["052"], 1_005_037)
  assert.equal(shown.priorBalance?.["052"], 802_019)
  assert.equal(shown.currentIncome["140"], 110_005)
  assert.equal(shown.priorIncome?.["140"], 90_040)

  const hidden = shownColumns(statement, false)
  assert.equal(hidden.showPrior, false)
  assert.equal(hidden.priorBalance, null)
  assert.equal(hidden.priorIncome, null)
  assert.equal(statement.balance.current["052"], 1_005_037)
  assert.equal(statement.balance.previous["052"], 802_019)
  assert.equal(statement.income["112"], 450_010)
  assert.equal(statement.previousIncome?.["112"], 325_080)
  assert.equal(statement.previousIncome?.["140"], 90_040)

  const cells = disclosureCells(statement)
  assert.equal(findBankCell(cells, "BS", "G60")?.euros, 1_005_037)
  assert.equal(findBankCell(cells, "BS", "H60")?.euros, 802_019)
  assert.equal(findBankCell(cells, "IPI", "G11")?.euros, 450_010)
  assert.equal(findBankCell(cells, "IPI", "H11")?.euros, 325_080)
  assert.notEqual(findBankCell(cells, "BS", "G60")?.euros, findBankCell(cells, "BS", "H60")?.euros)
})

test("zavrnitvena datoteka brez oznak AOP ne da zneskov", () => {
  assert.throws(
    () => parseAjpesText("Bruto bilanca\n1200 Kupci 0,00 0,00 1.000,00 0,00 1.000,00 0,00 0,00 0,00"),
    /izdelan obrazec AJPES/,
  )
})
