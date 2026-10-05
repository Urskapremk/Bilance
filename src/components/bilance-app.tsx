"use client"

import { FileDown, FileUp, Printer } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { StatementDocument } from "@/components/statement-document"
import { Button } from "@/components/ui/button"
import { grafam, mappingNotes } from "@/lib/grafam"
import type { Statement } from "@/lib/trial"
import { cn } from "@/lib/utils"

type View = "bilanca" | "izkaz"

const DEFAULT_PDF = "/sources/Grafam_BB_31.08.2026.pdf"

const initialStatement: Statement = {
  company: grafam.company,
  period: grafam.period,
  currentDate: grafam.currentDate,
  previousDate: grafam.previousDate,
  sourceName: "Grafam_BB_31.08.2026.pdf",
  balance: {
    current: { ...grafam.balance.current },
    previous: { ...grafam.balance.previous },
  },
  income: { ...grafam.income },
  notes: [...mappingNotes],
  warnings: [],
}

export function BilanceApp() {
  const [view, setView] = useState<View>("bilanca")
  const [showZeros, setShowZeros] = useState(false)
  const [statement, setStatement] = useState<Statement>(initialStatement)
  const [pdfUrl, setPdfUrl] = useState(DEFAULT_PDF)
  const [pdfName, setPdfName] = useState(initialStatement.sourceName)
  const [linked, setLinked] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pdfUrlRef = useRef(pdfUrl)

  useEffect(() => {
    pdfUrlRef.current = pdfUrl
  }, [pdfUrl])

  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search)
      setView(params.get("izkaz") === "1" ? "izkaz" : "bilanca")
    }
    sync()
    window.addEventListener("popstate", sync)
    return () => window.removeEventListener("popstate", sync)
  }, [])

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current.startsWith("blob:")) URL.revokeObjectURL(pdfUrlRef.current)
    }
  }, [])

  async function loadFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Dodajte datoteko PDF.")
      return
    }
    const nextUrl = URL.createObjectURL(file)
    setPdfUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current)
      return nextUrl
    })
    setPdfName(file.name)
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.set("file", file)
      const response = await fetch("/api/bruto-bilanca", { method: "POST", body })
      const data = (await response.json().catch(() => null)) as Statement & { error?: string } | null
      if (!response.ok || !data || !data.company) {
        throw new Error(data?.error ?? "Bruto bilance ni bilo mogoče prebrati.")
      }
      setStatement(data)
      setLinked(true)
    } catch (caught) {
      setLinked(false)
      setError(caught instanceof Error ? caught.message : "Bruto bilance ni bilo mogoče prebrati.")
    } finally {
      setBusy(false)
    }
  }

  function printStatement() {
    const previous = document.title
    document.title = fileBase(statement, view)
    const restore = () => {
      document.title = previous
      window.removeEventListener("afterprint", restore)
    }
    window.addEventListener("afterprint", restore)
    window.print()
  }

  async function createPdf() {
    setExporting(true)
    setError(null)
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement, view, showZeros }),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "PDF ni bil ustvarjen.")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${fileBase(statement, view)}.pdf`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF ni bil ustvarjen.")
    } finally {
      setExporting(false)
    }
  }

  const toolbar = (
    <div className="no-print mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="inline-flex rounded-lg border border-border bg-secondary p-1">
        <Tab href="/" active={view === "bilanca"}>
          Bilanca stanja
        </Tab>
        <Tab href="/?izkaz=1" active={view === "izkaz"}>
          Izkaz poslovnega izida
        </Tab>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={showZeros}
          onClick={() => setShowZeros((value) => !value)}
          className="px-2 text-sm font-medium text-navy underline-offset-4 hover:text-gold hover:underline"
        >
          {showZeros ? "Skrij prazne postavke" : "Prikaži celotno shemo AJPES"}
        </button>
        <Button type="button" variant="outline" onClick={printStatement}>
          <Printer />
          Natisni
        </Button>
        <Button type="button" onClick={() => void createPdf()} disabled={exporting}>
          <FileDown />
          {exporting ? "Pripravljam PDF…" : "Kreiraj PDF"}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto grid max-w-[1440px] items-start gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:px-6">
        <StatementDocument statement={statement} view={view} showZeros={showZeros} toolbar={toolbar} busy={busy} />

        <aside
          className={cn(
            "no-print flex flex-col overflow-hidden rounded-xl border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]",
            dragOver ? "border-gold" : "border-border",
          )}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            const file = event.dataTransfer.files[0]
            if (file) void loadFile(file)
          }}
        >
          <div className="border-b border-border p-5">
            <p className="text-xs font-medium tracking-[0.2em] text-gold uppercase">Izvor</p>
            <h2 className="font-heading mt-1 text-2xl font-semibold text-navy">Bruto bilanca</h2>
            <p className="mt-2 truncate text-sm text-muted-foreground" title={pdfName}>
              {pdfName}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {linked
                ? "Obrazec je sestavljen iz tega izpisa. Tukaj ostane, da ga lahko primerjate s postavkami."
                : "Ta datoteka je odprta, obrazec pa še vedno kaže zadnjo uspešno prebrano bilanco."}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void loadFile(file)
                event.target.value = ""
              }}
            />
            <Button type="button" className="mt-4" onClick={() => inputRef.current?.click()} disabled={busy}>
              <FileUp />
              {busy ? "Berem konte…" : "Dodaj PDF"}
            </Button>
            {error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <iframe
            title={`Bruto bilanca ${pdfName}`}
            src={`${pdfUrl}#toolbar=1&navpanes=0&view=FitH`}
            className="min-h-[70vh] w-full flex-1 bg-secondary lg:min-h-0"
          />
        </aside>
      </div>
    </div>
  )
}

function fileBase(statement: Statement, view: View) {
  const kind = view === "bilanca" ? "Bilanca stanja" : "Izkaz poslovnega izida"
  return `${kind} ${statement.company} ${statement.currentDate}`
}

function Tab({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-navy text-navy-foreground" : "text-muted-foreground hover:text-navy",
      )}
    >
      {children}
    </a>
  )
}
