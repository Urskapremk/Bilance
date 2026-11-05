import { readFile } from "node:fs/promises"
import path from "node:path"

import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { chart, descendantLeaves } from "@/lib/charts"
import { formatCents } from "@/lib/format"
import { incomeLines } from "@/lib/income"
import { legalFormOf } from "@/lib/legal-form"
import type { PrintJob } from "@/lib/print-job"
import { rowHasAmount, shownColumns, type ShownColumns } from "@/lib/prior-year"
import { signatoryById } from "@/lib/signatories"
import { statementSubtitle } from "@/lib/subtitle"

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
  prior?: string
  depth: number
  band: boolean
}

export async function renderStatementPdf(job: PrintJob): Promise<Uint8Array> {
  const ready = await preparePdf()
  const title = job.view === "bilanca" ? "Bilanca stanja" : "Izkaz poslovnega izida"
  ready.pdf.setTitle(`${title}, ${job.statement.company}`)
  ready.pdf.setAuthor("Hnatura d.o.o.")
  appendStatement(ready.pdf, ready.font, ready.fontBold, job)
  stampPages(ready.pdf, ready.font)
  return ready.pdf.save()
}

export async function renderBothStatementsPdf(input: {
  statement: PrintJob["statement"]
  showZeros: boolean
  showPrevious?: boolean
}): Promise<Uint8Array> {
  const ready = await preparePdf()
  ready.pdf.setTitle(`Bilanca stanja in izkaz poslovnega izida, ${input.statement.company}`)
  ready.pdf.setAuthor("Hnatura d.o.o.")
  appendStatement(ready.pdf, ready.font, ready.fontBold, { ...input, view: "bilanca" })
  appendStatement(ready.pdf, ready.font, ready.fontBold, { ...input, view: "izkaz" })
  stampPages(ready.pdf, ready.font)
  return ready.pdf.save()
}

async function preparePdf() {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const { regular, bold } = await loadFonts()
  const font = await pdf.embedFont(regular, { subset: true })
  const fontBold = await pdf.embedFont(bold, { subset: true })
  return { pdf, font, fontBold }
}

function appendStatement(pdf: PDFDocument, font: PDFFont, fontBold: PDFFont, job: PrintJob) {
  const columns = shownColumns(job.statement, Boolean(job.showPrevious))
  const rows = job.view === "bilanca" ? balanceRows(job, columns) : incomeRows(job, columns)
  const title = job.view === "bilanca" ? "Bilanca stanja" : "Izkaz poslovnega izida"
  const column = job.view === "bilanca" ? job.statement.currentDate : job.statement.period
  const two = columns.showPrior
  const priorGap = job.view === "bilanca" ? 84 : 120
  const currentRight = PAGE_WIDTH - MARGIN - 8
  const priorRight = currentRight - priorGap
  const labelWidthBase = two ? 250 : 360
  const aopCenter = two ? MARGIN + 300 : MARGIN + 400

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = PAGE_HEIGHT - MARGIN

  y = drawHeader(page, font, fontBold, y, job, title)
  y = drawTableHead(page, fontBold, y, column, two ? "Preteklo leto" : undefined, priorGap)

  for (const row of rows) {
    const labelWidth = labelWidthBase - row.depth * 12
    const labelSize = row.band ? 10 : 8.5
    const labelFont = row.band || row.depth <= 1 ? fontBold : font
    const lines = wrap(row.label, labelFont, labelSize, labelWidth)
    const height = Math.max(16, lines.length * 11 + 6)
    if (y - height < 48) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      y = PAGE_HEIGHT - MARGIN
      y = drawTableHead(page, fontBold, y, column, two ? "Preteklo leto" : undefined, priorGap)
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
      x: aopCenter - aopWidth / 2,
      y: y - 12,
      size: 8,
      font,
      color: GOLD,
    })
    if (row.prior !== undefined) {
      drawRight(page, row.prior, priorRight, y - 12, labelFont, 8.5, NAVY, priorGap - 12)
    }
    drawRight(page, row.amount, currentRight, y - 12, labelFont, 8.5, NAVY, two ? priorGap - 8 : 140)
    y -= height
  }

  const signer = signatoryById(job.statement.signatory)
  if (y < 80) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = PAGE_HEIGHT - MARGIN
  }
  const blockWidth = 180
  const blockX = PAGE_WIDTH - MARGIN - blockWidth
  const nameY = y - 28
  const nameFont = signer.id === "urska" ? font : fontBold
  const nameWidth = nameFont.widthOfTextAtSize(signer.name, 10)
  page.drawText(signer.name, {
    x: blockX + (blockWidth - nameWidth) / 2,
    y: nameY,
    size: 10,
    font: nameFont,
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
}

function stampPages(pdf: PDFDocument, font: PDFFont) {
  const pages = pdf.getPages()
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
}

function drawFittedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  let used = size
  while (used > 8 && font.widthOfTextAtSize(text, used) > maxWidth) used -= 0.5
  page.drawText(text, { x, y, size: used, font, color })
}

