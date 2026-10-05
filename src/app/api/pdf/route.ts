import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { deletePrintJob, savePrintJob, type PrintJob } from "@/lib/print-job"

export const runtime = "nodejs"

const exec = promisify(execFile)

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as PrintJob | null
  if (!body?.statement?.company || (body.view !== "bilanca" && body.view !== "izkaz")) {
    return Response.json({ error: "Manjkajo podatki za izpis." }, { status: 400 })
  }

  const id = await savePrintJob({
    statement: body.statement,
    view: body.view,
    showZeros: Boolean(body.showZeros),
  })
  const output = path.join(os.tmpdir(), `bilanca-${id}.pdf`)
  const profile = await mkdtemp(path.join(os.tmpdir(), "bilance-chrome-"))
  const port = process.env.PORT || "43123"
  const url = `http://127.0.0.1:${port}/tisk/${id}`

  try {
    try {
      await exec(
        "google-chrome",
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--disable-dev-shm-usage",
          `--user-data-dir=${profile}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          "--disable-background-networking",
          "--disable-sync",
          "--hide-scrollbars",
          "--virtual-time-budget=10000",
          "--timeout=20000",
          "--no-pdf-header-footer",
          `--print-to-pdf=${output}`,
          url,
        ],
        { timeout: 25_000 },
      )
    } catch (error) {
      console.error("Chrome print exited early", error instanceof Error ? error.message : error)
    }

    const pdf = await readFile(output).catch(() => null)
    if (!pdf || pdf.subarray(0, 5).toString() !== "%PDF-") {
      return Response.json(
        { error: "PDF ni bil ustvarjen. Uporabite Natisni in v oknu izberite Shrani kot PDF." },
        { status: 500 },
      )
    }
    const filename = pdfName(body)
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } finally {
    await deletePrintJob(id)
    await rm(output, { force: true })
    await rm(profile, { recursive: true, force: true })
  }
}

function pdfName(job: PrintJob) {
  const kind = job.view === "bilanca" ? "Bilanca-stanja" : "Izkaz-poslovnega-izida"
  const company = job.statement.company
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return `${kind}-${company || "druzba"}.pdf`
}
