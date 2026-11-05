import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { finishOcr } from "./ocr-engine.ts"
import { POST as postLoan } from "../app/api/zavihek-045/route.ts"
import { recognizeLoanScreenshot } from "./zavihek-045-ocr.ts"

const SHORT = path.join(process.cwd(), "src/lib/fixtures/posojilodajalci-kratka.png")

test("posnetek kratke tabele prebere lastnika, Nutralis in Lienelio s centi", { timeout: 60_000 }, async () => {
  try {
    const lines = await recognizeLoanScreenshot(await readFile(SHORT))
    assert.equal(lines.length, 3)
    assert.equal(lines[0]?.name, "lastnik")
    assert.equal(lines[0]?.taxNumber, undefined)
    assert.equal(lines[0]?.closingCents, 1940)
    assert.equal(lines[0]?.openingCents, undefined)
    assert.equal(lines[0]?.installmentCents, undefined)
    assert.equal(lines[1]?.name, "Nutralis group d.o.o.")
    assert.equal(lines[1]?.taxNumber, "14702215")
    assert.equal(lines[1]?.closingCents, 1_930_000)
    assert.equal(lines[2]?.name, "Lienelia")
    assert.equal(lines[2]?.taxNumber, "78073642")
    assert.equal(lines[2]?.closingCents, 600_000)
    assert.equal(
      lines.reduce((sum, line) => sum + (line.closingCents ?? 0), 0),
      2_531_940,
    )
  } finally {
    await finishOcr()
  }
})

test("prilepljen png kratke tabele vrne tri vrstice", { timeout: 60_000 }, async () => {
  const png = await readFile(SHORT)
  const form = new FormData()
  form.set("file", new File([png], "posojila.png", { type: "image/png" }))
  try {
    const response = await postLoan(new Request("http://bilance.local/api/zavihek-045", { method: "POST", body: form }))
    assert.equal(response.status, 200)
    const data = (await response.json()) as {
      lines: Array<{ name?: string; taxNumber?: string; closingCents?: number; openingCents?: number }>
    }
    assert.equal(data.lines.length, 3)
    assert.equal(data.lines[0]?.name, "lastnik")
    assert.equal(data.lines[0]?.closingCents, 1940)
    assert.equal(data.lines[0]?.openingCents, undefined)
    assert.equal(data.lines[2]?.name, "Lienelia")
    assert.equal(data.lines[2]?.closingCents, 600_000)
  } finally {
    await finishOcr()
  }
})

test("široka tabela kupcev na polju posojil obdrži stanje in izpusti razrede", { timeout: 120_000 }, async () => {
  const png = await readFile(path.join(process.cwd(), "src/lib/fixtures/kupci-terjatve.png"))
  try {
    const lines = await recognizeLoanScreenshot(png)
    assert.equal(lines.length, 11)
    assert.equal(lines[0]?.name, "Telemach d.o.o.")
    assert.equal(lines[0]?.taxNumber, "66863627")
    assert.equal(lines[0]?.closingCents, 4_392_332)
    assert.equal(lines[0]?.openingCents, undefined)
    assert.equal(lines[0]?.increaseCents, undefined)
    assert.equal(lines[0]?.decreaseCents, undefined)
    assert.equal(lines[0]?.installmentCents, undefined)
    assert.equal(
      lines.reduce((sum, line) => sum + (line.closingCents ?? 0), 0),
      12_515_666,
    )
  } finally {
    await finishOcr()
  }
})

test("obrazec posojil brez mreže še vedno da tri vrstice", { timeout: 60_000 }, async () => {
  const png = await readFile(path.join(process.cwd(), "src/lib/fixtures/posojila-045.png"))
  try {
    const lines = await recognizeLoanScreenshot(png)
    assert.equal(lines.length, 3)
    assert.equal(lines[0]?.name, "Ana Novak d.o.o.")
    assert.equal(lines[0]?.taxNumber, "12345678")
    assert.equal(lines[0]?.openingCents, 10050)
    assert.equal(lines[1]?.name, "Borut Kralj")
    assert.equal(lines[2]?.name, "Cvetka Hribar s.p.")
  } finally {
    await finishOcr()
  }
})
