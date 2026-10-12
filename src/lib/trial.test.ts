import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import fontkit from "@pdf-lib/fontkit"
import { PDFDocument } from "pdf-lib"

import { reviewColumn, rollup, sheetWarnings } from "./compute.ts"
import { formatCents } from "./format.ts"
import { statementFromPdf } from "./from-pdf.ts"
import { pdfToText } from "./pdf-lines.ts"
import { grafam } from "./grafam.ts"
import { rollupIncome } from "./income.ts"
import { filterAccountRows, formulasForEditor, normalizeFormulas } from "./account-map.ts"
import { accountQuestions, accountRows, accountsForSearch, applyCurrentAmount, buildStatement } from "./trial.ts"

test("kratek izpis se razporedi na terjatve in obveznosti do dobaviteljev", () => {
  const statement = buildStatement(
    [
      "ACME d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.01.2026",
      "120 Kupci",
      "1.000,00 0,00 150,00 0,00 1.150,00 0,00 1.150,00 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00",
      "760 Prodaja",
      "0,00 0,00 0,00 200,00 0,00 200,00 0,00 200,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
    ].join("\n"),
    "acme.pdf",
  )

  assert.equal(statement.company, "ACME d.o.o.")
  assert.equal(statement.currentDate, "31. 1. 2026")
  assert.equal(statement.previousDate, "31. 12. 2025")
  assert.equal(statement.balance.previous["050"], 100_000)
  assert.equal(statement.balance.current["050"], 115_000)
  assert.equal(statement.balance.current["093"], 100_000)
  assert.equal(statement.balance.current["070"], 15_000)
  assert.equal(statement.income["112"], 20_000)
  assert.equal(statement.income["131"], 5_000)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
})

test("negativne razlike na kontu 7580 gredo na AOP 181", () => {
  const statement = buildStatement(
    [
      "BLIŠČ d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.08.2026",
      "120 Kupci",
      "1.000,00 0,00 147,97 0,00 1.147,97 0,00 1.147,97 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00",
      "760 Prodaja",
      "0,00 0,00 0,00 200,00 0,00 200,00 0,00 200,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
      "7580 Negativne razlike",
      "0,00 0,00 2,03 0,00 2,03 0,00 2,03 0,00",
    ].join("\n"),
    "blisc.pdf",
  )

  assert.equal(statement.company, "BLIŠČ d.o.o.")
  assert.equal(statement.income["181"], 203)
  assert.equal(rollupIncome(statement.income)["186"], 14_797)
  assert.equal(statement.balance.current["070"], 14_797)
  assert.ok(statement.notes.some((note) => note.includes("AOP 181")))
  assert.equal(
    statement.warnings.some((warning) => warning.includes("7580")),
    false,
  )
})

test("konto 9831 po formuli stranke gre na AOP 090", () => {
  const text = [
    "BLIŠČ d.o.o.",
    "Bilanca za obdobje 01.01.2026-31.08.2026",
    "120 Kupci",
    "1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00 0,00",
    "220 Dobavitelji",
    "0,00 800,00 0,00 0,00 0,00 800,00 0,00 800,00",
    "9831 Druge kratkoročne finančne obveznosti",
    "0,00 200,00 0,00 0,00 0,00 200,00 0,00 200,00",
  ].join("\n")

  const standard = buildStatement(text, "blisc.pdf")
  assert.equal(standard.balance.current["074"], 20_000)
  assert.equal(standard.balance.current["090"], undefined)

  const asked = accountQuestions(text, [])
  const question = asked.find((row) => row.code === "9831")
  assert.equal(question?.suggested, "074")
  assert.equal(question?.aop, "074")

  const mapped = buildStatement(text, "blisc.pdf", [{ code: "9831", aop: "090" }])
  assert.equal(mapped.balance.current["090"], 20_000)
  assert.equal(mapped.balance.current["074"], undefined)
  assert.equal(mapped.balance.current["050"], 100_000)
  assert.equal(mapped.balance.current["093"], 80_000)
  assert.ok(mapped.notes.some((note) => note.includes("9831") && note.includes("090")))
  const current = rollup(mapped.balance.current)
  assert.equal(current["001"], current["055"])
  assert.equal(
    accountQuestions(text, [{ code: "9831", aop: "090" }]).some((row) => row.code === "9831"),
    false,
  )

  const kept = buildStatement(text, "blisc.pdf", [{ code: "9831", aop: "074" }])
  assert.equal(kept.balance.current["074"], 20_000)
  assert.equal(kept.balance.current["090"], undefined)

  const prefixed = buildStatement(text, "blisc.pdf", [{ code: "983", aop: "090" }])
  assert.equal(prefixed.balance.current["090"], 20_000)
  assert.equal(accountQuestions(text, [{ code: "983", aop: "090" }]).some((row) => row.code === "9831"), false)
})

