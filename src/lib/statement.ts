import { LEAF_AOPS, LINE_BY_AOP } from "@/lib/schema"

export type Statement = {
  company: string
  registration: string
  seat: string
  place: string
  year: number
  current: Record<string, number>
  previous: Record<string, number>
}

export const STORAGE_KEY = "bilance.ajpes.v1"

function amounts(entries: Record<string, number>): Record<string, number> {
  const clean: Record<string, number> = {}
  for (const [aop, value] of Object.entries(entries)) {
    if (!LEAF_AOPS.includes(aop)) continue
    if (!Number.isFinite(value) || value === 0) continue
    const line = LINE_BY_AOP[aop]
    const rounded = Math.round(value)
    if (!line.allowNegative && rounded < 0) continue
    clean[aop] = rounded
  }
  return clean
}

/** Demonstracijski primer, številke niso iz resničnega letnega poročila. */
export function sampleStatement(): Statement {
  return {
    company: "Severnica trgovina d.o.o.",
    registration: "1000000000",
    seat: "Ljubljana",
    place: "Ljubljana",
    year: 2025,
    current: amounts({
      "012": 145_000,
      "013": 48_000,
      "014": 9_200,
      "035": 8_400,
      "038": 18_600,
      "050": 36_400,
      "051": 2_100,
      "052": 48_700,
      "053": 4_100,
      "058": 7_500,
      "060": 15_000,
      "062": 750,
      "066": 42_000,
      "068": 28_500,
      "070": 31_250,
      "073": 6_400,
      "078": 96_000,
      "089": 12_000,
      "093": 54_800,
      "094": 22_100,
      "095": 4_200,
      "054": 15_000,
      "096": 15_000,
    }),
    previous: amounts({
      "012": 152_000,
      "013": 56_000,
      "014": 11_000,
      "035": 7_200,
      "038": 15_400,
      "050": 29_800,
      "051": 1_800,
      "052": 41_200,
      "053": 3_600,
      "058": 7_500,
      "060": 15_000,
      "062": 750,
      "066": 36_000,
      "068": 21_200,
      "070": 24_800,
      "073": 5_800,
      "078": 112_000,
      "089": 15_000,
      "093": 51_200,
      "094": 18_750,
      "095": 10_000,
      "054": 12_000,
      "096": 12_000,
    }),
  }
}

export function blankStatement(): Statement {
  return {
    company: "",
    registration: "",
    seat: "",
    place: "",
    year: 2025,
    current: {},
    previous: {},
  }
}

export function loadStatement(): Statement | "corrupt" {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return sampleStatement()
    const parsed = JSON.parse(raw) as Partial<Statement>
    if (!parsed || typeof parsed !== "object") return "corrupt"
    const year = Number(parsed.year)
    return {
      company: typeof parsed.company === "string" ? parsed.company : "",
      registration: typeof parsed.registration === "string" ? parsed.registration : "",
      seat: typeof parsed.seat === "string" ? parsed.seat : "",
      place: typeof parsed.place === "string" ? parsed.place : "",
      year: Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : 2025,
      current: amounts(parsed.current ?? {}),
      previous: amounts(parsed.previous ?? {}),
    }
  } catch {
    return "corrupt"
  }
}

export function saveStatement(statement: Statement): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...statement,
      current: amounts(statement.current),
      previous: amounts(statement.previous),
    }),
  )
}
