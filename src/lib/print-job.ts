import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { Statement } from "@/lib/trial"

export type PrintJob = {
  statement: Statement
  view: "bilanca" | "izkaz"
  showZeros: boolean
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function directory() {
  return path.join(os.tmpdir(), "bilance-jobs")
}

export async function savePrintJob(job: PrintJob): Promise<string> {
  const id = crypto.randomUUID()
  const dir = directory()
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(job))
  return id
}

export async function readPrintJob(id: string): Promise<PrintJob | null> {
  if (!UUID.test(id)) return null
  try {
    const raw = await readFile(path.join(directory(), `${id}.json`), "utf8")
    return JSON.parse(raw) as PrintJob
  } catch {
    return null
  }
}

export async function deletePrintJob(id: string) {
  if (!UUID.test(id)) return
  await rm(path.join(directory(), `${id}.json`), { force: true })
}
