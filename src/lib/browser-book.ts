import type { AccountFormula, AccountRow } from "@/lib/account-map"
import { mergeFormulas } from "@/lib/account-map"
import { keepNewestByPeriod, samePeriod } from "@/lib/archive-period"
import { clientKey, normalizeClientName, sameClient, SAMPLE_CLIENT } from "@/lib/clients"
import { parseLegalForm, type LegalForm } from "@/lib/legal-form"
import type { Statement } from "@/lib/trial"

export const REGISTRY_DATABASE = "bilance-stranke"

export type ClientDraft = {
  statement: Statement
  pdf: ArrayBuffer
  pdfName: string
  konti: AccountRow[]
  besedilo?: string
  savedAt: string
}

export type StoredPeriod = {
  id: string
  savedAt: string
  company: string
  period: string
  currentDate: string
  sourceName: string
  forms: string[]
  statement: Statement
}

type ClientRow = {
  key: string
  name: string
  createdAt: string
  legalForm?: LegalForm
}

export function clientDatabaseName(company: string): string {
  return `bilance-${clientKey(company)}`
}

export async function listStoredClients(): Promise<string[]> {
  const db = await openRegistry()
  const rows = await getAll<ClientRow>(db, "stranke")
  db.close()
  return rows.map((row) => row.name).filter((name) => name && !sameClient(name, SAMPLE_CLIENT))
}

export async function rememberStoredClient(name: string, legalForm?: LegalForm | null): Promise<string> {
  const clean = normalizeClientName(name)
  if (!clean || sameClient(clean, SAMPLE_CLIENT)) return SAMPLE_CLIENT
  const db = await openRegistry()
  const rows = await getAll<ClientRow>(db, "stranke")
  const existing = rows.find((row) => sameClient(row.name, clean))
  const form = parseLegalForm(legalForm)
  if (!existing) {
    await put(db, "stranke", {
      key: clientKey(clean),
      name: clean,
      createdAt: new Date().toISOString(),
      ...(form ? { legalForm: form } : {}),
    })
  } else if (form && existing.legalForm !== form) {
    await put(db, "stranke", { ...existing, legalForm: form })
  }
  db.close()
  const book = await openClient(existing?.name ?? clean)
  book.close()
  return existing?.name ?? clean
}

export async function readStoredLegalForm(company: string): Promise<LegalForm | null> {
  if (!company || sameClient(company, SAMPLE_CLIENT)) return null
  const db = await openRegistry()
  const rows = await getAll<ClientRow>(db, "stranke")
  db.close()
  const existing = rows.find((row) => sameClient(row.name, company))
  return parseLegalForm(existing?.legalForm)
}

export async function readStoredFormulas(company: string): Promise<AccountFormula[]> {
  if (!company || sameClient(company, SAMPLE_CLIENT)) return []
  const db = await openClient(company)
  const formulas = (await get<AccountFormula[]>(db, "formule", "vse")) ?? []
  db.close()
  return formulas
}

export async function writeStoredFormulas(company: string, incoming: AccountFormula[]): Promise<AccountFormula[]> {
  const name = await rememberStoredClient(company)
  if (sameClient(name, SAMPLE_CLIENT)) return []
  const db = await openClient(name)
  const current = (await get<AccountFormula[]>(db, "formule", "vse")) ?? []
  const merged = mergeFormulas(current, incoming)
  await put(db, "formule", merged, "vse")
  db.close()
  return merged
}

/** Zapiše celoten zemljevid stranke, tudi ko se formula umakne. */
export async function saveStoredFormulas(company: string, formule: AccountFormula[]): Promise<AccountFormula[]> {
  const name = await rememberStoredClient(company)
  if (sameClient(name, SAMPLE_CLIENT)) return []
  const clean = mergeFormulas([], formule)
  const db = await openClient(name)
  await put(db, "formule", clean, "vse")
  db.close()
  return clean
}

export async function saveDraft(company: string, draft: Omit<ClientDraft, "savedAt">): Promise<void> {
  const name = await rememberStoredClient(company)
  if (sameClient(name, SAMPLE_CLIENT)) return
  const db = await openClient(name)
  await put(db, "osnutek", { ...draft, pdf: draft.pdf.slice(0), savedAt: new Date().toISOString() }, "zadnji")
  db.close()
}

export type LastPlace = {
  company: string
  phase: "primer" | "osnutek" | "arhiv"
  archiveId?: string
}

const LAST_PLACE_KEY = "zadnja"

