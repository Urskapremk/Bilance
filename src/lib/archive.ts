import type { Statement } from "@/lib/trial"

export type ArchiveMeta = {
  id: string
  savedAt: string
  company: string
  period: string
  currentDate: string
  sourceName: string
}

export function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString("sl-SI", { dateStyle: "medium", timeStyle: "short" })
}

export async function saveArchive(statement: Statement, pdf: ArrayBuffer): Promise<ArchiveMeta> {
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

export async function listArchive(): Promise<ArchiveMeta[]> {
  const response = await fetch("/api/arhiv", { cache: "no-store" })
  if (!response.ok) throw new Error("Arhiva ni bilo mogoče odpreti.")
  return (await response.json()) as ArchiveMeta[]
}

export async function readArchive(id: string): Promise<{ statement: Statement; pdf: ArrayBuffer; sourceName: string }> {
  const [statementResponse, pdfResponse] = await Promise.all([
    fetch(`/api/arhiv/${id}`, { cache: "no-store" }),
    fetch(`/api/arhiv/${id}/pdf`, { cache: "no-store" }),
  ])
  if (!statementResponse.ok || !pdfResponse.ok) throw new Error("Te končne bilance v arhivu ni več.")
  const statement = (await statementResponse.json()) as Statement
  return { statement, pdf: await pdfResponse.arrayBuffer(), sourceName: statement.sourceName }
}
