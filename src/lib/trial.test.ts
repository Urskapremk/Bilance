import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { rollup } from "./compute.ts"
import { statementFromPdf } from "./from-pdf.ts"
import { grafam } from "./grafam.ts"
import { rollupIncome } from "./income.ts"
import { buildStatement } from "./trial.ts"

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

function nonzero(values: Record<string, number>) {
  return Object.fromEntries(Object.entries(values).filter((entry) => entry[1] !== 0))
}
