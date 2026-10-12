import assert from "node:assert/strict"
import test from "node:test"

import { canonAop, choicesFor, formulasForEditor, isSelectableAop } from "./account-map.ts"
import { rollup } from "./compute.ts"
import { accountRows, buildStatement } from "./trial.ts"

test("AOP 004 je veljaven na bilanci gospodarske družbe", () => {
  assert.equal(isSelectableAop("004", "doo"), true)
  assert.equal(isSelectableAop("4", "doo"), true)
  assert.equal(isSelectableAop(canonAop("4"), "doo"), true)
  const line = choicesFor("doo").bilanca.find((item) => item.aop === "004")
  assert.equal(line?.label, "1. Neopredmetena sredstva")
  assert.equal(isSelectableAop("999", "doo"), false)
  assert.equal(isSelectableAop("xyz", "doo"), false)
  assert.equal(isSelectableAop("060a", "doo"), false)
})

test("oznake, ki so na izkazu, ostanejo veljavne", () => {
  assert.equal(isSelectableAop("110", "doo"), true)
  assert.equal(isSelectableAop("156", "doo"), true)
  assert.match(choicesFor("doo").izkaz.find((item) => item.aop === "156")?.label ?? "", /deležev v družbah v skupini/)
  assert.equal(isSelectableAop("156", "drustvo"), false)
  assert.equal(isSelectableAop("148a", "doo"), false)
  assert.equal(isSelectableAop("148a", "sp"), true)
})

test("konto 008500 se shrani na AOP 004 in se vpiše v tekočo bilanco", () => {
  const text = [
    "ADREMA d.o.o.",
    "Bilanca za obdobje 01.01.2026-31.08.2026",
    "008500 Popravek vrednosti - druga neopredmetena sredstva",
    "0,00 1.168,50 0,00 0,00 0,00 1.168,50 0,00 1.168,50",
    "0085001 Analitika popravka",
    "0,00 1.168,50 0,00 0,00 0,00 1.168,50 0,00 1.168,50",
    "1100 Denarna sredstva",
    "1.168,50 0,00 0,00 0,00 1.168,50 0,00 1.168,50 0,00",
  ].join("\n")

  const rows = accountRows(text)
  const codes = rows.map((row) => row.code)
  assert.ok(codes.includes("008500"))
  assert.ok(codes.includes("0085001"))

  const target = rows.find((row) => row.code === "008500")
  assert.ok(target)
  const stored = formulasForEditor([], rows, { "008500": "004", "0085001": target.aop }, "doo")
  assert.deepEqual(stored, [{ code: "008500", aop: "004" }])

  const statement = buildStatement(text, "adrema.pdf", [{ code: "008500", aop: "004" }])
  assert.equal(statement.balance.current["004"], -116_850)
  assert.equal(statement.balance.current["007"], undefined)
  const shown = rollup(statement.balance.current, "doo")
  assert.equal(shown["004"], -116_850)
  assert.equal(shown["003"], -116_850)

  const kept = accountRows(text, [{ code: "008500", aop: "004" }]).map((row) => row.code)
  assert.ok(kept.includes("008500"))
  assert.ok(kept.includes("0085001"))
})
