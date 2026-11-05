import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

/**
 * Tesseract.js `createWorker` odpre nit in čaka na sporočilo, ki na strežniku
 * včasih nikoli ne pride. Jedro zato teče v istem procesu. Besedilo bere
 * slovenščina in angleščina, številke in davčne pa angleški model, kot prej.
 */
const require = createRequire(path.join(process.cwd(), "package.json"))

const LANG_PATH = path.join(process.cwd(), "data/tessdata")
const CACHE_PATH = path.join(os.tmpdir(), "bilance-tess")
const CORE_FILE = path.join(process.cwd(), "node_modules/tesseract.js-core/tesseract-core-simd-lstm.js")
const CORE_FALLBACK = path.join(process.cwd(), "node_modules/tesseract.js-core/tesseract-core-lstm.js")
const WORKER_SCRIPT = path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/index.js")
const GUNZIP = path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/gunzip.js")
const CACHE = path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/cache.js")
const CIRCULARIZE = path.join(process.cwd(), "node_modules/tesseract.js/src/utils/circularize.js")

const STEP_MS = 12_000
export const OCR_DEADLINE_MS = 18_000

export const PSM = {
  SINGLE_BLOCK: "6",
  SINGLE_LINE: "7",
} as const

export const TEXT_ONLY = {
  text: true,
  blocks: false,
  hocr: false,
  tsv: false,
  box: false,
  unlv: false,
  osd: false,
  pdf: false,
} as const

export const LINES_ONLY = {
  text: true,
  blocks: true,
  hocr: false,
  tsv: false,
  box: false,
  unlv: false,
  osd: false,
  pdf: false,
} as const

export const TSV_ONLY = {
  text: false,
  blocks: false,
  hocr: false,
  tsv: true,
  box: false,
  unlv: false,
  osd: false,
  pdf: false,
} as const

type Output = {
  text: boolean
  blocks: boolean
  hocr: boolean
  tsv: boolean
  box: boolean
  unlv: boolean
  osd: boolean
  pdf: boolean
}

type Bbox = { x0: number; y0: number; x1: number; y1: number }

export type OcrPage = {
  text: string | null
  tsv: string | null
  lines: Array<{ words: Array<{ text: string | null; bbox: Bbox }> }> | null
  words: Array<{ text: string | null; bbox: Bbox }> | null
}

type Packet = {
  workerId: string
  jobId: string
  action: string
  payload?: unknown
}

type Reply = {
  status: string
  data?: unknown
}

type WorkerModule = {
  setAdapter: (adapter: unknown) => void
  dispatchHandlers: (packet: Packet, send: (message: Reply) => void) => void
}

type Engine = {
  langs: string
  worker: WorkerModule
  started: boolean
  jobSeq: number
}

let chain: Promise<unknown> = Promise.resolve()
const engines = new Map<string, Engine>()

function loadFactory(file: string): ((options: unknown) => Promise<unknown>) | null {
  try {
    return require(file) as (options: unknown) => Promise<unknown>
  } catch {
    return null
  }
}

function freshWorker(): WorkerModule {
  const resolved = require.resolve(WORKER_SCRIPT)
  delete require.cache[resolved]
  return require(resolved) as WorkerModule
}

function engineFor(langs: string): Engine {
  const existing = engines.get(langs)
  if (existing) return existing
  mkdirSync(CACHE_PATH, { recursive: true })
  const worker = freshWorker()
  const gunzip = require(GUNZIP) as (data: Uint8Array) => Uint8Array
  const cache = require(CACHE) as Record<string, unknown>
  worker.setAdapter({
    ...cache,
    gunzip,
    fetch: async (url: string) => {
      throw new Error(`Jezikovnih podatkov ni na strežniku (${url}).`)
    },
    getCore: async (_lstmOnly: boolean, _corePath: string, res: { progress?: (status: unknown) => void }) => {
      res.progress?.({ status: "loading tesseract core", progress: 1 })
      const primary = loadFactory(CORE_FILE) ?? loadFactory(CORE_FALLBACK)
      const secondary = loadFactory(CORE_FALLBACK)
      if (!primary) throw new Error("Bralnik besedila ni na strežniku.")
      return (options: unknown) =>
        new Promise((resolve, reject) => {
          const run = (
            factory: (options: unknown) => Promise<unknown>,
            next?: ((options: unknown) => Promise<unknown>) | null,
          ) => {
            Promise.resolve()
              .then(() => factory(options))
              .then(resolve, () => {
                if (next && next !== factory) run(next, null)
                else reject(new Error("Branje posnetka ni uspelo."))
              })
          }
          run(primary, secondary)
        })
    },
  })
  const created = { langs, worker, started: false, jobSeq: 0 }
  engines.set(langs, created)
  return created
}

