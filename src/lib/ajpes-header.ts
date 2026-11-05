/**
 * Osnovni podatki z naslovnice izdelanega obrazca AJPES.
 * Vpišejo se samo polja, ki so na obrazcu prebrana.
 * Prazno polje pomeni, da ga obrazec nima.
 */

export type AjpesHeader = {
  name?: string
  seat?: string
  registration?: string
  taxNumber?: string
  director?: string
  /**
   * GD ali SP, kadar obrazec tako pove.
   * Prazen niz pomeni, da je vrsta navedena, a ni gospodarska družba ali s.p.
   */
  kind?: "GD" | "SP" | ""
  /** 1 mikro, 2 majhna, 3 srednja, 4 velika. */
  size?: number
  /** 1 MSRP, 2 SRS. */
  accounting?: number
  place?: string
  contact?: string
  phone?: string
  email?: string
}

const IDENTITY_KEYS = [
  "name",
  "seat",
  "registration",
  "taxNumber",
  "director",
  "place",
  "contact",
  "phone",
  "email",
] as const

export function parseAjpesHeader(text: string): AjpesHeader {
  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  const header: AjpesHeader = {}
  let contactEmail = ""
  let companyEmail = ""
  let pending: "name" | "seat" | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const next = lines[index + 1] ?? ""

    if (/^IME (?:PRAVNE OSEBE|DRUŽBE|PODJETNIKA|POSLOVNEGA SUBJEKTA)$/i.test(line)) {
      pending = "name"
      continue
    }
    if (/^SEDEŽ(?: PRAVNE OSEBE| DRUŽBE| PODJETNIKA| POSLOVNEGA SUBJEKTA)?$/i.test(line)) {
      pending = "seat"
      continue
    }

    const headed = line.match(/^ZASEBNEGA PRAVA:\s*(.+)$/i)
    if (headed?.[1] && pending) {
      const value = clean(headed[1])
      if (pending === "name") put(header, "name", value, true)
      if (pending === "seat") put(header, "seat", value, true)
      pending = null
      continue
    }

    if (pending && !isFieldLabel(line)) {
      const parts = splitIds(line)
      if (pending === "name") put(header, "name", parts.text, true)
      if (pending === "seat") put(header, "seat", parts.text, true)
      if (parts.registration) put(header, "registration", parts.registration, false)
      if (parts.taxNumber) put(header, "taxNumber", parts.taxNumber, false)
      pending = null
      continue
    }
    if (pending && isFieldLabel(line)) pending = null

    const registration = line.match(/^Matična številka(?!\s+pred)\s*:?\s*(\d{10})\b/i)
    if (registration?.[1]) put(header, "registration", registration[1], true)

    const tax = line.match(/^Davčna številka\s*:?\s*((?:SI[\s-]*)?\d{8})\b/i)
    if (tax?.[1]) put(header, "taxNumber", taxDigits(tax[1]), true)

    const named = line.match(/^Ime poslovnega subjekta\s*:?\s+(.+)$/i)
    if (named?.[1] && !/^mati[cč]na\s+številka/i.test(named[1])) {
      put(header, "name", clean(named[1]), true)
    } else if (/^Ime poslovnega subjekta\s*:?\s*(?:Matična številka\s*:?\s*\d{0,10})?\s*$/i.test(line)) {
      const onLabel = line.match(/(\d{10})\b/)
      if (onLabel?.[1]) put(header, "registration", onLabel[1], false)
      if (next && !isFieldLabel(next)) {
        const parts = splitIds(next)
        put(header, "name", parts.text, false)
        if (parts.registration) put(header, "registration", parts.registration, false)
        if (parts.taxNumber) put(header, "taxNumber", parts.taxNumber, false)
      }
    }

    const seated =
      line.match(/^Sedež(?: poslovnega subjekta)?(?: \([^)]*\))?\s*:\s+(.+)$/i) ??
      line.match(/^Sedež(?: poslovnega subjekta)? \([^)]*\)\s+(.+)$/i)
    if (seated?.[1] && !/^dav[cč]na\s+številka/i.test(seated[1])) {
      const parts = splitIds(seated[1])
      put(header, "seat", parts.text, true)
      if (parts.taxNumber) put(header, "taxNumber", parts.taxNumber, false)
    } else if (/^Sedež(?: poslovnega subjekta)?(?: \([^)]*\))?\s*:?\s*(?:Davčna številka\s*:?)?\s*$/i.test(line)) {
      const onLabel = line.match(/((?:SI[\s-]*)?\d{8})\b/i)
      if (onLabel?.[1]) put(header, "taxNumber", taxDigits(onLabel[1]), false)
      if (next && !isFieldLabel(next)) {
        const parts = splitIds(next)
        put(header, "seat", parts.text, false)
        if (parts.taxNumber) put(header, "taxNumber", parts.taxNumber, false)
      }
    }

    const kind = line.match(/^Vrsta(?: poslovnega subjekta)?\s*:?\s+(.+)$/i)
    if (kind?.[1] && header.kind === undefined) header.kind = mapKind(kind[1])

    if (/^Velikost\s*\(/i.test(line)) {
      const trailing = line.match(/:\s*([1-4])\s*$/)
      if (trailing?.[1]) put(header, "size", Number(trailing[1]), true)
      else {
        for (const look of [next, lines[index + 2] ?? ""]) {
          if (/^[1-4]$/.test(look)) {
            put(header, "size", Number(look), false)
            break
          }
          if (look && isFieldLabel(look)) break
        }
      }
    } else {
      const size = line.match(/^Velikost\s*:?\s*(.*)$/i)
      if (size) {
        const mapped = mapSize(size[1] ?? "")
        if (mapped) put(header, "size", mapped, true)
        else if (!size[1]?.trim() && /^[1-4]$/.test(next)) put(header, "size", Number(next), true)
      }
    }

    const accounting = line.match(/^(?:Računovodimo|Računovodski standard)\s*:?\s*(.*)$/i)
    if (accounting) {
      const mapped = mapAccounting(accounting[1] ?? "") || (!accounting[1]?.trim() ? mapAccounting(next) : undefined)
      if (mapped) put(header, "accounting", mapped, true)
    }

    const director = line.match(/^(?:Vodja (?:poslovnega subjekta|pravne osebe|družbe)|Zakoniti zastopnik)\s*:?\s*(.*)$/i)
    if (director) {
      const value = clean(director[1] ?? "")
      if (value && !isFieldLabel(value)) put(header, "director", value, true)
      else if (!value && next && !isFieldLabel(next)) put(header, "director", clean(next), true)
    }

    const place = line.match(/^Kraj\s*:?\s*(.*)$/i)
    if (place && !/^Kraj in datum/i.test(line)) {
      const value = clean(place[1] ?? "")
      if (isPlace(value)) put(header, "place", value, true)
      else if (!value && isPlace(next)) put(header, "place", clean(next), true)
    }

    const contact = line.match(/^Oseba,? odgovorna za sestavljanje bilance\s*:?\s*(.*)$/i)
    if (contact) {
      const value = clean(contact[1] ?? "")
      if (value && !isFieldLabel(value)) put(header, "contact", value, true)
      else if (!value && next && !isFieldLabel(next) && !next.includes("@")) put(header, "contact", clean(next), true)
    }

    if (/^Telefonska številka/i.test(line)) {
      const phone = phoneOn(line) || phoneOn(next)
      if (phone) put(header, "phone", phone, true)
    } else if (/^predložitvijo bilance:/i.test(line)) {
      const phone = phoneOn(line)
      if (phone) put(header, "phone", phone, true)
    }

    const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
    if (email && /kontaktne osebe|e-?naslov kontaktne/i.test(line)) contactEmail = contactEmail || email
    else if (email && /poslovnega subjekta/i.test(line) && !/uporabnika portala/i.test(line)) {
      companyEmail = companyEmail || email
    }
  }

  const email = contactEmail || companyEmail
  if (email) header.email = email
  return header
}

