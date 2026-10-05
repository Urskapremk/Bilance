import assert from "node:assert/strict"
import { test } from "node:test"
import { rollup } from "./compute.ts"
import { grafam } from "./grafam.ts"
import { rollupIncome } from "./income.ts"

test("bilanca Grafama je usklajena na oba datuma", () => {
  const current = rollup(grafam.balance.current)
  const previous = rollup(grafam.balance.previous)
  assert.equal(current["001"], 19_348_331)
  assert.equal(current["055"], current["001"])
  assert.equal(current["070"], 975_862)
  assert.equal(previous["001"], 18_534_290)
  assert.equal(previous["055"], previous["001"])
})

test("izkaz poslovnega izida se steka v čisti dobiček obdobja", () => {
  const income = rollupIncome(grafam.income)
  assert.equal(income["110"], 29_112_327)
  assert.equal(income["126"], 30_532_802)
  assert.equal(income["127"], 29_513_072)
  assert.equal(income["151"], 1_019_730)
  assert.equal(income["152"], 0)
  assert.equal(income["166"], 44_237)
  assert.equal(income["186"], 975_862)
  assert.equal(income["187"], 0)
  assert.equal(income["186"], rollup(grafam.balance.current)["070"])
})
