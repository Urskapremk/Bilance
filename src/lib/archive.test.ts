import assert from "node:assert/strict"
import test from "node:test"

import { formatSavedAt, groupArchiveByClient, type ArchiveMeta } from "./archive.ts"

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

test("datum arhiva je zapisan po slovensko", () => {
  const label = formatSavedAt("2026-10-05T10:47:00.000Z")
  assert.match(label, /2026/)
  assert.match(label, /10/)
  assert.match(label, /5/)
})
