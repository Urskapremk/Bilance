import os from "node:os"
import path from "node:path"

import sharp from "sharp"
import { createWorker, PSM, type Worker } from "tesseract.js"

import {
  AgingTableError,
  classifyAgingHeader,
  parseAgingGrid,
  type AgingKind,
  type AgingParty,
} from "@/lib/partner-aging"

export type OcrWord = {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

type HeaderCell = {
  kind: string
  text: string
  x0: number
  x1: number
}

const MONEY = new Set(["terjatve", "stanje", "nezapadlo", "zapadlo", "do30", "d60", "d90", "d150", "nad150", "nerazporejeno"])

let chain: Promise<unknown> = Promise.resolve()
let workerPromise: Promise<Worker> | null = null
let digitWorkerPromise: Promise<Worker> | null = null

/** Besede s položajem sestavi v mrežo, ki jo bere isti razčlenjevalec kot Excel. */
export function ocrWordsToGrid(words: OcrWord[]): string[][] {
  return gridFromLines(groupLines(words))
}

function gridFromLines(lines: OcrWord[][]): string[][] {
  for (let index = 0; index < lines.length; index += 1) {
    const single = headerCells(lines[index] ?? [])
    if (isAgingHeader(single)) {
      return gridFrom(lines.slice(index + 1), single)
    }
    const wrapped = headerCells([...(lines[index] ?? []), ...(lines[index + 1] ?? [])])
    if (isAgingHeader(wrapped)) {
      return gridFrom(lines.slice(index + 2), wrapped)
    }
  }
  return []
}

export async function parseAgingImage(data: Uint8Array, expected: AgingKind): Promise<AgingParty[]> {
  const cells = await cellsToGrid(data).catch(() => [] as string[][])
  if (cells.length) {
    try {
      return parseAgingGrid(cells, expected).map(reconcileAgingRow)
    } catch (error) {
      if (!(error instanceof AgingTableError)) throw error
      if (/V tej tabeli so/.test(error.message)) throw error
    }
  }
  const lines = await recognizeLines(data)
  const grid = gridFromLines(lines)
  if (!grid.length) {
    throw new AgingTableError(
      "Na sliki ne vidim tabele. Naložite posnetek zaslona s stolpci Kupec ali Dobavitelj, davčna in Stanje.",
    )
  }
  return parseAgingGrid(grid, expected).map(reconcileAgingRow)
}

function isAgingHeader(cells: HeaderCell[]): boolean {
  const kinds = new Set(cells.map((cell) => cell.kind))
  return (kinds.has("kupec") || kinds.has("dobavitelj")) && kinds.has("stanje")
}

function headerCells(words: OcrWord[]): HeaderCell[] {
  const sorted = [...words].sort((left, right) => left.x0 - right.x0)
  const cells: HeaderCell[] = []
  const used = new Set<string>()
  let index = 0
  while (index < sorted.length) {
    let best: { length: number; cell: HeaderCell } | null = null
    const max = Math.min(3, sorted.length - index)
    for (let length = 1; length <= max; length += 1) {
      const slice = sorted.slice(index, index + length)
      const text = slice
        .map((word) => word.text.trim())
        .filter(Boolean)
        .join(" ")
      const kind = classifyAgingHeader(text)
      if (!kind || used.has(kind)) continue
      const first = slice[0]
      const last = slice[slice.length - 1]
      if (!first || !last) continue
      best = { length, cell: { kind, text, x0: first.x0, x1: last.x1 } }
      break
    }
    if (best) {
      used.add(best.cell.kind)
      cells.push(best.cell)
      index += best.length
    } else {
      index += 1
    }
  }
  return cells
}

function gridFrom(lines: OcrWord[][], headers: HeaderCell[]): string[][] {
  const grid: string[][] = [headers.map((header) => header.text)]
  for (const line of lines) {
    const buckets = headers.map(() => [] as string[])
    for (const word of line) {
      const column = columnIndex((word.x0 + word.x1) / 2, headers)
      const text = word.text.trim()
      if (text) buckets[column]?.push(text)
    }
    const row = buckets.map((parts) => parts.join(" ").trim())
    if (!row.some(Boolean)) continue
    grid.push(row)
    if (row.some((cell) => isTotal(cell))) break
  }
  return grid
}

function columnIndex(x: number, headers: HeaderCell[]): number {
  const centers = headers.map((header) => (header.x0 + header.x1) / 2)
  const bounds = [Number.NEGATIVE_INFINITY]
  for (let index = 0; index < centers.length - 1; index += 1) {
    bounds.push(((centers[index] ?? 0) + (centers[index + 1] ?? 0)) / 2)
  }
  for (let index = 0; index < headers.length; index += 1) {
    const start = bounds[index] ?? Number.NEGATIVE_INFINITY
    const end = bounds[index + 1] ?? Number.POSITIVE_INFINITY
    if (x >= start && x < end) return index
  }
  return Math.max(0, headers.length - 1)
}

function groupLines(words: OcrWord[]): OcrWord[][] {
  const sorted = [...words].sort((left, right) => left.y0 - right.y0 || left.x0 - right.x0)
  const lines: OcrWord[][] = []
  for (const word of sorted) {
    const center = (word.y0 + word.y1) / 2
    const height = Math.max(1, word.y1 - word.y0)
    const line = lines.length ? lines[lines.length - 1] : undefined
    const sample = line?.[0]
    const sampleCenter = sample ? (sample.y0 + sample.y1) / 2 : 0
    const sampleHeight = sample ? Math.max(1, sample.y1 - sample.y0) : 0
    if (line && sample && Math.abs(center - sampleCenter) <= Math.max(height, sampleHeight) * 0.7) {
      line.push(word)
    } else {
      lines.push([word])
    }
  }
  return lines.map((line) => line.sort((left, right) => left.x0 - right.x0))
}

function isTotal(value: string): boolean {
  const clean = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
  return clean === "skupaj" || clean.startsWith("skupaj ")
}

/** Mreža iz Excela: vsaka celica se prebere posebej, prazna ostane prazna. */
async function cellsToGrid(data: Uint8Array): Promise<string[][]> {
  const { data: raw, info } = await sharp(Buffer.from(data)).greyscale().raw().toBuffer({ resolveWithObject: true })
  const width = info.width
  const height = info.height
  if (!width || !height) return []
  const at = (x: number, y: number) => raw[y * width + x] ?? 255
  const borders: number[] = []
  for (let x = 1; x < width - 1; x += 1) {
    let hits = 0
    for (let y = 0; y < height; y += 1) {
      const value = at(x, y)
      if (value < 190 && at(x - 1, y) > 200 && at(x + 1, y) > 200) hits += 1
    }
    if (hits > height * 0.4) borders.push(x)
  }
  const edges = [0]
  for (const x of borders) {
    const previous = edges[edges.length - 1] ?? 0
    if (x - previous >= 8 && width - x >= 8) edges.push(x)
  }
  edges.push(width)
  if (edges.length < 8) return []

  const bands: { y0: number; y1: number }[] = []
  let y = 0
  while (y < height) {
    const ink = inkCount(at, width, y)
    if (ink > 12 && ink < width * 0.5) {
      const start = y
      while (y < height) {
        const next = inkCount(at, width, y)
        if (next <= 12 || next >= width * 0.5) break
        y += 1
      }
      if (y - start >= 4) bands.push({ y0: Math.max(0, start - 2), y1: Math.min(height, y + 2) })
    } else {
      y += 1
    }
  }
  if (bands.length < 3) return []

  const scale = Math.min(8, Math.max(3, Math.round(64 / Math.max(1, (bands[1]?.y1 ?? 16) - (bands[1]?.y0 ?? 0)))))
  const headerAt = await headerBand(data, edges, bands, scale)
  if (headerAt < 0) return []
  const headers = await readBand(data, edges, bands[headerAt]!, scale, null)
  const kinds = headers.map((text) => classifyAgingHeader(text))
  if (!isAgingHeader(kinds.map((kind, index) => ({ kind: kind ?? "", text: headers[index] ?? "", x0: 0, x1: 0 })))) {
    return []
  }
  const grid = [headers]
  for (const band of bands.slice(headerAt + 1)) {
    const row = await readBand(data, edges, band, scale, kinds)
    if (!row.some(Boolean)) continue
    grid.push(row)
    if (row.some((cell) => isTotal(cell))) break
  }
  return grid
}

function inkCount(at: (x: number, y: number) => number, width: number, y: number): number {
  let count = 0
  for (let x = 0; x < width; x += 1) if (at(x, y) < 110) count += 1
  return count
}

async function headerBand(
  data: Uint8Array,
  edges: number[],
  bands: { y0: number; y1: number }[],
  scale: number,
): Promise<number> {
  const limit = Math.min(3, bands.length)
  for (let index = 0; index < limit; index += 1) {
    const band = bands[index]
    if (!band) continue
    const texts = await readBand(data, edges, band, scale, null)
    const kinds = texts.map((text) => classifyAgingHeader(text)).filter((kind): kind is string => Boolean(kind))
    if ((kinds.includes("kupec") || kinds.includes("dobavitelj")) && kinds.includes("stanje")) return index
  }
  return -1
}

async function readBand(
  data: Uint8Array,
  edges: number[],
  band: { y0: number; y1: number },
  scale: number,
  kinds: (string | null)[] | null,
): Promise<string[]> {
  const cells: string[] = []
  for (let index = 0; index < edges.length - 1; index += 1) {
    const x0 = edges[index] ?? 0
    const x1 = edges[index + 1] ?? x0
    const kind = kinds?.[index] ?? null
    const image = await cellImage(data, x0, band.y0, x1, band.y1, cellScale(kind, band, scale), cellThreshold(kind))
    if (!image) {
      cells.push("")
      continue
    }
    let text = await readCell(image, kind)
    if (kind === "kupec" || kind === "dobavitelj" || (kind === null && /[A-Za-zŠŽČ]/.test(text))) {
      text = await restoreCaron(text, data, x0, band.y0, x1, band.y1)
    }
    cells.push(text)
  }
  return cells
}

/** Strešica nad Z je na posnetku višja od črke S. Brez nje ostane SŽ prebran kot SZ. */
async function restoreCaron(name: string, data: Uint8Array, x0: number, y0: number, x1: number, y1: number): Promise<string> {
  if (!/^S[Zz](?=\s|$)/.test(name)) return name
  const width = Math.max(1, x1 - x0)
  const height = Math.max(1, y1 - y0)
  const grey = await sharp(Buffer.from(data)).extract({ left: x0, top: y0, width, height }).greyscale().raw().toBuffer()
  const dark = (x: number, y: number) => (grey[y * width + x] ?? 255) < 110
  const glyphs: { y0: number }[] = []
  let x = 0
  while (x < width && glyphs.length < 2) {
    let column = 0
    for (let y = 0; y < height; y += 1) if (dark(x, y)) column += 1
    if (column === 0 || column > height * 0.75) {
      x += 1
      continue
    }
    const start = x
    let top = height
    while (x < width) {
      let next = 0
      for (let y = 0; y < height; y += 1) {
        if (!dark(x, y)) continue
        next += 1
        top = Math.min(top, y)
      }
      if (next === 0) break
      x += 1
    }
    if (x - start >= 2) glyphs.push({ y0: top })
  }
  const first = glyphs[0]
  const second = glyphs[1]
  if (!first || !second || second.y0 + 1 >= first.y0) return name
  return name.replace(/^S[Zz]/, "SŽ")
}

/** Števke pri višini okoli 70 px zaprejo luknjo v petki. Zato jih beremo bližje 56 px. */
function cellScale(kind: string | null, band: { y0: number; y1: number }, scale: number): number {
  if (!kind || (!MONEY.has(kind) && kind !== "davcna" && kind !== "zap")) return scale
  const height = Math.max(1, band.y1 - band.y0)
  return Math.min(8, Math.max(3, Math.round(56 / height)))
}

/** Pri davčni številki nekoliko višji prag obdrži svetlejšo potezo petke. */
function cellThreshold(kind: string | null): number {
  return kind === "davcna" || kind === "zap" ? 180 : 160
}

async function cellImage(
  data: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  scale: number,
  threshold: number,
): Promise<Buffer | null> {
  const width = Math.max(1, x1 - x0)
  const height = Math.max(1, y1 - y0)
  const grey = await sharp(Buffer.from(data)).extract({ left: x0, top: y0, width, height }).greyscale().raw().toBuffer()
  let dark = 0
  for (const value of grey) if (value < 140) dark += 1
  if (dark < 6) return null
  return sharp(Buffer.from(data))
    .extract({ left: x0, top: y0, width, height })
    .greyscale()
    .resize(width * scale, height * scale)
    .threshold(threshold)
    .extend({ top: 18, bottom: 18, left: 18, right: 18, background: "#ffffff" })
    .png()
    .toBuffer()
}

async function readCell(image: Buffer, kind: string | null): Promise<string> {
  if (kind && MONEY.has(kind)) {
    const digits = await recognizeCell(image, "0123456789.,")
    return canonicalAmount(digits)
  }
  if (kind === "davcna" || kind === "zap") return readTax(image, kind)
  if (kind === "kupec" || kind === "dobavitelj") return readName(image)
  return cleanName(await recognizeCell(image, ""))
}

async function readTax(image: Buffer, kind: "davcna" | "zap"): Promise<string> {
  const digits = await recognizeCell(image, "0123456789")
  if (kind === "zap") return digits.replace(/\D/g, "")
  const numeric = digits.replace(/\D/g, "")
  const compact = (await recognizeCell(image, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"))
    .replace(/\s+/g, "")
    .toUpperCase()
  const prefixed = compact.match(/^([A-Z]{2})(\d{6,})$/)
  if (prefixed?.[1] && prefixed[2] && (numeric === prefixed[2] || numeric.endsWith(prefixed[2]))) {
    return `${prefixed[1]}${prefixed[2]}`
  }
  if (/^1\d{8}$/.test(numeric)) return numeric.slice(1)
  if (numeric.length >= 7) return numeric
  const plain = cleanName(await recognizeCell(image, "")).replace(/\s+/g, "").toUpperCase()
  if (/^[A-Z]{2}$/.test(plain)) return plain
  if (/^[A-Z]{2}\d{6,}$/.test(plain)) return plain
  if (/^I[A-Z]{2}$/.test(compact)) return compact.slice(1)
  return /^1\d{8}$/.test(compact) ? compact.slice(1) : compact
}

async function readName(image: Buffer): Promise<string> {
  const plain = cleanName(await recognizeCell(image, ""))
  const alnum = (await recognizeCell(image, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")).replace(/\s+/g, "")
  return mergeName(plain, alnum)
}

function cleanName(text: string): string {
  return text
    .replace(/^[^0-9A-Za-zÀ-ž]+/u, "")
    .replace(/[|;,[\]()]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function mergeName(plain: string, alnum: string): string {
  const spaced = plain.replace(/([0-9])(?=LTD\b)/g, "$1 ")
  const tokens = spaced.split(" ")
  const first = tokens[0] ?? ""
  const alt = alnum.slice(0, first.length)
  if (first && alt.length === first.length && !/\d/.test(first) && /\d/.test(alt) && sameAsideFromDigit(first, alt)) {
    tokens[0] = alt
  }
  return tokens.join(" ")
}

function sameAsideFromDigit(plain: string, alt: string): boolean {
  for (let index = 0; index < plain.length; index += 1) {
    const left = plain[index] ?? ""
    const right = alt[index] ?? ""
    if (left.toLowerCase() === right.toLowerCase()) continue
    if ((left === "A" || left === "a") && right === "4") continue
    return false
  }
  return true
}

/** Zapadlo je vsota razredov. Če bralnik odreže prvo števko, jo vrnemo, kadar se ujema z zapadlim. */
function reconcileAgingRow(row: AgingParty): AgingParty {
  const buckets = ["do30", "d60", "d90", "d150", "nad150"] as const
  let next = row
  const parts = next.nezapadlo + next.zapadlo
  if (parts && next.stanje === parts * 100 && next.stanje % 100 === 0 && parts % 100 !== 0) {
    next = { ...next, stanje: parts }
  }
  const sum = buckets.reduce((total, key) => total + next[key], 0)
  if (!next.zapadlo || sum === next.zapadlo) return next
  const fixes = buckets.filter((key) => {
    const value = next[key]
    if (!value) return false
    const corrected = next.zapadlo - (sum - value)
    return corrected > value && corrected < value * 100 && String(corrected).endsWith(String(value))
  })
  if (fixes.length !== 1) return next
  const key = fixes[0]
  if (!key) return next
  return { ...next, [key]: next.zapadlo - (sum - next[key]) }
}

function canonicalAmount(raw: string): string {
  const cents = amountCents(raw)
  if (cents === null || cents === 0) return ""
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const frac = String(abs % 100).padStart(2, "0")
  return `${cents < 0 ? "-" : ""}${whole},${frac}`
}

function amountCents(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "")
  if (!/\d/.test(cleaned)) return null
  const negative = cleaned.startsWith("-")
  const body = cleaned.replace(/-/g, "")
  const last = Math.max(body.lastIndexOf(","), body.lastIndexOf("."))
  const swallowed = body.match(/^(\d{1,3}(?:\.\d{3})+)(\d{2})$/)
  let cents: number
  if (swallowed?.[1] && swallowed[2]) {
    cents = Number(swallowed[1].replace(/\./g, "")) * 100 + Number(swallowed[2])
  } else if (last >= 0 && body.length - last - 1 === 2) {
    const whole = body.slice(0, last).replace(/\D/g, "") || "0"
    const frac = body.slice(last + 1).replace(/\D/g, "")
    cents = Number(whole) * 100 + Number(frac)
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(body)) {
    cents = Number(body.replace(/\D/g, "")) * 100
  } else {
    cents = Number(body.replace(/\D/g, "")) * 100
  }
  if (!Number.isFinite(cents)) return null
  return negative ? -cents : cents
}

async function recognizeCell(image: Buffer, whitelist: string): Promise<string> {
  const run = chain.then(async () => {
    const engine = whitelist ? await digitWorker() : await ocrWorker()
    if (whitelist) {
      await engine.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: whitelist,
        user_defined_dpi: "300",
      })
    } else {
      await engine.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        user_defined_dpi: "300",
      })
    }
    const result = await engine.recognize(image)
    return result.data.text.replace(/\s+/g, " ").trim()
  })
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function recognizeLines(data: Uint8Array): Promise<OcrWord[][]> {
  const run = chain.then(() => readLines(data))
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function readLines(data: Uint8Array): Promise<OcrWord[][]> {
  const engine = await ocrWorker()
  await engine.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    user_defined_dpi: "200",
  })
  const prepared = await prepareScreenshot(data)
  const result = await engine.recognize(prepared)
  const fromLines = (result.data.lines ?? [])
    .map((line) =>
      line.words
        .filter((word) => word.text.trim())
        .map((word) => ({
          text: word.text,
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
        })),
    )
    .filter((line) => line.length > 0)
  if (fromLines.length) return fromLines
  const words = (result.data.words ?? [])
    .filter((word) => word.text.trim())
    .map((word) => ({
      text: word.text,
      x0: word.bbox.x0,
      y0: word.bbox.y0,
      x1: word.bbox.x1,
      y1: word.bbox.y1,
    }))
  return groupLines(words)
}

/** Sive črte mreže in črne obrobe ne smejo prekriti besedila. Barvna polja ostanejo prazna. */
export async function prepareScreenshot(data: Uint8Array): Promise<Buffer> {
  const { data: raw, info } = await sharp(Buffer.from(data)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const lineY = new Uint8Array(height)
  const lineX = new Uint8Array(width)
  for (let y = 0; y < height; y += 1) {
    if (rowIsRule(raw, width, y)) lineY[y] = 1
  }
  for (let x = 0; x < width; x += 1) {
    if (columnIsRule(raw, width, height, x)) lineX[x] = 1
  }
  const gray = Buffer.alloc(width * height, 255)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const onRule = lineY[y] === 1 || lineX[x] === 1
      const beside =
        (y > 0 && lineY[y - 1] === 1) ||
        (y + 1 < height && lineY[y + 1] === 1) ||
        (x > 0 && lineX[x - 1] === 1) ||
        (x + 1 < width && lineX[x + 1] === 1)
      if (onRule || (beside && rulePixel(raw, offset))) continue
      if (inkPixel(raw, offset)) gray[y * width + x] = 0
    }
  }
  const pad = 20
  const paddedWidth = width + pad * 2
  const paddedHeight = height + pad * 2
  const padded = Buffer.alloc(paddedWidth * paddedHeight, 255)
  for (let y = 0; y < height; y += 1) {
    gray.copy(padded, (y + pad) * paddedWidth + pad, y * width, (y + 1) * width)
  }
  let image = sharp(padded, { raw: { width: paddedWidth, height: paddedHeight, channels: 1 } })
  if (paddedWidth < 1700) image = image.resize({ width: Math.min(2800, paddedWidth * 3), kernel: "nearest" })
  return image.png().toBuffer()
}

function rowIsRule(raw: Buffer, width: number, y: number): boolean {
  let hits = 0
  let run = 0
  let longest = 0
  for (let x = 0; x < width; x += 1) {
    if (rulePixel(raw, (y * width + x) * 4)) {
      hits += 1
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  return hits > width * 0.62 && longest > width * 0.4
}

function columnIsRule(raw: Buffer, width: number, height: number, x: number): boolean {
  let hits = 0
  let run = 0
  let longest = 0
  for (let y = 0; y < height; y += 1) {
    if (rulePixel(raw, (y * width + x) * 4)) {
      hits += 1
      run += 1
      if (run > longest) longest = run
    } else {
      run = 0
    }
  }
  return hits > height * 0.55 && longest > height * 0.4
}

function rulePixel(raw: Buffer, offset: number): boolean {
  const red = raw[offset] ?? 255
  const green = raw[offset + 1] ?? 255
  const blue = raw[offset + 2] ?? 255
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
  const lum = (red + green + blue) / 3
  if (chroma > 32) return false
  return (lum > 55 && lum < 242) || lum < 95
}

function inkPixel(raw: Buffer, offset: number): boolean {
  const red = raw[offset] ?? 255
  const green = raw[offset + 1] ?? 255
  const blue = raw[offset + 2] ?? 255
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
  const lum = (red + green + blue) / 3
  return lum < 165 && chroma < 75 && Math.min(red, green, blue) < 150
}

export async function finishAgingOcr(): Promise<void> {
  const pending = [workerPromise, digitWorkerPromise]
  workerPromise = null
  digitWorkerPromise = null
  chain = Promise.resolve()
  for (const worker of pending) {
    const engine = await worker?.catch(() => null)
    await engine?.terminate()
  }
}

function digitWorker(): Promise<Worker> {
  if (!digitWorkerPromise) {
    const pending = createWorker("eng", 1, {
      langPath: path.join(process.cwd(), "data/tessdata"),
      cachePath: path.join(os.tmpdir(), "bilance-tess"),
      gzip: false,
    }).catch((error: unknown) => {
      digitWorkerPromise = null
      throw error
    })
    digitWorkerPromise = pending
  }
  return digitWorkerPromise
}

function ocrWorker(): Promise<Worker> {
  if (!workerPromise) {
    const pending = createWorker("slv+eng", 1, {
      langPath: path.join(process.cwd(), "data/tessdata"),
      cachePath: path.join(os.tmpdir(), "bilance-tess"),
      gzip: false,
    })
      .then(async (created) => {
        await created.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
          preserve_interword_spaces: "1",
        })
        return created
      })
      .catch((error: unknown) => {
        workerPromise = null
        throw error
      })
    workerPromise = pending
  }
  return workerPromise
}
