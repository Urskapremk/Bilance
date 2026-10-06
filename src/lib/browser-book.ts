import type { AccountFormula, AccountRow } from "@/lib/account-map"
import { mergeFormulas } from "@/lib/account-map"
import { clientKey, normalizeClientName, sameClient, SAMPLE_CLIENT } from "@/lib/clients"
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

export async function rememberStoredClient(name: string): Promise<string> {
  const clean = normalizeClientName(name)
  if (!clean || sameClient(clean, SAMPLE_CLIENT)) return SAMPLE_CLIENT
  const db = await openRegistry()
  const rows = await getAll<ClientRow>(db, "stranke")
  const existing = rows.find((row) => sameClient(row.name, clean))
  if (!existing) {
    await put(db, "stranke", { key: clientKey(clean), name: clean, createdAt: new Date().toISOString() })
  }
  db.close()
  const book = await openClient(existing?.name ?? clean)
  book.close()
  return existing?.name ?? clean
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

export async function saveStoredPeriod(statement: Statement, pdf: ArrayBuffer, forms: string[]): Promise<StoredPeriod> {
  const name = await rememberStoredClient(statement.company)
  const period: StoredPeriod = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    company: name,
    period: statement.period,
    currentDate: statement.currentDate,
    sourceName: statement.sourceName || "bruto-bilanca.pdf",
    forms,
    statement: { ...statement, company: name, sourceName: statement.sourceName || "bruto-bilanca.pdf" },
  }
  const db = await openClient(name)
  await put(db, "obdobja", period)
  await put(db, "pdf", pdf.slice(0), period.id)
  db.close()
  const registry = await openRegistry()
  await put(registry, "kazalo", name, period.id)
  registry.close()
  return period
}

export async function listStoredPeriods(): Promise<StoredPeriod[]> {
  const names = await listStoredClients()
  const periods: StoredPeriod[] = []
  for (const name of names) {
    const db = await openClient(name)
    periods.push(...(await getAll<StoredPeriod>(db, "obdobja")))
    db.close()
  }
  return periods.sort((left, right) => right.savedAt.localeCompare(left.savedAt))
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
  return openDatabase(clientDatabaseName(company), 1, (db) => {
    if (!db.objectStoreNames.contains("formule")) db.createObjectStore("formule")
    if (!db.objectStoreNames.contains("obdobja")) db.createObjectStore("obdobja", { keyPath: "id" })
    if (!db.objectStoreNames.contains("pdf")) db.createObjectStore("pdf")
    if (!db.objectStoreNames.contains("osnutek")) db.createObjectStore("osnutek")
  })
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
