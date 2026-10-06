import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { PERIOD_FORMS } from "@/lib/archive"
import type { Statement } from "@/lib/trial"

export type ArchiveMeta = {
  id: string
  savedAt: string
  company: string
  period: string
  currentDate: string
  sourceName: string
  forms: string[]
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function rootDir() {
  const base = process.env.VERCEL ? path.join(os.tmpdir(), "bilance-data") : path.join(process.cwd(), "data")
  return path.join(base, "arhiv")
}

function entryDir(id: string) {
  if (!ID.test(id)) throw new Error("Arhivski zapis ni veljaven.")
  return path.join(rootDir(), id)
}

export async function writeArchive(statement: Statement, pdf: Uint8Array, sourceName: string): Promise<ArchiveMeta> {
  const meta: ArchiveMeta = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    company: statement.company,
    period: statement.period,
    currentDate: statement.currentDate,
    sourceName: sourceName || statement.sourceName,
    forms: [...PERIOD_FORMS],
  }
  const dir = entryDir(meta.id)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta))
  await writeFile(path.join(dir, "statement.json"), JSON.stringify({ ...statement, sourceName: meta.sourceName }))
  await writeFile(path.join(dir, "bruto.pdf"), pdf)
  return meta
}

export async function listArchiveFiles(): Promise<ArchiveMeta[]> {
  let names: string[] = []
  try {
    names = await readdir(rootDir())
  } catch {
    return []
  }
  const metas: ArchiveMeta[] = []
  for (const name of names) {
    if (!ID.test(name)) continue
    try {
      const raw = await readFile(path.join(rootDir(), name, "meta.json"), "utf8")
      metas.push(JSON.parse(raw) as ArchiveMeta)
    } catch {
      /* nepopoln zapis preskočimo */
    }
  }
  return metas.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function replaceArchiveStatement(id: string, statement: Statement): Promise<ArchiveMeta> {
  const dir = entryDir(id)
  const meta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) as ArchiveMeta
  const next: ArchiveMeta = {
    ...meta,
    savedAt: new Date().toISOString(),
    forms: meta.forms?.length ? meta.forms : [...PERIOD_FORMS],
  }
  const stored: Statement = {
    ...statement,
    company: meta.company,
    period: meta.period,
    currentDate: meta.currentDate,
    sourceName: meta.sourceName,
  }
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(next))
  await writeFile(path.join(dir, "statement.json"), JSON.stringify(stored))
  return next
}

export async function readArchiveStatement(id: string): Promise<Statement> {
  const raw = await readFile(path.join(entryDir(id), "statement.json"), "utf8")
  return JSON.parse(raw) as Statement
}

export async function readArchivePdf(id: string): Promise<Buffer> {
  return readFile(path.join(entryDir(id), "bruto.pdf"))
}
