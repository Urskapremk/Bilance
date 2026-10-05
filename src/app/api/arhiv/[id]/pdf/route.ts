import { readArchivePdf } from "@/lib/archive-disk"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const pdf = await readArchivePdf(id)
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"bruto-bilanca.pdf\"",
      },
    })
  } catch {
    return Response.json({ error: "Izvorne datoteke v arhivu ni." }, { status: 404 })
  }
}
