import assert from "node:assert/strict"
import test from "node:test"

import { attachPublicFiling } from "./ajpes-public.ts"
import { rememberClient, readStoredClients, replaceStoredClients } from "./clients-disk.ts"
import { filterClients, mergeClients, SAMPLE_CLIENT, statementForClient } from "./clients.ts"
import type { Statement } from "./trial.ts"

const grafam: Statement = attachPublicFiling({
  company: "GRAFAM d.o.o.",
  period: "1. 1. 2026–31. 8. 2026",
  currentDate: "31. 8. 2026",
  previousDate: "31. 12. 2025",
  sourceName: "Grafam_BB_31.08.2026.pdf",
  balance: { current: { "070": 975862 }, previous: { "001": 18534290 } },
  income: {},
  notes: [],
  warnings: [],
})

test("seznam strank začne z Grafamom in ne podvaja nazivov", () => {
  const names = mergeClients(["Sever d.o.o.", "grafam d.o.o.", "Alfa d.o.o.", "Sever d.o.o.", "  "])
  assert.deepEqual(names, [SAMPLE_CLIENT, "Alfa d.o.o.", "Sever d.o.o."])
  assert.deepEqual(filterClients(names, "sev"), ["Sever d.o.o."])
})

test("nova stranka ne prevzame javne objave Grafama", () => {
  const next = statementForClient(grafam, "Sever d.o.o.")
  assert.equal(next.company, "Sever d.o.o.")
  assert.equal(next.publicPrevious, undefined)
  assert.equal(next.balance.current["070"], 975862)
  assert.equal(
    next.notes.some((note) => note.includes("javna objava")),
    false,
  )
})

test("isti naziv obdrži javno objavo", () => {
  const next = statementForClient(grafam, "grafam d.o.o.")
  assert.equal(next.company, "GRAFAM d.o.o.")
  assert.equal(next.publicPrevious?.registration, "6531482000")
})

test("nov naziv se zapiše med stranke", async () => {
  const before = await readStoredClients()
  const name = "Testna stranka 2026"
  try {
    const stored = await rememberClient(name)
    assert.equal(stored, name)
    assert.equal(await rememberClient(`  ${name}  `), name)
    assert.ok((await readStoredClients()).includes(name))
  } finally {
    await replaceStoredClients(before)
  }
})
