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
      row.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
}
