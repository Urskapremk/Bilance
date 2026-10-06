import assert from "node:assert/strict"
import test from "node:test"

import { renderStatementPdf } from "./statement-pdf.ts"
import type { Statement } from "./trial.ts"

const statement: Statement = {
  company: "BLIŠČ d.o.o.",
  period: "1. 1. 2026–31. 8. 2026",
  currentDate: "31. 8. 2026",
  previousDate: "31. 12. 2025",
  sourceName: "blisc.pdf",
  balance: { current: { "014": 123456 }, previous: {} },
  income: { "112": 3181318 },
  notes: [],
  warnings: [],
}

test("izpis bilance je PDF z družbo, ki ima šumnike", async () => {
  const pdf = await renderStatementPdf({ statement, view: "bilanca", showZeros: false })
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-")
  assert.ok(pdf.byteLength > 2000)
  const income = await renderStatementPdf({ statement, view: "izkaz", showZeros: false })
  assert.equal(Buffer.from(income.subarray(0, 5)).toString(), "%PDF-")
})
