import assert from "node:assert/strict"
import test from "node:test"

import { formatSavedAt, groupArchiveByClient, keepNewestByPeriod, type ArchiveMeta } from "./archive.ts"
import { archiveSaveTarget, emptyPeriodStatement, periodCountLabel, previousFullYear } from "./archive-period.ts"
import type { Statement } from "./trial.ts"

test("arhiv je razvrščen pod stranko", () => {
  const items: ArchiveMeta[] = [
    { id: "b", savedAt: "2026-08-01", company: "Sever d.o.o.", period: "1. 1. 2026–31. 8. 2026", currentDate: "31. 8. 2026", sourceName: "sever.pdf" },
    { id: "a", savedAt: "2026-08-02", company: "GRAFAM d.o.o.", period: "1. 1. 2026–31. 8. 2026", currentDate: "31. 8. 2026", sourceName: "grafam.pdf" },
    { id: "c", savedAt: "2025-12-31", company: "grafam d.o.o.", period: "1. 1. 2025–31. 12. 2025", currentDate: "31. 12. 2025", sourceName: "grafam-2025.pdf" },
  ]
  const groups = groupArchiveByClient(items)
  assert.equal(groups.length, 2)
  assert.equal(groups[1]?.company, "GRAFAM d.o.o.")
  assert.deepEqual(groups[1]?.items.map((item) => item.id), ["a", "c"])
})

test("za isto stranko in obdobje ostane zadnja bilanca", () => {
  const items: ArchiveMeta[] = [
    {
      id: "fortun-1205",
      savedAt: "2026-10-09T10:05:00.000Z",
      company: "FORTUN d.o.o.",
      period: "1. 1. 2026–31. 8. 2026",
      currentDate: "31. 8. 2026",
      sourceName: "BB FORTUN 31.08.2026.pdf",
    },
    {
      id: "fortun-1210",
      savedAt: "2026-10-09T10:10:00.000Z",
      company: "Fortun d.o.o.",
      period: "1. 1. 2026–31. 8. 2026 ",
      currentDate: "31. 8. 2026",
      sourceName: "BB FORTUN 31.08.2026.pdf",
    },
    {
      id: "fortun-junij",
      savedAt: "2026-07-01T08:00:00.000Z",
      company: "FORTUN d.o.o.",
      period: "1. 1. 2026–30. 6. 2026",
      currentDate: "30. 6. 2026",
      sourceName: "BB FORTUN 30.06.2026.pdf",
    },
    {
      id: "sever",
      savedAt: "2026-10-09T12:00:00.000Z",
      company: "Sever d.o.o.",
      period: "1. 1. 2026–31. 8. 2026",
      currentDate: "31. 8. 2026",
      sourceName: "sever.pdf",
    },
  ]
  const { kept, dropped } = keepNewestByPeriod(items)
  assert.deepEqual(
    kept.map((item) => item.id),
    ["fortun-1210", "fortun-junij", "sever"],
  )
  assert.deepEqual(
    dropped.map((item) => item.id),
    ["fortun-1205"],
  )
})

test("drugo obdobje ne zadene kartice odprtega obdobja", () => {
  const year2026: ArchiveMeta = {
    id: "fortun-2026",
    savedAt: "2026-09-01T10:00:00.000Z",
    company: "FORTUN d.o.o.",
    period: "1. 1. 2026–31. 8. 2026",
    currentDate: "31. 8. 2026",
    sourceName: "BB FORTUN 31.08.2026.pdf",
  }
  const year2025: ArchiveMeta = {
    id: "fortun-2025",
    savedAt: "2026-09-02T10:00:00.000Z",
    company: "Fortun d.o.o.",
    period: "1. 1. 2025–31. 12. 2025",
    currentDate: "31. 12. 2025",
    sourceName: "BB FORTUN 31.12.2025.pdf",
  }
  assert.equal(
    archiveSaveTarget([year2026], { company: "FORTUN d.o.o.", period: "1. 1. 2025–31. 12. 2025" }, year2026.id),
    undefined,
  )
  assert.equal(
    archiveSaveTarget([year2026, year2025], { company: "FORTUN d.o.o.", period: "1. 1. 2025–31. 12. 2025" }, year2026.id)?.id,
    year2025.id,
  )
  assert.equal(
    archiveSaveTarget([year2026, year2025], { company: "FORTUN d.o.o.", period: "1. 1. 2026–31. 8. 2026" }, year2026.id)?.id,
    year2026.id,
  )
})

test("predlagano drugo obdobje je prejšnje celo leto", () => {
  assert.deepEqual(previousFullYear("1. 1. 2026–31. 8. 2026"), {
    start: "1. 1. 2025",
    end: "31. 12. 2025",
  })
  assert.equal(previousFullYear("brez datuma"), null)
  assert.equal(periodCountLabel(1), "1 obdobje")
  assert.equal(periodCountLabel(2), "2 obdobji")
  assert.equal(periodCountLabel(5), "5 obdobij")
})

test("prazna bilanca za drugo obdobje ne prenese zneskov", () => {
  const source: Statement = {
    company: "FORTUN d.o.o.",
    period: "1. 1. 2026–31. 8. 2026",
    currentDate: "31. 8. 2026",
    previousDate: "31. 12. 2025",
    sourceName: "BB FORTUN 31.08.2026.pdf",
    balance: { current: { "001": 32121395, "070": 4723730 }, previous: { "001": 1 } },
    income: { "186": 4723730 },
    notes: ["samo tekoče leto"],
    warnings: ["razlika"],
    legalForm: "doo",
    signatory: "urska",
  }
  const next = emptyPeriodStatement(source, "1. 1. 2025", "31. 12. 2025")
  assert.equal(next.company, "FORTUN d.o.o.")
  assert.equal(next.period, "1. 1. 2025–31. 12. 2025")
  assert.equal(next.currentDate, "31. 12. 2025")
  assert.equal(next.legalForm, "doo")
  assert.equal(next.signatory, "urska")
  assert.equal(next.sourceName, "")
  assert.deepEqual(next.balance.current, {})
  assert.deepEqual(next.balance.previous, {})
  assert.deepEqual(next.income, {})
  assert.deepEqual(next.notes, [])
  assert.notEqual(next.balance.current["001"], source.balance.current["001"])
})

test("datum arhiva je zapisan po slovensko", () => {
  const label = formatSavedAt("2026-10-05T10:47:00.000Z")
  assert.match(label, /2026/)
  assert.match(label, /10/)
  assert.match(label, /5/)
})