test("analitika brez trištevilčnega konta gre v isto postavko bilance", () => {
  const statement = buildStatement(
    [
      "SEVER d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.08.2026",
      "12 Terjatve do kupcev",
      "0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00",
      "1200 Kupci v državi",
      "50.000,00 0,00 30.000,00 0,00 80.000,00 0,00 80.000,00 0,00",
      "22 Dobavitelji",
      "0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00",
      "2200 Dobavitelji v državi",
      "0,00 50.000,00 0,00 0,00 0,00 50.000,00 0,00 50.000,00",
      "7600 Prodaja storitev",
      "0,00 0,00 0,00 30.000,00 0,00 30.000,00 0,00 30.000,00",
    ].join("\n"),
    "sever.pdf",
  )

  assert.equal(statement.balance.current["050"], 8_000_000)
  assert.equal(statement.balance.previous["050"], 5_000_000)
  assert.equal(statement.balance.current["093"], 5_000_000)
  assert.equal(statement.balance.current["070"], 3_000_000)
  assert.equal(statement.income["112"], 3_000_000)
  assert.equal(statement.warnings.length, 0)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
})

test("popravek izkaza se takoj pozna na dobičku bilance", () => {
  const statement = buildStatement(
    [
      "ACME d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.01.2026",
      "120 Kupci",
      "1.000,00 0,00 150,00 0,00 1.150,00 0,00 1.150,00 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00",
      "760 Prodaja",
      "0,00 0,00 0,00 200,00 0,00 200,00 0,00 200,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
    ].join("\n"),
    "acme.pdf",
  )

  const edited = applyCurrentAmount(statement, "izkaz", "112", (statement.income["112"] ?? 0) + 100)
  assert.equal(edited.income["112"], 20_100)
  assert.equal(edited.balance.current["070"], 15_100)
  assert.equal(applyCurrentAmount(edited, "bilanca", "050", 116_000).balance.current["050"], 116_000)
})

test("sprememba AOP v formulah zamenja prejšnji konto", () => {
  const rows = [
    {
      code: "9831",
      name: "Druge kratkoročne finančne obveznosti",
      amount: 20_000,
      aop: "074",
      suggested: "074",
      obrazec: "bilanca" as const,
      saved: true,
    },
  ]
  const next = formulasForEditor(
    [
      { code: "9831", aop: "074" },
      { code: "120", aop: "050" },
    ],
    rows,
    { "9831": "090" },
  )
  assert.deepEqual(next, [
    { code: "120", aop: "050" },
    { code: "9831", aop: "090" },
  ])
})

test("bruto bilanca Grafama se razporedi na obrazec AJPES", async () => {
  const bytes = await readFile(new URL("../../public/sources/Grafam_BB_31.08.2026.pdf", import.meta.url))
  const statement = await statementFromPdf(bytes, "Grafam_BB_31.08.2026.pdf")

  assert.equal(statement.company, "GRAFAM d.o.o.")
  assert.equal(statement.period, grafam.period)
  assert.equal(statement.currentDate, grafam.currentDate)
  assert.equal(statement.previousDate, grafam.previousDate)
  assert.deepEqual(statement.warnings, [])

  assert.deepEqual(nonzero(statement.balance.current), grafam.balance.current)
  assert.deepEqual(nonzero(statement.balance.previous), grafam.balance.previous)
  assert.deepEqual(nonzero(statement.income), grafam.income)

  const current = rollup(statement.balance.current)
  const previous = rollup(statement.balance.previous)
  assert.equal(current["001"], current["055"])
  assert.equal(previous["001"], previous["055"])
  assert.equal(rollupIncome(statement.income)["186"], current["070"])
})

