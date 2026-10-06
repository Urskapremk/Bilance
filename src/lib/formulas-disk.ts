import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { mergeFormulas, normalizeFormulas, type AccountFormula } from "@/lib/account-map"
import { clientKey, normalizeClientName } from "@/lib/clients"

type Book = Record<string, AccountFormula[]>

function filePath() {
  const base = process.env.VERCEL ? path.join(os.tmpdir(), "bilance-data") : path.join(process.cwd(), "data")
  return path.join(base, "formule.json")
}

async function readBook(): Promise<Book> {
  try {
    const raw = await readFile(filePath(), "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const book: Book = {}
    for (const [key, value] of Object.entries(parsed)) {
      const formulas = normalizeFormulas(value)
      if (formulas.length) book[key] = formulas
    }
    return book
  } catch {
    return {}
  }
}

export async function readFormulas(company: string): Promise<AccountFormula[]> {
  const key = clientKey(normalizeClientName(company))
  if (!key) return []
  const book = await readBook()
  return book[key] ?? []
}

export async function writeFormulas(company: string, incoming: AccountFormula[]): Promise<AccountFormula[]> {
  const name = normalizeClientName(company)
  const key = clientKey(name)
  if (!key) return []
  const book = await readBook()
  const merged = mergeFormulas(book[key] ?? [], incoming)
  if (merged.length) book[key] = merged
  else delete book[key]
  await mkdir(path.dirname(filePath()), { recursive: true })
  await writeFile(filePath(), JSON.stringify(book, null, 2))
  return merged
}
