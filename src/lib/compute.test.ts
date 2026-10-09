import assert from "node:assert/strict"
import { test } from "node:test"
import { isImbalanceWarning, reviewColumn, rollup, sheetWarnings, warningsForSheet } from "./compute.ts"
import { formatCents } from "./format.ts"
import { sampleStatement } from "./statement.ts"

test("demonstracijski primer je usklajen v obeh letih", () => {
  const sample = sampleStatement()
  const current = rollup(sample.current)
  const previous = rollup(sample.previous)

  assert.equal(current["001"], 320_500)
  assert.equal(current["055"], 320_500)
  assert.equal(current["054"], current["096"])
  assert.equal(previous["001"], 318_000)
  assert.equal(previous["055"], 318_000)
  assert.equal(previous["054"], previous["096"])
  assert.deepEqual(reviewColumn(current, "Tekoče leto").filter((issue) => issue.severity === "error"), [])
  assert.deepEqual(reviewColumn(previous, "Preteklo leto").filter((issue) => issue.severity === "error"), [])
})

test("zunajbilančne postavke niso del sredstev", () => {
  const values = rollup({ "052": 1_000, "058": 1_000, "054": 400, "096": 400 })
  assert.equal(values["001"], 1_000)
  assert.equal(values["055"], 1_000)
  assert.equal(values["054"], 400)
})

test("odbitne postavke in negativni AOP 301 zmanjšajo kapital", () => {
  const values = rollup({
    "058": 10_000,
    "059": 2_500,
    "064": 400,
    "062": 1_000,
    "301": -300,
    "069": 200,
  })
  assert.equal(values["057"], 7_500)
  assert.equal(values["061"], 600)
  assert.equal(values["056"], 7_500 + 600 - 300 - 200)
})

test("hkratni dobiček in izguba poslovnega leta pade kontrolo", () => {
  const values = rollup({ "070": 100, "071": 40 })
  const errors = reviewColumn(values, "Tekoče leto").filter((issue) => issue.severity === "error")
  assert.ok(errors.some((issue) => issue.message.includes("dobiček tega leta") && issue.message.includes("izguba tega leta")))
})

test("enaka AOP 001 in AOP 055 ne data opozorila o razliki", () => {
  const values = rollup({
    "052": 100_000,
    "058": 80_000,
    "069": 20_000,
    "070": 40_000,
  })
  assert.equal(values["001"], values["055"])
  assert.equal(formatCents(values["001"]), formatCents(values["055"]))
  const issues = reviewColumn(values, "31. 8. 2026")
  const red = issues.filter((issue) => issue.severity === "error" && !issue.imbalance)
  assert.deepEqual(red, [])
  assert.equal(
    issues.some((issue) => issue.imbalance || isImbalanceWarning(issue.message)),
    false,
  )
  assert.equal(
    issues.some((issue) => /razlikujejo|niso enaka|neusklajen|preverite konte|AOP 069/.test(issue.message)),
    false,
  )
})

test("stari rdeči stavek o 40.822,93 se skrije, ko sta vsoti enaki", () => {
  const stale =
    "Sredstva in obveznosti do virov se razlikujejo za 40.822,93 €. Preverite konte, ki niso razporejeni."
  assert.equal(isImbalanceWarning(stale), true)
  assert.deepEqual(sheetWarnings([stale], 5_000_000, 5_000_000), [])
})

test("enaka prikazana vsota izbriše shranjeni stavek o 40.822,93", () => {
  const stale =
    "Sredstva in obveznosti do virov se razlikujejo za 40.822,93 €. Preverite konte, ki niso razporejeni."
  const leaves = { "052": 11_138_710, "058": 11_138_710 }
  const shown = rollup(leaves)
  assert.equal(formatCents(shown["001"]), formatCents(shown["055"]))
  const lines = warningsForSheet([stale], leaves)
  assert.equal(
    lines.some((line) => /razlikujejo|niso razporejeni|40\.822,93/.test(line)),
    false,
  )
})

test("isti izpis na zaslonu skrije stavek, če se centi razlikujejo le za drobec", () => {
  const stale =
    "Sredstva in obveznosti do virov se razlikujejo za 40.822,93 €. Preverite konte, ki niso razporejeni."
  assert.equal(formatCents(11_138_710), formatCents(11_138_710.4))
  assert.equal(
    sheetWarnings([stale], 11_138_710, 11_138_710.4).some(
      (line) => line.includes("40.822,93") || line.includes("razlikujejo") || line.includes("niso razporejeni"),
    ),
    false,
  )
})

test("če se vsoti razlikujeta, stavek pove oba zneska", () => {
  const stale =
    "Sredstva in obveznosti do virov se razlikujejo za 40.822,93 €. Preverite konte, ki niso razporejeni."
  const shown = sheetWarnings([stale, "Konto 8100 Posebni evidenčni: 40.822,93 € ni v bilanci."], 5_000_000, 917_707)
  assert.equal(shown[0]?.includes(formatCents(5_000_000)), true)
  assert.equal(shown[0]?.includes(formatCents(917_707)), true)
  assert.equal(shown[0]?.includes(formatCents(4_082_293)), true)
  assert.equal(shown.some((line) => line.includes("8100") && line.includes("Posebni evidenčni") && line.includes("40.822,93")), true)
  assert.equal(shown.some((line) => line.startsWith("Sredstva in obveznosti do virov se razlikujejo")), false)
})

test("razlika v kontroli je v evrih, enako kot na zaslonu", () => {
  const values = rollup({ "052": 10_050, "058": 10_000 })
  assert.equal(values["001"], 10_050)
  assert.equal(values["055"], 10_000)
  const gap = reviewColumn(values, "31. 8. 2026").find((issue) => issue.imbalance)
  assert.ok(gap)
  assert.equal(gap.message.includes(`${formatCents(50)} €`), true)
  assert.equal(gap.imbalance, true)
})
