import { readFile } from "node:fs/promises"
import path from "node:path"

import { adremaBankCells, dhWorkbookName, hasDhBankPack, type BankStatement } from "@/lib/bank-form"
import { fillDhWorkbook } from "@/lib/bank-xlsx"

export const runtime = "nodejs"

const TEMPLATE = path.join(process.cwd(), "data/templates/dh/FRP_EXCEL_DH.xlsx")

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { statement?: BankStatement } | null
  const statement = body?.statement
  if (!statement?.company || !statement.balance?.current || !hasDhBankPack(statement.company)) {
    return Response.json({ error: "Obrazec za banko je pripravljen za stranko ADREMA." }, { status: 400 })
  }

  try {
    const template = await readFile(TEMPLATE)
    const workbook = await fillDhWorkbook(template, adremaBankCells(statement))
    const filename = dhWorkbookName(statement.currentDate ?? "")
    return new Response(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Obrazec za banko ni bil ustvarjen." }, { status: 500 })
  }
}
