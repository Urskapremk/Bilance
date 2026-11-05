import JSZip from "jszip"

import type { BankCell } from "@/lib/bank-form"

const SHEET_FILE: Record<string, string> = {
  "Osnovni podatki": "xl/worksheets/sheet2.xml",
  BS: "xl/worksheets/sheet4.xml",
  IPI: "xl/worksheets/sheet5.xml",
  "003 Neopred.OS": "xl/worksheets/sheet6.xml",
  "010 Opred.OS": "xl/worksheets/sheet7.xml",
  "018 Nalož.neprem.": "xl/worksheets/sheet8.xml",
  "020 Dolg.fin.naložbe": "xl/worksheets/sheet9.xml",
  "024 Dolg.posojila": "xl/worksheets/sheet10.xml",
  "027 Dolg.posl.ter.": "xl/worksheets/sheet11.xml",
  "034 Zaloge": "xl/worksheets/sheet12.xml",
  "041 Krat.fin.naložbe": "xl/worksheets/sheet13.xml",
  "045 Krat.posojila": "xl/worksheets/sheet14.xml",
  "049 Krat.ter.druzbe.v.sk.": "xl/worksheets/sheet15.xml",
  "050 Krat.ter.kupci": "xl/worksheets/sheet16.xml",
  "051 Krat.ter.drugi": "xl/worksheets/sheet17.xml",
  "053 Krat.AČR": "xl/worksheets/sheet18.xml",
  "054 Zabil.sreds.": "xl/worksheets/sheet19.xml",
  "056 Kapital": "xl/worksheets/sheet20.xml",
  "072 Rez.dolg.PČR": "xl/worksheets/sheet21.xml",
  "076 Dolg.fin.obvez.": "xl/worksheets/sheet22.xml",
  "080 Dolg.posl.obvez.": "xl/worksheets/sheet23.xml",
  "087 Krat.fin.obvez.": "xl/worksheets/sheet24.xml",
  "092 Krat.obvez.druzb.v.sk.": "xl/worksheets/sheet25.xml",
  "093 Krat.obvez.dobav.": "xl/worksheets/sheet26.xml",
  "094 Krat.obvez.druge": "xl/worksheets/sheet27.xml",
  "095 Krat.PČR": "xl/worksheets/sheet28.xml",
}

/** Vpiše vrednosti v kopijo predloge in pusti formule, sloge in imena celic. */
export async function fillDhWorkbook(
  template: Uint8Array,
  cells: BankCell[],
  options?: { dropStaleText?: boolean },
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(template)
  const bySheet = new Map<string, BankCell[]>()
  for (const cell of cells) {
    const list = bySheet.get(cell.sheet) ?? []
    list.push(cell)
    bySheet.set(cell.sheet, list)
  }

  for (const [sheet, writes] of bySheet) {
    const path = SHEET_FILE[sheet]
    if (!path) throw new Error(`List ${sheet} ni v predlogi FRP.`)
    const file = zip.file(path)
    if (!file) throw new Error(`V predlogi manjka ${path}.`)
    const xml = await file.async("string")
    zip.file(path, patchSheetXml(xml, writes, sheet))
  }

  if (options?.dropStaleText) {
    const names = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    for (const name of names) {
      const file = zip.file(name)
      if (!file) continue
      zip.file(name, forgetFormulaCache(await file.async("string")))
    }
  }

  const workbook = zip.file("xl/workbook.xml")
  if (workbook) {
    const xml = await workbook.async("string")
    zip.file(
      "xl/workbook.xml",
      xml.replace("<calcPr calcId=\"191029\"/>", "<calcPr calcId=\"191029\" fullCalcOnLoad=\"1\"/>"),
    )
  }
  await dropCalcChain(zip)
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  return Buffer.from(out)
}

export function euroText(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(Math.round(cents))
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  if (frac === 0) return `${sign}${whole}`
  return `${sign}${whole}.${String(frac).padStart(2, "0")}`
}

export function patchSheetXml(xml: string, writes: BankCell[], sheet: string): string {
  let next = xml
  for (const write of writes) {
    next = relocateSharedFormulaMaster(next, write.cell)
    const replaced = replaceCell(next, write.cell, (attrs) => {
      const cleaned = attrs.replace(/\s+t="[^"]*"/g, "")
      if (write.clear) return `<c r="${write.cell}"${cleaned}/>`
      const extra = write.text ? ' t="inlineStr"' : ""
      return `<c r="${write.cell}"${cleaned}${extra}>${cellInner(write)}</c>`
    })
    if (replaced === null) throw new Error(`Na listu ${sheet} ni celice ${write.cell}.`)
    next = replaced
  }
  return next
}

