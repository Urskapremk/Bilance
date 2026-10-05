import { pdfToText } from "@/lib/pdf-lines"
import { buildStatement, type Statement } from "@/lib/trial"

export async function statementFromPdf(data: Uint8Array, sourceName: string): Promise<Statement> {
  const text = await pdfToText(data)
  return buildStatement(text, sourceName)
}
