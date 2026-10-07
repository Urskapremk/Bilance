import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

import { parseDavcniObracun, normiraniSplit } from "./davcni-obracun.ts"
import { rollupIncome } from "./income.ts"
import { pdfToText } from "./pdf-lines.ts"
import { applyEkartica, applyNormirani, buildStatement, type Statement } from "./trial.ts"

const TAX_PDF =
  "/home/ubuntu/.cursor/projects/workspace/uploads/DDD_DDD_EDP-41234316-365__1_.pdf_Karin__ema_ar_2e1a.pdf"

const taxText = [
  "Obračun akontacije dohodnine in dohodnine od dohodka iz dejavnosti",
  "za obdobje od 01.01.2025 do 31.12.2025.",
  "N – Normirani na podlagi dejanskih prihodkov in normiranih odhodkov",
  "Ime in priimek zavezanca KARIN ČEMAŽAR",
  "iz naslova opravljanja dejavnosti 3.931,15 (obračunani znesek prispevkov za socialno varnost v tem poslovnem letu)",
  "1. Prihodki, ugotovljeni po računovodskih predpisih, od tega 53.881,48",
  "8. DAVČNO PRIZNANI ODHODKI izračunani v skladu z 59. členom ZDoh-2 43.105,18",
].join("\n")

test("normirani stroški so 80 odstotkov prihodkov, razdeljeni na prispevke, material in storitve", () => {
  const tax = parseDavcniObracun(taxText, "ddd.pdf")
  assert.equal(tax.year, 2025)
  assert.equal(tax.holder, "KARIN ČEMAŽAR")
  assert.equal(tax.revenuesCents, 5_388_148)
  assert.equal(tax.recognizedExpensesCents, 4_310_518)
  assert.equal(tax.statedContributionsCents, 393_115)

  const split = normiraniSplit(tax.revenuesCents, 515_527)
  assert.equal(split.recognizedCents, 4_310_518)
  assert.equal(split.contributionsCents, 515_527)
  assert.equal(split.materialCents + split.servicesCents + split.contributionsCents, split.recognizedCents)
  assert.equal(split.materialCents, Math.round((split.recognizedCents - 515_527) * 0.2))
  assert.equal(tax.revenuesCents - split.recognizedCents, 1_077_630)
})

test("obračun davka uskladi prihodke in zamenja stroške normiranca", () => {
  const statement = buildStatement(
    [
      "Karin Čemažar s.p.",
      "Bilanca za obdobje 01.01.2025-31.12.2025",
      "120 Kupci",
      "0,00 0,00 1.000,00 0,00 1.000,00 0,00 1.000,00 0,00",
      "900 Začetni kapital",
      "0,00 700,00 0,00 0,00 0,00 700,00 0,00 700,00",
      "760 Prodaja",
      "0,00 0,00 0,00 400,00 0,00 400,00 0,00 400,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
      "410 Storitev",
      "0,00 0,00 20,00 0,00 20,00 0,00 20,00 0,00",
      "480 Prispevki za socialno varnost podjetnika",
      "0,00 0,00 30,00 0,00 30,00 0,00 30,00 0,00",
    ].join("\n"),
    "karin.pdf",
    [],
    "sp",
  )
  const tax = parseDavcniObracun(taxText, "ddd.pdf")
  const withTax: Statement = { ...statement, davcni: tax, ekartica: card(515_527) }
  const next = applyNormirani(withTax)
  const split = normiraniSplit(tax.revenuesCents, 515_527)
  assert.equal(next.income["112"], split.revenuesCents)
  assert.equal(next.income["131"], split.materialCents)
  assert.equal(next.income["138"], split.servicesCents)
  assert.equal(next.income["148a"], 515_527)
  assert.equal(next.income["148b"], undefined)
  const rolled = rollupIncome(next.income, "sp")
  assert.equal(rolled["126"], split.revenuesCents)
  assert.equal(rolled["127"], split.recognizedCents)
  assert.equal(rolled["182"], tax.revenuesCents - split.recognizedCents)
  assert.equal(next.balance.current["070"], rolled["182"])
})

test("kartica po obračunu davka znova razdeli preostanek stroškov", () => {
  const tax = parseDavcniObracun(taxText, "ddd.pdf")
  const statement = buildStatement(
    [
      "Karin Čemažar s.p.",
      "Bilanca za obdobje 01.01.2025-31.12.2025",
      "120 Kupci",
      "0,00 0,00 100,00 0,00 100,00 0,00 100,00 0,00",
      "900 Kapital",
      "0,00 100,00 0,00 0,00 0,00 100,00 0,00 100,00",
      "760 Prodaja",
      "0,00 0,00 0,00 50,00 0,00 50,00 0,00 50,00",
      "400 Material",
      "0,00 0,00 50,00 0,00 50,00 0,00 50,00 0,00",
    ].join("\n"),
    "karin.pdf",
    [],
    "sp",
  )
  const next = applyEkartica({ ...statement, davcni: tax }, card(515_527))
  assert.equal(next.income["148a"], 515_527)
  assert.equal(next.income["112"], 5_388_148)
  assert.equal((next.income["131"] ?? 0) + (next.income["138"] ?? 0) + 515_527, 4_310_518)
})

test("obračun davka Karin Čemažar 2025 je normiran", async (t) => {
  try {
    await access(TAX_PDF)
  } catch {
    t.skip("obračun davka ni v tem okolju")
    return
  }
  const text = await pdfToText(new Uint8Array(await readFile(TAX_PDF)))
  const tax = parseDavcniObracun(text, "DDD.pdf")
  assert.equal(tax.year, 2025)
  assert.match(tax.holder, /KARIN ČEMAŽAR/)
  assert.equal(tax.revenuesCents, 5_388_148)
  assert.equal(tax.recognizedExpensesCents, 4_310_518)
  assert.equal(tax.statedContributionsCents, 393_115)
  assert.equal(normiraniSplit(tax.revenuesCents, 0).recognizedCents, tax.recognizedExpensesCents)
})

function card(totalCents: number): Statement["ekartica"] {
  return { year: 2025, holder: "KARIN ČEMAŽAR S.P.", sourceName: "ekartica.pdf", accounts: [], totalCents }
}
