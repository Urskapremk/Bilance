import { clientKey } from "@/lib/clients"
import { parseSloveneDate, splitPeriod } from "@/lib/format"
import type { Statement } from "@/lib/trial"

export type PeriodStamp = {
  id: string
  savedAt: string
  company: string
  period: string
}

export function samePeriod(left: { company: string; period: string }, right: { company: string; period: string }): boolean {
  return clientKey(left.company) === clientKey(right.company) && left.period.trim() === right.period.trim()
}

/** Ena bilanca na stranko in obdobje. Ostane zapis z najnovejšim savedAt. */
export function keepNewestByPeriod<T extends PeriodStamp>(items: T[]): { kept: T[]; dropped: T[] } {
  const winner = new Map<string, T>()
  for (const item of items) {
    const key = `${clientKey(item.company)}\0${item.period.trim()}`
    const current = winner.get(key)
    if (!current || item.savedAt.localeCompare(current.savedAt) > 0) winner.set(key, item)
  }
  const keptIds = new Set(Array.from(winner.values(), (item) => item.id))
  const kept: T[] = []
  const dropped: T[] = []
  for (const item of items) {
    if (keptIds.has(item.id)) kept.push(item)
    else dropped.push(item)
  }
  return { kept, dropped }
}

/** Kartica, ki jo sme Shrani prepisati. Drugo obdobje ne zadene tuje kartice. */
export function archiveSaveTarget<T extends PeriodStamp>(
  items: T[],
  statement: { company: string; period: string },
  openId?: string,
): T | undefined {
  const matches = items.filter((item) => samePeriod(item, statement))
  const open = openId ? matches.find((item) => item.id === openId) : undefined
  if (open) return open
  return keepNewestByPeriod(matches).kept[0]
}

function dateRank(value: string): number {
  const parsed = parseSloveneDate(value)
  const match = parsed?.match(/^(\d{1,2})\. (\d{1,2})\. (\d{4})$/)
  if (!match?.[1] || !match[2] || !match[3]) return 0
  return Number(match[3]) * 10000 + Number(match[2]) * 100 + Number(match[1])
}

/** Novejše obdobje je prej. */
export function comparePeriodDesc(left: string, right: string): number {
  const a = splitPeriod(left)
  const b = splitPeriod(right)
  return dateRank(b?.end ?? "") - dateRank(a?.end ?? "") || dateRank(b?.start ?? "") - dateRank(a?.start ?? "")
}

/** Celoletno obdobje pred letom odprte bilance. 1. 1. 2026–31. 8. 2026 da 1. 1. 2025–31. 12. 2025. */
export function previousFullYear(period: string): { start: string; end: string } | null {
  const parts = splitPeriod(period)
  if (!parts) return null
  const endYear = Math.floor(dateRank(parts.end) / 10000)
  if (endYear < 1901) return null
  const previous = endYear - 1
  return { start: `1. 1. ${previous}`, end: `31. 12. ${previous}` }
}

export function periodCountLabel(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod10 === 1 && mod100 !== 11) return `${count} obdobje`
  if (mod10 === 2 && mod100 !== 12) return `${count} obdobji`
  if (mod10 >= 3 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} obdobja`
  return `${count} obdobij`
}

/** Prazna bilanca iste stranke. Zneski ostanejo prazni, dokler ni naložena bruto bilanca tega obdobja. */
export function emptyPeriodStatement(source: Statement, start: string, end: string): Statement {
  const period = start && end ? `${start}–${end}` : ""
  const endYear = Math.floor(dateRank(end) / 10000)
  return {
    company: source.company,
    period,
    currentDate: end,
    previousDate: endYear > 1900 ? `31. 12. ${endYear - 1}` : "",
    sourceName: "",
    balance: { current: {}, previous: {} },
    income: {},
    notes: [],
    warnings: [],
    signatory: source.signatory,
    subtitle: source.subtitle,
    legalForm: source.legalForm,
  }
}
