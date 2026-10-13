import { readFile } from "node:fs/promises"
import path from "node:path"

import { dhApplicationName, hasDhBankPack, type BankStatement } from "@/lib/bank-form"
import { fillFinancingApplication } from "@/lib/bank-vloga"

export const runtime = "nodejs"

const VLOGA = path.join(process.cwd(), "data/templates/dh/Vloga_za_odobritev_financiranja_PO.pdf")
const FONT = path.join(process.cwd(), "src/lib/fonts/DejaVuSans.ttf")

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { statement?: BankStatement } | null
  const statement = body?.statement
  if (!statement?.company || !statement.balance?.current || !statement.income || !hasDhBankPack(statement.company)) {
    return Response.json({ error: "Najprej odprite bilanco Adreme." }, { status: 400 })
  }

  try {
    const [template, font] = await Promise.all([readFile(VLOGA), readFile(FONT)])
    const pdf = await fillFinancingApplication(template, font, statement)
    const filename = dhApplicationName(statement.period ?? "", statement.currentDate ?? "")
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Vloga za financiranje ni bila ustvarjena." }, { status: 500 })
  }
}
