import sharp from "sharp"

import { PSM, recognizeImage, TEXT_ONLY, TSV_ONLY } from "@/lib/ocr-engine"
import { parseAnalyticalTsv, parseLoanGrid, parseLoanTsv, type LoanAnalyticalLine } from "@/lib/zavihek-045"

let chain: Promise<unknown> = Promise.resolve()

/** Prebere tabelo posojil s posnetka. Prazne vrstice ne nastanejo. */
export function recognizeLoanScreenshot(image: Buffer): Promise<LoanAnalyticalLine[]> {
  const run = chain.then(() => recognize(image))
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function recognize(image: Buffer): Promise<LoanAnalyticalLine[]> {
  const grid = await readExcelGrid(image).catch(() => null)
  if (grid) {
    const lines = parseLoanGrid(grid)
    if (lines.length) return lines
  }
  const page = await recognizeImage(
    image,
    {
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: "",
    },
    TSV_ONLY,
  )
  const tsv = page.tsv ?? ""
  const loan = parseLoanTsv(tsv)
  if (loan.length) return loan
  return parseAnalyticalTsv(tsv)
}

/**
 * Excelova mreža je črna črta skozi celico. Celoten posnetek jo prebere kot
 * znak, zato se stolpci zlepijo in vejica v 19,40 izgine. Vsaka celica se
 * zato odreže znotraj črte. Oranžno in modro besedilo ostane temno po oddaljenosti
 * od bele, ne po sivi svetlobi, sicer se 9 in 6 prebereta kot 5.
 */
async function readExcelGrid(image: Buffer): Promise<string[][] | null> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const width = info.width
  const height = info.height
  if (!width || !height) return null
  const vertical = ruleLines(data, width, height, "x")
  const horizontal = ruleLines(data, width, height, "y")
  if (vertical.length < 3 || horizontal.length < 3) return null
  const xs = edges(vertical, width)
  const ys = edges(horizontal, height)
  const grid: string[][] = []
  for (let row = 0; row < ys.length - 1; row += 1) {
    const y0 = ys[row] ?? 0
    const y1 = ys[row + 1] ?? y0
    if (y1 - y0 < 10) continue
    const cells: string[] = []
    let any = false
    for (let column = 0; column < xs.length - 1; column += 1) {
      const x0 = xs[column] ?? 0
      const x1 = xs[column + 1] ?? x0
      if (x1 - x0 < 12) {
        cells.push("")
        continue
      }
      const text = await readCell(image, x0, y0, x1, y1, width, height)
      if (text) any = true
      cells.push(text)
    }
    if (any) grid.push(cells)
  }
  return grid.length >= 2 ? grid : null
}

function edges(lines: number[], limit: number): number[] {
  const sorted = [...lines]
  if (sorted[0] !== 0) sorted.unshift(0)
  const last = sorted[sorted.length - 1] ?? 0
  if (limit - 1 - last > 8) sorted.push(limit - 1)
  return sorted
}

function ruleLines(raw: Buffer, width: number, height: number, axis: "x" | "y"): number[] {
  const found: { at: number; hits: number }[] = []
  const length = axis === "x" ? width : height
  const span = axis === "x" ? height : width
  for (let index = 0; index < length; index += 1) {
    let hits = 0
    let run = 0
    let longest = 0
    for (let cross = 0; cross < span; cross += 1) {
      const x = axis === "x" ? index : cross
      const y = axis === "x" ? cross : index
      if (isRule(raw, width, x, y)) {
        hits += 1
        run += 1
        if (run > longest) longest = run
      } else {
        run = 0
      }
    }
    if (hits > span * 0.42 && longest > span * 0.32) found.push({ at: index, hits })
  }
  const lines: { at: number; hits: number }[] = []
  for (const line of found) {
    const previous = lines[lines.length - 1]
    if (!previous || line.at - previous.at > 3) lines.push(line)
    else if (line.hits > previous.hits) lines[lines.length - 1] = line
  }
  return lines.map((line) => line.at)
}

function isRule(raw: Buffer, width: number, x: number, y: number): boolean {
  const offset = (y * width + x) * 4
  const red = raw[offset] ?? 255
  const green = raw[offset + 1] ?? 255
  const blue = raw[offset + 2] ?? 255
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
  const lum = (red + green + blue) / 3
  return chroma < 36 && lum < 190
}

async function readCell(
  image: Buffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
): Promise<string> {
  const left = clamp(x0 + 2, width - 1)
  const top = clamp(y0 + 2, height - 1)
  const right = clamp(x1 - 2, width)
  const bottom = clamp(y1 - 2, height)
  const cellWidth = right - left
  const cellHeight = bottom - top
  if (cellWidth < 6 || cellHeight < 6) return ""
  const raw = await sharp(image).extract({ left, top, width: cellWidth, height: cellHeight }).ensureAlpha().raw().toBuffer()
  const gray = Buffer.alloc(cellWidth * cellHeight)
  let ink = 0
  for (let index = 0; index < cellWidth * cellHeight; index += 1) {
    const red = raw[index * 4] ?? 255
    const green = raw[index * 4 + 1] ?? 255
    const blue = raw[index * 4 + 2] ?? 255
    const distance = Math.max(255 - red, 255 - green, 255 - blue)
    gray[index] = 255 - distance
    if (distance > 45) ink += 1
  }
  if (ink < 8) return ""
  const scale = Math.min(5, Math.max(2, Math.round(56 / cellHeight)))
  const prepared = await sharp(gray, { raw: { width: cellWidth, height: cellHeight, channels: 1 } })
    .resize(cellWidth * scale, cellHeight * scale, { kernel: "lanczos3" })
    .extend({ top: 16, bottom: 16, left: 16, right: 16, background: "#ffffff" })
    .png()
    .toBuffer()
  const plain = cleanCell(await recognizeCell(prepared, "", "slv+eng"))
  if (!/\d/.test(plain)) return plain
  if (isCleanAmount(plain) || isCleanTax(plain)) return plain
  const digits = cleanCell(await recognizeCell(prepared, "0123456789.,-", "eng"))
  if (isCleanAmount(digits) || isCleanTax(digits)) return digits
  if (/,/.test(digits) && !/,/.test(plain)) return digits
  return plain
}

function isCleanAmount(value: string): boolean {
  const compact = value.replace(/\s/g, "")
  return /^-?\d{1,3}(?:[.\s]\d{3})*,\d{2}$/.test(compact) || /^-?\d+,\d{2}$/.test(compact)
}

function isCleanTax(value: string): boolean {
  return /^\d{8}$/.test(value.replace(/\s/g, ""))
}

function cleanCell(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[^0-9A-Za-zÀ-ž]+/u, "")
    .replace(/[|;,[\]()]+$/g, "")
    .trim()
}

async function recognizeCell(image: Buffer, whitelist: string, langs: "slv+eng" | "eng"): Promise<string> {
  const page = await recognizeImage(
    image,
    {
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      tessedit_char_whitelist: whitelist,
      user_defined_dpi: "300",
    },
    TEXT_ONLY,
    langs,
  )
  return (page.text ?? "").replace(/\s+/g, " ").trim()
}

function clamp(value: number, limit: number): number {
  return Math.max(0, Math.min(limit, Math.round(value)))
}
