import { EkarticaError, parseEkartica } from "@/lib/ekartica"
import { pdfToText } from "@/lib/pdf-lines"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return Response.json({ error: "Dodajte datoteko PDF." }, { status: 400 })
  }
  try {
    const text = await pdfToText(new Uint8Array(await file.arrayBuffer()))
    return Response.json(parseEkartica(text, file.name))
  } catch (error) {
    const message =
      error instanceof EkarticaError ? error.message : "Kartice eDavkov ni bilo mogoče prebrati."
    return Response.json({ error: message }, { status: 422 })
  }
}
