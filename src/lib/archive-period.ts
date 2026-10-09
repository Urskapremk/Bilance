import { clientKey } from "@/lib/clients"

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
