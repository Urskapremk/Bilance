"use client"

import { Archive, FileDown, FileUp, Printer } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { PdfPreview } from "@/components/pdf-preview"
import { StatementDocument } from "@/components/statement-document"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatSavedAt, listArchive, readArchive, saveArchive, type ArchiveMeta } from "@/lib/archive"
import { attachPublicFiling } from "@/lib/ajpes-public"
import { grafam, mappingNotes } from "@/lib/grafam"
import type { Statement } from "@/lib/trial"
import { cn } from "@/lib/utils"

type View = "bilanca" | "izkaz"

const DEFAULT_PDF = "/sources/Grafam_BB_31.08.2026.pdf"

const initialStatement: Statement = attachPublicFiling({
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
})

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
  const [phase, setPhase] = useState<"primer" | "osnutek" | "arhiv">("primer")
  const [pendingFinal, setPendingFinal] = useState<{ statement: Statement; pdf: ArrayBuffer } | null>(null)
  const [savingArchive, setSavingArchive] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveItems, setArchiveItems] = useState<ArchiveMeta[]>([])
  const [archiveError, setArchiveError] = useState<string | null>(null)
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

  useEffect(() => {
    void listArchive()
      .then(setArchiveItems)
      .catch(() => setArchiveItems([]))
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
      const pdf = await file.arrayBuffer()
      setStatement(data)
      setLinked(true)
      setPhase("osnutek")
      setPendingFinal({ statement: data, pdf })
    } catch (caught) {
      setLinked(false)
      setPendingFinal(null)
      setError(caught instanceof Error ? caught.message : "Bruto bilance ni bilo mogoče prebrati.")
    } finally {
      setBusy(false)
    }
  }

  async function confirmFinal() {
    if (!pendingFinal) return
    setSavingArchive(true)
    setError(null)
    try {
      await saveArchive(pendingFinal.statement, pendingFinal.pdf)
      setArchiveItems(await listArchive())
      setPhase("arhiv")
      setPendingFinal(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Arhiva ni bilo mogoče shraniti.")
    } finally {
      setSavingArchive(false)
    }
  }

  async function openArchive() {
    setArchiveError(null)
    setArchiveOpen(true)
    try {
      setArchiveItems(await listArchive())
    } catch (caught) {
      setArchiveError(caught instanceof Error ? caught.message : "Arhiva ni bilo mogoče odpreti.")
    }
  }

  async function openArchived(id: string) {
    setArchiveError(null)
    setBusy(true)
    try {
      const stored = await readArchive(id)
      const nextUrl = URL.createObjectURL(new Blob([stored.pdf], { type: "application/pdf" }))
      setPdfUrl((current) => {
        if (current.startsWith("blob:")) URL.revokeObjectURL(current)
        return nextUrl
      })
      setPdfName(stored.sourceName)
      setStatement(stored.statement)
      setLinked(true)
      setPhase("arhiv")
      setPendingFinal(null)
      setArchiveOpen(false)
    } catch (caught) {
      setArchiveError(caught instanceof Error ? caught.message : "Končne bilance ni bilo mogoče odpreti.")
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
                ? phase === "arhiv"
                  ? "Končna bilanca je v arhivu. Obrazec je sestavljen iz te bruto bilance."
                  : phase === "osnutek"
                    ? "Osnutek je sestavljen iz te bruto bilance. V arhiv gre šele, ko potrdite, da je končna."
                    : "Obrazec je sestavljen iz tega izpisa. Tukaj ostane, da ga lahko primerjate s postavkami."
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy || savingArchive}>
                <FileUp />
                {busy ? "Berem konte…" : "Dodaj PDF"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void openArchive()}>
                <Archive />
                Arhiv{archiveItems.length > 0 ? ` (${archiveItems.length})` : ""}
              </Button>
            </div>
            {error ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <PdfPreview url={pdfUrl} title={`Bruto bilanca ${pdfName}`} />
        </aside>
      </div>

      <Dialog open={pendingFinal !== null} onOpenChange={(open) => { if (!open && !savingArchive) setPendingFinal(null) }}>
        <DialogContent className="sm:max-w-md" showCloseButton={!savingArchive}>
          <DialogHeader>
            <DialogTitle className="text-2xl text-navy">Je ta bilanca končna?</DialogTitle>
            <DialogDescription>
              Obrazec je sestavljen iz nove bruto bilance {pendingFinal?.statement.sourceName}.{" "}
              {pendingFinal?.statement.company}, obdobje {pendingFinal?.statement.period}. Končna bilanca se shrani v
              arhiv skupaj z izvorno datoteko.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingFinal(null)} disabled={savingArchive}>
              Še ni končna
            </Button>
            <Button type="button" onClick={() => void confirmFinal()} disabled={savingArchive}>
              {savingArchive ? "Shranjujem…" : "Shrani v arhiv"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl text-navy">Arhiv končnih bilanc</DialogTitle>
            <DialogDescription>Shranjene končne bilance in bruto bilance, iz katerih so sestavljene.</DialogDescription>
          </DialogHeader>
          {archiveError ? (
            <p className="text-sm text-destructive" role="alert">
              {archiveError}
            </p>
          ) : null}
          {archiveItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">V arhivu še ni končne bilance.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-auto">
              {archiveItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-navy">{item.company}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.period} · {item.sourceName}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatSavedAt(item.savedAt)}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => void openArchived(item.id)} disabled={busy}>
                    Odpri
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
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
        active ? "bg-deep-blue text-navy-foreground" : "text-muted-foreground hover:text-navy",
      )}
    >
      {children}
    </a>
  )
}
