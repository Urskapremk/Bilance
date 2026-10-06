import { readFile } from "node:fs/promises"
import path from "node:path"

import { mergeFormulas, normalizeFormulas } from "@/lib/account-map"
import { normalizeClientName, statementForClient } from "@/lib/clients"
import { readFormulas } from "@/lib/formulas-disk"
import { statementFromPdf, trialFromText } from "@/lib/from-pdf"
import { pdfToText } from "@/lib/pdf-lines"
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
  const companyField = form.get("company")
  const company = typeof companyField === "string" ? normalizeClientName(companyField) : ""
  const formuleField = form.get("formule")
  let posted = normalizeFormulas([])
  if (typeof formuleField === "string" && formuleField.trim()) {
    try {
      posted = normalizeFormulas(JSON.parse(formuleField) as unknown)
    } catch {
      return Response.json({ error: "Formul kontov ne prepoznam." }, { status: 400 })
    }
  }
  try {
    const text = await pdfToText(new Uint8Array(await file.arrayBuffer()))
    const probe = trialFromText(text, file.name)
    const name = company || probe.statement.company
    const formulas = mergeFormulas(await readFormulas(name), posted)
    const parsed = formulas.length > 0 ? trialFromText(text, file.name, formulas) : probe
    return Response.json({
      statement: statementForClient(parsed.statement, name),
      vprasanja: parsed.vprasanja,
      konti: parsed.konti,
      besedilo: text,
    })
  } catch (error) {
    const message =
      error instanceof TrialBalanceError
        ? error.message
        : "Te datoteke ne prepoznam kot bruto bilanco s konti in osmimi zneski."
    return Response.json({ error: message }, { status: 422 })
  }
}
