import { isScreenshotFile, screenshotReadError, withOcrDeadline } from "@/lib/ocr-engine"
import { parseAgingImage } from "@/lib/partner-aging-image"

export const runtime = "nodejs"
export const maxDuration = 20

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const kind = form?.get("kind")
  if (!(file instanceof File)) {
    return Response.json({ error: "Dodajte posnetek zaslona." }, { status: 400 })
  }
  if (kind !== "kupci" && kind !== "dobavitelji") {
    return Response.json({ error: "Izberite kupce ali dobavitelje." }, { status: 400 })
  }
  if (file.size > 12_000_000) {
    return Response.json({ error: "Slika je prevelika." }, { status: 400 })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isScreenshotFile(bytes, file.type, file.name)) {
    return Response.json({ error: "Posnetek zaslona naj bo png, jpg ali webp." }, { status: 400 })
  }

  try {
    const rows = await withOcrDeadline(parseAgingImage(bytes, kind))
    return Response.json({ rows })
  } catch (error) {
    console.error(error)
    return Response.json(
      { error: screenshotReadError(error, "Tabele na sliki ni bilo mogoče prebrati.") },
      { status: 422 },
    )
  }
}
