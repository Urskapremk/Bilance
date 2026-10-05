"use client"

import { useEffect, useRef, useState } from "react"

export function PdfPreview({ url, title }: { url: string; title: string }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    const frame = frameRef.current
    const pages = pagesRef.current
    if (!frame || !pages) return

    let cancelled = false
    const tasks: { cancel: () => void }[] = []

    async function paint() {
      setStatus("loading")
      pages.replaceChildren()
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const response = await fetch(url)
        if (!response.ok) throw new Error("PDF ni dosegljiv.")
        const data = new Uint8Array(await response.arrayBuffer())
        const pdf = await pdfjs
          .getDocument({ data, verbosity: 0 })
          .promise
        if (cancelled) return

        const width = Math.max(220, frame.clientWidth - 28)
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)

        for (let number = 1; number <= pdf.numPages; number += 1) {
          if (cancelled) return
          const page = await pdf.getPage(number)
          const unscaled = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (width / unscaled.width) * pixelRatio })
          const canvas = document.createElement("canvas")
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.className = "h-auto w-full bg-white"
          canvas.setAttribute("aria-label", `${title}, stran ${number}`)
          const context = canvas.getContext("2d")
          if (!context) continue
          const task = page.render({ canvas, canvasContext: context, viewport })
          tasks.push(task)
          await task.promise
          if (cancelled) return
          pages.appendChild(canvas)
        }
        if (!cancelled) setStatus("ready")
      } catch {
        if (!cancelled) setStatus("error")
      }
    }

    void paint()
    return () => {
      cancelled = true
      for (const task of tasks) task.cancel()
    }
  }, [title, url])

  return (
    <div
      ref={frameRef}
      className="min-h-[70vh] flex-1 overflow-auto bg-deep-blue lg:min-h-0"
      aria-busy={status === "loading"}
    >
      {status === "loading" ? (
        <p className="px-4 py-3 text-sm text-navy-foreground">Odpiram izpis…</p>
      ) : null}
      {status === "error" ? (
        <p className="px-4 py-3 text-sm text-navy-foreground" role="alert">
          Izpisa tukaj ne morem prikazati. Datoteka je še vedno naložena za bilanco.
        </p>
      ) : null}
      <div ref={pagesRef} className="flex flex-col gap-3 p-3" />
    </div>
  )
}
