import type { AccountFormula, AccountRow } from "@/lib/account-map"
import type { LegalForm } from "@/lib/legal-form"
import { pdfToText } from "@/lib/pdf-lines"
import { accountQuestions, accountRows, buildStatement, type Statement } from "@/lib/trial"

export async function statementFromPdf(
  data: Uint8Array,
  sourceName: string,
  formulas: AccountFormula[] = [],
  form: LegalForm = "doo",
): Promise<Statement> {
  const text = await pdfToText(data)
  return buildStatement(text, sourceName, formulas, form)
}

export type ParsedTrial = {
  statement: Statement
  vprasanja: AccountRow[]
  konti: AccountRow[]
}

export function trialFromText(
  text: string,
  sourceName: string,
  formulas: AccountFormula[] = [],
  form: LegalForm = "doo",
): ParsedTrial {
  return {
    statement: buildStatement(text, sourceName, formulas, form),
    vprasanja: accountQuestions(text, formulas, form),
    konti: accountRows(text, formulas, form),
  }
}

export async function parseTrialPdf(
  data: Uint8Array,
  sourceName: string,
  formulas: AccountFormula[] = [],
  form: LegalForm = "doo",
): Promise<ParsedTrial> {
  const text = await pdfToText(data)
  return trialFromText(text, sourceName, formulas, form)
}