export async function readLastPlace(): Promise<LastPlace | null> {
  const db = await openRegistry()
  const stored = await get<unknown>(db, "kazalo", LAST_PLACE_KEY)
  db.close()
  if (!stored || typeof stored !== "object") return null
  const record = stored as { company?: unknown; phase?: unknown; archiveId?: unknown }
  const company = typeof record.company === "string" ? normalizeClientName(record.company) : ""
  if (!company) return null
  const phase = record.phase === "arhiv" || record.phase === "osnutek" || record.phase === "primer" ? record.phase : "osnutek"
  const archiveId = typeof record.archiveId === "string" && record.archiveId ? record.archiveId : undefined
  return { company, phase, archiveId }
}

export async function writeLastPlace(place: LastPlace): Promise<void> {
  const company = normalizeClientName(place.company)
  if (!company) return
  const db = await openRegistry()
  await put(db, "kazalo", { company, phase: place.phase, archiveId: place.archiveId }, LAST_PLACE_KEY)
  db.close()
}

export async function readDraft(company: string): Promise<ClientDraft | null> {
  if (!company || sameClient(company, SAMPLE_CLIENT)) return null
  const db = await openClient(company)
  const draft = await get<ClientDraft>(db, "osnutek", "zadnji")
  db.close()
  return draft
}

/** Obdrži družbo in izvor shranjenega zapisa. Obdobje in zneski pridejo iz popravljene bilance. */
export function pinStoredStatement(
  period: Pick<StoredPeriod, "company" | "sourceName">,
  statement: Statement,
): Statement {
  return {
    ...statement,
    company: period.company,
    sourceName: period.sourceName,
  }
}

export async function updateStoredPeriod(id: string, statement: Statement, pdf?: ArrayBuffer): Promise<StoredPeriod | null> {
  if (!id) return null
  const registry = await openRegistry()
  const company = await get<string>(registry, "kazalo", id)
  registry.close()
  if (!company || typeof company !== "string") return null
  return replaceStoredPeriod(company, id, statement, pdf)
}

async function replaceStoredPeriod(
  company: string,
  id: string,
  statement: Statement,
  pdf?: ArrayBuffer,
): Promise<StoredPeriod | null> {
  const db = await openClient(company)
  const period = await get<StoredPeriod>(db, "obdobja", id)
  if (!period) {
    db.close()
    return null
  }
  const pinned = pinStoredStatement(period, statement)
  const sourceName = pdf ? statement.sourceName || period.sourceName : pinned.sourceName
  const next: StoredPeriod = {
    ...period,
    savedAt: new Date().toISOString(),
    period: pinned.period,
    currentDate: pinned.currentDate,
    sourceName,
    statement: { ...pinned, sourceName },
  }
  await put(db, "obdobja", next)
  if (pdf) await put(db, "pdf", pdf.slice(0), id)
  db.close()
  return next
}

export async function saveStoredPeriod(
  statement: Statement,
  pdf: ArrayBuffer,
  forms: string[],
  openId?: string,
): Promise<StoredPeriod> {
  const name = await rememberStoredClient(statement.company)
  const db = await openClient(name)
  const existing = await getAll<StoredPeriod>(db, "obdobja")
  db.close()
  const matches = existing.filter((item) => samePeriod(item, { company: name, period: statement.period }))
  const open = openId ? existing.find((item) => item.id === openId) : undefined
  const openIsThisPeriod = open ? matches.some((item) => item.id === open.id) : false
  const target = (openIsThisPeriod ? open : undefined) ?? keepNewestByPeriod(matches).kept[0] ?? open
  if (target) {
    const registry = await openRegistry()
    await put(registry, "kazalo", target.company || name, target.id)
    registry.close()
    for (const old of matches) {
      if (old.id !== target.id) await removeStoredPeriod(name, old.id)
    }
    const saved = await replaceStoredPeriod(name, target.id, { ...statement, company: target.company || name }, pdf)
    if (saved) {
      const replaced = matches.map((item) => item.id)
      if (openId && openId !== saved.id) replaced.push(openId)
      await pointLastPlaceAt(saved.id, replaced)
      return saved.forms?.length ? saved : { ...saved, forms }
    }
  }
  const sourceName = statement.sourceName || "bruto-bilanca.pdf"
  const period: StoredPeriod = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    company: name,
    period: statement.period,
    currentDate: statement.currentDate,
    sourceName,
    forms,
    statement: { ...statement, company: name, sourceName },
  }
  const book = await openClient(name)
  await put(book, "obdobja", period)
  await put(book, "pdf", pdf.slice(0), period.id)
  book.close()
  const registry = await openRegistry()
  await put(registry, "kazalo", name, period.id)
  registry.close()
  return period
}

