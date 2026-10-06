import { listStoredPeriods, readStoredPeriod, saveStoredPeriod } from "@/lib/browser-book"
import { sameClient } from "@/lib/clients"
import type { Statement } from "@/lib/trial"

export const PERIOD_FORMS = ["Bilanca stanja", "Izkaz poslovnega izida"] as const

export type ArchiveMeta = {
  id: string
  savedAt: string
  company: string
  period: string
  currentDate: string
  sourceName: string
  forms?: string[]
}

export function formsOf(item: ArchiveMeta): string[] {
  return item.forms?.length ? item.forms : [...PERIOD_FORMS]
}

export function groupArchiveByClient(items: ArchiveMeta[]): { company: string; items: ArchiveMeta[] }[] {
  const groups: { company: string; items: ArchiveMeta[] }[] = []
  for (const item of items) {
    const group = groups.find((entry) => sameClient(entry.company, item.company))
    if (group) group.items.push(item)
    else groups.push({ company: item.company, items: [item] })
  }
  return groups
}

export function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString("sl-SI", { dateStyle: "medium", timeStyle: "short" })
}

export async function saveArchive(statement: Statement, pdf: ArrayBuffer): Promise<ArchiveMeta> {
  if (!browserBook()) return saveRemoteArchive(statement, pdf)
  const stored = await saveStoredPeriod(statement, pdf.slice(0), [...PERIOD_FORMS])
  void saveRemoteArchive(statement, pdf).catch(() => undefined)
  return stored
}

export async function listArchive(): Promise<ArchiveMeta[]> {
  const remote = await listRemoteArchive().catch(() => [] as ArchiveMeta[])
  if (!browserBook()) return remote
  const local = await listStoredPeriods()
  const seen = new Set(local.map((item) => item.id))
  return [...local, ...remote.filter((item) => !seen.has(item.id))].sort((left, right) =>
    right.savedAt.localeCompare(left.savedAt),
  )
}

export async function readArchive(id: string): Promise<{ statement: Statement; pdf: ArrayBuffer; sourceName: string }> {
  if (browserBook()) {
    const stored = await readStoredPeriod(id)
    if (stored) return stored
  }
  return readRemoteArchive(id)
}

function browserBook(): boolean {
  return typeof indexedDB !== "undefined"
}

async function saveRemoteArchive(statement: Statement, pdf: ArrayBuffer): Promise<ArchiveMeta> {
  const body = new FormData()
  const name = statement.sourceName || "bruto-bilanca.pdf"
  body.set("statement", JSON.stringify(statement))
  body.set("file", new Blob([pdf.slice(0)], { type: "application/pdf" }), name)
  const response = await fetch("/api/arhiv", { method: "POST", body })
  const data = (await response.json().catch(() => null)) as (ArchiveMeta & { error?: string }) | null
  if (!response.ok || !data?.id) {
    throw new Error(data?.error ?? "Arhiva ni bilo mogoče shraniti.")
  }
  return data
}

async function listRemoteArchive(): Promise<ArchiveMeta[]> {
  const response = await fetch("/api/arhiv", { cache: "no-store" })
  if (!response.ok) throw new Error("Arhiva ni bilo mogoče odpreti.")
  return (await response.json()) as ArchiveMeta[]
}

async function readRemoteArchive(id: string): Promise<{ statement: Statement; pdf: ArrayBuffer; sourceName: string }> {
  const [statementResponse, pdfResponse] = await Promise.all([
    fetch(`/api/arhiv/${id}`, { cache: "no-store" }),
    fetch(`/api/arhiv/${id}/pdf`, { cache: "no-store" }),
  ])
  if (!statementResponse.ok || !pdfResponse.ok) throw new Error("Te končne bilance v arhivu ni več.")
  const statement = (await statementResponse.json()) as Statement
  return { statement, pdf: await pdfResponse.arrayBuffer(), sourceName: statement.sourceName }
}
