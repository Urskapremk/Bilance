import { listArchiveFiles, writeArchive } from "@/lib/archive-disk"
import type { Statement } from "@/lib/trial"

export const runtime = "nodejs"

export async function GET() {
  const items = await listArchiveFiles()
  return Response.json(items)
}

export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get("file")
  const raw = form.get("statement")
  if (!(file instanceof File) || typeof raw !== "string") {
    return Response.json({ error: "Manjka bruto bilanca ali obrazec." }, { status: 400 })
  }
  let statement: Statement
  try {
    statement = JSON.parse(raw) as Statement
  } catch {
    return Response.json({ error: "Obrazca ni bilo mogoče prebrati." }, { status: 400 })
  }
  if (!statement.company || !statement.period) {
    return Response.json({ error: "Obrazec nima družbe in obdobja." }, { status: 400 })
  }
  const pdf = new Uint8Array(await file.arrayBuffer())
  const requestedId = form.get("id")
  const requestedSavedAt = form.get("savedAt")
  const meta = await writeArchive(statement, pdf, file.name || statement.sourceName, {
    id: typeof requestedId === "string" ? requestedId : undefined,
    savedAt: typeof requestedSavedAt === "string" ? requestedSavedAt : undefined,
  })
  return Response.json(meta)
}