test("usklajena bilanca z dobičkom in staro izgubo nima opozorila o razliki", () => {
  const statement = buildStatement(
    [
      "FORTUN d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.08.2026",
      "120 Kupci",
      "10.000,00 0,00 0,00 0,00 10.000,00 0,00 10.000,00 0,00",
      "900 Osnovni kapital",
      "0,00 8.000,00 0,00 0,00 0,00 8.000,00 0,00 8.000,00",
      "933 Prenesena izguba",
      "2.000,00 0,00 0,00 0,00 2.000,00 0,00 2.000,00 0,00",
      "760 Prodaja",
      "0,00 0,00 0,00 4.000,00 0,00 4.000,00 0,00 4.000,00",
    ].join("\n"),
    "fortun.pdf",
  )

  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
  assert.equal(statement.balance.current["070"], 400_000)
  assert.equal(statement.balance.current["069"], 200_000)
  assert.equal(
    statement.warnings.some((warning) => /se razlikujejo|preverite konte|neusklajen/.test(warning)),
    false,
  )
  const issues = reviewColumn(current, statement.currentDate)
  assert.equal(
    issues.some((issue) => issue.imbalance || issue.severity === "error"),
    false,
  )
})

test("iskanje 600001 najde analitični konto poleg 600 in 600000", () => {
  const text = [
    "ADREMA d.o.o.",
    "Bilanca za obdobje 01.01.2026-31.08.2026",
    "600 NEDOKONČANA PROIZVODNJA",
    "6.609,03 0,00 0,00 0,00 6.609,03 0,00 6.609,03 0,00",
    "600000 Razvijanje izdelka Guest Copilot",
    "5.869,00 0,00 0,00 0,00 5.869,00 0,00 5.869,00 0,00",
    "600001 Bolha Fashion - priprava kolekcije",
    "740,03 0,00 0,00 0,00 740,03 0,00 740,03 0,00",
  ].join("\n")

  const rows = accountRows(text)
  const hit = filterAccountRows(rows, "600001")
  assert.equal(hit.length, 1)
  assert.equal(hit[0]?.code, "600001")
  assert.equal(hit[0]?.name, "Bolha Fashion - priprava kolekcije")
  assert.equal(hit[0]?.amount, 74_003)

  const prefix = filterAccountRows(rows, "600").map((row) => row.code)
  assert.deepEqual(prefix, ["600", "600000", "600001"])

  const plain = buildStatement(text, "adrema.pdf")
  assert.equal(plain.balance.current["036"], undefined)

  const mapped = buildStatement(text, "adrema.pdf", [{ code: "600001", aop: "036" }])
  assert.equal(mapped.balance.current["036"], 74_003)
  assert.equal(mapped.balance.current["070"], undefined)
  const mappedHit = filterAccountRows(accountRows(text, [{ code: "600001", aop: "036" }]), "600001")
  assert.equal(mappedHit[0]?.aop, "036")
  assert.equal(mappedHit[0]?.amount, 74_003)
})

test("iskanje 600000 pokaže analitični konto iz PDF, tudi če shranjeni seznam pozna samo 600", () => {
  const text = [
    "ADREMA d.o.o.",
    "Bilanca za obdobje 01.01.2026-31.08.2026",
    "600 NEDOKONČANA PROIZVODNJA",
    "6.609,03 0,00 0,00 0,00 6.609,03 0,00 6.609,03 0,00",
    "600000 Razvijanje izdelka Guest Copilot",
    "5.869,00 0,00 0,00 0,00 5.869,00 0,00 5.869,00 0,00",
    "600001 Bolha Fashion - priprava kolekcije",
    "740,03 0,00 0,00 0,00 740,03 0,00 740,03 0,00",
  ].join("\n")

  const stored = [
    {
      code: "600",
      name: "NEDOKONČANA PROIZVODNJA",
      amount: 660_903,
      aop: "",
      suggested: "",
      obrazec: "bilanca" as const,
      saved: false,
    },
  ]
  const rows = accountsForSearch(stored, text)
  assert.deepEqual(
    rows.map((row) => row.code),
    ["600", "600000", "600001"],
  )

  const hit = filterAccountRows(rows, "600000")
  assert.equal(hit.length, 1)
  assert.equal(hit[0]?.code, "600000")
  assert.equal(hit[0]?.name, "Razvijanje izdelka Guest Copilot")
  assert.equal(hit[0]?.amount, 586_900)
  assert.equal(formatCents(hit[0]?.amount ?? 0), "5.869,00")

  const sibling = filterAccountRows(rows, "600001")
  assert.equal(sibling[0]?.code, "600001")
  const parent = filterAccountRows(rows, "600").map((row) => row.code)
  assert.deepEqual(parent, ["600", "600000", "600001"])
})

