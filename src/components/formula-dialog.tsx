"use client"

import { X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"

import {
  NIKAMOR,
  canonAop,
  choicesFor,
  filterAccountRows,
  isNikamor,
  isSelectableAop,
  type AccountFormula,
  type AccountRow,
} from "@/lib/account-map"
import type { LegalForm } from "@/lib/legal-form"
import { formatCents } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function FormulaDialog({
  open,
  company,
  rows,
  mode,
  busy,
  error,
  onOpenChange,
  onConfirm,
  onPreview,
  form = "doo",
}: {
  open: boolean
  company: string
  rows: AccountRow[]
  mode: "nova" | "vse"
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (formule: AccountFormula[]) => void
  onPreview?: (choices: Record<string, string>) => void
  form?: LegalForm
}) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const [pos, setPos] = useState({ x: 16, y: 16 })

  useEffect(() => {
    if (!open) return
    const width = Math.min(768, window.innerWidth - 16)
    setPos({ x: Math.max(8, window.innerWidth - width - 12), y: 12 })
  }, [open])

  if (!open || typeof document === "undefined") return null

  function clamp(x: number, y: number) {
    const width = panel.current?.offsetWidth ?? 320
    return {
      x: Math.min(window.innerWidth - 72, Math.max(16 - width, x)),
      y: Math.min(window.innerHeight - 48, Math.max(8, y)),
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (busy) return
    if ((event.target as HTMLElement).closest("button")) return
    const rect = panel.current?.getBoundingClientRect()
    if (!rect) return
    drag.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    setPos(clamp(event.clientX - drag.current.dx, event.clientY - drag.current.dy))
  }

  function onPointerUp() {
    drag.current = null
  }

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Kam gre konto?"
      className="fixed z-40 flex max-h-[calc(100dvh-1rem)] w-[min(48rem,calc(100vw-1rem))] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex cursor-grab touch-none items-start justify-between gap-3 border-b border-border px-5 py-3 select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-gold uppercase">Primite in premaknite</p>
          <h2 className="font-heading text-2xl font-semibold text-navy">Kam gre konto?</h2>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-navy hover:bg-secondary"
          aria-label="Zapri"
          disabled={busy}
          onClick={() => onOpenChange(false)}
        >
          <X className="size-4" />
        </button>
      </div>
      <FormulaForm
        key={`${company}:${mode}:${rows.map((row) => row.code).join(",")}`}
        company={company}
        rows={rows}
        busy={busy}
        error={error}
        onClose={() => onOpenChange(false)}
        onConfirm={onConfirm}
        onPreview={onPreview}
        form={form}
      />
    </div>,
    document.body,
  )
}


function cnLabel(valid: boolean): string {
  return valid
    ? "min-w-0 flex-1 basis-48 pt-1.5 text-sm leading-snug break-words text-navy"
    : "min-w-0 flex-1 basis-48 pt-1.5 text-sm leading-snug break-words text-destructive"
}

type PendingRule = {
  code: string
  name: string
  from: string
  to: string
  toLabel: string
}

