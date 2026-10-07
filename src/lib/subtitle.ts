export const DEFAULT_SUBTITLE = "Presečni izkazi"
export const IZKAZI_SUBTITLE = "Izkazi"
export const SUBTITLE_LIMIT = 80

/** Napis pod naslovom bilance. Prazen vnos ostane pri Presečni izkazi. */
export function statementSubtitle(value: string | undefined): string {
  const clean = value?.trim().replace(/\s+/g, " ") ?? ""
  return clean.slice(0, SUBTITLE_LIMIT) || DEFAULT_SUBTITLE
}

export function subtitleChoice(value: string | undefined): "presecni" | "izkazi" | "svoje" {
  const clean = value?.trim().replace(/\s+/g, " ") ?? ""
  if (!clean || clean === DEFAULT_SUBTITLE) return "presecni"
  if (clean === IZKAZI_SUBTITLE) return "izkazi"
  return "svoje"
}
