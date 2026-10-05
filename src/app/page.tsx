import type { Metadata } from "next"

import { LandingPage } from "@/components/landing-page"

export const metadata: Metadata = {
  title: "Hnatura d.o.o. — Računovodski servis",
  description:
    "Digitalno okolje računovodskega servisa Hnatura. Prevzem dokumentov in izdelava presečnih izkazov.",
}

export default function Page() {
  return <LandingPage />
}
