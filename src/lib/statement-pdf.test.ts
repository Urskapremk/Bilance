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
  assert.match(joined, /Presečni izkazi/)
  assert.doesNotMatch(joined, /ocena poslovanja/)
  const custom = await renderStatementPdf({
    statement: { ...statement, subtitle: "Letni izkazi" },
    view: "bilanca",
    showZeros: false,
  })
  const customDoc = await getDocument({ data: new Uint8Array(custom), disableWorker: true }).promise
  const customPage = await customDoc.getPage(1)
  const customText = await customPage.getTextContent()
  const customJoined = customText.items.map((item) => ("str" in item ? item.str : "")).join(" ")
  assert.match(customJoined, /Letni izkazi/)
  assert.doesNotMatch(customJoined, /Presečni izkazi/)
  const named = await renderStatementPdf({
    statement: { ...statement, subtitle: "Izkazi" },
    view: "bilanca",
    showZeros: false,
  })
  const namedDoc = await getDocument({ data: new Uint8Array(named), disableWorker: true }).promise
  const namedPage = await namedDoc.getPage(1)
  const namedText = await namedPage.getTextContent()
  const namedJoined = namedText.items.map((item) => ("str" in item ? item.str : "")).join(" ")
  assert.match(namedJoined, /Izkazi/)
  assert.doesNotMatch(joined, /usklajena/)
  assert.doesNotMatch(joined, /Kljukica/)
})
