import { readFile } from "node:fs/promises"
import path from "node:path"

import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { chart, descendantLeaves } from "@/lib/charts"
import { rollup } from "@/lib/compute"
import { formatCents } from "@/lib/format"
import { incomeLines, rollupIncome } from "@/lib/income"
import { legalFormOf, legalFormOption } from "@/lib/legal-form"
import type { PrintJob } from "@/lib/print-job"
import { signatoryById } from "@/lib/signatories"

const NAVY = rgb(34 / 255, 44 / 255, 55 / 255)
const DEEP = rgb(21 / 255, 58 / 255, 92 / 255)
const GOLD = rgb(188 / 255, 161 / 255, 105 / 255)
const BAND = rgb(242 / 255, 245 / 255, 249 / 255)
const WHITE = rgb(1, 1, 1)
const MUTED = rgb(93 / 255, 100 / 255, 108 / 255)
const LINE = rgb(221 / 255, 226 / 255, 230 / 255)

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 36

type PdfRow = {
  label: string
  aop: string
  amount: string
  depth: number
  band: boolean
}

export async function renderStatementPdf(job: PrintJob): Promise<Uint8Array> {
  const rows = job.view === "bilanca" ? balanceRows(job) : incomeRows(job)
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const { regular, bold } = await loadFonts()
  const font = await pdf.embedFont(regular, { subset: true })
  const fontBold = await pdf.embedFont(bold, { subset: true })
  const title = job.view === "bilanca" ? "Bilanca stanja" : "Izkaz poslovnega izida"
  const column = job.view === "bilanca" ? job.statement.currentDate : job.statement.period
  pdf.setTitle(`${title}, ${job.statement.company}`)
  pdf.setAuthor("Hnatura d.o.o.")

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN
  const pages: PDFPage[] = [page]

  y = drawHeader(page, font, fontBold, y, job, title)
  y = drawTableHead(page, fontBold, y, column)

  for (const row of rows) {
    const labelWidth = 360 - row.depth * 12
    const labelSize = row.band ? 10 : 8.5
    const labelFont = row.band || row.depth <= 1 ? fontBold : font
    const lines = wrap(row.label, labelFont, labelSize, labelWidth)
    const height = Math.max(16, lines.length * 11 + 6)
    if (y - height < 48) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      pages.push(page)
      y = PAGE_HEIGHT - MARGIN
      y = drawTableHead(page, fontBold, y, column)
    }
    const last = rows[rows.length - 1] === row
    drawRoundRect(
      page,
      MARGIN,
      y - height,
      PAGE_WIDTH - MARGIN * 2,
      height,
      8,
      { color: row.band ? BAND : WHITE, borderColor: LINE, borderWidth: 0.4 },
      { tl: false, tr: false, bl: last, br: last },
    )
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN + 8 + row.depth * 12,
        y: y - 12 - index * 11,
        size: labelSize,
        font: labelFont,
        color: NAVY,
      })
    })
    const aopWidth = font.widthOfTextAtSize(row.aop, 8)
    page.drawText(row.aop, {
      x: MARGIN + 400 - aopWidth / 2,
      y: y - 12,
      size: 8,
      font,
      color: GOLD,
    })
    const amountWidth = labelFont.widthOfTextAtSize(row.amount, 8.5)
    page.drawText(row.amount, {
      x: PAGE_WIDTH - MARGIN - 8 - amountWidth,
      y: y - 12,
      size: 8.5,
      font: labelFont,
      color: NAVY,
    })
    y -= height
  }

  const signer = signatoryById(job.statement.signatory)
  if (y < 96) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    pages.push(page)
    y = PAGE_HEIGHT - MARGIN
  }
  const blockWidth = 180
  const blockX = PAGE_WIDTH - MARGIN - blockWidth
  const nameY = y - 28
  const nameWidth = fontBold.widthOfTextAtSize(signer.name, 10)
  page.drawText(signer.name, {
    x: blockX + (blockWidth - nameWidth) / 2,
    y: nameY,
    size: 10,
    font: fontBold,
    color: NAVY,
  })
  if (signer.role) {
    const roleWidth = font.widthOfTextAtSize(signer.role, 8)
    page.drawText(signer.role, {
      x: blockX + (blockWidth - roleWidth) / 2,
      y: nameY - 12,
      size: 8,
      font,
      color: MUTED,
    })
  }

  pages.forEach((item, index) => {
    item.drawText("Hnatura d.o.o. — Računovodski servis", {
      x: MARGIN,
      y: 22,
      size: 8,
      font,
      color: MUTED,
    })
    const marker = `${index + 1} / ${pages.length}`
    const markerWidth = font.widthOfTextAtSize(marker, 8)
    item.drawText(marker, {
      x: PAGE_WIDTH - MARGIN - markerWidth,
      y: 22,
      size: 8,
      font,
      color: MUTED,
    })
  })

  return pdf.save()
}

