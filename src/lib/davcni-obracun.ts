import { parseCents } from "@/lib/format"

export class DavcniObracunError extends Error {}

export type DavcniObracun = {
  year: number
  holder: string
  sourceName: string
  regime: "normirani"
  /** Prihodki, ugotovljeni po računovodskih predpisih. */
  revenuesCents: number
  /** Davčno priznani odhodki, kot so navedeni na obračunu. */
  recognizedExpensesCents: number
  /** Obračunani znesek prispevkov za socialno varnost. Na izkazu je to AOP 148a. */
  statedContributionsCents: number
}

export type NormiraniSplit = {
  revenuesCents: number
  recognizedCents: number
  contributionsCents: number
  materialCents: number
  servicesCents: number
}

const AMOUNT = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`

export function parseDavcniObracun(text: string, sourceName = "obracun-davka.pdf"): DavcniObracun {
  const clean = text.replace(/\u00a0/g, " ")
  if (!/obračun akontacije dohodnine/i.test(clean) && !/dohodnine od dohodka iz dejavnosti/i.test(clean)) {
    throw new DavcniObracunError("Te datoteke ne prepoznam kot obračun davka od dohodka iz dejavnosti.")
  }
  if (!/normirani na podlagi dejanskih prihodkov/i.test(clean)) {
    throw new DavcniObracunError("Obračun ni sestavljen z normiranimi odhodki. Za samostojnega podjetnika normiranca velja 80 % prihodkov.")
  }
  const year = Number(clean.match(/do\s+\d{2}\.\d{2}\.(\d{4})/)?.[1] ?? "")
  const revenuesCents = amountAfter(clean, /1\.\s*Prihodki, ugotovljeni po računovodskih predpisih/)
  const recognizedExpensesCents = amountAfter(clean, /8\.\s*DAVČNO PRIZNANI ODHODKI/)
  const stated = clean.match(new RegExp(`(${AMOUNT})\\s*\\(obračunani znesek prispevkov`, "i"))
  const statedContributionsCents = stated?.[1] ? parseCents(stated[1]) : null
  if (!year || revenuesCents == null || recognizedExpensesCents == null || statedContributionsCents == null) {
    throw new DavcniObracunError("Na obračunu davka ne najdem prihodkov, normiranih odhodkov ali prispevkov.")
  }
  const holder = clean.match(/Ime in priimek zavezanca\s+([^\n]+)/)?.[1]?.replace(/\s+/g, " ").trim() ?? ""
  return {
    year,
    holder,
    sourceName,
    regime: "normirani",
    revenuesCents,
    recognizedExpensesCents,
    statedContributionsCents,
  }
}

/** Davčno priznani stroški so 80 % prihodkov. Prispevki so znesek z obračuna davka. Od preostanka je 20 % material, ostanek so drugi stroški storitev. */
export function normiraniSplit(revenuesCents: number, contributionsCents: number): NormiraniSplit {
  const revenues = Math.round(revenuesCents)
  const recognizedCents = Math.round((revenues * 80) / 100)
  const contributions = Math.max(0, Math.round(contributionsCents))
  const pool = Math.max(0, recognizedCents - contributions)
  const materialCents = Math.round((pool * 20) / 100)
  return {
    revenuesCents: revenues,
    recognizedCents,
    contributionsCents: contributions,
    materialCents,
    servicesCents: pool - materialCents,
  }
}

function amountAfter(text: string, label: RegExp): number | null {
  const start = text.search(label)
  if (start < 0) return null
  const slice = text.slice(start, start + 500)
  const match = slice.match(new RegExp(AMOUNT))
  return match?.[0] ? parseCents(match[0]) : null
}
