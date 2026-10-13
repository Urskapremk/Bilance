import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { PDFDocument, type PDFForm } from "pdf-lib"

import type { BankStatement } from "./bank-form.ts"
import { fillFinancingApplication } from "./bank-vloga.ts"

const statement: BankStatement = {
  company: "ADREMA d.o.o.",
  period: "1. 1. 2026–31. 7. 2026",
  currentDate: "31. 7. 2026",
  legalForm: "doo",
  balance: { current: { "014": 42424242 }, previous: {} },
  income: { "112": 42424242 },
}

test("vloga dobi osnovne podatke iz obrazca 31. 7. 2025 in ne izmisli napovedi", async () => {
  const templatePath = path.join(process.cwd(), "data/templates/dh/Vloga_za_odobritev_financiranja_PO.pdf")
  const fontPath = path.join(process.cwd(), "src/lib/fonts/DejaVuSans.ttf")
  const [template, font] = await Promise.all([readFile(templatePath), readFile(fontPath)])
  const dirtyPdf = await PDFDocument.load(template)
  dirtyPdf.getForm().getTextField("2026SREDSTVA").setText("999999")
  dirtyPdf.getForm().getTextField("2029Izid iz poslovanja EBIT").setText("888888")
  const dirty = await dirtyPdf.save()

  const filled = await fillFinancingApplication(dirty, font, statement)
  const form = (await PDFDocument.load(filled)).getForm()
  assert.equal(form.getTextField("Polni naziv").getText(), "ADREMA D.O.O.")
  assert.equal(form.getTextField("Sedež ulica in kraj").getText(), "MIKLOŠIČEVA CESTA 28, 1000 LJUBLJANA")
  assert.equal(form.getTextField("fill_3").getText(), "2305682000")
  assert.equal(form.getTextField("fill_4").getText(), "SI85127035")
  assert.equal(form.getTextField("Zakoniti zastopnik").getText(), "KAMENKO KESAR")
  assert.equal(form.getTextField("kraj in datum").getText(), "LJUBLJANA, 31. 7. 2026")
  assert.equal(textOf(form, "2026SREDSTVA"), "")
  assert.equal(textOf(form, "2027SREDSTVA"), "")
  assert.equal(textOf(form, "2028Kapital"), "")
  assert.equal(textOf(form, "2029Izid iz poslovanja EBIT"), "")
  for (const field of form.getFields()) {
    const name = field.getName()
    let value = ""
    try {
      value = form.getTextField(name).getText() ?? ""
    } catch {
      value = ""
    }
    assert.equal(value.includes("424242"), false, name)
    if (/202[6-9]/.test(name)) assert.equal(value, "", name)
  }
})

function textOf(form: PDFForm, name: string): string {
  return form.getTextField(name).getText() ?? ""
}
