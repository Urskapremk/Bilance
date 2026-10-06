export const SIGNATORIES = [
  { id: "nejc", name: "Nejc Zupanc", role: "računovodja" },
  { id: "matic", name: "Matic Premk", role: "" },
  { id: "urska", name: "Urška Premk", role: "" },
] as const

export type SignatoryId = (typeof SIGNATORIES)[number]["id"]

export const DEFAULT_SIGNATORY: SignatoryId = "nejc"

export function signatoryById(id: string | undefined) {
  return SIGNATORIES.find((item) => item.id === id) ?? SIGNATORIES[0]
}
