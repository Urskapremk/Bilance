import { readArchiveStatement, removeArchive, replaceArchiveStatement } from "@/lib/archive-disk"
import type { Statement } from "@/lib/trial"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const statement = await readArchiveStatement(id)
    return Response.json(statement)
  } catch {
    return Response.json({ error: "Te končne bilance v arhivu ni." }, { status: 404 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let statement: Statement
  try {
    statement = (await request.json()) as Statement
  } catch {
    return Response.json({ error: "Obrazca ni bilo mogoče prebrati." }, { status: 400 })
  }
  if (!statement?.company || !statement.period) {
    return Response.json({ error: "Obrazec nima družbe in obdobja." }, { status: 400 })
  }
  try {
    const meta = await replaceArchiveStatement(id, statement)
    return Response.json(meta)
  } catch {
    return Response.json({ error: "Te končne bilance v arhivu ni." }, { status: 404 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await removeArchive(id)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: "Te končne bilance v arhivu ni." }, { status: 404 })
  }
}
