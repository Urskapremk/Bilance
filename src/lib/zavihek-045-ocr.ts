import path from "node:path"

import { createWorker, PSM } from "tesseract.js"

import { parseLoanTsv, type LoanAnalyticalLine } from "@/lib/zavihek-045"

const LANG_PATH = path.join(process.cwd(), "data/tessdata")

let chain: Promise<unknown> = Promise.resolve()
let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null

/** Prebere tabelo kratkoročnih posojil s posnetka. Prazne vrstice ne nastanejo. */
export function recognizeLoanScreenshot(image: Buffer): Promise<LoanAnalyticalLine[]> {
  const run = chain.then(() => recognize(image))
  chain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function recognize(image: Buffer): Promise<LoanAnalyticalLine[]> {
  const worker = await sharedWorker()
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
  const result = await worker.recognize(image, {}, { tsv: true })
  return parseLoanTsv(result.data.tsv ?? "")
}

function sharedWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("slv+eng", 1, {
      langPath: LANG_PATH,
      cachePath: path.join(process.cwd(), ".tess-cache"),
      gzip: false,
    }).catch((error: unknown) => {
      workerPromise = null
      throw error
    })
  }
  return workerPromise
}