function drawHeader(page: PDFPage, font: PDFFont, fontBold: PDFFont, y: number, job: PrintJob, title: string) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 28, width: PAGE_WIDTH, height: 28, color: DEEP })
  page.drawText("BILANCE", { x: MARGIN, y: PAGE_HEIGHT - 18, size: 9, font: fontBold, color: GOLD })
  let cursor = y - 28
  page.drawText(title, { x: MARGIN, y: cursor, size: 18, font: fontBold, color: NAVY })
  cursor -= 16
  drawFittedText(page, statementSubtitle(job.statement.subtitle), MARGIN, cursor, PAGE_WIDTH - MARGIN * 2, font, 11, GOLD)
  cursor -= 18
  page.drawText(job.statement.company, { x: MARGIN, y: cursor, size: 13, font: fontBold, color: NAVY })
  cursor -= 16
  const period = `Obdobje ${job.statement.period}. Stanje na dan ${job.statement.currentDate}.`
  page.drawText(period, { x: MARGIN, y: cursor, size: 9, font, color: MUTED })
  return cursor - 16
}

function drawRight(
  page: PDFPage,
  text: string,
  right: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  maxWidth: number,
) {
  let used = size
  while (used > 6 && font.widthOfTextAtSize(text, used) > maxWidth) used -= 0.25
  const width = font.widthOfTextAtSize(text, used)
  page.drawText(text, { x: right - width, y, size: used, font, color })
}

function drawTableHead(
  page: PDFPage,
  fontBold: PDFFont,
  y: number,
  column: string,
  prior?: string,
  priorGap = 84,
) {
  const height = 18
  const currentRight = PAGE_WIDTH - MARGIN - 8
  drawRoundRect(page, MARGIN, y - height, PAGE_WIDTH - MARGIN * 2, height, 8, { color: DEEP }, { tl: true, tr: true, bl: false, br: false })
  page.drawText("POSTAVKA", { x: MARGIN + 8, y: y - 12, size: 8, font: fontBold, color: WHITE })
  page.drawText("AOP", { x: prior ? MARGIN + 286 : MARGIN + 392, y: y - 12, size: 8, font: fontBold, color: WHITE })
  if (prior) drawRight(page, prior, currentRight - priorGap, y - 12, fontBold, 8, WHITE, priorGap - 12)
  drawRight(page, column, currentRight, y - 12, fontBold, 8, WHITE, prior ? priorGap - 8 : 160)
  return y - height
}

function balanceRows(job: PrintJob, columns: ShownColumns): PdfRow[] {
  const form = legalFormOf(job.statement)
  const current = columns.currentBalance
  const prior = columns.priorBalance
  return chart(form).lines.filter((line) => job.showZeros || rowHasAmount(line.aop, current, prior, descendantLeaves(line.aop, form))).map((line) => ({
    label: line.label,
    aop: line.aop,
    amount: formatCents(current[line.aop] ?? 0),
    prior: columns.showPrior ? formatCents(prior?.[line.aop] ?? 0) : undefined,
    depth: line.depth,
    band: line.depth === 0,
  }))
}

function incomeRows(job: PrintJob, columns: ShownColumns): PdfRow[] {
  const form = legalFormOf(job.statement)
  const values = columns.currentIncome
  const prior = columns.priorIncome
  return incomeLines(form).filter((line) => job.showZeros || rowHasAmount(line.aop, values, prior)).map((line) => ({
    label: line.label,
    aop: line.aop,
    amount: formatCents(values[line.aop] ?? 0),
    prior: columns.showPrior ? formatCents(prior?.[line.aop] ?? 0) : undefined,
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