test("uvoz PDF obdrži analitična konta 600000 in 600001", async () => {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await readFile(new URL("./fonts/DejaVuSans.ttf", import.meta.url)))
  const page = pdf.addPage([595, 842])
  const lines = [
    "ADREMA d.o.o.",
    "Bilanca za obdobje 01.01.2026-31.08.2026",
    "600 NEDOKONČANA PROIZVODNJA",
    "6.609,03 0,00 0,00 0,00 6.609,03 0,00 6.609,03 0,00",
    "600000 Razvijanje izdelka Guest Copilot",
    "5.869,00 0,00 0,00 0,00 5.869,00 0,00 5.869,00 0,00",
    "600001 Bolha Fashion - priprava kolekcije",
    "740,03 0,00 0,00 0,00 740,03 0,00 740,03 0,00",
    "120 Kupci",
    "1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00 0,00",
  ]
  let y = 800
  for (const line of lines) {
    page.drawText(line, { x: 40, y, size: 9, font })
    y -= 14
  }
  const text = await pdfToText(await pdf.save())
  const rows = accountRows(text)
  const hit = filterAccountRows(rows, "600000")
  assert.equal(hit.length, 1)
  assert.equal(hit[0]?.name, "Razvijanje izdelka Guest Copilot")
  assert.equal(hit[0]?.amount, 586_900)
  assert.deepEqual(
    filterAccountRows(rows, "600").map((row) => row.code),
    ["600", "600000", "600001"],
  )
})

test("konto, ki ni na bilanci, poimenuje razliko 40.822,93", () => {
  const statement = buildStatement(
    [
      "FORTUN d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.08.2026",
      "120 Kupci",
      "50.000,00 0,00 0,00 0,00 50.000,00 0,00 50.000,00 0,00",
      "900 Osnovni kapital",
      "0,00 9.177,07 0,00 0,00 0,00 9.177,07 0,00 9.177,07",
      "8100 Posebni evidenčni",
      "40.822,93 0,00 0,00 0,00 40.822,93 0,00 40.822,93 0,00",
    ].join("\n"),
    "fortun.pdf",
  )

  const current = rollup(statement.balance.current)
  assert.equal(current["001"] - current["055"], 4_082_293)
  assert.equal(
    statement.warnings.some(
      (warning) => warning.includes("8100") && warning.includes("Posebni evidenčni") && warning.includes(formatCents(4_082_293)),
    ),
    true,
  )
  const shown = sheetWarnings(statement.warnings, current["001"], current["055"])
  assert.equal(shown[0]?.includes(formatCents(current["001"] ?? 0)), true)
  assert.equal(shown[0]?.includes(formatCents(current["055"] ?? 0)), true)
  assert.equal(shown[0]?.includes("40.822,93"), true)
  assert.equal(shown.some((line) => line.includes("8100 Posebni evidenčni")), true)

  const hidden = sheetWarnings(statement.warnings, current["001"], current["001"])
  assert.equal(
    hidden.some((line) => /se razlikujejo|razlikujejo se/.test(line)),
    false,
  )
})

test("popravek zneska zbriše shranjeni stavek, ko sta prikazani vsoti enaki", () => {
  const statement = buildStatement(
    [
      "FORTUN d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.08.2026",
      "120 Kupci",
      "10.000,00 0,00 0,00 0,00 10.000,00 0,00 10.000,00 0,00",
      "900 Osnovni kapital",
      "0,00 8.000,00 0,00 0,00 0,00 8.000,00 0,00 8.000,00",
      "933 Prenesena izguba",
      "2.000,00 0,00 0,00 0,00 2.000,00 0,00 2.000,00 0,00",
      "760 Prodaja",
      "0,00 0,00 0,00 4.000,00 0,00 4.000,00 0,00 4.000,00",
    ].join("\n"),
    "fortun.pdf",
  )
  const current = rollup(statement.balance.current)
  assert.equal(formatCents(current["001"]), formatCents(current["055"]))
  const stale = {
    ...statement,
    warnings: ["Sredstva in obveznosti do virov se razlikujejo za 40.822,93 €. Preverite konte, ki niso razporejeni."],
  }
  const edited = applyCurrentAmount(stale, "bilanca", "050", 0)
  assert.equal(
    edited.warnings.some((warning) => /razlikujejo|niso razporejeni|40\.822,93/.test(warning)),
    false,
  )
})

