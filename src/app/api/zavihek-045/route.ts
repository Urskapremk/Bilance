import { isScreenshotFile, screenshotReadError, withOcrDeadline } from "@/lib/ocr-engine"
import { recognizeLoanScreenshot } from "@/lib/zavihek-045-ocr"

export const runtime = "nodejs"
export const maxDuration = 20

const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return Response.json({ error: "Prilepite posnetek zaslona (png, jpg ali webp)." }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Posnetek je prevelik." }, { status: 400 })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isScreenshotFile(bytes, file.type, file.name)) {
    return Response.json({ error: "Posnetek naj bo png, jpg ali webp." }, { status: 400 })
  }
  try {
    const lines = await withOcrDeadline(recognizeLoanScreenshot(Buffer.from(bytes)))
    return Response.json({ lines })
  } catch (error) {
    console.error(error)
    return Response.json(
      { error: screenshotReadError(error, "Tabele na posnetku ni bilo mogoče prebrati.") },
      { status: 422 },
    )
  }
}