export async function listStoredPeriods(): Promise<StoredPeriod[]> {
  const names = await listStoredClients()
  const periods: StoredPeriod[] = []
  const dropped: StoredPeriod[] = []
  for (const name of names) {
    const db = await openClient(name)
    const stored = await getAll<StoredPeriod>(db, "obdobja")
    const { kept, dropped: older } = keepNewestByPeriod(stored)
    for (const old of older) {
      await del(db, "obdobja", old.id)
      await del(db, "pdf", old.id)
      dropped.push(old)
    }
    db.close()
    periods.push(...kept)
  }
  if (dropped.length > 0) {
    const registry = await openRegistry()
    for (const old of dropped) await del(registry, "kazalo", old.id)
    registry.close()
    const place = await readLastPlace()
    if (place?.archiveId && dropped.some((old) => old.id === place.archiveId)) {
      const gone = dropped.find((old) => old.id === place.archiveId)
      const winner = gone ? periods.find((item) => samePeriod(item, gone)) : undefined
      if (winner) await writeLastPlace({ ...place, phase: "arhiv", archiveId: winner.id })
    }
  }
  return periods.sort((left, right) => right.savedAt.localeCompare(left.savedAt))
}

async function removeStoredPeriod(company: string, id: string): Promise<void> {
  const db = await openClient(company)
  await del(db, "obdobja", id)
  await del(db, "pdf", id)
  db.close()
  const registry = await openRegistry()
  await del(registry, "kazalo", id)
  registry.close()
}

async function pointLastPlaceAt(id: string, replacedIds: string[]): Promise<void> {
  const place = await readLastPlace()
  if (!place?.archiveId || place.archiveId === id) return
  if (!replacedIds.includes(place.archiveId)) return
  await writeLastPlace({ ...place, phase: "arhiv", archiveId: id })
}

export async function readStoredPeriod(id: string): Promise<{ statement: Statement; pdf: ArrayBuffer; sourceName: string } | null> {
  const registry = await openRegistry()
  const company = await get<string>(registry, "kazalo", id)
  registry.close()
  if (!company) return null
  const db = await openClient(company)
  const period = await get<StoredPeriod>(db, "obdobja", id)
  const pdf = await get<ArrayBuffer>(db, "pdf", id)
  db.close()
  if (!period || !pdf) return null
  return { statement: period.statement, pdf, sourceName: period.sourceName }
}

function openRegistry(): Promise<IDBDatabase> {
  return openDatabase(REGISTRY_DATABASE, 1, (db) => {
    if (!db.objectStoreNames.contains("stranke")) db.createObjectStore("stranke", { keyPath: "key" })
    if (!db.objectStoreNames.contains("kazalo")) db.createObjectStore("kazalo")
  })
}

function openClient(company: string): Promise<IDBDatabase> {
  return openDatabase(clientDatabaseName(company), 2, (db) => {
    if (!db.objectStoreNames.contains("formule")) db.createObjectStore("formule")
    if (!db.objectStoreNames.contains("obdobja")) db.createObjectStore("obdobja", { keyPath: "id" })
    if (!db.objectStoreNames.contains("pdf")) db.createObjectStore("pdf")
    if (!db.objectStoreNames.contains("osnutek")) db.createObjectStore("osnutek")
    if (!db.objectStoreNames.contains("kontrola")) db.createObjectStore("kontrola")
  })
}

export function checkMark(obrazec: "bilanca" | "izkaz", aop: string): string {
  return `${obrazec}:${aop}`
}

export async function readChecks(company: string, period: string): Promise<string[]> {
  if (!company || !period) return []
  const db = await openClient(company)
  const marks = (await get<unknown>(db, "kontrola", period)) ?? []
  db.close()
  return Array.isArray(marks) ? marks.filter((mark): mark is string => typeof mark === "string") : []
}

export async function writeChecks(company: string, period: string, marks: string[]): Promise<void> {
  if (!company || !period) return
  const db = await openClient(company)
  await put(db, "kontrola", marks, period)
  db.close()
}

function openDatabase(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => upgrade(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Baze stranke ni bilo mogoče odpreti."))
  })
}

function put(db: IDBDatabase, store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  return run(db, store, "readwrite", (objectStore) => objectStore.put(value, key)).then(() => undefined)
}

function get<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | null> {
  return run(db, store, "readonly", (objectStore) => objectStore.get(key)).then((value) => (value ?? null) as T | null)
}

function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return run(db, store, "readonly", (objectStore) => objectStore.getAll()).then((value) => (value ?? []) as T[])
}

function del(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return run(db, store, "readwrite", (objectStore) => objectStore.delete(key)).then(() => undefined)
}

function run<T>(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  action: (objectStore: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const request = action(transaction.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Baze stranke ni bilo mogoče prebrati."))
    transaction.onerror = () => reject(transaction.error ?? new Error("Baze stranke ni bilo mogoče zapisati."))
  })
}
