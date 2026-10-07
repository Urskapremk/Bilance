import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

import { rollupIncome } from "./income.ts"
import { parseEkartica } from "./ekartica.ts"
import { pdfToText } from "./pdf-lines.ts"
import { applyEkartica, buildStatement } from "./trial.ts"

const CARD_PDF = "/home/ubuntu/.cursor/projects/workspace/uploads/eKartica_41234316.pdf_karin_9cb7.pdf"

function cardText(): string {
  const lines = [
    "Knjigovodska kartica davčnega zavezanca",
    "Skupni podatki po kontih za leto 2025",
    "23 Stroški prisilne izterjave 30,00 0,00 0,00 30,00",
    "40 Akontacija dohodnine 100,00 0,00 0,00 100,00",
    "42 Prispevki za zaposlovanje 24,23 0,00 0,00 24,23",
    "43 Prispevki za starševsko varstvo 2,66 0,00 0,00 2,66",
    "Knjižbe po vseh kontih",
    "23 Stroški prisilne izterjave Sklep o izterjavi 10.02.2025 30,00 0,00 30,00",
    "40 Akontacija dohodnine Obračun davka 15.01.2025 100,00 0,00 100,00",
    "42 Prispevki za zaposlovanje Plačilo prispevkov 25.01.2025 0,00 2,67 0,00",
  ]
  for (let month = 1; month <= 12; month += 1) {
    const stamp = String(month).padStart(2, "0")
    const amount = month === 1 ? "2,67" : "3,00"
    lines.push(
      `42 Prispevki za zaposlovanje Obračun prispevkov za socialno varnost za zasebnike - OPSVZ -282 20.${stamp}.2025 ${amount} 0,00 ${amount}`,
    )
  }
  lines.push(
    "42 Prispevki za zaposlovanje Obračun prispevkov za socialno varnost za zasebnike - OPSVZ -356 20.01.2026 3,39 0,00 3,39",
  )
  lines.push(
    "43 Prispevki za starševsko varstvo Obračun prispevkov za socialno varnost za zasebnike - OPSVZ -282 20.01.2025 2,66 0,00 2,66",
  )
  lines.push("eKartica - ORGANIZACIJA DOGODKOV, KARIN ČEMAŽAR S.P. 1 / 1")
  return lines.join("\n")
}

const trial = [
  "Karin Čemažar s.p.",
  "Bilanca za obdobje 01.01.2025-31.12.2025",
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

test("kartica razporedi obračune prispevkov na 12 mesecev", () => {
  const report = parseEkartica(cardText(), "ekartica.pdf")
  assert.equal(report.year, 2025)
  assert.match(report.holder, /KARIN ČEMAŽAR S\.P\./)
  assert.equal(report.accounts.map((account) => account.code).join(","), "42,43")

  const employment = report.accounts[0]
  assert.ok(employment)
  assert.equal(employment.name, "Prispevki za zaposlovanje")
  assert.equal(employment.months.length, 12)
  assert.equal(employment.monthsWithCharge, 12)
  const january = employment.months[0]
  assert.ok(january)
  assert.equal(january.lines[0]?.date, "20.01.2025")
  assert.equal(january.lines[0]?.cents, 267)
  assert.match(january.lines[0]?.description ?? "", /OPSVZ -282/)
  assert.equal(employment.following[0]?.date, "20.01.2026")
  assert.equal(employment.following[0]?.cents, 339)
  assert.equal(employment.totalCents, 267 + 11 * 300 + 339)

  const parental = report.accounts[1]
  assert.ok(parental)
  assert.equal(parental.months.length, 12)
  assert.equal(parental.monthsWithCharge, 1)
  assert.equal(parental.months[1]?.lines.length, 0)
  assert.equal(parental.totalCents, 266)
  assert.equal(report.totalCents, employment.totalCents + 266)
})

test("seštevek kartice zamenja AOP 148a in premakne podjetnikov dohodek", () => {
  const statement = buildStatement(trial, "karin.pdf", [], "sp")
  assert.equal(statement.income["148a"], 5_000)
  const report = parseEkartica(cardText(), "ekartica.pdf")
  const next = applyEkartica(statement, report)
  assert.equal(next.income["148a"], report.totalCents)
  assert.equal(next.ekartica?.sourceName, "ekartica.pdf")
  const rolled = rollupIncome(next.income, "sp")
  const shift = 5_000 - report.totalCents
  assert.equal(rolled["182"], 30_000 + shift)
  assert.equal(next.balance.current["070"], 30_000 + shift)
})

test("kartica Karin Čemažar ima dvanajst mesecev na kontih prispevkov", async (t) => {
  try {
    await access(CARD_PDF)
  } catch {
    t.skip("kartica ni v tem okolju")
    return
  }
  const text = await pdfToText(new Uint8Array(await readFile(CARD_PDF)))
  const report = parseEkartica(text, "eKartica_41234316.pdf")
  assert.equal(report.year, 2025)
  assert.match(report.holder, /KARIN ČEMAŽAR S\.P\./)
  const byCode = new Map(report.accounts.map((account) => [account.code, account]))
  assert.equal(byCode.has("23"), false)
  assert.equal(byCode.has("40"), false)
  const expected: Record<string, number> = { "42": 2423, "43": 2418, "44": 294840, "45": 215846 }
  for (const [code, total] of Object.entries(expected)) {
    const account = byCode.get(code)
    assert.ok(account, code)
    assert.equal(account.months.length, 12)
    assert.equal(account.monthsWithCharge, 12, code)
    assert.equal(account.totalCents, total, code)
    assert.equal(account.following[0]?.date, "20.01.2026")
  }
  const january = byCode.get("42")?.months[0]?.lines[0]
  assert.equal(january?.date, "20.01.2025")
  assert.equal(january?.cents, 267)
  assert.match(january?.description ?? "", /OPSVZ -282/)
  assert.equal(report.totalCents, 515527)
})
