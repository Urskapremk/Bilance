"use client"

import { Archive, ArrowLeft, FileDown, FileText, FileUp, Printer, Receipt, Save, UserPlus } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react"

import { FormulaDialog } from "@/components/formula-dialog"
import { PdfPreview } from "@/components/pdf-preview"
import { StatementDocument } from "@/components/statement-document"
import { formulasForEditor, type AccountFormula, type AccountRow } from "@/lib/account-map"
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
  updateArchive,
  type ArchiveMeta,
} from "@/lib/archive"
import { attachPublicFiling } from "@/lib/ajpes-public"
import { checkMark, listStoredPeriods, readChecks, readDraft, readLastPlace, readStoredFormulas, readStoredLegalForm, rememberStoredClient, saveDraft, saveStoredFormulas, listStoredClients, writeChecks, writeLastPlace } from "@/lib/browser-book"
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
import { trialFromText } from "@/lib/from-pdf"
import { grafam, mappingNotes } from "@/lib/grafam"
import { inferLegalForm, legalFormOf, type LegalForm } from "@/lib/legal-form"
import type { DavcniObracun } from "@/lib/davcni-obracun"
import type { EkarticaReport } from "@/lib/ekartica"
import { applyCurrentAmount, applyEkartica, applyNormirani, type Statement } from "@/lib/trial"
import { cn } from "@/lib/utils"

type ParsedTrial = {
  statement: Statement
  vprasanja: AccountRow[]
  konti: AccountRow[]
  besedilo?: string
  error?: string
}

type View = "bilanca" | "izkaz"

type Workspace = {
  statement: Statement
  pdf: ArrayBuffer
  pdfName: string
  phase: "primer" | "osnutek" | "arhiv"
  konti: AccountRow[]
  besedilo: string
  archiveId?: string
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
  legalForm: "doo",
})

