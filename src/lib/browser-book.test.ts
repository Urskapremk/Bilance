import assert from "node:assert/strict"
import test from "node:test"

import { clientDatabaseName, pinStoredStatement, REGISTRY_DATABASE } from "./browser-book.ts"
import type { Statement } from "./trial.ts"

test("vsaka stranka dobi svojo bazo", () => {
  assert.equal(clientDatabaseName("Adrema d.o.o."), clientDatabaseName("ADREMA d.o.o."))
  assert.notEqual(clientDatabaseName("ADREMA d.o.o."), clientDatabaseName("BLIŠČ d.o.o."))
  assert.equal(REGISTRY_DATABASE, "bilance-stranke")
  assert.match(clientDatabaseName("BLIŠČ d.o.o."), /^bilance-blišč d\.o\.o\.$/u)
})

test("popravek shranjenega obdobja obdrži stranko in obdobje", () => {
  const stored: Statement = {
    company: "ADREMA d.o.o.",
    period: "1. 1. 2026–31. 8. 2026",
    currentDate: "31. 8. 2026",
    previousDate: "31. 12. 2025",
    sourceName: "adrema.pdf",
    balance: { current: { "001": 100 }, previous: {} },
    income: {},
    notes: [],
    warnings: [],
  }
  const corrected = pinStoredStatement(
    { company: stored.company, period: stored.period, currentDate: stored.currentDate, sourceName: stored.sourceName },
    {
      ...stored,
      company: "Druga d.o.o.",
      period: "drugo obdobje",
      balance: { current: { "001": 250 }, previous: {} },
    },
  )
  assert.equal(corrected.company, "ADREMA d.o.o.")
  assert.equal(corrected.period, "1. 1. 2026–31. 8. 2026")
  assert.equal(corrected.balance.current["001"], 250)
})
