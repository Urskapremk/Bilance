"use client"

import { ZoomIn, ZoomOut } from "lucide-react"
import { useEffect, useRef, useState } from "react"

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.25

function clampZoom(value: number) {
  const stepped = Math.round(value / ZOOM_STEP) * ZOOM_STEP
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(stepped.toFixed(2))))
}

export function PdfPreview({ url, title }: { url: string; title: string }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [documentVersion, setDocumentVersion] = useState(0)
  const pdfRef = useRef<{ numPages: number; getPage: (n: number) => Promise<PdfPage> } | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setZoom(1)

    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const response = await fetch(url)
        if (!response.ok) throw new Error("PDF ni dosegljiv.")
        const data = new Uint8Array(await response.arrayBuffer())
        const pdf = await pdfjs.getDocument({ data, verbosity: 0 }).promise
        if (cancelled) return
        pdfRef.current = pdf as unknown as NonNullable<typeof pdfRef.current>
        setDocumentVersion((version) => version + 1)
      } catch {
        if (!cancelled) setStatus("error")
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    const frame = frameRef.current
    const pages = pagesRef.current
    const pdf = pdfRef.current
    if (!frame || !pages || !pdf) return
    const view = frame
    const host = pages
    const file = pdf

    let cancelled = false
    const tasks: { cancel: () => void }[] = []

    async function paint() {
      const displayWidth = Math.max(160, (view.clientWidth - 24) * zoom)
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const built: HTMLCanvasElement[] = []

      try {
        for (let number = 1; number <= file.numPages; number += 1) {
          if (cancelled) return
          const page = await file.getPage(number)
          const unscaled = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (displayWidth / unscaled.width) * pixelRatio })
          const canvas = document.createElement("canvas")
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.className = "h-auto w-full bg-white shadow-sm"
          canvas.setAttribute("aria-label", `${title}, stran ${number}`)
          const context = canvas.getContext("2d")
          if (!context) continue
          const task = page.render({ canvas, canvasContext: context, viewport })
          tasks.push(task)
          await task.promise
          if (cancelled) return
          built.push(canvas)
        }
        if (!cancelled) {
          host.replaceChildren(...built)
          setStatus("ready")
        }
      } catch {
        if (!cancelled) setStatus("error")
      }
    }

    void paint()
    return () => {
      cancelled = true
      for (const task of tasks) task.cancel()
    }
  }, [documentVersion, title, zoom])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setZoom((current) => clampZoom(current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)))
    }
    frame.addEventListener("wheel", onWheel, { passive: false })
    return () => frame.removeEventListener("wheel", onWheel)
  }, [])

  return (
    <div ref={frameRef} className="relative min-h-[70vh] flex-1 overflow-auto bg-deep-blue lg:min-h-0" aria-busy={status === "loading"}>
      <div className="sticky top-0 z-10 flex items-center justify-end gap-1 border-b border-white/10 bg-deep-blue/95 px-3 py-2 backdrop-blur-sm">
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md border border-white/25 text-navy-foreground transition-colors hover:border-gold hover:text-gold disabled:pointer-events-none disabled:opacity-40"
          aria-label="Pomanjšaj"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
        >
          <ZoomOut className="size-4" />
        </button>
        <span className="min-w-12 text-center text-xs font-medium tabular-nums text-navy-foreground">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-md border border-white/25 text-navy-foreground transition-colors hover:border-gold hover:text-gold disabled:pointer-events-none disabled:opacity-40"
          aria-label="Povečaj"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
        >
          <ZoomIn className="size-4" />
        </button>
      </div>
      {status === "loading" ? <p className="px-4 py-3 text-sm text-navy-foreground">Odpiram izpis…</p> : null}
      {status === "error" ? (
        <p className="px-4 py-3 text-sm text-navy-foreground" role="alert">
          Izpisa tukaj ne morem prikazati. Datoteka je še vedno naložena za bilanco.
        </p>
      ) : null}
      <div ref={pagesRef} className="mx-auto flex flex-col gap-3 p-3" style={{ width: `${zoom * 100}%` }} />
    </div>
  )
}

type PdfPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number }
  render: (params: {
    canvas: HTMLCanvasElement
    canvasContext: CanvasRenderingContext2D
    viewport: { width: number; height: number }
  }) => { cancel: () => void; promise: Promise<unknown> }
}