test("izračunan dobiček iz izkaza pride na postavko 070 in bilanca se ujema", () => {
  const statement = buildStatement(
    [
      "ACME d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.01.2026",
      "120 Kupci",
      "1.000,00 0,00 150,00 0,00 1.150,00 0,00 1.150,00 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00",
      "760 Prodaja",
      "0,00 0,00 0,00 200,00 0,00 200,00 0,00 200,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
    ].join("\n"),
    "dobicek.pdf",
  )

  const profit = rollupIncome(statement.income)["186"]
  assert.equal(profit, 15_000)
  assert.equal(statement.balance.current["070"], profit)
  assert.equal(statement.balance.current["071"], undefined)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
  assert.equal(
    statement.warnings.some((warning) => /razlikujejo/.test(warning)),
    false,
  )
})

test("že vknjižen dobiček na postavki 070 se ne podvoji", () => {
  const statement = buildStatement(
    [
      "ACME d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.01.2026",
      "120 Kupci",
      "1.150,00 0,00 0,00 0,00 1.150,00 0,00 1.150,00 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00",
      "931 Čisti dobiček poslovnega leta",
      "0,00 150,00 0,00 0,00 0,00 150,00 0,00 150,00",
      "760 Prodaja",
      "0,00 0,00 0,00 200,00 0,00 200,00 0,00 200,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
    ].join("\n"),
    "ze-070.pdf",
    [{ code: "931", aop: "070" }],
  )

  const profit = rollupIncome(statement.income)["186"]
  assert.equal(profit, 15_000)
  assert.equal(statement.balance.current["070"], profit)
  assert.equal(statement.balance.current["071"], undefined)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
})

test("dobiček pride na 070, tudi ko razlika ni natanko enaka dobičku", () => {
  const statement = buildStatement(
    [
      "ACME d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.01.2026",
      "120 Kupci",
      "1.000,00 0,00 250,00 0,00 1.250,00 0,00 1.250,00 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00",
      "760 Prodaja",
      "0,00 0,00 0,00 200,00 0,00 200,00 0,00 200,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
    ].join("\n"),
    "razlika.pdf",
  )

  const profit = rollupIncome(statement.income)["186"]
  assert.equal(profit, 15_000)
  assert.equal(statement.balance.current["070"], profit)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"] - current["055"], 10_000)
})

test("izguba iz izkaza pride na postavko 071", () => {
  const statement = buildStatement(
    [
      "ACME d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.01.2026",
      "120 Kupci",
      "1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 50,00 0,00 1.050,00 0,00 1.050,00",
      "760 Prodaja",
      "0,00 0,00 0,00 100,00 0,00 100,00 0,00 100,00",
      "400 Material",
      "0,00 0,00 150,00 0,00 150,00 0,00 150,00 0,00",
    ].join("\n"),
    "izguba.pdf",
  )

  const loss = rollupIncome(statement.income)["187"]
  assert.equal(loss, 5_000)
  assert.equal(statement.balance.current["071"], loss)
  assert.equal(statement.balance.current["070"], undefined)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
  assert.equal(
    statement.warnings.some((warning) => /razlikujejo/.test(warning)),
    false,
  )
})

test("dobiček, ki je že v prenesenem dobičku, ne pride še enkrat na 070", () => {
  const statement = buildStatement(
    [
      "ACME d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.01.2026",
      "120 Kupci",
      "1.150,00 0,00 0,00 0,00 1.150,00 0,00 1.150,00 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00",
      "930 Preneseni dobiček",
      "0,00 0,00 0,00 150,00 0,00 150,00 0,00 150,00",
      "760 Prodaja",
      "0,00 0,00 0,00 200,00 0,00 200,00 0,00 200,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
    ].join("\n"),
    "zaprt.pdf",
  )

  const profit = rollupIncome(statement.income)["186"]
  assert.equal(profit, 15_000)
  assert.equal(statement.balance.current["068"], profit)
  assert.equal(statement.balance.current["070"], undefined)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
})