/** Vzorčni izpis formul v predlogi ne sme ostati, ko se vhodne celice zamenjajo. */
function forgetFormulaCache(xml: string): string {
  return xml.replace(/<c\b([^>]*)>([\s\S]*?)<\/c>/g, (full, attrs: string, inner: string) => {
    if (!/<f[\s>]/.test(inner) || !/<v>/.test(inner)) return full
    const cleanedAttrs = attrs.replace(/\s+\bt="(?:str|s)"/, "")
    const cleanedInner = inner.replace(/<v>[\s\S]*?<\/v>/g, "")
    return `<c${cleanedAttrs}>${cleanedInner}</c>`
  })
}

function cellInner(write: BankCell): string {
  if (write.text !== undefined) return `<is><t>${escapeXml(write.text)}</t></is>`
  if (write.euros !== undefined) return `<v>${euroText(write.euros)}</v>`
  if (write.number !== undefined) return `<v>${write.number}</v>`
  throw new Error(`Celica ${write.sheet} ${write.cell} nima vrednosti.`)
}

function replaceCell(xml: string, ref: string, build: (attrs: string) => string): string | null {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const selfClosing = new RegExp(`<c r="${escaped}"([^>]*)/>`)
  const self = selfClosing.exec(xml)
  if (self) {
    return xml.slice(0, self.index) + build(self[1] ?? "") + xml.slice(self.index + self[0].length)
  }
  const open = new RegExp(`<c r="${escaped}"([^>]*)>([\\s\\S]*?)</c>`)
  const hit = open.exec(xml)
  if (!hit) return null
  return xml.slice(0, hit.index) + build(hit[1] ?? "") + xml.slice(hit.index + hit[0].length)
}

/**
 * Skupna formula (na primer G9:G18 na listu 045) izgubi telo, če se glavna celica zamenja z zneskom.
 * Glavo formule prestavimo na naslednjo vrstico, preden se celica prepiše.
 */
function relocateSharedFormulaMaster(xml: string, ref: string): string {
  const cell = cellInnerOf(xml, ref)
  if (!cell) return xml
  const formula = /<f\b([^>]*)>([\s\S]*?)<\/f>/.exec(cell.inner)
  if (!formula) return xml
  const attrs = formula[1] ?? ""
  if (!/\bt="shared"/.test(attrs)) return xml
  const range = /\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/.exec(attrs)
  const si = /\bsi="(\d+)"/.exec(attrs)
  if (!range?.[1] || !range[2] || !range[3] || !range[4] || !si?.[1]) return xml
  const column = range[1]
  const start = Number(range[2])
  const endColumn = range[3]
  const end = Number(range[4])
  if (column !== endColumn || end <= start) return xml
  const nextRow = start + 1
  const nextRef = `${column}${nextRow}`
  const shifted = (formula[2] ?? "").replace(
    new RegExp(`(\\$?)([A-Z]+)(?!\\$)(${start})(?!\\d)`, "g"),
    `$1$2${nextRow}`,
  )
  const nextAttrs = attrs.replace(/\bref="[^"]*"/, `ref="${nextRef}:${column}${end}"`)
  const nextFormula = `<f${nextAttrs}>${shifted}</f>`
  return replaceCell(xml, nextRef, (nextCellAttrs) => {
    const inner = cellInnerOf(xml, nextRef)?.inner ?? ""
    const replacedInner = /<f\b[^>]*\/>/.test(inner)
      ? inner.replace(/<f\b[^>]*\/>/, nextFormula)
      : /<f\b[^>]*>[\s\S]*?<\/f>/.test(inner)
        ? inner.replace(/<f\b[^>]*>[\s\S]*?<\/f>/, nextFormula)
        : `${nextFormula}${inner}`
    return `<c r="${nextRef}"${nextCellAttrs}>${replacedInner}</c>`
  }) ?? xml
}

function cellInnerOf(xml: string, ref: string): { inner: string } | null {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const open = new RegExp(`<c r="${escaped}"([^>]*)>([\\s\\S]*?)</c>`)
  const hit = open.exec(xml)
  if (!hit || (hit[1] ?? "").endsWith("/")) return null
  return { inner: hit[2] ?? "" }
}

async function dropCalcChain(zip: JSZip) {
  zip.remove("xl/calcChain.xml")
  const rels = zip.file("xl/_rels/workbook.xml.rels")
  const types = zip.file("[Content_Types].xml")
  if (rels) {
    const xml = await rels.async("string")
    zip.file("xl/_rels/workbook.xml.rels", xml.replace(/<Relationship[^>]*calcChain[^>]*\/>/g, ""))
  }
  if (types) {
    const xml = await types.async("string")
    zip.file("[Content_Types].xml", xml.replace(/<Override[^>]*calcChain[^>]*\/>/g, ""))
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
