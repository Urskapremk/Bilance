import { statementFileStamp } from "@/lib/bank-form"

/** Banke, za katere znamo pripraviti razkritja. Seznam se daljša, ko pride nova predloga. */
export const DISCLOSURE_BANKS = [{ id: "dh", name: "Delavska hranilnica" }] as const

export type DisclosureBankId = (typeof DISCLOSURE_BANKS)[number]["id"]

export function isDisclosureBank(id: string | null | undefined): id is DisclosureBankId {
  return DISCLOSURE_BANKS.some((bank) => bank.id === id)
}

/** Ime datoteke vsebuje stranko in obdobje, npr. GRAFAM_d.o.o._Razkritja_Delavska_hranilnica_01.01.2026-31.12.2026.xlsx. */
export function disclosureWorkbookName(company: string, period: string, currentDate: string): string {
  const stamp = statementFileStamp(period, currentDate)
  const safe = company.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_") || "stranka"
  return stamp
    ? `${safe}_Razkritja_Delavska_hranilnica_${stamp}.xlsx`
    : `${safe}_Razkritja_Delavska_hranilnica.xlsx`
}