function dispatch(engine: Engine, action: string, payload?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error("Branje posnetka se ni končalo."))
    }, STEP_MS)
    const finish = (error: Error | null, value?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    try {
      engine.worker.dispatchHandlers(
        { workerId: engine.langs, jobId: String(++engine.jobSeq), action, payload },
        (message) => {
          if (message.status === "progress") return
          if (message.status === "resolve") finish(null, message.data)
          else finish(new Error(typeof message.data === "string" ? message.data : "Branje posnetka ni uspelo."))
        },
      )
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Branje posnetka ni uspelo."))
    }
  })
}

async function ensureReady(engine: Engine): Promise<void> {
  if (engine.started) return
  engine.started = true
  try {
    await dispatch(engine, "load", { options: { lstmOnly: true, logging: false } })
    await dispatch(engine, "loadLanguage", {
      langs: engine.langs,
      options: {
        langPath: LANG_PATH,
        cachePath: CACHE_PATH,
        gzip: false,
        cacheMethod: "write",
        lstmOnly: true,
      },
    })
    await dispatch(engine, "initialize", { langs: engine.langs, oem: 1, config: {} })
  } catch (error) {
    engine.started = false
    throw error
  }
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job)
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/** Eno branje. Prazen whitelist pomeni vse znake. Številčni whitelist bere angleški model. */
export function recognizeImage(
  image: Buffer | Uint8Array,
  parameters: Record<string, string>,
  output: Output,
  langs: "slv+eng" | "eng" = "slv+eng",
): Promise<OcrPage> {
  const bytes = new Uint8Array(image.byteLength)
  bytes.set(image)
  const engine = engineFor(langs)
  return enqueue(async () => {
    await ensureReady(engine)
    await dispatch(engine, "setParameters", {
      params: {
        tessedit_char_whitelist: "",
        preserve_interword_spaces: "1",
        ...parameters,
      },
    })
    const page = await dispatch(engine, "recognize", { image: bytes, options: {}, output })
    const circularize = require(CIRCULARIZE) as (page: unknown) => OcrPage
    return circularize(page)
  })
}

export async function finishOcr(): Promise<void> {
  const pending = [...engines.values()]
  engines.clear()
  chain = Promise.resolve()
  for (const engine of pending) {
    if (!engine.started) continue
    try {
      await dispatch(engine, "terminate")
    } catch {
      /* jedro je že končano */
    }
  }
}

/** Png, jpg in webp po vsebini, tudi če odložišče ne napiše vrste datoteke. */
export function isScreenshotFile(bytes: Uint8Array, type: string, name: string): boolean {
  if (isPng(bytes) || isJpeg(bytes) || isWebp(bytes)) return true
  const cleanType = type.toLowerCase()
  const cleanName = name.toLowerCase()
  return (
    cleanType === "image/png" ||
    cleanType === "image/jpeg" ||
    cleanType === "image/webp" ||
    /\.(png|jpe?g|webp)$/.test(cleanName)
  )
}

/** Kratek slovenski razlog. Manjkajoča knjižnica ne ostane skrita za splošnim stavkom. */
export function screenshotReadError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : ""
  if (!message) return fallback
  if (/cannot find module|module_not_found|bmp-js/i.test(message)) {
    return "Na strežniku manjka bralnik besedila."
  }
  if (/error attempting to read image/i.test(message)) return "Posnetka ni bilo mogoče odpreti."
  if (/unsupported image format|input buffer contains/i.test(message)) return "Te oblike slike ne znam prebrati."
  if (
    message.length <= 180 &&
    !/node_modules|\/workspace\/|at \//.test(message) &&
    /[čšžČŠŽ]|slik|posnet|bral|tabel|strežnik|končal|poskus|manjka/i.test(message)
  ) {
    return message
  }
  return fallback
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
}

/** Celoten klic se prekine, tudi če se posamezno branje ne vrne. */
export function withOcrDeadline<T>(work: Promise<T>, ms = OCR_DEADLINE_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Branje se ni končalo. Poskusite znova."))
    }, ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
