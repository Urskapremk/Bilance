import { renderBothStatementsPdf, renderStatementPdf } from "@/lib/statement-pdf"
import type { PrintJob } from "@/lib/print-job"

export const runtime = "nodejs"

type PdfBody = {
  statement?: PrintJob["statement"]
  view?: PrintJob["view"] | "oba"
  showZeros?: boolean
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PdfBody | null
  const view = body?.view
  if (!body?.statement?.company || (view !== "bilanca" && view !== "izkaz" && view !== "oba")) {
    return Response.json({ error: "Manjkajo podatki za izpis." }, { status: 400 })
  }

  try {
    const pdf =
      view === "oba"
        ? await renderBothStatementsPdf({
            statement: body.statement,
            showZeros: Boolean(body.showZeros),
          })
        : await renderStatementPdf({
            statement: body.statement,
            view,
            showZeros: Boolean(body.showZeros),
          })
    const filename = pdfName(body.statement.company, view)
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

function pdfName(companyName: string, view: PrintJob["view"] | "oba") {
  const kind =
    view === "oba" ? "Bilanca-stanja-in-izkaz" : view === "bilanca" ? "Bilanca-stanja" : "Izkaz-poslovnega-izida"
  const company = companyName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${kind}-${company || "druzba"}.pdf`
}
