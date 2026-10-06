import assert from "node:assert/strict"
import { rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { listArchiveFiles, readArchivePdf, readArchiveStatement, replaceArchiveStatement, writeArchive } from "./archive-disk.ts"
import type { Statement } from "./trial.ts"

const statement: Statement = {
  company: "GRAFAM d.o.o.",
  period: "1. 1. 2026–31. 8. 2026",
  currentDate: "31. 8. 2026",
  previousDate: "31. 12. 2025",
  sourceName: "Grafam_BB_31.08.2026.pdf",
  balance: { current: { "070": 975862 }, previous: {} },
  income: { "186": 975862 },
  notes: [],
  warnings: [],
}

test("končna bilanca se zapiše na disk in se prebere nazaj", async () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
  const meta = await writeArchive(statement, pdf, statement.sourceName)
  try {
    const listed = await listArchiveFiles()
    assert.ok(listed.some((item) => item.id === meta.id && item.company === "GRAFAM d.o.o."))
    assert.deepEqual(meta.forms, ["Bilanca stanja", "Izkaz poslovnega izida"])
    const stored = await readArchiveStatement(meta.id)
    assert.equal(stored.balance.current["070"], 975862)
    const storedPdf = await readArchivePdf(meta.id)
    assert.equal(storedPdf.subarray(0, 5).toString(), "%PDF-")
    const replaced = await replaceArchiveStatement(meta.id, {
      ...statement,
      company: "Druga d.o.o.",
      period: "1. 1. 2026–30. 6. 2026",
      currentDate: "30. 6. 2026",
      balance: { current: { "070": 1200 }, previous: {} },
    })
    assert.equal(replaced.company, "GRAFAM d.o.o.")
    assert.equal(replaced.period, "1. 1. 2026–30. 6. 2026")
    assert.equal(replaced.currentDate, "30. 6. 2026")
    assert.equal(replaced.id, meta.id)
    const corrected = await readArchiveStatement(meta.id)
    assert.equal(corrected.balance.current["070"], 1200)
    assert.equal(corrected.company, "GRAFAM d.o.o.")
    assert.equal(corrected.period, "1. 1. 2026–30. 6. 2026")
    assert.equal(corrected.currentDate, "30. 6. 2026")
  } finally {
    await rm(path.join(process.cwd(), "data", "arhiv", meta.id), { recursive: true, force: true })
  }
})

test("neveljaven arhivski naslov se ne prebere", async () => {
  await assert.rejects(() => readArchiveStatement("../tajno"), /ni veljaven/)
})
