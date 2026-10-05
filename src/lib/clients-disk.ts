import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { normalizeClientName, sameClient, SAMPLE_CLIENT } from "@/lib/clients"

function filePath() {
  return path.join(process.cwd(), "data", "stranke.json")
}

export async function readStoredClients(): Promise<string[]> {
  try {
    const raw = await readFile(filePath(), "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

export async function rememberClient(name: string): Promise<string> {
  const clean = normalizeClientName(name)
  if (!clean || sameClient(clean, SAMPLE_CLIENT)) return SAMPLE_CLIENT
  const current = await readStoredClients()
  if (current.some((item) => sameClient(item, clean))) {
    return current.find((item) => sameClient(item, clean)) ?? clean
  }
  await mkdir(path.dirname(filePath()), { recursive: true })
  await writeFile(filePath(), JSON.stringify([...current, clean], null, 2))
  return clean
}

export async function replaceStoredClients(names: string[]): Promise<void> {
  await mkdir(path.dirname(filePath()), { recursive: true })
  await writeFile(filePath(), JSON.stringify(names, null, 2))
}
