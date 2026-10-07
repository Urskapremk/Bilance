import assert from "node:assert/strict"
import test from "node:test"

import { normalizeFormulas } from "./account-map.ts"
import { chart } from "./charts.ts"
import { rollup } from "./compute.ts"
import { incomeLines, rollupIncome } from "./income.ts"
import { inferLegalForm } from "./legal-form.ts"
import { buildStatement } from "./trial.ts"

const trial = [
  "Karin Čemažar",
  "Bilanca za obdobje 01.01.2026-31.08.2026",
  "120 Kupci",
  "0,00 0,00 1.000,00 0,00 1.000,00 0,00 1.000,00 0,00",
  "900 Začetni kapital",
  "0,00 800,00 0,00 0,00 0,00 800,00 0,00 800,00",
  "910 Prenos stvarnega premoženja",
  "0,00 100,00 0,00 0,00 0,00 100,00 0,00 100,00",
  "920 Dvig denarja",
  "200,00 0,00 0,00 0,00 200,00 0,00 200,00 0,00",
  "760 Prodaja",
  "0,00 0,00 0,00 500,00 0,00 500,00 0,00 500,00",
  "400 Material",
  "0,00 0,00 150,00 0,00 150,00 0,00 150,00 0,00",
  "480 Prispevki za socialno varnost podjetnika",
  "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
].join("\n")

test("iz imena se prepozna oblika, osebno ime pa ostane prazno", () => {
  assert.equal(inferLegalForm("GRAFAM d.o.o."), "doo")
  assert.equal(inferLegalForm("Planinsko društvo"), "drustvo")
  assert.equal(inferLegalForm("Zavod za kulturo"), "zavod")
  assert.equal(inferLegalForm("Karin Čemažar s.p."), "sp")
  assert.equal(inferLegalForm("Karin Čemažar"), null)
})

test("samostojni podjetnik ima podjetnikov kapital po AJPES", () => {
  const spec = chart("sp")
  assert.equal(spec.lineByAop["058"]?.label, "I. Začetni podjetnikov kapital")
  assert.match(spec.lineByAop["060a"]?.label ?? "", /Prenosi stvarnega premoženja/)
  assert.match(spec.lineByAop["060b"]?.label ?? "", /Pritoki in odtoki/)
  assert.equal(spec.lineByAop["057"], undefined)
  assert.equal(spec.lineByAop["060"], undefined)
  assert.equal(spec.lineByAop["068"], undefined)
  assert.equal(spec.lineByAop["069"], undefined)
  const values = rollup({ "058": 100, "060a": 20, "060b": -5, "070": 3 }, "sp")
  assert.equal(values["056"], 118)

  const statement = buildStatement(trial, "karin.pdf", [], "sp")
  assert.equal(statement.legalForm, "sp")
  assert.equal(statement.balance.current["058"], 80_000)
  assert.equal(statement.balance.current["060a"], 10_000)
  assert.equal(statement.balance.current["060b"], -20_000)
  assert.equal(statement.balance.current["060"], undefined)
  assert.equal(statement.balance.current["062"], undefined)
  assert.equal(statement.income["148a"], 5_000)
  assert.equal(statement.income["150"], undefined)
  const income = rollupIncome(statement.income, "sp")
  assert.equal(income["182"], 30_000)
  assert.equal(income["186"], undefined)
  assert.equal(statement.balance.current["070"], 30_000)
  const current = rollup(statement.balance.current, "sp")
  assert.equal(current["001"], current["055"])
  assert.equal(incomeLines("sp").some((line) => line.aop === "186"), false)
  assert.match(incomeLines("sp").find((line) => line.aop === "182")?.label ?? "", /Podjetnikov dohodek/)
})

test("d.o.o. še naprej razporedi konto 910 na kapitalske rezerve", () => {
  const statement = buildStatement(trial, "karin.pdf")
  assert.equal(statement.legalForm, "doo")
  assert.equal(statement.balance.current["058"], 80_000)
  assert.equal(statement.balance.current["060"], 10_000)
  assert.equal(statement.balance.current["060a"], undefined)
  assert.equal(statement.income["150"], 5_000)
  assert.equal(rollupIncome(statement.income)["186"], 30_000)
  const current = rollup(statement.balance.current)
  assert.equal(current["001"], current["055"])
})

test("društvo prenese presežek v društveni sklad, zavod v presežek leta", () => {
  const drustvo = buildStatement(trial, "drustvo.pdf", [], "drustvo")
  assert.equal(chart("drustvo").lineByAop["056a"]?.label, "I. Društveni sklad")
  assert.equal(chart("drustvo").lineByAop["070"], undefined)
  assert.equal(drustvo.balance.current["056a"], 80_000 + 10_000 - 20_000 + 30_000)
  assert.equal(drustvo.balance.current["070"], undefined)
  assert.equal(rollup(drustvo.balance.current, "drustvo")["001"], rollup(drustvo.balance.current, "drustvo")["055"])

  const zavod = buildStatement(trial, "zavod.pdf", [], "zavod")
  assert.equal(chart("zavod").lineByAop["056a"]?.label, "I. Ustanovitveni vložek")
  assert.equal(zavod.balance.current["056a"], 80_000 + 10_000 - 20_000)
  assert.equal(zavod.balance.current["301"], undefined)
  assert.equal(zavod.balance.current["070"], 30_000)
  assert.equal(rollup(zavod.balance.current, "zavod")["001"], rollup(zavod.balance.current, "zavod")["055"])
  assert.match(incomeLines("zavod").find((line) => line.aop === "186")?.label ?? "", /Čisti presežek prihodkov/)
})

test("formula 060a ostane shranjena", () => {
  assert.deepEqual(normalizeFormulas([{ code: "9100", aop: "060a" }]), [{ code: "9100", aop: "060a" }])
  assert.deepEqual(normalizeFormulas([{ code: "9100", aop: "60A" }]), [{ code: "9100", aop: "060a" }])
})