function drawHeader(page: PDFPage, font: PDFFont, fontBold: PDFFont, y: number, job: PrintJob, title: string) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 28, width: PAGE_WIDTH, height: 28, color: DEEP })
  page.drawText("BILANCE", { x: MARGIN, y: PAGE_HEIGHT - 18, size: 9, font: fontBold, color: GOLD })
  let cursor = y - 28
  page.drawText(title, { x: MARGIN, y: cursor, size: 18, font: fontBold, color: NAVY })
  cursor -= 16
  page.drawText("Presečni izkazi", { x: MARGIN, y: cursor, size: 11, font, color: GOLD })
  cursor -= 18
  page.drawText(job.statement.company, { x: MARGIN, y: cursor, size: 13, font: fontBold, color: NAVY })
  cursor -= 14
  const shape = legalFormOption(legalFormOf(job.statement)).printName
  page.drawText(shape, { x: MARGIN, y: cursor, size: 9, font, color: MUTED })
  cursor -= 12
  const period = `Obdobje ${job.statement.period}. Stanje na dan ${job.statement.currentDate}.`
  page.drawText(period, { x: MARGIN, y: cursor, size: 9, font, color: MUTED })
  return cursor - 16
}

function drawTableHead(page: PDFPage, fontBold: PDFFont, y: number, column: string) {
  const height = 18
  drawRoundRect(page, MARGIN, y - height, PAGE_WIDTH - MARGIN * 2, height, 8, { color: DEEP }, { tl: true, tr: true, bl: false, br: false })
  page.drawText("POSTAVKA", { x: MARGIN + 8, y: y - 12, size: 8, font: fontBold, color: WHITE })
  page.drawText("AOP", { x: MARGIN + 392, y: y - 12, size: 8, font: fontBold, color: WHITE })
  const columnWidth = fontBold.widthOfTextAtSize(column, 8)
  page.drawText(column, {
    x: PAGE_WIDTH - MARGIN - 8 - columnWidth,
    y: y - 12,
    size: 8,
    font: fontBold,
    color: WHITE,
  })
  return y - height
}

function balanceRows(job: PrintJob): PdfRow[] {
  const form = legalFormOf(job.statement)
  const current = rollup(job.statement.balance.current, form)
  return chart(form).lines.filter((line) => {
    if (job.showZeros) return true
    if ((current[line.aop] ?? 0) !== 0) return true
    return descendantLeaves(line.aop, form).some((aop) => (current[aop] ?? 0) !== 0)
  }).map((line) => ({
    label: line.label,
    aop: line.aop,
    amount: formatCents(current[line.aop] ?? 0),
    depth: line.depth,
    band: line.depth === 0,
  }))
}

function incomeRows(job: PrintJob): PdfRow[] {
  const form = legalFormOf(job.statement)
  const values = rollupIncome(job.statement.income, form)
  return incomeLines(form).filter((line) => job.showZeros || (values[line.aop] ?? 0) !== 0).map((line) => ({
    label: line.label,
    aop: line.aop,
    amount: formatCents(values[line.aop] ?? 0),
    depth: line.depth,
    band: line.depth === 0,
  }))
}

function drawRoundRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  options: { color: ReturnType<typeof rgb>; borderColor?: ReturnType<typeof rgb>; borderWidth?: number },
  corners: { tl: boolean; tr: boolean; bl: boolean; br: boolean } = { tl: true, tr: true, bl: true, br: true },
) {
  const r = Math.min(radius, width / 2, height / 2)
  const tl = corners.tl ? r : 0
  const tr = corners.tr ? r : 0
  const bl = corners.bl ? r : 0
  const br = corners.br ? r : 0
  const path = [
    `M ${tl} 0`,
    `H ${width - tr}`,
    tr ? `Q ${width} 0 ${width} ${tr}` : `L ${width} 0`,
    `V ${height - br}`,
    br ? `Q ${width} ${height} ${width - br} ${height}` : `L ${width} ${height}`,
    `H ${bl}`,
    bl ? `Q 0 ${height} 0 ${height - bl}` : `L 0 ${height}`,
    `V ${tl}`,
    tl ? `Q 0 0 ${tl} 0` : `L 0 0`,
    "Z",
  ].join(" ")
  page.drawSvgPath(path, {
    x,
    y: y + height,
    color: options.color,
    borderColor: options.borderColor,
    borderWidth: options.borderWidth,
  })
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) <= width) {
      line = next
      continue
    }
    if (line) lines.push(line)
    line = word
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : [""]
}

function loadFonts() {
  return Promise.all([
    readFile(path.join(process.cwd(), "src/lib/fonts/DejaVuSans.ttf")),
    readFile(path.join(process.cwd(), "src/lib/fonts/DejaVuSans-Bold.ttf")),
  ]).then(([regular, bold]) => ({ regular, bold }))
}
