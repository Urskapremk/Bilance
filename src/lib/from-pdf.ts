import type { AccountFormula, AccountRow } from "@/lib/account-map"
import { pdfToText } from "@/lib/pdf-lines"
import { accountQuestions, accountRows, buildStatement, type Statement } from "@/lib/trial"

export async function statementFromPdf(
  data: Uint8Array,
  sourceName: string,
  formulas: AccountFormula[] = [],
): Promise<Statement> {
  const text = await pdfToText(data)
  return buildStatement(text, sourceName, formulas)
}

export type ParsedTrial = {
  statement: Statement
  vprasanja: AccountRow[]
  konti: AccountRow[]
}

export function trialFromText(text: string, sourceName: string, formulas: AccountFormula[] = []): ParsedTrial {
  return {
    statement: buildStatement(text, sourceName, formulas),
    vprasanja: accountQuestions(text, formulas),
    konti: accountRows(text, formulas),
  }
}

export async function parseTrialPdf(
  data: Uint8Array,
  sourceName: string,
  formulas: AccountFormula[] = [],
): Promise<ParsedTrial> {
  const text = await pdfToText(data)
  return trialFromText(text, sourceName, formulas)
}
