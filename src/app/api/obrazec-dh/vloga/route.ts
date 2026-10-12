import { readFile } from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"

const VLOGA = path.join(process.cwd(), "data/templates/dh/Vloga_za_odobritev_financiranja_PO.pdf")
const FILENAME = "ADREMA_Vloga_za_odobritev_financiranja.pdf"

export async function GET() {
  try {
    const pdf = await readFile(VLOGA)
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${FILENAME}"; filename*=UTF-8''${encodeURIComponent(FILENAME)}`,
      },
    })
  } catch (error) {
    console.error(error)
    return Response.json({ error: "Vloga za financiranje ni pripravljena." }, { status: 500 })
  }
}
