import { AjpesFormError, applyAjpesText } from "@/lib/ajpes-form"
import { pdfToText } from "@/lib/pdf-lines"
import type { Statement } from "@/lib/trial"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const form = await request.formData()
  const files = form.getAll("file").filter((item): item is File => item instanceof File)
  if (!files.length) {
    return Response.json({ error: "Dodajte datoteko PDF." }, { status: 400 })
  }

  const raw = form.get("statement")
  if (typeof raw !== "string" || !raw.trim()) {
    return Response.json({ error: "Najprej odprite stranko." }, { status: 400 })
  }
  let base: Statement
  try {
    base = JSON.parse(raw) as Statement
  } catch {
    return Response.json({ error: "Najprej odprite stranko." }, { status: 400 })
  }
  if (!base?.company || !base.balance || !base.income) {
    return Response.json({ error: "Najprej odprite stranko." }, { status: 400 })
  }

  try {
    const parts: string[] = []
    for (const file of files) parts.push(await readForm(file))
    const uploaded = files.map((file) => file.name).filter(Boolean).join(", ") || "ajpes.pdf"
    const sourceName = base.sourceKind === "ajpes" && base.sourceName ? `${base.sourceName}, ${uploaded}` : uploaded
    const statement = applyAjpesText(base, parts.join("\n"), sourceName)
    return Response.json({ statement, besedilo: parts.join("\n") })
  } catch (error) {
    const message =
      error instanceof AjpesFormError
        ? error.message
        : "Izdelanega obrazca AJPES ni bilo mogoče prebrati."
    return Response.json({ error: message }, { status: 422 })
  }
}

async function readForm(file: File): Promise<string> {
  try {
    return await pdfToText(new Uint8Array(await file.arrayBuffer()))
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("ni besedila")) {
      throw new AjpesFormError("V datoteki ni besedila. Obrazec AJPES mora biti izpis, ne skeniran dokument.")
    }
    throw new AjpesFormError("Izdelanega obrazca AJPES ni bilo mogoče prebrati.")
  }
}
