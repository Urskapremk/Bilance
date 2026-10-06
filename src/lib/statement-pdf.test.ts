import assert from "node:assert/strict"
import test from "node:test"

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"

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
  const income = await renderStatementPdf({ statement: { ...statement, signatory: "urska" }, view: "izkaz", showZeros: false })
  assert.equal(Buffer.from(income.subarray(0, 5)).toString(), "%PDF-")
  const doc = await getDocument({ data: new Uint8Array(income), disableWorker: true }).promise
  const page = await doc.getPage(1)
  const text = await page.getTextContent()
  const joined = text.items.map((item) => ("str" in item ? item.str : "")).join(" ")
  assert.match(joined, /Urška Premk/)
  assert.doesNotMatch(joined, /Kljukica/)
})
