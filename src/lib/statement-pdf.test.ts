import assert from "node:assert/strict"
import test from "node:test"

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"

import { renderBothStatementsPdf, renderStatementPdf } from "./statement-pdf.ts"
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

test("oba izkaza sta v enem PDF", async () => {
  const pdf = await renderBothStatementsPdf({ statement, showZeros: false })
  assert.equal(Buffer.from(pdf.subarray(0, 5)).toString(), "%PDF-")
  assert.ok(pdf.byteLength > 2000)
  const doc = await getDocument({ data: new Uint8Array(pdf), disableWorker: true }).promise
  assert.ok(doc.numPages >= 2)
  let joined = ""
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index)
    const text = await page.getTextContent()
    joined += `${text.items.map((item) => ("str" in item ? item.str : "")).join(" ")}\n`
  }
  const balanceAt = joined.indexOf("Bilanca stanja")
  const incomeAt = joined.indexOf("Izkaz poslovnega izida")
  assert.ok(balanceAt >= 0)
  assert.ok(incomeAt > balanceAt)
  assert.match(joined, /BLIŠČ d\.o\.o\./)
  assert.match(joined, /Presečni izkazi/)
  assert.doesNotMatch(joined, /usklajena/)
  assert.doesNotMatch(joined, /Kljukica/)
})
