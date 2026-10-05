import { mergeClients } from "@/lib/clients"

export async function listClients(): Promise<string[]> {
  const response = await fetch("/api/stranke", { cache: "no-store" })
  if (!response.ok) throw new Error("Seznama strank ni bilo mogoče prebrati.")
  const data = (await response.json()) as unknown
  if (!Array.isArray(data)) return mergeClients([])
  return mergeClients(data.filter((item): item is string => typeof item === "string"))
}

export async function rememberClientName(name: string): Promise<void> {
  const response = await fetch("/api/stranke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? "Stranke ni bilo mogoče shraniti.")
  }
}
