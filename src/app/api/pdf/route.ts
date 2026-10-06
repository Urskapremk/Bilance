import { renderStatementPdf } from "@/lib/statement-pdf"
import type { PrintJob } from "@/lib/print-job"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PrintJob | null
  if (!body?.statement?.company || (body.view !== "bilanca" && body.view !== "izkaz")) {
    return Response.json({ error: "Manjkajo podatki za izpis." }, { status: 400 })
  }

  try {
    const pdf = await renderStatementPdf({
      statement: body.statement,
      view: body.view,
      showZeros: Boolean(body.showZeros),
    })
    const filename = pdfName(body)
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "PDF ni bil ustvarjen." }, { status: 500 })
  }
}

function pdfName(job: PrintJob) {
  const kind = job.view === "bilanca" ? "Bilanca-stanja" : "Izkaz-poslovnega-izida"
  const company = job.statement.company
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${kind}-${company || "druzba"}.pdf`
}