export function mergeAjpesHeader(previous: AjpesHeader | undefined, next: AjpesHeader): AjpesHeader | undefined {
  const merged: AjpesHeader = { ...previous }
  for (const key of IDENTITY_KEYS) {
    const value = next[key]
    if (value?.trim()) merged[key] = value.trim()
  }
  if (next.size) merged.size = next.size
  if (next.accounting) merged.accounting = next.accounting
  if (next.kind !== undefined) merged.kind = next.kind
  return hasAjpesHeader(merged) ? merged : undefined
}

export function hasAjpesHeader(header: AjpesHeader | undefined): boolean {
  if (!header) return false
  if (header.kind !== undefined) return true
  if (header.size || header.accounting) return true
  return IDENTITY_KEYS.some((key) => Boolean(header[key]?.trim()))
}

function put<K extends "name" | "seat" | "registration" | "taxNumber" | "director" | "place" | "contact" | "phone" | "size" | "accounting">(
  header: AjpesHeader,
  key: K,
  value: AjpesHeader[K] | undefined,
  overwrite: boolean,
) {
  if (value === undefined || value === "") return
  if (!overwrite && header[key]) return
  header[key] = value
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function isFieldLabel(line: string): boolean {
  return /^(?:mati[cč]na številka|dav[cč]na številka|ime poslovnega subjekta|ime pravne osebe|sedež|velikost|računovodimo|računovodski standard|vodja|zakoniti zastopnik|kraj(?: in datum)?|oseba|telefonska|elektronski naslov|e-naslov|enaslov|obdobje|vrsta|status|datum|pripravljeno|podatki iz|osnovni podatki|letno poročilo|zasebnega prava)\b/i.test(
    line,
  )
}

function taxDigits(raw: string): string {
  const digits = raw.replace(/^SI[\s-]*/i, "").replace(/\D/g, "")
  return digits.length === 8 ? digits : ""
}

function splitIds(line: string): { text: string; registration?: string; taxNumber?: string } {
  let text = clean(line)
  let taxNumber = ""
  let registration = ""
  text = text.replace(/\s*Davčna številka:\s*((?:SI[\s-]*)?\d{8})\s*$/i, (_, tax: string) => {
    taxNumber = taxDigits(tax)
    return ""
  })
  text = text.replace(/\s+(\d{10})\s*$/, (_, reg: string) => {
    registration = reg
    return ""
  })
  text = text.replace(/\s+((?:SI[\s-]*)?\d{8})\s*$/i, (_, tax: string) => {
    if (!taxNumber) taxNumber = taxDigits(tax)
    return ""
  })
  return {
    text: clean(text),
    registration: registration || undefined,
    taxNumber: taxNumber || undefined,
  }
}

function isPlace(value: string): boolean {
  const text = clean(value)
  if (!text || text.endsWith(":")) return false
  if (isFieldLabel(text)) return false
  if (/zastopnik|sestavljanje|datum|vodja|bilance/i.test(text)) return false
  return true
}

function mapKind(value: string): "GD" | "SP" | "" {
  const text = value.toLocaleLowerCase("sl")
  if (text.includes("gospodarska")) return "GD"
  if (text.includes("samostojni podjetnik") || /\bs\s*\.\s*p\b/.test(text)) return "SP"
  return ""
}

function mapSize(value: string): number | undefined {
  const text = value.toLocaleLowerCase("sl").trim()
  if (!text || text.startsWith("(")) return undefined
  if (/^[1-4]\b/.test(text)) return Number(text[0])
  if (text.includes("mikro")) return 1
  if (text.includes("majhn")) return 2
  if (text.includes("srednj")) return 3
  if (text.includes("velik")) return 4
  return undefined
}

function mapAccounting(value: string): number | undefined {
  const text = value.toLocaleUpperCase("sl")
  if (!text.trim()) return undefined
  if (text.includes("MSRP")) return 1
  if (/\bSRS\b/.test(text)) return 2
  return undefined
}

function phoneOn(line: string): string | undefined {
  const match = line.match(/(\+?\d[\d\s/()-]{5,}\d)/)
  if (!match?.[1]) return undefined
  const digits = match[1].replace(/\D/g, "")
  if (digits.length < 7 || digits.length > 15) return undefined
  if (/^\d{8}$/.test(digits) || /^\d{10}$/.test(digits)) return undefined
  return match[1].trim()
}
