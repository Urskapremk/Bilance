import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { grafamPublic2025 } from "./ajpes-public.ts"
import { statementFromPdf } from "./from-pdf.ts"
import { grafam } from "./grafam.ts"

test("javna objava 2025 je uravnotežena in se ujema s kapitalom iz knjig", () => {
  const amounts = grafamPublic2025.amounts
  assert.equal(amounts["001"], 18_519_740)
  assert.equal(amounts["055"], amounts["001"])
  assert.equal(amounts["056"], 7_039_625)
  assert.equal(
    (amounts["057"] ?? 0) +
      (amounts["060"] ?? 0) +
      (amounts["061"] ?? 0) +
      (amounts["067"] ?? 0) +
      (amounts["301"] ?? 0) +
      (amounts["068"] ?? 0) +
      (amounts["070"] ?? 0) -
      (amounts["069"] ?? 0) -
      (amounts["071"] ?? 0),
    amounts["056"],
  )
  assert.equal(
    (amounts["056"] ?? 0) + (amounts["072"] ?? 0) + (amounts["075"] ?? 0) + (amounts["085"] ?? 0) + (amounts["095"] ?? 0),
    amounts["055"],
  )
  assert.equal((amounts["002"] ?? 0) + (amounts["032"] ?? 0) + (amounts["053"] ?? 0), amounts["001"])
  assert.equal((amounts["068"] ?? 0) + (amounts["070"] ?? 0), grafam.balance.previous["068"])
  assert.equal(amounts["010"], grafam.balance.previous["014"])
  assert.equal(amounts["052"], grafam.balance.previous["052"])
  assert.equal(amounts["053"], grafam.balance.previous["053"])
  assert.equal(amounts["058"], grafam.balance.previous["058"])
})

test("bruto bilanca Grafama obdrži otvoritev in pokaže javno objavo", async () => {
  const bytes = await readFile(new URL("../../public/sources/Grafam_BB_31.08.2026.pdf", import.meta.url))
  const statement = await statementFromPdf(bytes, "Grafam_BB_31.08.2026.pdf")
  assert.equal(statement.publicPrevious?.registration, "6531482000")
  assert.equal(statement.publicPrevious?.amounts["001"], 18_519_740)
  assert.equal(statement.balance.previous["050"], grafam.balance.previous["050"])
  assert.equal(statement.notes.at(-1)?.includes("javna objava"), true)
})
