import type { Statement } from "@/lib/trial"

export type ArchiveMeta = {
  id: string
  savedAt: string
  company: string
  period: string
  currentDate: string
  sourceName: string
}

type ArchiveRecord = ArchiveMeta & {
  statement: Statement
}

type PdfRecord = {
  id: string
  pdf: ArrayBuffer
}

const DB_NAME = "bilance"
const DB_VERSION = 1
const RECORDS = "arhiv"
const FILES = "bruto"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS, { keyPath: "id" })
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Arhiva se ni odprla."))
  })
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Arhiva ni odgovorila."))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Arhiva ni bila shranjena."))
    transaction.onabort = () => reject(transaction.error ?? new Error("Shranjevanje v arhiv je prekinjeno."))
  })
}

export function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString("sl-SI", { dateStyle: "medium", timeStyle: "short" })
}

export async function saveArchive(statement: Statement, pdf: ArrayBuffer): Promise<ArchiveMeta> {
  const record: ArchiveRecord = {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    company: statement.company,
    period: statement.period,
    currentDate: statement.currentDate,
    sourceName: statement.sourceName,
    statement,
  }
  const db = await openDb()
  try {
    const transaction = db.transaction([RECORDS, FILES], "readwrite")
    transaction.objectStore(RECORDS).put(record)
    transaction.objectStore(FILES).put({ id: record.id, pdf } satisfies PdfRecord)
    await transactionDone(transaction)
    return {
      id: record.id,
      savedAt: record.savedAt,
      company: record.company,
      period: record.period,
      currentDate: record.currentDate,
      sourceName: record.sourceName,
    }
  } finally {
    db.close()
  }
}

export async function listArchive(): Promise<ArchiveMeta[]> {
  const db = await openDb()
  try {
    const records = await requestToPromise(db.transaction(RECORDS).objectStore(RECORDS).getAll() as IDBRequest<ArchiveRecord[]>)
    return records
      .map(({ id, savedAt, company, period, currentDate, sourceName }) => ({
        id,
        savedAt,
        company,
        period,
        currentDate,
        sourceName,
      }))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  } finally {
    db.close()
  }
}

export async function readArchive(id: string): Promise<{ statement: Statement; pdf: ArrayBuffer; sourceName: string }> {
  const db = await openDb()
  try {
    const transaction = db.transaction([RECORDS, FILES])
    const record = await requestToPromise(transaction.objectStore(RECORDS).get(id) as IDBRequest<ArchiveRecord | undefined>)
    const file = await requestToPromise(transaction.objectStore(FILES).get(id) as IDBRequest<PdfRecord | undefined>)
    if (!record || !file) throw new Error("Te končne bilance v arhivu ni več.")
    return { statement: record.statement, pdf: file.pdf, sourceName: record.sourceName }
  } finally {
    db.close()
  }
}
