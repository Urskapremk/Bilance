import { PSM, recognizeImage, TSV_ONLY } from "@/lib/ocr-engine"
import { parseAnalyticalTsv, parseLoanTsv, type LoanAnalyticalLine } from "@/lib/zavihek-045"

let chain: Promise<unknown> = Promise.resolve()

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
  const page = await recognizeImage(
    image,
    {
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: "",
    },
    TSV_ONLY,
  )
  const tsv = page.tsv ?? ""
  const loan = parseLoanTsv(tsv)
  if (loan.length) return loan
  return parseAnalyticalTsv(tsv)
}
