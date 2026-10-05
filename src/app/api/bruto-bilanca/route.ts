import { readFile } from "node:fs/promises"
import path from "node:path"

import { statementFromPdf } from "@/lib/from-pdf"
import { TrialBalanceError } from "@/lib/trial"

export const runtime = "nodejs"

const DEFAULT_NAME = "Grafam_BB_31.08.2026.pdf"

export async function GET() {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "sources", DEFAULT_NAME))
    const statement = await statementFromPdf(bytes, DEFAULT_NAME)
    return Response.json(statement)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bruto bilance ni bilo mogoče prebrati."
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return Response.json({ error: "Dodajte datoteko PDF." }, { status: 400 })
  }
  try {
    const statement = await statementFromPdf(new Uint8Array(await file.arrayBuffer()), file.name)
    return Response.json(statement)
  } catch (error) {
    const message =
      error instanceof TrialBalanceError
        ? error.message
        : "Te datoteke ne prepoznam kot bruto bilanco s konti in osmimi zneski."
    return Response.json({ error: message }, { status: 422 })
  }
}
