import { readFile } from "node:fs/promises"
import path from "node:path"

import type { AjpesHeader } from "@/lib/ajpes-header"
import { disclosureCells, type BankStatement } from "@/lib/bank-form"
import { fillDhWorkbook } from "@/lib/bank-xlsx"
import { sanitizeAgingParties } from "@/lib/partner-aging"
import { disclosureWorkbookName, isDisclosureBank } from "@/lib/razkritja"
import { applySheet045, applySheet076, sanitizeLoanLines } from "@/lib/zavihek-045"

export const runtime = "nodejs"

const TEMPLATE = path.join(process.cwd(), "data/templates/dh/razkritja/FRP_EXCEL_DH.xlsx")

type Incoming = BankStatement & {
  registration?: string
  previousIncome?: Record<string, number>
  publicPrevious?: { registration?: string } | null
  ajpesHeader?: AjpesHeader
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    bank?: string
    statement?: Incoming
    kupci?: unknown
    dobavitelji?: unknown
    posojila045?: unknown
    obveznosti076?: unknown
  } | null
  const statement = body?.statement
  if (!isDisclosureBank(body?.bank)) {
    return Response.json({ error: "Ta banka še nima razkritij." }, { status: 400 })
  }
  if (!statement?.company || !statement.balance?.current || !statement.balance?.previous || !statement.income) {
    return Response.json({ error: "Najprej odprite bilanco." }, { status: 400 })
  }

  try {
    const template = await readFile(TEMPLATE)
    const kupci = sanitizeAgingParties(body?.kupci)
    const dobavitelji = sanitizeAgingParties(body?.dobavitelji)
    const posojila045 = sanitizeLoanLines(body?.posojila045)
    const obveznosti076 = sanitizeLoanLines(body?.obveznosti076)
    const workbook = await fillDhWorkbook(
      template,
      applySheet076(
        applySheet045(
          disclosureCells(
            {
              ...statement,
              registration: statement.registration || statement.publicPrevious?.registration || "",
            },
            {
              ...(kupci?.length ? { kupci } : {}),
              ...(dobavitelji?.length ? { dobavitelji } : {}),
            },
          ),
          posojila045,
        ),
        obveznosti076,
      ),
      { dropStaleText: true },
    )
    const filename = disclosureWorkbookName(statement.company, statement.period ?? "", statement.currentDate ?? "")
    const ascii = filename.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/["\\]/g, "") || "razkritja.xlsx"
    return new Response(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Razkritja niso bila ustvarjena." }, { status: 500 })
  }
}
