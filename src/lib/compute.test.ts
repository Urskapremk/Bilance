import assert from "node:assert/strict"
import { test } from "node:test"
import { reviewColumn, rollup } from "./compute.ts"
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
  assert.ok(errors.some((issue) => issue.message.includes("AOP 070")))
})
