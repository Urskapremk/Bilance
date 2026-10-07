export const LEGAL_FORMS = ["doo", "drustvo", "zavod", "sp"] as const

export type LegalForm = (typeof LEGAL_FORMS)[number]

export type LegalFormOption = {
  id: LegalForm
  label: string
  printName: string
  scheme: string
  hint: string
}

export const LEGAL_FORM_OPTIONS: LegalFormOption[] = [
  {
    id: "doo",
    label: "d.o.o.",
    printName: "Gospodarska družba",
    scheme: "gospodarske družbe",
    hint: "Kapital z osnovnim kapitalom, rezervami in čistim dobičkom.",
  },
  {
    id: "drustvo",
    label: "Društvo",
    printName: "Društvo",
    scheme: "društvo",
    hint: "Društveni sklad, revalorizacijske rezerve in rezerve po pošteni vrednosti.",
  },
  {
    id: "zavod",
    label: "Zavod",
    printName: "Zavod",
    scheme: "zavod",
    hint: "Lastni viri z ustanovitvenim vložkom in presežkom prihodkov.",
  },
  {
    id: "sp",
    label: "Samostojni podjetnik",
    printName: "Samostojni podjetnik",
    scheme: "samostojnega podjetnika",
    hint: "Podjetnikov kapital, pritoki in odtoki ter podjetnikov dohodek.",
  },
]

export function parseLegalForm(value: unknown): LegalForm | null {
  return LEGAL_FORMS.find((form) => form === value) ?? null
}

export function legalFormOption(form: LegalForm): LegalFormOption {
  return LEGAL_FORM_OPTIONS.find((option) => option.id === form) ?? LEGAL_FORM_OPTIONS[0]
}

/** Iz naziva. Brez oznake, na primer pri osebnem imenu, ostane prazno, da obliko izberete vi. */
export function inferLegalForm(name: string): LegalForm | null {
  const text = name.toLocaleLowerCase("sl")
  if (/(?:^|[^a-zčšž])d\s*\.\s*o\s*\.\s*o/.test(text)) return "doo"
  if (/(?:^|[^a-zčšž])d\s*\.\s*d\b/.test(text)) return "doo"
  if (/(?:^|[^a-zčšž])k\s*\.\s*d\b/.test(text)) return "doo"
  if (/(?:^|[^a-zčšž])d\s*\.\s*n\s*\.\s*o/.test(text)) return "doo"
  if (text.includes("društvo") || text.includes("drustvo")) return "drustvo"
  if (text.includes("zavod")) return "zavod"
  if (text.includes("samostojni") || /(?:^|[^a-zčšž])s\s*\.\s*p\b/.test(text)) return "sp"
  return null
}

export function legalFormOf(statement: { legalForm?: string | null; company?: string }): LegalForm {
  return parseLegalForm(statement.legalForm) ?? inferLegalForm(statement.company ?? "") ?? "doo"
}

/** Poslovni izid, ki se prenese v bilanco stanja. Pri s.p. sta to 182 in 183. */
export function resultAops(form: LegalForm): { profit: string; loss: string } {
  if (form === "sp") return { profit: "182", loss: "183" }
  return { profit: "186", loss: "187" }
}

export function periodResultCopy(form: LegalForm, loss: boolean): string {
  if (form === "sp") return loss ? "Negativni poslovni izid" : "Podjetnikov dohodek"
  if (form === "drustvo" || form === "zavod") return loss ? "Čisti presežek odhodkov" : "Čisti presežek prihodkov"
  return loss ? "Čista izguba obdobja" : "Čisti dobiček obdobja"
}