function FormulaForm({
  company,
  rows,
  busy,
  error,
  onClose,
  onConfirm,
  onPreview,
  form,
}: {
  company: string
  rows: AccountRow[]
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: (formule: AccountFormula[]) => void
  onPreview?: (choices: Record<string, string>) => void
  form: LegalForm
}) {
  const [query, setQuery] = useState("")
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.code, row.aop])),
  )
  const [pending, setPending] = useState<PendingRule | null>(null)
  const applied = useRef<Record<string, string>>(Object.fromEntries(rows.map((row) => [row.code, canonAop(row.aop) || row.aop])))
  const lastCode = useRef<string | null>(null)
  const preview = useRef(onPreview)
  preview.current = onPreview
  const catalog = useMemo(() => choicesFor(form), [form])
  const labels = useMemo(() => {
    const map = new Map<string, string>()
    for (const choice of [...catalog.bilanca, ...catalog.izkaz]) map.set(choice.aop, choice.label)
    return map
  }, [catalog])

  function appliedChoices() {
    return Object.fromEntries(rows.map((row) => [row.code, applied.current[row.code] ?? (canonAop(row.aop) || row.aop)]))
  }

  function ask(code: string, raw: string, finish: boolean) {
    if (pending && pending.code !== code) return
    const from = applied.current[code] ?? ""
    if (isNikamor(raw)) {
      if (isNikamor(from)) return
      if (pending?.code === code && isNikamor(pending.to)) return
      const row = rows.find((item) => item.code === code)
      setPending({
        code,
        name: row?.name ?? "",
        from,
        to: NIKAMOR,
        toLabel: "Ne vpiši nikamor",
      })
      return
    }
    const digits = raw.trim()
    const canon = canonAop(digits)
    const ready = finish || /^\d{3}[a-z]?$/i.test(digits)
    if (!ready) return
    const next = canon
    if (!isSelectableAop(next, form) || next === from) return
    if (pending?.code === code && pending.to === next) return
    const row = rows.find((item) => item.code === code)
    setPending({
      code,
      name: row?.name ?? "",
      from,
      to: next,
      toLabel: labels.get(next) ?? "",
    })
  }

  function acceptRule() {
    if (!pending) return
    applied.current[pending.code] = pending.to
    const next = appliedChoices()
    setChoices((current) => ({ ...current, [pending.code]: pending.to }))
    setPending(null)
    preview.current?.(next)
  }

  function declineRule() {
    if (!pending) return
    const code = pending.code
    const from = pending.from
    setChoices((current) => ({ ...current, [code]: from }))
    setPending(null)
  }

  useEffect(() => {
    if (pending) return
    const code = lastCode.current
    if (!code) return
    const timer = window.setTimeout(() => ask(code, choices[code] ?? "", false), 450)
    return () => window.clearTimeout(timer)
  }, [choices, pending])
  const visible = useMemo(() => filterAccountRows(rows, query, choices), [rows, query, choices])
  const chosen = (code: string) => {
    const raw = choices[code] ?? ""
    return isNikamor(raw) ? NIKAMOR : canonAop(raw)
  }
  const missing = rows.some((row) => {
    const raw = (choices[row.code] ?? "").trim()
    if (isNikamor(raw)) return false
    if (!raw) return Boolean(row.suggested)
    return !isSelectableAop(chosen(row.code), form)
  })

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-5 py-4">
        <p className="text-sm leading-relaxed break-words text-muted-foreground">
          Primite naslov in premaknite okno, da spodaj vidite bilanco {company}. Ko spremenite AOP, vprašam, ali pravilo
          upoštevam v tekoči bilanci. Po potrditvi se vpiše v obrazec. Z izbiro Ne vpiši nikamor znesek ne gre na nobeno
          postavko.
        </p>
        <div className="space-y-2">
          <Label htmlFor="isci-konto">Poišči konto</Label>
          <Input
            id="isci-konto"
            value={query}
            placeholder="na primer 9831"
            disabled={busy}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">V tej bruto bilanci ni kontov z zneskom.</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobene vrstice s tem kontom.</p>
        ) : (
          <ul className="min-w-0 space-y-2">
            {visible.map((row) => {
              const raw = (choices[row.code] ?? "").trim()
              const nowhere = isNikamor(raw)
              const valid = nowhere || isSelectableAop(chosen(row.code), form)
              const lineName = nowhere
                ? "Znesek ne gre na nobeno postavko."
                : labels.get(chosen(row.code))
              return (
                <li key={row.code} className="min-w-0 space-y-2 rounded-lg border border-border px-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium break-all text-navy">{row.code}</p>
                    <p className="text-sm leading-snug break-words text-navy">{row.name}</p>
                    <p className="text-sm font-medium whitespace-nowrap text-navy tabular-nums">{formatCents(row.amount)} €</p>
                  </div>
                  <label className="block min-w-0">
                    <span className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-1">
                      <input
                        list="aop-sifrant"
                        inputMode="text"
                        aria-label={`AOP za konto ${row.code}`}
                        className="h-9 w-28 shrink-0 rounded-lg border border-input bg-background px-2 text-sm text-navy outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={nowhere ? "" : (choices[row.code] ?? "")}
                        disabled={busy}
                        onChange={(event) => {
                          const value = event.target.value.trim()
                          lastCode.current = row.code
                          setChoices((current) => ({ ...current, [row.code]: value }))
                        }}
                        onBlur={(event) => {
                          if (isNikamor(choices[row.code] ?? "")) return
                          ask(row.code, event.target.value, true)
                        }}
                      />
                      <span className={cnLabel(valid || !raw)}>
                        {lineName ?? (raw ? "Tega AOP ni na obrazcu." : "Vpišite AOP, na primer 090.")}
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    aria-pressed={nowhere}
                    disabled={busy}
                    className={
                      nowhere
                        ? "h-9 w-full rounded-lg border border-gold bg-accent px-3 text-left text-sm font-medium text-navy"
                        : "h-9 w-full rounded-lg border border-input bg-background px-3 text-left text-sm text-navy hover:bg-secondary"
                    }
                    onClick={() => {
                      lastCode.current = row.code
                      setChoices((current) => ({ ...current, [row.code]: NIKAMOR }))
                      ask(row.code, NIKAMOR, true)
                    }}
                  >
                    Ne vpiši nikamor
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <datalist id="aop-sifrant">
          {catalog.bilanca.map((choice) => (
            <option key={`b-${choice.aop}`} value={choice.aop} label={choice.label} />
          ))}
          {catalog.izkaz.map((choice) => (
            <option key={`i-${choice.aop}`} value={choice.aop} label={choice.label} />
          ))}
        </datalist>
      </div>
      <div className="shrink-0 space-y-3 border-t border-border bg-popover px-5 py-3">
        {pending ? (
          <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-gold/50 bg-accent px-3 py-3" role="status">
            <p className="text-sm leading-relaxed break-words text-navy">
              {isNikamor(pending.to)
                ? `Znesek konta ${pending.code} ${pending.name} ne vpišem na nobeno postavko. Ali to upoštevam v tekoči bilanci?`
                : `Konto ${pending.code} ${pending.name} naj gre na AOP ${pending.to}${pending.toLabel ? `, ${pending.toLabel}` : ""}. Ali to upoštevam v tekoči bilanci?`}
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={declineRule} disabled={busy}>
                Ne
              </Button>
              <Button type="button" onClick={acceptRule} disabled={busy}>
                Da, upoštevaj
              </Button>
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="text-sm break-words text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Zapri
          </Button>
          <Button
            type="button"
            disabled={busy || missing || rows.length === 0 || pending !== null}
            onClick={() => onConfirm(rows.map((row) => ({ code: row.code, aop: applied.current[row.code] || chosen(row.code) })))}
          >
            {busy ? "Shranjujem…" : "Zapomni si za stranko"}
          </Button>
        </div>
      </div>
    </div>
  )
}
