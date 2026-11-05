import { loan045Key, type LoanAnalyticalLine } from "@/lib/zavihek-045"

const DATABASE_045 = "bilance-zavihek-045"
const DATABASE_076 = "bilance-zavihek-076"
const STORE = "posnetki"

export type Loan045Record = {
  key: string
  company: string
  period: string
  lines: LoanAnalyticalLine[]
  imageName: string
  imageType: string
  image: ArrayBuffer
  savedAt: string
}

/** Posnetek zavihka 045 ostane pri odprti stranki in odprtem obdobju. */
export function readLoan045(company: string, period: string): Promise<Loan045Record | null> {
  return readLoan(DATABASE_045, company, period)
}

export function writeLoan045(
  company: string,
  period: string,
  lines: LoanAnalyticalLine[],
  image: { name: string; type: string; bytes: ArrayBuffer },
): Promise<void> {
  return writeLoan(DATABASE_045, company, period, lines, image)
}

/** Posnetek zavihka 076 ostane pri odprti stranki in odprtem obdobju. Drugo obdobje ima svoj zapis. */
export function readLoan076(company: string, period: string): Promise<Loan045Record | null> {
  return readLoan(DATABASE_076, company, period)
}

export function writeLoan076(
  company: string,
  period: string,
  lines: LoanAnalyticalLine[],
  image: { name: string; type: string; bytes: ArrayBuffer },
): Promise<void> {
  return writeLoan(DATABASE_076, company, period, lines, image)
}

function readLoan(database: string, company: string, period: string): Promise<Loan045Record | null> {
  const key = loan045Key(company, period)
  if (!company.trim() || !period.trim() || typeof indexedDB === "undefined") return Promise.resolve(null)
  return openStore(database).then(async (db) => {
    const record = await get<Loan045Record>(db, key)
    db.close()
    if (!record || !Array.isArray(record.lines)) return null
    return record
  })
}

function writeLoan(
  database: string,
  company: string,
  period: string,
  lines: LoanAnalyticalLine[],
  image: { name: string; type: string; bytes: ArrayBuffer },
): Promise<void> {
  const key = loan045Key(company, period)
  if (!company.trim() || !period.trim() || typeof indexedDB === "undefined") return Promise.resolve()
  const record: Loan045Record = {
    key,
    company: company.trim(),
    period: period.trim(),
    lines,
    imageName: image.name,
    imageType: image.type,
    image: image.bytes,
    savedAt: new Date().toISOString(),
  }
  return openStore(database).then(async (db) => {
    await put(db, record)
    db.close()
  })
}

function openStore(database: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Posnetka ni bilo mogoče odpreti."))
  })
}

function put(db: IDBDatabase, value: Loan045Record): Promise<void> {
  return run(db, "readwrite", (store) => store.put(value)).then(() => undefined)
}

function get<T>(db: IDBDatabase, key: IDBValidKey): Promise<T | null> {
  return run(db, "readonly", (store) => store.get(key)).then((value) => (value ?? null) as T | null)
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const request = action(transaction.objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Posnetka ni bilo mogoče prebrati."))
  })
}
