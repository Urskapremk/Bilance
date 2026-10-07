import { attachPublicFiling, grafamPublic2025 } from "@/lib/ajpes-public"
import type { Statement } from "@/lib/trial"

export const SAMPLE_CLIENT = "GRAFAM d.o.o."

export function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

export function sameClient(left: string, right: string): boolean {
  return normalizeClientName(left).localeCompare(normalizeClientName(right), "sl", { sensitivity: "accent" }) === 0
}

export function clientKey(name: string): string {
  return normalizeClientName(name).toLocaleLowerCase("sl")
}

export function mergeClients(names: Iterable<string>): string[] {
  const unique: string[] = []
  for (const name of [SAMPLE_CLIENT, ...names]) {
    const clean = normalizeClientName(name)
    if (!clean) continue
    if (unique.some((item) => sameClient(item, clean))) continue
    unique.push(sameClient(clean, SAMPLE_CLIENT) ? SAMPLE_CLIENT : clean)
  }
  const [sample, ...rest] = unique
  rest.sort((left, right) => left.localeCompare(right, "sl"))
  return sample ? [sample, ...rest] : rest
}

export function filterClients(names: string[], query: string): string[] {
  const needle = normalizeClientName(query).toLocaleLowerCase("sl")
  if (!needle) return names
  return names.filter((name) => name.toLocaleLowerCase("sl").includes(needle))
}

export function statementForClient(statement: Statement, company: string): Statement {
  const requested = normalizeClientName(company)
  if (!requested) return statement
  const name = sameClient(requested, statement.company) ? statement.company : requested
  if (name === statement.company) return attachPublicFiling(statement)
  const notes = statement.notes.filter((note) => note !== grafamPublic2025.note)
  return attachPublicFiling({
    company: name,
    period: statement.period,
    currentDate: statement.currentDate,
    previousDate: statement.previousDate,
    sourceName: statement.sourceName,
    balance: statement.balance,
    income: statement.income,
    notes,
    warnings: statement.warnings,
    signatory: statement.signatory,
    legalForm: statement.legalForm,
  })
}
