import { readArchiveStatement } from "@/lib/archive-disk"

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
