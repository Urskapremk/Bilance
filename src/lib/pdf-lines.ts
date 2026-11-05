type TextItem = {
  str: string
  transform: number[]
}

function isTextItem(item: unknown): item is TextItem {
  if (typeof item !== "object" || item === null) return false
  if (!("str" in item) || !("transform" in item)) return false
  const candidate = item as { str: unknown; transform: unknown }
  return typeof candidate.str === "string" && Array.isArray(candidate.transform)
}

export async function pdfToText(data: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs")
  ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
  const payload = new Uint8Array(data)
  const document = await pdfjs.getDocument({ data: payload, verbosity: 0 }).promise
  const pages: string[] = []

  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number)
    const content = await page.getTextContent()
    const lines: TextItem[] = []
    for (const item of content.items) {
      if (isTextItem(item)) lines.push(item)
    }
    pages.push(rowsToText(lines))
  }

  const text = pages.join("\n")
  if (!text.trim()) {
    throw new Error("V datoteki ni besedila. Bruto bilanca mora biti izpis, ne skeniran dokument.")
  }
  return text
}

function rowsToText(items: TextItem[]): string {
  const placed = items
    .filter((item) => item.str.trim())
    .map((item) => ({
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      str: item.str,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const rows: { y: number; parts: { x: number; str: string }[] }[] = []
  for (const item of placed) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(last.y - item.y) < 2) last.parts.push(item)
    else rows.push({ y: item.y, parts: [item] })
  }

  return rows
    .map((row) =>
      collapseOverlays(row.parts)
        .map((part) => part.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
}

/**
 * Izdelan obrazec AJPES isto besedo nariše večkrat, skoraj na istem mestu.
 * Brez tega se znesek tekočega leta prebere štirikrat in lanski stolpec izgine.
 */
function collapseOverlays(parts: { x: number; str: string }[]): { x: number; str: string }[] {
  const sorted = [...parts].sort((a, b) => a.x - b.x)
  const kept: { x: number; str: string }[] = []
  for (const part of sorted) {
    const overlay = kept.some((item) => item.str === part.str && Math.abs(item.x - part.x) < 2)
    if (!overlay) kept.push(part)
  }
  return kept
}