export function BilanceApp() {
  const [view, setView] = useState<View>("bilanca")
  const [showZeros, setShowZeros] = useState(false)
  const [statement, setStatement] = useState<Statement>(initialStatement)
  const [pdfUrl, setPdfUrl] = useState(DEFAULT_PDF)
  const [pdfName, setPdfName] = useState(initialStatement.sourceName)
  const [linked, setLinked] = useState(true)
  const [busy, setBusy] = useState(false)
  const [cardBusy, setCardBusy] = useState(false)
  const [taxBusy, setTaxBusy] = useState(false)
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
  const [newClientForm, setNewClientForm] = useState<LegalForm | null>(null)
  const [formTouched, setFormTouched] = useState(false)
  const [newClientFile, setNewClientFile] = useState<File | null>(null)
  const [newClientError, setNewClientError] = useState<string | null>(null)
  const [creatingClient, setCreatingClient] = useState(false)
  const [konti, setKonti] = useState<AccountRow[]>([])
  const [formulaOpen, setFormulaOpen] = useState(false)
  const [formulaRows, setFormulaRows] = useState<AccountRow[]>([])
  const [formulaMode, setFormulaMode] = useState<"nova" | "vse">("nova")
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [savingFormulas, setSavingFormulas] = useState(false)
  const [opened, setOpened] = useState(false)
  const [checks, setChecks] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const cardInputRef = useRef<HTMLInputElement>(null)
  const taxInputRef = useRef<HTMLInputElement>(null)
  const newFileRef = useRef<HTMLInputElement>(null)
  const pdfUrlRef = useRef(pdfUrl)
  const draftRef = useRef<{ statement: Statement; pdf: ArrayBuffer } | null>(null)
  const savingRef = useRef(false)
  const uploadClientRef = useRef<string | null>(null)
  const fileRef = useRef<File | null>(null)
  const workspaces = useRef(new Map<string, Workspace>())
  const textRef = useRef("")
  const formulasRef = useRef<AccountFormula[]>([])
  const phaseRef = useRef(phase)
  const pdfNameRef = useRef(pdfName)
  const activeClientRef = useRef(activeClient)
  const kontiRef = useRef<AccountRow[]>([])
  const sampleKontiRef = useRef<AccountRow[]>([])
  const sampleTextRef = useRef("")
  const persistTimer = useRef<number | null>(null)
  const archiveIdRef = useRef<string | undefined>(undefined)
  const archivePdfRef = useRef<ArrayBuffer | null>(null)
  const statementRef = useRef(statement)
  const checkScope = useRef({ company: initialStatement.company, period: initialStatement.period })
  const checkLoad = useRef(0)

  useEffect(() => {
    pdfUrlRef.current = pdfUrl
  }, [pdfUrl])

  useEffect(() => {
    phaseRef.current = phase
    pdfNameRef.current = pdfName
    activeClientRef.current = activeClient
    kontiRef.current = konti
    statementRef.current = statement
  }, [phase, pdfName, activeClient, konti, statement])

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
    void refreshClients()
  }, [])

  useEffect(() => {
    if (!opened || phase !== "primer") return
    let cancel = false
    void (async () => {
      if (textRef.current) return
      try {
        const response = await fetch(DEFAULT_PDF)
        if (!response.ok || cancel) return
        const file = new File([await response.arrayBuffer()], initialStatement.sourceName, { type: "application/pdf" })
        const body = new FormData()
        body.set("file", file)
        body.set("company", SAMPLE_CLIENT)
        const parsed = await fetch("/api/bruto-bilanca", { method: "POST", body })
        const data = (await parsed.json().catch(() => null)) as ParsedTrial | null
        if (cancel || textRef.current || phaseRef.current !== "primer" || !data?.besedilo) return
        sampleTextRef.current = data.besedilo
        textRef.current = data.besedilo
        sampleKontiRef.current = data.konti ?? []
        setKonti(data.konti ?? [])
      } catch {
        /* vzorec ostane brez preračuna formul */
      }
    })()
    return () => {
      cancel = true
    }
  }, [opened, phase])

  useEffect(() => {
    checkScope.current = { company: statement.company, period: statement.period }
    const load = ++checkLoad.current
    void readChecks(statement.company, statement.period)
      .then((marks) => {
        if (load === checkLoad.current) setChecks(marks)
      })
      .catch(() => {
        if (load === checkLoad.current) setChecks([])
      })
  }, [statement.company, statement.period])

  useEffect(() => {
    if (!opened) return
    void writeLastPlace({
      company: activeClient,
      phase,
      archiveId: phase === "arhiv" ? archiveIdRef.current : undefined,
    }).catch(() => undefined)
  }, [opened, activeClient, phase])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const place = await readLastPlace().catch(() => null)
        if (cancel) return
        if (!place || place.phase === "primer" || sameClient(place.company, SAMPLE_CLIENT)) return
        if (place.phase === "arhiv" && place.archiveId) {
          archiveIdRef.current = place.archiveId
          const openedArchive = await openArchived(place.archiveId)
          if (openedArchive || cancel) return
        }
        const draft = await readDraft(place.company).catch(() => null)
        if (cancel) return
        if (draft?.statement && draft.pdf) {
          setError(null)
          setArchiveError(null)
          textRef.current = draft.besedilo ?? ""
          applyWorkspace({
            statement: draft.statement,
            pdf: draft.pdf,
            pdfName: draft.pdfName,
            phase: "osnutek",
            konti: draft.konti ?? [],
            besedilo: draft.besedilo ?? "",
          })
          if (!draft.besedilo) void hydrateText(draft.pdf, draft.pdfName)
          return
        }
        setActiveClient(place.company)
        setBlank(true)
        setPhase("osnutek")
        setLinked(false)
        setKonti([])
      } finally {
        if (!cancel) setOpened(true)
      }
    })()
    return () => {
      cancel = true
    }
  }, [])

  function cacheWorkspace(workspace: Workspace) {
    workspaces.current.set(clientKey(workspace.statement.company), workspace)
  }

  function clearArchive() {
    archiveIdRef.current = undefined
    archivePdfRef.current = null
  }

  function openPdf(): ArrayBuffer | null {
    return phaseRef.current === "arhiv" ? archivePdfRef.current : (draftRef.current?.pdf ?? null)
  }

  function rememberWorkspace(next: Statement, nextKonti: AccountRow[] = kontiRef.current) {
    const pdf = openPdf()
    if (!pdf) return
    if (phaseRef.current !== "arhiv") draftRef.current = { statement: next, pdf }
    cacheWorkspace({
      statement: next,
      pdf,
      pdfName: pdfNameRef.current,
      phase: phaseRef.current === "primer" ? "osnutek" : phaseRef.current,
      konti: nextKonti,
      besedilo: textRef.current,
      archiveId: phaseRef.current === "arhiv" ? archiveIdRef.current : undefined,
    })
  }

  function persistOpenStatement(next: Statement, nextKonti: AccountRow[] = kontiRef.current) {
    if (persistTimer.current) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      const id = phaseRef.current === "arhiv" ? archiveIdRef.current : undefined
      if (id) {
        void updateArchive(id, next)
          .then((meta) => {
            if (!meta) return
            setArchiveItems((items) => items.map((item) => (item.id === meta.id ? { ...item, ...meta } : item)))
          })
          .catch(() => undefined)
      }
      const pdf = openPdf()
      if (!pdf || phaseRef.current === "arhiv" || sameClient(next.company, SAMPLE_CLIENT)) return
      void saveDraft(next.company, {
        statement: next,
        pdf,
        pdfName: pdfNameRef.current,
        konti: nextKonti,
        besedilo: textRef.current,
      }).catch(() => undefined)
    }, 250)
  }

  function scheduleBook(next: Statement, formule: AccountFormula[], nextKonti: AccountRow[]) {
    if (persistTimer.current) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      void saveStoredFormulas(next.company, formule).catch(() => undefined)
      void fetch("/api/formule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: next.company, formule }),
      }).catch(() => undefined)
      persistOpenStatement(next, nextKonti)
    }, 250)
  }

  async function hydrateText(pdf: ArrayBuffer, name: string) {
    if (textRef.current) return
    try {
      const file = new File([pdf], name, { type: "application/pdf" })
      const body = new FormData()
      body.set("file", file)
      const shape = legalFormOf(statementRef.current)
      body.set("oblika", shape)
      const response = await fetch("/api/bruto-bilanca", { method: "POST", body })
      const data = (await response.json().catch(() => null)) as ParsedTrial | null
      if (!textRef.current && data?.besedilo) textRef.current = data.besedilo
      if (data?.konti?.length && kontiRef.current.length === 0) {
        setKonti(data.konti)
        const cached = workspaces.current.get(clientKey(activeClientRef.current))
        if (cached) cacheWorkspace({ ...cached, konti: data.konti, besedilo: textRef.current })
      }
    } catch {
      /* naslednji popravek počaka na besedilo */
    }
  }

  function previewChoices(rows: AccountRow[], choices: Record<string, string>) {
    const text = textRef.current
    if (!text) {
      setFormulaError("Bruto bilanca se še bere. Popravek se na obrazcu pokaže takoj, ko je prebrana.")
      return
    }
    const formule = formulasForEditor(formulasRef.current, rows, choices, legalFormOf(statementRef.current))
    try {
      const parsed = trialFromText(text, pdfNameRef.current || "bruto-bilanca.pdf", formule, legalFormOf(statementRef.current))
      const named = keepStatementDates(statementForClient(parsed.statement, activeClientRef.current || parsed.statement.company))
      formulasRef.current = formule
      statementRef.current = named
      setStatement(named)
      setKonti(parsed.konti)
      setFormulaError(null)
      rememberWorkspace(named, parsed.konti)
      scheduleBook(named, formule, parsed.konti)
    } catch (caught) {
      setFormulaError(caught instanceof Error ? caught.message : "Obrazca ni bilo mogoče osvežiti.")
    }
  }

  function toggleCheck(obrazec: "bilanca" | "izkaz", aop: string) {
    checkLoad.current += 1
    const key = checkMark(obrazec, aop)
    const next = checks.includes(key) ? checks.filter((mark) => mark !== key) : [...checks, key]
    setChecks(next)
    const scope = checkScope.current
    void writeChecks(scope.company, scope.period, next).catch(() => undefined)
  }

  function keepStatementDates(next: Statement): Statement {
    const current = statementRef.current
    const merged: Statement = {
      ...next,
      period: current.period,
      currentDate: current.currentDate,
      previousDate: current.previousDate,
      signatory: current.signatory,
      subtitle: current.subtitle,
      legalForm: next.legalForm ?? current.legalForm,
      ekartica: current.ekartica,
      davcni: current.davcni,
    }
    if (legalFormOf(merged) === "sp" && merged.davcni?.regime === "normirani") return applyNormirani(merged)
    if (legalFormOf(merged) === "sp" && merged.ekartica) return applyEkartica(merged, merged.ekartica)
    return merged
  }

  async function changeLegalForm(form: LegalForm) {
    const current = statementRef.current
    if (legalFormOf(current) === form) {
      if (current.legalForm === form) return
      const marked = { ...current, legalForm: form }
      statementRef.current = marked
      setStatement(marked)
      void rememberStoredClient(marked.company, form).catch(() => undefined)
      persistOpenStatement(marked)
      return
    }
    const text = textRef.current
    if (!text) {
      const marked = { ...current, legalForm: form }
      statementRef.current = marked
      setStatement(marked)
      void rememberStoredClient(marked.company, form).catch(() => undefined)
      persistOpenStatement(marked)
      setError("Besedilo bruto bilance se še bere. Oblika je shranjena. Ko je besedilo tu, obliko izberite še enkrat, da se postavke razporedijo.")
      return
    }
    try {
      const parsed = trialFromText(text, pdfNameRef.current || "bruto-bilanca.pdf", formulasRef.current, form)
      const named = keepStatementDates(statementForClient(parsed.statement, current.company))
      statementRef.current = named
      setStatement(named)
      setKonti(parsed.konti)
      setError(null)
      rememberWorkspace(named, parsed.konti)
      void rememberStoredClient(named.company, form).catch(() => undefined)
      persistOpenStatement(named, parsed.konti)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Bilance za to obliko ni bilo mogoče sestaviti.")
    }
  }

  function editSubtitle(subtitle: string | undefined) {
    const current = statementRef.current
    const nextValue = subtitle?.trim() || undefined
    if ((current.subtitle?.trim() || undefined) === nextValue) return
    const next = { ...current, subtitle: nextValue }
    statementRef.current = next
    setStatement(next)
    rememberWorkspace(next)
    persistOpenStatement(next)
  }

  function editSignatory(id: string) {
    const current = statementRef.current
    if (current.signatory === id) return
    const next = { ...current, signatory: id }
    statementRef.current = next
    setStatement(next)
    rememberWorkspace(next)
    persistOpenStatement(next)
  }

  function editPeriod(start: string, end: string) {
    const current = statementRef.current
    const period = `${start}–${end}`
    if (current.period === period && current.currentDate === end) return
    const next = { ...current, period, currentDate: end }
    statementRef.current = next
    setStatement(next)
    if (current.period !== period) {
      checkScope.current = { company: next.company, period }
      void writeChecks(next.company, period, checks).catch(() => undefined)
    }
    rememberWorkspace(next)
    persistOpenStatement(next)
  }

  function editAmount(obrazec: "bilanca" | "izkaz", aop: string, cents: number) {
    const next = applyCurrentAmount(statementRef.current, obrazec, aop, cents)
    statementRef.current = next
    setStatement(next)
    rememberWorkspace(next)
    persistOpenStatement(next)
  }

  function showPdf(nextUrl: string, name: string) {
    setPdfUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current)
      return nextUrl
    })
    setPdfName(name)
  }

  function restoreSample() {
    statementRef.current = initialStatement
    setStatement(initialStatement)
    showPdf(DEFAULT_PDF, initialStatement.sourceName)
    setActiveClient(SAMPLE_CLIENT)
    setPhase("primer")
    setBlank(false)
    setLinked(true)
    setError(null)
    textRef.current = sampleTextRef.current
    setKonti(sampleKontiRef.current)
    setFormulaOpen(false)
    draftRef.current = null
    clearArchive()
    setSaveAsk(false)
  }

  function applyWorkspace(workspace: Workspace) {
    showPdf(URL.createObjectURL(new Blob([workspace.pdf], { type: "application/pdf" })), workspace.pdfName)
    textRef.current = workspace.besedilo
    statementRef.current = workspace.statement
    setStatement(workspace.statement)
    setActiveClient(workspace.statement.company)
    phaseRef.current = workspace.phase
    setPhase(workspace.phase)
    setBlank(false)
    setLinked(true)
    setError(null)
    setKonti(workspace.konti)
    setFormulaOpen(false)
    if (workspace.phase === "arhiv") {
      archiveIdRef.current = workspace.archiveId
      archivePdfRef.current = workspace.pdf
      draftRef.current = null
    } else {
      clearArchive()
      draftRef.current = workspace.phase === "osnutek" ? { statement: workspace.statement, pdf: workspace.pdf } : null
    }
    setSaveAsk(false)
  }

  async function refreshClients() {
    const local = await listStoredClients().catch(() => [] as string[])
    let remote: string[] = []
    try {
      remote = await listClients()
    } catch {
      remote = []
    }
    for (const name of remote) {
      if (!sameClient(name, SAMPLE_CLIENT)) await rememberStoredClient(name).catch(() => undefined)
    }
    setClients(mergeClients([...local, ...remote]))
  }

  function filingName(company?: string): string | undefined {
    if (company) return company
    if (phase === "primer") return undefined
    return activeClient
  }

  async function loadFile(file: File, company?: string, form?: LegalForm | null): Promise<boolean> {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      const message = "Dodajte datoteko PDF."
      if (company) setNewClientError(message)
      else setError(message)
      return false
    }
    const namedCompany = filingName(company)
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
      if (namedCompany) {
        body.set("company", namedCompany)
        const savedFormulas = await readStoredFormulas(namedCompany).catch(() => [])
        formulasRef.current = savedFormulas
        if (savedFormulas.length) body.set("formule", JSON.stringify(savedFormulas))
      }
      const storedForm = namedCompany ? await readStoredLegalForm(namedCompany).catch(() => null) : null
      const openForm =
        namedCompany && statementRef.current && sameClient(statementRef.current.company, namedCompany)
          ? statementRef.current.legalForm
          : undefined
      const oblika = form ?? openForm ?? storedForm ?? (namedCompany ? inferLegalForm(namedCompany) : null)
      if (oblika) body.set("oblika", oblika)
      const response = await fetch("/api/bruto-bilanca", { method: "POST", body })
      const data = (await response.json().catch(() => null)) as ParsedTrial | null
      if (!response.ok || !data?.statement?.company) {
        throw new Error(data?.error ?? "Bruto bilance ni bilo mogoče prebrati.")
      }
      const pdf = (await file.arrayBuffer()).slice(0)
      const named = namedCompany ? statementForClient(data.statement, namedCompany) : data.statement
      const draft = { statement: named, pdf }
      draftRef.current = draft
      fileRef.current = file
      textRef.current = data.besedilo ?? ""
      phaseRef.current = "osnutek"
      clearArchive()
      cacheWorkspace({
        statement: named,
        pdf,
        pdfName: file.name,
        phase: "osnutek",
        konti: data.konti ?? [],
        besedilo: data.besedilo ?? "",
      })
      statementRef.current = named
      setStatement(named)
      setActiveClient(named.company)
      setKonti(data.konti ?? [])
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
      setFormulaOpen(false)
      setFormulaRows(data.konti ?? [])
      showView("bilanca")
      requestAnimationFrame(() => {
        document.querySelector("article.print-sheet, section.print-sheet")?.scrollIntoView({ block: "start" })
      })
      try {
        await rememberStoredClient(named.company, named.legalForm)
        await saveDraft(named.company, {
          statement: named,
          pdf,
          pdfName: file.name,
          konti: data.konti ?? [],
          besedilo: data.besedilo ?? "",
        })
      } catch {
        setError("Bilanca je izračunana, baze stranke pa ni bilo mogoče zapisati.")
      }
      void rememberClientName(named.company)
        .then(() => refreshClients())
        .catch(() => setClients((current) => mergeClients([...current, named.company])))
      return true
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Bruto bilance ni bilo mogoče prebrati."
      setLinked(false)
      draftRef.current = null
      clearArchive()
      setSaveAsk(false)
      if (company) setNewClientError(message)
      else setError(message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function rememberFormulas(formule: AccountFormula[]) {
    const name = activeClientRef.current || statement.company
    if (!name) return
    setSavingFormulas(true)
    setFormulaError(null)
    try {
      const full = formulasForEditor(
        formulasRef.current,
        formulaRows,
        Object.fromEntries(formule.map((formula) => [formula.code, formula.aop])),
        legalFormOf(statementRef.current),
      )
      formulasRef.current = full
      await saveStoredFormulas(name, full)
      const response = await fetch("/api/formule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: name, formule: full }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? "Formul ni bilo mogoče shraniti.")
      }
      if (textRef.current) {
        const parsed = trialFromText(
          textRef.current,
          pdfNameRef.current || "bruto-bilanca.pdf",
          full,
          legalFormOf(statementRef.current),
        )
        const named = keepStatementDates(statementForClient(parsed.statement, name))
        statementRef.current = named
        setStatement(named)
        setKonti(parsed.konti)
        rememberWorkspace(named, parsed.konti)
        const id = phaseRef.current === "arhiv" ? archiveIdRef.current : undefined
        if (id) await updateArchive(id, named)
        const pdf = openPdf()
        if (pdf && phaseRef.current !== "arhiv") {
          await saveDraft(name, {
            statement: named,
            pdf,
            pdfName: pdfNameRef.current,
            konti: parsed.konti,
            besedilo: textRef.current,
          })
        }
      }
      setFormulaOpen(false)
    } catch (caught) {
      setFormulaError(caught instanceof Error ? caught.message : "Formul ni bilo mogoče shraniti.")
    } finally {
      setSavingFormulas(false)
    }
  }

  async function loadCard(file: File) {
    if (legalFormOf(statementRef.current) !== "sp") return
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Dodajte datoteko PDF.")
      return
    }
    setCardBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.set("file", file)
      const response = await fetch("/api/ekartica", { method: "POST", body })
      const data = (await response.json().catch(() => null)) as (EkarticaReport & { error?: string }) | null
      if (!response.ok || !data || typeof data.totalCents !== "number" || !Array.isArray(data.accounts)) {
        throw new Error(data?.error ?? "Kartice eDavkov ni bilo mogoče prebrati.")
      }
      const next = applyEkartica({ ...statementRef.current, ekartica: data }, data)
      statementRef.current = next
      setStatement(next)
      rememberWorkspace(next)
      persistOpenStatement(next)
      showView("izkaz")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kartice eDavkov ni bilo mogoče prebrati.")
    } finally {
      setCardBusy(false)
    }
  }

  async function loadTax(file: File) {
    if (legalFormOf(statementRef.current) !== "sp") return
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Dodajte datoteko PDF.")
      return
    }
    setTaxBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.set("file", file)
      const response = await fetch("/api/davcni-obracun", { method: "POST", body })
      const data = (await response.json().catch(() => null)) as (DavcniObracun & { error?: string }) | null
      if (!response.ok || !data || data.regime !== "normirani" || typeof data.revenuesCents !== "number") {
        throw new Error(data?.error ?? "Obračuna davka ni bilo mogoče prebrati.")
      }
      const next = applyNormirani({ ...statementRef.current, davcni: data })
      statementRef.current = next
      setStatement(next)
      rememberWorkspace(next)
      persistOpenStatement(next)
      showView("izkaz")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Obračuna davka ni bilo mogoče prebrati.")
    } finally {
      setTaxBusy(false)
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
    const draft = await readDraft(name).catch(() => null)
    const stored = await listStoredPeriods().catch(() => [])
    const latest = stored.find((item) => sameClient(item.company, name)) ?? items.find((item) => sameClient(item.company, name))
    const sameSavedWork =
      latest &&
      draft?.statement &&
      latest.period === draft.statement.period &&
      latest.sourceName === draft.pdfName &&
      latest.savedAt >= draft.savedAt
    if (latest && (!draft?.statement || sameSavedWork)) {
      await openArchived(latest.id)
      return
    }
    if (draft?.statement && draft.pdf) {
      textRef.current = draft.besedilo ?? ""
      applyWorkspace({
        statement: draft.statement,
        pdf: draft.pdf,
        pdfName: draft.pdfName,
        phase: "osnutek",
        konti: draft.konti ?? [],
        besedilo: draft.besedilo ?? "",
      })
      if (!draft.besedilo) void hydrateText(draft.pdf, draft.pdfName)
      return
    }
    if (sameClient(name, SAMPLE_CLIENT)) {
      restoreSample()
      return
    }
    setActiveClient(name)
    setBlank(true)
    setKonti([])
    setFormulaOpen(false)
    setLinked(false)
    setError(null)
    setPhase("osnutek")
    draftRef.current = null
    clearArchive()
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
    if (!newClientForm) {
      setNewClientError("Izberite pravno obliko.")
      return
    }
    setCreatingClient(true)
    setNewClientError(null)
    try {
      await rememberStoredClient(name, newClientForm)
      await refreshClients()
      await loadFile(newClientFile, name, newClientForm)
    } finally {
      setCreatingClient(false)
    }
  }

  function askToSave() {
    if (savingRef.current || phaseRef.current === "primer" || !openPdf()) return
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
    const pdf = openPdf()
    const current = statementRef.current
    if (!pdf || savingRef.current) return
    savingRef.current = true
    setSavingArchive(true)
    setSaveError(null)
    setError(null)
    try {
      const meta =
        phaseRef.current === "arhiv" && archiveIdRef.current
          ? await updateArchive(archiveIdRef.current, current)
          : await saveArchive(current, pdf.slice(0))
      if (!meta) throw new Error("Shranjene bilance ni bilo mogoče zapisati.")
      setArchiveItems(await listArchive())
      archiveIdRef.current = meta.id
      archivePdfRef.current = pdf.slice(0)
      phaseRef.current = "arhiv"
      setPhase("arhiv")
      cacheWorkspace({
        statement: current,
        pdf,
        pdfName: current.sourceName,
        phase: "arhiv",
        konti,
        besedilo: textRef.current,
        archiveId: meta.id,
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

  async function openArchived(id: string): Promise<boolean> {
    setArchiveError(null)
    setBusy(true)
    try {
      const stored = await readArchive(id)
      const nextUrl = URL.createObjectURL(new Blob([stored.pdf], { type: "application/pdf" }))
      showPdf(nextUrl, stored.sourceName)
      setStatement(stored.statement)
      statementRef.current = stored.statement
      setActiveClient(stored.statement.company)
      archiveIdRef.current = id
      archivePdfRef.current = stored.pdf.slice(0)
      textRef.current = ""
      cacheWorkspace({
        statement: stored.statement,
        pdf: stored.pdf,
        pdfName: stored.sourceName,
        phase: "arhiv",
        konti: [],
        besedilo: "",
        archiveId: id,
      })
      void hydrateText(stored.pdf, stored.sourceName)
      setKonti([])
      setFormulaOpen(false)
      setLinked(true)
      setBlank(false)
      phaseRef.current = "arhiv"
      setPhase("arhiv")
      draftRef.current = null
      setSaveAsk(false)
      setSavedMeta(null)
      setArchiveOpen(false)
      return true
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Končne bilance ni bilo mogoče odpreti."
      setArchiveError(message)
      setError(message)
      return false
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
      if (!blob.size || blob.type.includes("json")) throw new Error("PDF ni bil ustvarjen.")
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${fileBase(statement, view)}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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
        {phase !== "primer" && !blank ? (
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
        {error ? (
          <p className="basis-full text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )

  if (!opened) {
    return (
      <div className="min-h-svh bg-background">
        <div className="no-print border-b border-border">
          <div className="mx-auto flex max-w-[1440px] px-4 py-3 lg:px-6">
            <a
              href="https://hnatura.app"
              className="inline-flex items-center gap-2 text-sm font-medium text-navy underline-offset-4 hover:text-gold hover:underline"
            >
              <ArrowLeft className="size-4" />
              Programi
            </a>
          </div>
        </div>
        <p className="font-heading px-6 py-24 text-center text-3xl font-semibold text-navy">Odpiram zadnjo bilanco.</p>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="no-print border-b border-border">
        <div className="mx-auto flex max-w-[1440px] px-4 py-3 lg:px-6">
          <a
            href="https://hnatura.app"
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
          <StatementDocument
            statement={statement}
            view={view}
            showZeros={showZeros}
            toolbar={toolbar}
            busy={busy}
            onEdit={editAmount}
            onPeriod={editPeriod}
            onSignatory={editSignatory}
            onSubtitle={editSubtitle}
            onLegalForm={(form) => void changeLegalForm(form)}
            checks={new Set(checks)}
            onToggleCheck={toggleCheck}
          />
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
                    ? "Shranjeno obdobje. Obdobje vpišite v polji Od in Do. Znesek tekočega leta popravite v vrstici. Shrani zapiše to bilanco, takšno kot je zdaj."
                    : phase === "osnutek"
                      ? "Bilanca je naložena. Obdobje vpišite v polji Od in Do. Najprej jo preglejte. Pravila odprejo okno, ki ga primete za naslov in premaknete, da vidite bilanco. Ko je v redu, Shrani vpraša, ali se pod to stranko zapišeta izvorni PDF ter oba obrazca obdobja."
                      : "Obrazec je sestavljen iz tega izpisa. Popravek zneska v tekočem letu se na njem pokaže takoj."
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
            <input
              ref={cardInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void loadCard(file)
                event.target.value = ""
              }}
            />
            <input
              ref={taxInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void loadTax(file)
                event.target.value = ""
              }}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => choosePdf(blank ? activeClient : undefined)}
                disabled={busy || cardBusy || taxBusy || savingArchive || creatingClient}
              >
                <FileUp />
                {busy ? "Berem konte…" : "Dodaj PDF"}
              </Button>
              {!blank && legalFormOf(statement) === "sp" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cardInputRef.current?.click()}
                  disabled={busy || cardBusy || taxBusy || savingArchive || creatingClient}
                >
                  <Receipt />
                  {cardBusy ? "Berem kartico…" : "Kartica eDavkov"}
                </Button>
              ) : null}
              {!blank && legalFormOf(statement) === "sp" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => taxInputRef.current?.click()}
                  disabled={busy || cardBusy || taxBusy || savingArchive || creatingClient}
                >
                  <FileText />
                  {taxBusy ? "Berem obračun…" : "Obračun davka"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setNewClientName("")
                  setNewClientForm(null)
                  setFormTouched(false)
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
              {konti.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || savingFormulas}
                  onClick={() => {
                    void readStoredFormulas(activeClient)
                      .then((formule) => {
                        formulasRef.current = formule
                      })
                      .catch(() => undefined)
                      .finally(() => {
                        setFormulaMode("vse")
                        setFormulaRows(konti)
                        setFormulaError(null)
                        setFormulaOpen(true)
                      })
                  }}
                >
                  Pravila
                </Button>
              ) : null}
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

      <FormulaDialog
        open={formulaOpen}
        company={statement.company}
        rows={formulaRows}
        mode={formulaMode}
        busy={savingFormulas}
        error={formulaError}
        onOpenChange={setFormulaOpen}
        onConfirm={(formule) => void rememberFormulas(formule)}
        onPreview={(choices) => previewChoices(formulaRows, choices)}
        form={legalFormOf(statement)}
      />

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
              Vsaka stranka hrani svoja obdobja v svoji bazi. Pri obdobju sta shranjena izvorni PDF ter oba obrazca. Znesek v odprtem obdobju popravite na obrazcu.
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
            <DialogDescription>
              Vsaka stranka ima svojo bazo v tem brskalniku. Formule in shranjena obdobja ostanejo, tudi ko se program posodobi.
            </DialogDescription>
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
                const seeded = visibleClients.length === 0 ? typed : ""
                setNewClientName(seeded)
                setNewClientForm(inferLegalForm(seeded))
                setFormTouched(false)
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
              Vpišite naziv, izberite pravno obliko in dodajte bruto bilanco. Iz nje se sestavi bilanca po obrazcu AJPES
              za to obliko.
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
                onChange={(event) => {
                  const value = event.target.value
                  setNewClientName(value)
                  if (!formTouched) setNewClientForm(inferLegalForm(value))
                }}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-navy">Pravna oblika</legend>
              <div className="grid gap-2">
                {(
                  [
                    ["doo", "d.o.o.", "Gospodarska družba. Kapital, rezerve in čisti dobiček."],
                    ["drustvo", "Društvo", "Društveni sklad in revalorizacijske rezerve."],
                    ["zavod", "Zavod", "Lastni viri, ustanovitveni vložek in presežek prihodkov."],
                    ["sp", "Samostojni podjetnik", "Podjetnikov kapital, pritoki in odtoki, podjetnikov dohodek."],
                  ] as const
                ).map(([id, label, hint]) => {
                  const selected = newClientForm === id
                  return (
                    <label
                      key={id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2",
                        selected ? "border-gold bg-accent" : "border-border bg-card",
                      )}
                    >
                      <input
                        type="radio"
                        name="pravna-oblika"
                        className="mt-1"
                        checked={selected}
                        disabled={creatingClient}
                        onChange={() => {
                          setFormTouched(true)
                          setNewClientForm(id)
                        }}
                      />
                      <span>
                        <span className="block text-sm font-medium text-navy">{label}</span>
                        <span className="block text-xs text-muted-foreground">{hint}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
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
  return `${kind}, presečni izkazi ${statement.company} ${statement.currentDate}`
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
