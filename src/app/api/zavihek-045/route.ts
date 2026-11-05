import { withOcrDeadline } from "@/lib/ocr-engine"
import { recognizeLoanScreenshot } from "@/lib/zavihek-045-ocr"

export const runtime = "nodejs"
export const maxDuration = 20

const TYPES = new Set(["image/png", "image/jpeg", "image/webp"])
const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return Response.json({ error: "Prilepite posnetek zaslona (png, jpg ali webp)." }, { status: 400 })
  }
  if (!TYPES.has(file.type)) {
    return Response.json({ error: "Posnetek naj bo png, jpg ali webp." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Posnetek je prevelik." }, { status: 400 })
  }
  try {
    const lines = await withOcrDeadline(recognizeLoanScreenshot(Buffer.from(await file.arrayBuffer())))
    return Response.json({ lines })
  } catch (error) {
    console.error(error)
    const message =
      error instanceof Error && /končalo|poskusite/i.test(error.message)
        ? error.message
        : "Tabele na posnetku ni bilo mogoče prebrati."
    return Response.json({ error: message }, { status: 422 })
  }
}