test("hkrati vknjižen dobiček in izguba ostaneta le pravi izid", () => {
  const statement = buildStatement(
    [
      "ACME d.o.o.",
      "Bilanca za obdobje 01.01.2026-31.01.2026",
      "120 Kupci",
      "1.150,00 0,00 0,00 0,00 1.150,00 0,00 1.150,00 0,00",
      "220 Dobavitelji",
      "0,00 1.000,00 0,00 0,00 0,00 1.000,00 0,00 1.000,00",
      "931 Čisti dobiček poslovnega leta",
      "0,00 200,00 0,00 0,00 0,00 200,00 0,00 200,00",
      "934 Čista izguba poslovnega leta",
      "50,00 0,00 0,00 0,00 50,00 0,00 50,00 0,00",
      "760 Prodaja",
      "0,00 0,00 0,00 200,00 0,00 200,00 0,00 200,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
    ].join("\n"),
    "oba.pdf",
    [
      { code: "931", aop: "070" },
      { code: "934", aop: "071" },
    ],
  )

  const profit = rollupIncome(statement.income)["186"]
  assert.equal(profit, 15_000)
  assert.equal(statement.balance.current["070"], profit)
  assert.equal(statement.balance.current["071"], undefined)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
})

test("005000 in 008500 data na AOP 004 razliko, 008500 pa ni na 007", () => {
  const text = [
    "ADREMA d.o.o.",
    "Bilanca za obdobje 01.01.2026-31.08.2026",
    "005000 Druga neopredmetena sredstva",
    "10.000,00 0,00 0,00 0,00 10.000,00 0,00 10.000,00 0,00",
    "008500 Popravek vrednosti - druga neopredmetena sredstva",
    "0,00 1.168,50 0,00 0,00 0,00 1.168,50 0,00 1.168,50",
    "900 Osnovni kapital",
    "0,00 8.831,50 0,00 0,00 0,00 8.831,50 0,00 8.831,50",
  ].join("\n")
  const difference = 1_000_000 - 116_850

  const statement = buildStatement(text, "adrema.pdf")
  assert.equal(rollup(statement.balance.current)["004"], difference)
  assert.equal(statement.balance.current["007"] ?? 0, 0)
  assert.equal(accountRows(text).find((row) => row.code === "008500")?.suggested ?? "", "")

  const mapped = buildStatement(text, "adrema.pdf", [
    { code: "005000", aop: "004" },
    { code: "008500", aop: "nikamor" },
  ])
  assert.equal(mapped.balance.current["004"], difference)
  assert.equal(mapped.balance.current["008"] ?? 0, 0)
  assert.equal(mapped.balance.current["007"] ?? 0, 0)
  assert.equal(rollup(mapped.balance.current)["004"], difference)
})

test("konto z izbiro nikamor ne spremeni nobene postavke", () => {
  const base = [
    "ACME d.o.o.",
    "Bilanca za obdobje 01.01.2026-31.01.2026",
    "1100 Denarna sredstva",
    "100,00 0,00 0,00 0,00 100,00 0,00 100,00 0,00",
    "900 Osnovni kapital",
    "0,00 100,00 0,00 0,00 0,00 100,00 0,00 100,00",
    "400 Material",
    "0,00 0,00 0,00 0,00 0,00 0,00 0,00 0,00",
  ].join("\n")
  const withReceivable = [
    base,
    "120 Kupci",
    "50,00 0,00 0,00 0,00 50,00 0,00 50,00 0,00",
  ].join("\n")

  const plain = buildStatement(base, "brez.pdf")
  const hidden = buildStatement(withReceivable, "skrit.pdf", [{ code: "120", aop: "nikamor" }])
  assert.deepEqual(rollup(hidden.balance.current), rollup(plain.balance.current))
  assert.equal(hidden.balance.current["050"] ?? 0, 0)
  assert.equal(
    Object.values(rollup(hidden.balance.current)).some((value) => value === 5_000),
    false,
  )

  const rows = accountRows(withReceivable)
  assert.deepEqual(formulasForEditor([], rows, { "120": "Ne vpiši nikamor" }), [{ code: "120", aop: "nikamor" }])
  assert.deepEqual(normalizeFormulas([{ code: "120", aop: "nikamor" }]), [{ code: "120", aop: "nikamor" }])
})

function nonzero(values: Record<string, number>) {
  return Object.fromEntries(Object.entries(values).filter((entry) => entry[1] !== 0))
}
