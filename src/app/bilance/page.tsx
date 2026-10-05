import type { Metadata } from "next"

import { BilanceApp } from "@/components/bilance-app"

export const metadata: Metadata = {
  title: "Bilance · Hnatura",
  description:
    "Presečni izkazi in ocena poslovanja. Bilanca stanja in izkaz poslovnega izida iz bruto bilance.",
}

export default function Page() {
  return <BilanceApp />
}
