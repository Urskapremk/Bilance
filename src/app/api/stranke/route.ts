import { mergeClients, normalizeClientName } from "@/lib/clients"
import { readStoredClients, rememberClient } from "@/lib/clients-disk"
import { listArchiveFiles } from "@/lib/archive-disk"

export const runtime = "nodejs"

export async function GET() {
  const [stored, archived] = await Promise.all([readStoredClients(), listArchiveFiles()])
  return Response.json(mergeClients([...stored, ...archived.map((item) => item.company)]))
}

export async function POST(request: Request) {
  let body: { name?: unknown }
  try {
    body = (await request.json()) as { name?: unknown }
  } catch {
    return Response.json({ error: "Naziv stranke manjka." }, { status: 400 })
  }
  const name = typeof body.name === "string" ? normalizeClientName(body.name) : ""
  if (!name) return Response.json({ error: "Vpišite naziv stranke." }, { status: 400 })
  const stored = await rememberClient(name)
  return Response.json({ name: stored })
}
