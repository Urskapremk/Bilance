import { normalizeFormulas } from "@/lib/account-map"
import { normalizeClientName } from "@/lib/clients"
import { readFormulas, writeFormulas } from "@/lib/formulas-disk"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const company = normalizeClientName(new URL(request.url).searchParams.get("company") ?? "")
  if (!company) return Response.json({ formule: [] })
  return Response.json({ formule: await readFormulas(company) })
}

export async function POST(request: Request) {
  let body: { company?: unknown; formule?: unknown }
  try {
    body = (await request.json()) as { company?: unknown; formule?: unknown }
  } catch {
    return Response.json({ error: "Formul ni bilo mogoče prebrati." }, { status: 400 })
  }
  const company = typeof body.company === "string" ? normalizeClientName(body.company) : ""
  if (!company) return Response.json({ error: "Vpišite stranko." }, { status: 400 })
  const formule = await writeFormulas(company, normalizeFormulas(body.formule))
  return Response.json({ formule })
}
