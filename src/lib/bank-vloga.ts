import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, PDFTextField, type PDFFont, type PDFForm } from "pdf-lib"

import type { BankStatement } from "@/lib/bank-form"
import { ADREMA_DH_COMPANY } from "@/lib/dh-adrema"

/** Leta napovedi na vlogi. Generator jih ne izpolni. */
export const FINANCING_FORECAST_YEAR = /202[6-9]/

/** Osnovni podatki družbe in datum odprte bilance. Brez napovedi in brez zneskov izkaza. */
export function financingBasics(statement: BankStatement): Record<string, string> {
  const company = ADREMA_DH_COMPANY
  const tax = company.taxNumber.startsWith("SI") ? company.taxNumber : `SI${company.taxNumber}`
  const dated = statement.currentDate ? `${company.place}, ${statement.currentDate}` : company.place
  return {
    "Polni naziv": company.name,
    "Sedež ulica in kraj": company.seat,
    fill_3: company.registration,
    fill_4: tax,
    "Zakoniti zastopnik": company.director,
    "kraj in datum": dated,
    "ime in priimek ter podpis zakonitega zastopnika": company.director,
  }
}

/** Vloga za odobritev financiranja: samo osnovni podatki, napovedi 2026–2029 ostanejo prazne. */
export async function fillFinancingApplication(
  template: Uint8Array,
  fontBytes: Uint8Array,
  statement: BankStatement,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template)
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(fontBytes, { subset: true })
  const form = pdf.getForm()
  for (const [name, value] of Object.entries(financingBasics(statement))) {
    writeText(form, font, name, value)
  }
  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField)) continue
    if (!FINANCING_FORECAST_YEAR.test(field.getName())) continue
    field.setText("")
    field.updateAppearances(font)
  }
  pdf.setTitle(`Vloga za odobritev financiranja, ${ADREMA_DH_COMPANY.name}, ${statement.period}`)
  pdf.setAuthor(ADREMA_DH_COMPANY.accountant)
  return pdf.save()
}

function writeText(form: PDFForm, font: PDFFont, name: string, value: string) {
  const field = form.getTextField(name)
  field.setText(value)
  field.updateAppearances(font)
}
