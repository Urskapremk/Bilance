"use client"

import { Archive, ArrowLeft, FileDown, FileUp, Printer, Save, UserPlus } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  formsOf,
  formatSavedAt,
  groupArchiveByClient,
  listArchive,
  readArchive,
  saveArchive,
  type ArchiveMeta,
} from "@/lib/archive"
import { attachPublicFiling } from "@/lib/ajpes-public"
import { listClients, rememberClientName } from "@/lib/clients-api"
import {
  clientKey,
  filterClients,
  mergeClients,
  normalizeClientName,
  sameClient,
  SAMPLE_CLIENT,
  statementForClient,
} from "@/lib/clients"
import { grafam, mappingNotes } from "@/lib/grafam"
import type { Statement } from "@/lib/trial"
import { cn } from "@/lib/utils"

type View = "bilanca" | "izkaz"

type Workspace = {
  statement: Statement
  pdf: ArrayBuffer
  pdfName: string
  phase: "primer" | "osnutek" | "arhiv"
}

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
  const [saveAsk, setSaveAsk] = useState(false)
  const [savingArchive, setSavingArchive] = useState(false)
  const [savedMeta, setSavedMeta] = useState<ArchiveMeta | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveItems, setArchiveItems] = useState<ArchiveMeta[]>([])
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [clients, setClients] = useState<string[]>([SAMPLE_CLIENT])
  const [activeClient, setActiveClient] = useState(SAMPLE_CLIENT)
  const [blank, setBlank] = useState(false)
  const [clientsOpen, setClientsOpen] = useState(false)
  const [clientQuery, setClientQuery] = useState("")
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [newClientFile, setNewClientFile] = useState<File | null>(null)
  const [newClientError, setNewClientError] = useState<string | null>(null)
  const [creatingClient, setCreatingClient] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const newFileRef = useRef<HTMLInputElement>(null)
  const pdfUrlRef = useRef(pdfUrl)
  const draftRef = useRef<{ statement: Statement; pdf: ArrayBuffer } | null>(null)
  const savingRef = useRef(false)
  const uploadClientRef = useRef<string | null>(null)
  const workspaces = useRef(new Map<string, Workspace>())

  useEffect(() => {
    pdfUrlRef.current = pdfUrl
  }, [pdfUrl])

  function showView(next: View) {
    setView(next)
    const url = new URL(window.location.href)
    if (next === "izkaz") url.searchParams.set("izkaz", "1")
    else url.searchParams.delete("izkaz")
    const nextUrl = `${url.pathname}${url.search}`
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.pushState({}, "", nextUrl)
    }
  }

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
    void listClients()
      .then(setClients)
      .catch(() => setClients([SAMPLE_CLIENT]))
  }, [])

  function cacheWorkspace(workspace: Workspace) {
    workspaces.current.set(clientKey(workspace.statement.company), workspace)
  }

  function showPdf(nextUrl: string, name: string) {
    setPdfUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current)
      return nextUrl
    })
    setPdfName(name)
  }

  function restoreSample() {
    setStatement(initialStatement)
    showPdf(DEFAULT_PDF, initialStatement.sourceName)
    setActiveClient(SAMPLE_CLIENT)
    setPhase("primer")
    setBlank(false)
    setLinked(true)
    setError(null)
    draftRef.current = null
    setSaveAsk(false)
  }

  function applyWorkspace(workspace: Workspace) {
    showPdf(URL.createObjectURL(new Blob([workspace.pdf], { type: "application/pdf" })), workspace.pdfName)
    setStatement(workspace.statement)
    setActiveClient(workspace.statement.company)
    setPhase(workspace.phase)
    setBlank(false)
    setLinked(true)
    setError(null)
    draftRef.current =
      workspace.phase === "osnutek" ? { statement: workspace.statement, pdf: workspace.pdf } : null
    setSaveAsk(false)
  }

  async function refreshClients() {
    try {
      setClients(await listClients())
    } catch {
      setClients((current) => mergeClients(current))
    }
  }

  async function loadFile(file: File, company?: string): Promise<boolean> {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      const message = "Dodajte datoteko PDF."
      if (company) setNewClientError(message)
      else setError(message)
      return false
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
      const pdf = (await file.arrayBuffer()).slice(0)
      const named = company ? statementForClient(data, company) : data
      const draft = { statement: named, pdf }
      draftRef.current = draft
      cacheWorkspace({ statement: named, pdf, pdfName: file.name, phase: "osnutek" })
      setStatement(named)
      setActiveClient(named.company)
      setBlank(false)
      setLinked(true)
      setPhase("osnutek")
      setSavedMeta(null)
      setSaveError(null)
      setNewClientOpen(false)
      setNewClientName("")
      setNewClientFile(null)
      setNewClientError(null)
      setSaveAsk(false)
      showView("bilanca")
      requestAnimationFrame(() => {
        document.querySelector("article.print-sheet, section.print-sheet")?.scrollIntoView({ block: "start" })
      })
      void rememberClientName(named.company)
        .then(() => refreshClients())
        .catch(() => setClients((current) => mergeClients([...current, named.company])))
      return true
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Bruto bilance ni bilo mogoče prebrati."
      setLinked(false)
      draftRef.current = null
      setSaveAsk(false)
      if (company) setNewClientError(message)
      else setError(message)
      return false
    } finally {
      setBusy(false)
    }
  }

  function choosePdf(forClient?: string) {
    uploadClientRef.current = forClient ?? null
    inputRef.current?.click()
  }

  async function selectClient(name: string) {
    setClientsOpen(false)
    setClientQuery("")
    const cached = workspaces.current.get(clientKey(name))
    if (cached) {
      applyWorkspace(cached)
      return
    }
    let items = archiveItems
    try {
      items = await listArchive()
      setArchiveItems(items)
    } catch {
      /* ob napaki ostane zadnji seznam */
    }
    const latest = items.find((item) => sameClient(item.company, name))
    if (latest) {
      await openArchived(latest.id)
      return
    }
    if (sameClient(name, SAMPLE_CLIENT)) {
      restoreSample()
      return
    }
    setActiveClient(name)
    setBlank(true)
    setLinked(false)
    setError(null)
    setPhase("osnutek")
    draftRef.current = null
    setSaveAsk(false)
  }

  async function submitNewClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = normalizeClientName(newClientName)
    if (!name) {
      setNewClientError("Vpišite naziv stranke.")
      return
    }
    if (!newClientFile) {
      setNewClientError("Dodajte PDF bruto bilance.")
      return
    }
    setCreatingClient(true)
    setNewClientError(null)
    try {
      await loadFile(newClientFile, name)
    } finally {
      setCreatingClient(false)
    }
  }

  function askToSave() {
    if (!draftRef.current || savingRef.current) return
    setSaveError(null)
    setSaveAsk(true)
  }

  function declineSave() {
    if (savingRef.current) return
    setSaveAsk(false)
    setSaveError(null)
  }

  async function confirmFinal(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const draft = draftRef.current
    if (!draft || savingRef.current) return
    savingRef.current = true
    setSavingArchive(true)
    setSaveError(null)
    setError(null)
    try {
      const meta = await saveArchive(draft.statement, draft.pdf.slice(0))
      setArchiveItems(await listArchive())
      setPhase("arhiv")
      cacheWorkspace({
        statement: draft.statement,
        pdf: draft.pdf,
        pdfName: draft.statement.sourceName,
        phase: "arhiv",
      })
      void refreshClients()
      draftRef.current = null
      setSaveAsk(false)
      setSavedMeta(meta)
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Arhiva ni bilo mogoče shraniti.")
    } finally {
      savingRef.current = false
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
      showPdf(nextUrl, stored.sourceName)
      setStatement(stored.statement)
      setActiveClient(stored.statement.company)
      cacheWorkspace({
        statement: stored.statement,
        pdf: stored.pdf,
        pdfName: stored.sourceName,
        phase: "arhiv",
      })
      setLinked(true)
      setBlank(false)
      setPhase("arhiv")
      draftRef.current = null
      setSaveAsk(false)
      setSavedMeta(null)
      setArchiveOpen(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Končne bilance ni bilo mogoče odpreti."
      setArchiveError(message)
      setError(message)
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

  function clientPeriod(name: string) {
    const cached = workspaces.current.get(clientKey(name))
    if (cached) return cached.statement.period
    const archived = archiveItems.find((item) => sameClient(item.company, name))
    if (archived) return archived.period
    if (sameClient(name, SAMPLE_CLIENT)) return initialStatement.period
    if (sameClient(name, activeClient) && !blank) return statement.period
    return "Še brez bilance"
  }

  const visibleClients = filterClients(mergeClients([...clients, activeClient]), clientQuery)

  const toolbar = (
    <div className="no-print mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="inline-flex rounded-lg border border-border bg-secondary p-1">
        <Tab active={view === "bilanca"} onSelect={() => showView("bilanca")}>
          Bilanca stanja
        </Tab>
        <Tab active={view === "izkaz"} onSelect={() => showView("izkaz")}>
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
        {phase === "osnutek" && !blank ? (
          <Button type="button" onClick={askToSave} disabled={savingArchive || busy}>
            <Save />
            Shrani
          </Button>
        ) : null}
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
      <div className="no-print border-b border-border">
        <div className="mx-auto flex max-w-[1440px] px-4 py-3 lg:px-6">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-navy underline-offset-4 hover:text-gold hover:underline"
          >
            <ArrowLeft className="size-4" />
            Programi
          </a>
        </div>
      </div>
      <div className="mx-auto grid min-w-0 max-w-[1440px] items-start gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:px-6">
        {blank ? (
          <section className="print-sheet min-w-0">
            <header className="border-b border-border">
              <div className="flex justify-center px-6 py-5">
                <Image
                  src="/images/hnatura-logo.png"
                  alt="Hnatura d.o.o. — Računovodski servis"
                  width={340}
                  height={100}
                  priority
                  className="h-auto w-[200px] md:w-[240px]"
                />
              </div>
            </header>
            <div className="px-6 pt-10 pb-16 text-center md:pt-14">
              <p className="mb-4 flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-gold uppercase">
                <span className="h-px w-8 bg-gold" aria-hidden="true" />
                Bilance
                <span className="h-px w-8 bg-gold" aria-hidden="true" />
              </p>
              <h1 className="font-heading text-4xl leading-tight font-semibold text-navy md:text-5xl">Nova bilanca</h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                Za stranko {activeClient} še ni bruto bilance. Dodajte PDF v stolpcu desno, pa se iz njega sestavita
                bilanca stanja in izkaz poslovnega izida.
              </p>
              <Button type="button" className="mt-8" onClick={() => choosePdf(activeClient)} disabled={busy}>
                <FileUp />
                {busy ? "Berem konte…" : "Dodaj PDF"}
              </Button>
            </div>
          </section>
        ) : (
          <StatementDocument statement={statement} view={view} showZeros={showZeros} toolbar={toolbar} busy={busy} />
        )}

        <aside
          className={cn(
            "no-print flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]",
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
            if (file) void loadFile(file, blank ? activeClient : undefined)
          }}
        >
          <div className="border-b border-border p-5">
            <p className="text-xs font-medium tracking-[0.2em] text-gold uppercase">Stranka</p>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h2 className="font-heading min-w-0 text-2xl font-semibold break-words text-navy" title={activeClient}>
                {activeClient}
              </h2>
              <Button type="button" variant="outline" size="sm" onClick={() => setClientsOpen(true)} disabled={busy}>
                Zamenjaj
              </Button>
            </div>
            <p className="mt-4 text-xs font-medium tracking-[0.2em] text-gold uppercase">Bruto bilanca</p>
            <p className="mt-2 truncate text-sm text-muted-foreground" title={blank ? undefined : pdfName}>
              {blank ? "Še ni dodane." : pdfName}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {blank
                ? "Nova stranka čaka na svojo bruto bilanco. Dodajte PDF ali jo ustvarite z Nova stranka."
                : linked
                  ? phase === "arhiv"
                    ? "Shranjeno v arhiv. Obrazec je sestavljen iz te bruto bilance."
                    : phase === "osnutek"
                      ? "Najprej preglejte bilanco. Ko je v redu, Shrani vpraša, ali se pod to stranko zapišeta izvorni PDF ter oba obrazca obdobja."
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
                const company = uploadClientRef.current ?? (blank ? activeClient : undefined)
                uploadClientRef.current = null
                if (file) void loadFile(file, company ?? undefined)
                event.target.value = ""
              }}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => choosePdf(blank ? activeClient : undefined)}
                disabled={busy || savingArchive || creatingClient}
              >
                <FileUp />
                {busy ? "Berem konte…" : "Dodaj PDF"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewClientName("")
                  setNewClientFile(null)
                  setNewClientError(null)
                  setNewClientOpen(true)
                }}
                disabled={busy || savingArchive || creatingClient}
              >
                <UserPlus />
                Nova stranka
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
          {blank ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm leading-relaxed text-muted-foreground">
              Bruto bilanca za {activeClient} se pokaže tukaj, ko dodate PDF.
            </div>
          ) : (
            <PdfPreview url={pdfUrl} title={`Bruto bilanca ${pdfName}`} />
          )}
        </aside>
      </div>

      <Dialog
        open={saveAsk || savedMeta !== null}
        onOpenChange={(open) => {
          if (open || savingRef.current) return
          if (savedMeta) setSavedMeta(null)
          else declineSave()
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!savingArchive}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (savingRef.current) event.preventDefault()
          }}
        >
          {savedMeta ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl text-navy">Shranjeno.</DialogTitle>
                <DialogDescription>
                  Pod {savedMeta.company} je obdobje {savedMeta.period}. Shranjeni so izvorni PDF {savedMeta.sourceName}{" "}
                  ter {formsOf(savedMeta).join(" in ").toLowerCase()}.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" onClick={() => setSavedMeta(null)}>
                  Zapri
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl text-navy">Ali shrani?</DialogTitle>
                <DialogDescription>
                  Pod {statement.company} se za obdobje {statement.period} shrani izvorni PDF {pdfName}. Zraven se shranita
                  bilanca stanja in izkaz poslovnega izida.
                </DialogDescription>
              </DialogHeader>
              {saveError ? (
                <p className="text-sm text-destructive" role="alert">
                  {saveError}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={declineSave} disabled={savingArchive}>
                  Ne shrani
                </Button>
                <Button type="button" onClick={(event) => void confirmFinal(event)} disabled={savingArchive}>
                  {savingArchive ? "Shranjujem…" : "Shrani"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl text-navy">Arhiv končnih bilanc</DialogTitle>
            <DialogDescription>
              Po strankah. Pri vsakem obdobju sta shranjena izvorni PDF ter bilanca stanja in izkaz poslovnega izida.
            </DialogDescription>
          </DialogHeader>
          {archiveError ? (
            <p className="text-sm text-destructive" role="alert">
              {archiveError}
            </p>
          ) : null}
          {archiveItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">V arhivu še ni shranjenega obdobja.</p>
          ) : (
            <div className="max-h-80 space-y-4 overflow-auto">
              {groupArchiveByClient(archiveItems).map((group) => (
                <section key={group.company}>
                  <h3 className="font-heading text-lg font-semibold text-navy">{group.company}</h3>
                  <ul className="mt-2 space-y-2">
                    {group.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-navy">{item.period}</p>
                          <p className="truncate text-xs text-muted-foreground">Bruto bilanca: {item.sourceName}</p>
                          <p className="truncate text-xs text-muted-foreground">{formsOf(item).join(" · ")}</p>
                          <p className="text-xs text-muted-foreground">{formatSavedAt(item.savedAt)}</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => void openArchived(item.id)} disabled={busy}>
                          Odpri
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={clientsOpen}
        onOpenChange={(open) => {
          setClientsOpen(open)
          if (!open) setClientQuery("")
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl text-navy">Stranke</DialogTitle>
            <DialogDescription>Izberite stranko, za katero delate bilanco, ali dodajte novo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="isci-stranko">Poišči stranko</Label>
            <Input
              id="isci-stranko"
              value={clientQuery}
              placeholder="Naziv stranke"
              onChange={(event) => setClientQuery(event.target.value)}
            />
            {visibleClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobene stranke s tem imenom.</p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-auto">
                {visibleClients.map((name) => {
                  const current = sameClient(name, activeClient)
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => void selectClient(name)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left",
                          current ? "bg-deep-blue text-navy-foreground" : "hover:bg-secondary",
                        )}
                      >
                        <span className="truncate font-medium">{name}</span>
                        <span className={cn("shrink-0 text-xs", current ? "text-navy-foreground/80" : "text-muted-foreground")}>
                          {clientPeriod(name)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                const typed = normalizeClientName(clientQuery)
                setClientsOpen(false)
                setClientQuery("")
                setNewClientName(visibleClients.length === 0 ? typed : "")
                setNewClientFile(null)
                setNewClientError(null)
                setNewClientOpen(true)
              }}
            >
              <UserPlus />
              Nova stranka
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newClientOpen}
        onOpenChange={(open) => {
          if (creatingClient) return
          setNewClientOpen(open)
          if (!open) setNewClientError(null)
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={!creatingClient}
          onPointerDownOutside={(event) => {
            if (creatingClient) event.preventDefault()
          }}
          onEscapeKeyDown={(event) => {
            if (creatingClient) event.preventDefault()
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-2xl text-navy">Nova stranka</DialogTitle>
            <DialogDescription>
              Vpišite naziv in dodajte bruto bilanco. Iz nje se sestavi nova bilanca za to stranko.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void submitNewClient(event)}>
            <div className="space-y-2">
              <Label htmlFor="naziv-stranke">Naziv</Label>
              <Input
                id="naziv-stranke"
                value={newClientName}
                placeholder="na primer Sever d.o.o."
                autoComplete="organization"
                disabled={creatingClient}
                onChange={(event) => setNewClientName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdf-stranke">Bruto bilanca</Label>
              <input
                id="pdf-stranke"
                ref={newFileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(event) => {
                  setNewClientFile(event.target.files?.[0] ?? null)
                  setNewClientError(null)
                  event.target.value = ""
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => newFileRef.current?.click()} disabled={creatingClient}>
                  <FileUp />
                  Izberi PDF
                </Button>
                <p className="min-w-0 truncate text-sm text-muted-foreground" title={newClientFile?.name}>
                  {newClientFile ? newClientFile.name : "Datoteka še ni izbrana."}
                </p>
              </div>
            </div>
            {newClientError ? (
              <p className="text-sm text-destructive" role="alert">
                {newClientError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewClientOpen(false)} disabled={creatingClient}>
                Prekliči
              </Button>
              <Button type="submit" disabled={creatingClient}>
                {creatingClient ? "Berem konte…" : "Dodaj bilanco"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function fileBase(statement: Statement, view: View) {
  const kind = view === "bilanca" ? "Bilanca stanja" : "Izkaz poslovnega izida"
  return `${kind}, presečni izkazi, ocena poslovanja ${statement.company} ${statement.currentDate}`
}

function Tab({
  active,
  onSelect,
  children,
}: {
  active: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-deep-blue text-navy-foreground" : "text-muted-foreground hover:text-navy",
      )}
    >
      {children}
    </button>
  )
}
