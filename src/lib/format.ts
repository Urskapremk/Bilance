const eur = new Intl.NumberFormat("sl-SI", {
  maximumFractionDigits: 0,
  signDisplay: "auto",
})

export function formatEur(value: number): string {
  return eur.format(value)
}

const cents = new Intl.NumberFormat("sl-SI", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
})

export function formatCents(value: number): string {
  return cents.format(value / 100)
}

/** Cela števila v eurih. Pike in presledki so ločila tisočic, vejica je decimalno ločilo. */
export function parseEur(raw: string, allowNegative: boolean): number | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === "-" || trimmed === "+") return 0
  const normalized = trimmed.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) return null
  const rounded = Math.round(Number(normalized))
  if (!Number.isFinite(rounded)) return null
  if (!allowNegative && rounded < 0) return null
  return rounded
}
