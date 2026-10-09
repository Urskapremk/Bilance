import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { PERIOD_FORMS } from "@/lib/archive"
import { keepNewestByPeriod, samePeriod } from "@/lib/archive-period"
import { clientKey } from "@/lib/clients"
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

export async function writeArchive(
  statement: Statement,
  pdf: Uint8Array,
  sourceName: string,
  options?: { id?: string; savedAt?: string },
): Promise<ArchiveMeta> {
  const metas = await readArchiveMetas()
  const requestedRaw = options?.id && ID.test(options.id) ? options.id : undefined
  const taken = requestedRaw ? metas.find((item) => item.id === requestedRaw) : undefined
  const requested = taken && clientKey(taken.company) !== clientKey(statement.company) ? undefined : requestedRaw
  const savedAt = options?.savedAt && !Number.isNaN(Date.parse(options.savedAt)) ? new Date(options.savedAt).toISOString() : undefined
  const matches = metas.filter((item) => samePeriod(item, statement))
  const preferred = requested ? matches.find((item) => item.id === requested) : undefined
  const newest = keepNewestByPeriod(matches).kept[0]
  const open =
    requested && !preferred ? metas.find((item) => item.id === requested && clientKey(item.company) === clientKey(statement.company)) : undefined
  const target = preferred ?? newest ?? open
  if (target) {
    for (const old of matches) {
      if (old.id !== target.id) await removeArchive(old.id)
    }
    return storeArchive(target.id, statement, pdf, sourceName, target, savedAt)
  }
  return storeArchive(requested ?? crypto.randomUUID(), statement, pdf, sourceName, undefined, savedAt)
}

async function storeArchive(
  id: string,
  statement: Statement,
  pdf: Uint8Array,
  sourceName: string,
  previous: ArchiveMeta | undefined,
  savedAt: string | undefined,
): Promise<ArchiveMeta> {
  const name = sourceName || previous?.sourceName || statement.sourceName || "bruto-bilanca.pdf"
  const meta: ArchiveMeta = {
    id,
    savedAt: savedAt ?? new Date().toISOString(),
    company: previous?.company ?? statement.company,
    period: statement.period,
    currentDate: statement.currentDate,
    sourceName: name,
    forms: previous?.forms?.length ? previous.forms : [...PERIOD_FORMS],
  }
  const dir = entryDir(id)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta))
  await writeFile(path.join(dir, "statement.json"), JSON.stringify({ ...statement, company: meta.company, sourceName: name }))
  await writeFile(path.join(dir, "bruto.pdf"), pdf)
  return meta
}

async function readArchiveMetas(): Promise<ArchiveMeta[]> {
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
  return metas
}

export async function listArchiveFiles(): Promise<ArchiveMeta[]> {
  const metas = await readArchiveMetas()
  const { kept, dropped } = keepNewestByPeriod(metas)
  for (const old of dropped) await removeArchive(old.id).catch(() => undefined)
  return kept.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function removeArchive(id: string): Promise<void> {
  if (!ID.test(id)) throw new Error("Arhivski zapis ni veljaven.")
  await rm(entryDir(id), { recursive: true, force: true })
}

export async function replaceArchiveStatement(id: string, statement: Statement): Promise<ArchiveMeta> {
  const dir = entryDir(id)
  const meta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) as ArchiveMeta
  const stored: Statement = {
    ...statement,
    company: meta.company,
    sourceName: meta.sourceName,
  }
  const next: ArchiveMeta = {
    ...meta,
    savedAt: new Date().toISOString(),
    period: stored.period,
    currentDate: stored.currentDate,
    forms: meta.forms?.length ? meta.forms : [...PERIOD_FORMS],
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
