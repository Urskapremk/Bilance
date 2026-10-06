import assert from "node:assert/strict"
import test from "node:test"

import { parseSloveneDate, splitPeriod } from "./format.ts"

test("datum obdobja sprejme ničle in pike", () => {
  assert.equal(parseSloveneDate("01.01.2026"), "1. 1. 2026")
  assert.equal(parseSloveneDate("31.08.2026"), "31. 8. 2026")
  assert.equal(parseSloveneDate("1. 1. 2026"), "1. 1. 2026")
  assert.equal(parseSloveneDate("31.13.2026"), null)
  assert.equal(parseSloveneDate("31.02.2026"), null)
})

test("obdobje se razdeli na začetek in konec", () => {
  assert.deepEqual(splitPeriod("1. 1. 2026–31. 12. 2026"), { start: "1. 1. 2026", end: "31. 12. 2026" })
  assert.deepEqual(splitPeriod("01.01.2026-31.08.2026"), { start: "1. 1. 2026", end: "31. 8. 2026" })
})
