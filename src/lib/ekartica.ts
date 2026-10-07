export class EkarticaError extends Error {}

export type ContributionLine = {
  date: string
  description: string
  /** Znesek v breme, v centih. Popravek je lahko negativen. */
  cents: number
}

export type ContributionMonth = {
  month: number
  label: string
  lines: ContributionLine[]
  totalCents: number
}

export type ContributionAccount = {
  code: string
  name: string
  months: ContributionMonth[]
  /** Obračuni, ki so knjiženi v januarju naslednjega leta in so še na tej kartici. */
  following: ContributionLine[]
  totalCents: number
  monthsWithCharge: number
}

export type EkarticaReport = {
  year: number
  holder: string
  sourceName: string
  accounts: ContributionAccount[]
  totalCents: number
}

const AMOUNT = String.raw`-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}`
const DETAIL = new RegExp(
  `^(\\d+)\\s+(.+?)\\s+(\\d{2}\\.\\d{2}\\.\\d{4})\\s+(${AMOUNT})\\s+(${AMOUNT})\\s+(${AMOUNT})$`,
)
const SUMMARY = new RegExp(`^(\\d+)\\s+(.+?)\\s+(${AMOUNT})(?:\\s+${AMOUNT}){3}$`)

const MONTHS = [
  "januar",
  "februar",
  "marec",
  "april",
  "maj",
  "junij",
  "julij",
  "avgust",
  "september",
  "oktober",
  "november",
  "december",
]

export function parseEkartica(text: string, sourceName = "ekartica.pdf"): EkarticaReport {
  const clean = text.replace(/\u00a0/g, " ")
  const yearMatch = clean.match(/za leto\s+(\d{4})/)
  if (!/knjigovodska kartica/i.test(clean) || !yearMatch?.[1]) {
    throw new EkarticaError("Te datoteke ne prepoznam kot kartico eDavkov. Pričakujem knjigovodsko kartico davčnega zavezanca.")
  }
  const year = Number(yearMatch[1])
  const names = summaryNames(clean)
  const entries = detailEntries(clean, names)
  const contributions = entries.filter((entry) => isContribution(entry.description))
  if (contributions.length === 0) {
    throw new EkarticaError("Na kartici ni obračunov prispevkov.")
  }

  const byCode = new Map<string, { name: string; lines: typeof contributions }>()
  for (const line of contributions) {
    const bucket = byCode.get(line.code) ?? { name: line.name, lines: [] }
    bucket.lines.push(line)
    byCode.set(line.code, bucket)
  }

  const accounts = [...byCode.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], "sl", { numeric: true }))
    .map(([code, bucket]) => accountSheet(code, bucket.name, bucket.lines, year))

  return {
    year,
    holder: readHolder(clean),
    sourceName,
    accounts,
    totalCents: accounts.reduce((sum, account) => sum + account.totalCents, 0),
  }
}

function summaryNames(text: string): Map<string, string> {
  const names = new Map<string, string>()
  const head = text.split(/Knjižbe po vseh kontih/i)[0] ?? text
  for (const line of head.split(/\r?\n/)) {
    const match = SUMMARY.exec(line.trim())
    if (!match?.[1] || !match[2]) continue
    names.set(match[1], match[2].replace(/\s+/g, " ").trim())
  }
  return names
}

type Entry = { code: string; name: string; date: string; description: string; cents: number }

function detailEntries(text: string, names: Map<string, string>): Entry[] {
  const body = text.split(/Knjižbe po vseh kontih/i)[1] ?? ""
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !isChrome(line))

  const entries: Entry[] = []
  let pending: { entry: Entry; nameLeft: string } | null = null

  for (const line of lines) {
    const match = DETAIL.exec(line)
    if (match?.[1] && match[2] && match[3] && match[4]) {
      const code = match[1]
      const name = names.get(code) ?? ""
      const peeled = peelName(match[2], name)
      const entry: Entry = {
        code,
        name: name || match[2],
        date: match[3],
        description: peeled.description,
        cents: toCents(match[4]),
      }
      entries.push(entry)
      pending = { entry, nameLeft: peeled.nameLeft }
      continue
    }
    if (!pending) continue
    const extra = absorbContinuation(line, pending.nameLeft)
    pending.nameLeft = extra.nameLeft
    if (extra.description) {
      pending.entry.description = `${pending.entry.description} ${extra.description}`.replace(/\s+/g, " ").trim()
    }
  }

  return entries
}

