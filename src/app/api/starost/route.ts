import { withOcrDeadline } from "@/lib/ocr-engine"
import { AgingTableError } from "@/lib/partner-aging"
import { parseAgingImage } from "@/lib/partner-aging-image"

export const runtime = "nodejs"
export const maxDuration = 20

const IMAGE = new Set(["image/png", "image/jpeg", "image/webp"])

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
  const name = file.name.toLowerCase()
  const image = IMAGE.has(file.type) || /\.(png|jpe?g|webp)$/.test(name)
  if (!image) {
    return Response.json({ error: "Posnetek zaslona naj bo png, jpg ali webp." }, { status: 400 })
  }
  if (file.size > 12_000_000) {
    return Response.json({ error: "Slika je prevelika." }, { status: 400 })
  }

  try {
    const rows = await withOcrDeadline(parseAgingImage(new Uint8Array(await file.arrayBuffer()), kind))
    return Response.json({ rows })
  } catch (error) {
    const message =
      error instanceof AgingTableError || (error instanceof Error && /končalo|poskusite/i.test(error.message))
        ? error.message
        : "Tabele na sliki ni bilo mogoče prebrati."
    return Response.json({ error: message }, { status: 422 })
  }
}
