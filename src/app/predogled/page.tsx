"use client"

import { useEffect, useState } from "react"

import { PdfPreview } from "@/components/pdf-preview"
import { PDF_WINDOW_KEY, type PdfWindowMessage } from "@/lib/pdf-window"

export default function PredogledPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [title, setTitle] = useState("Bruto bilanca")

  useEffect(() => {
    let objectUrl = ""

    function apply(message: PdfWindowMessage) {
      if (message.title) setTitle(message.title)
      if (message.bytes) {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = URL.createObjectURL(new Blob([message.bytes], { type: "application/pdf" }))
        setUrl(objectUrl)
        return
      }
      if (message.url) setUrl(message.url)
    }

    const stored = sessionStorage.getItem(PDF_WINDOW_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { url?: string; title?: string }
        if (parsed.title) setTitle(parsed.title)
        if (parsed.url) setUrl(parsed.url)
      } catch {
        /* shranjen naslov ni berljiv */
      }
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as PdfWindowMessage | null
      if (!data || data.type !== "bilance-predogled") return
      apply(data)
    }
    window.addEventListener("message", onMessage)
    document.title = "Povečava izpisa · Bilance"
    return () => {
      window.removeEventListener("message", onMessage)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [])

  return (
    <main className="flex h-dvh flex-col bg-deep-blue">
      <header className="border-b border-white/10 px-5 py-3">
        <p className="text-xs font-medium tracking-[0.2em] text-gold uppercase">Povečava</p>
        <h1 className="font-heading text-2xl font-semibold text-navy-foreground">{title}</h1>
      </header>
      {url ? (
        <PdfPreview url={url} title={title} variant="window" />
      ) : (
        <p className="px-5 py-4 text-sm text-navy-foreground">Odpiram povečan izpis…</p>
      )}
    </main>
  )
}