function peelName(rest: string, fullName: string): { description: string; nameLeft: string } {
  const name = fullName.replace(/\s+/g, " ").trim()
  const text = rest.replace(/\s+/g, " ").trim()
  if (!name) return { description: text, nameLeft: "" }
  let cut = 0
  const limit = Math.min(name.length, text.length)
  while (cut < limit && name[cut]?.toLocaleLowerCase("sl") === text[cut]?.toLocaleLowerCase("sl")) cut += 1
  if (cut < name.length && cut > 0 && name[cut] !== " ") {
    const space = name.lastIndexOf(" ", cut)
    cut = space >= 0 ? space + 1 : cut
  }
  return {
    description: text.slice(cut).trim(),
    nameLeft: name.slice(cut).trim(),
  }
}

function absorbContinuation(line: string, nameLeft: string): { description: string; nameLeft: string } {
  if (!nameLeft) return { description: line, nameLeft: "" }
  const left = nameLeft.replace(/\s+/g, " ").trim()
  const text = line.replace(/\s+/g, " ").trim()
  if (text.toLocaleLowerCase("sl") === left.toLocaleLowerCase("sl")) return { description: "", nameLeft: "" }
  if (left.toLocaleLowerCase("sl").startsWith(text.toLocaleLowerCase("sl"))) {
    return { description: "", nameLeft: left.slice(text.length).trim() }
  }
  if (text.toLocaleLowerCase("sl").startsWith(left.toLocaleLowerCase("sl"))) {
    return { description: text.slice(left.length).trim(), nameLeft: "" }
  }
  const peeled = peelName(text, left)
  if (peeled.nameLeft !== left) return { description: peeled.description, nameLeft: peeled.nameLeft }
  return { description: text, nameLeft }
}

function isChrome(line: string): boolean {
  if (/eKartica\s*-/i.test(line)) return true
  if (/^\d+\s*\/\s*\d+$/.test(line)) return true
  if (/^Konto\s+Naziv/i.test(line)) return true
  return false
}

function isContribution(description: string): boolean {
  const text = description.toLocaleLowerCase("sl")
  if (text.includes("plačilo") || text.includes("placilo")) return false
  if (text.includes("obrest")) return false
  if (text.includes("izravnava") || text.includes("pobot") || text.includes("vračil")) return false
  if (text.includes("sklep")) return false
  if (text.includes("rek")) return false
  if (text.includes("obračun davka") || text.includes("obracun davka")) return false
  if (text.includes("obračun prispevkov") || text.includes("obracun prispevkov")) return true
  if (text.includes("pzdv")) return true
  return false
}

function accountSheet(code: string, name: string, lines: Entry[], year: number): ContributionAccount {
  const inYear = lines.filter((line) => line.date.endsWith(`.${year}`))
  const following = lines
    .filter((line) => line.date.endsWith(`.${year + 1}`) && line.date.slice(3, 5) === "01")
    .map(toLine)
  const months: ContributionMonth[] = MONTHS.map((label, index) => {
    const month = index + 1
    const monthLines = inYear.filter((line) => Number(line.date.slice(3, 5)) === month).map(toLine)
    return {
      month,
      label: `${label} ${year}`,
      lines: monthLines,
      totalCents: monthLines.reduce((sum, line) => sum + line.cents, 0),
    }
  })
  return {
    code,
    name,
    months,
    following,
    totalCents: lines.reduce((sum, line) => sum + line.cents, 0),
    monthsWithCharge: months.filter((month) => month.lines.length > 0).length,
  }
}

function toLine(entry: Entry): ContributionLine {
  return { date: entry.date, description: entry.description, cents: entry.cents }
}

function readHolder(text: string): string {
  const match = text.match(/eKartica\s*-\s*(.+?)\s+\d+\s*\/\s*\d+/)
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? ""
}

function toCents(raw: string): number {
  const negative = raw.trim().startsWith("-")
  const cents = Math.round(Number(raw.replace(/-/g, "").replace(/\./g, "").replace(",", ".")) * 100)
  return negative ? -cents : cents
}
