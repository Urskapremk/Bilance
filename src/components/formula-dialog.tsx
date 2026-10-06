"use client"

import { X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"

import { AOP_CHOICES, isSelectableAop, type AccountFormula, type AccountRow } from "@/lib/account-map"
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
}) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const [pos, setPos] = useState({ x: 16, y: 16 })

  useEffect(() => {
    if (!open) return
    const width = Math.min(560, window.innerWidth - 24)
    setPos({ x: Math.max(12, window.innerWidth - width - 16), y: 16 })
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
      className="fixed z-40 flex max-h-[min(640px,calc(100vh-2rem))] w-[min(560px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
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
      />
    </div>,
    document.body,
  )
}

function canonAop(value: string): string {
  const digits = value.trim()
  if (!/^\d+$/.test(digits)) return ""
  return digits.padStart(3, "0")
}

function cnLabel(valid: boolean): string {
  return valid ? "mt-1 block truncate text-xs text-muted-foreground" : "mt-1 block truncate text-xs text-destructive"
}

function FormulaForm({
  company,
  rows,
  busy,
  error,
  onClose,
  onConfirm,
  onPreview,
}: {
  company: string
  rows: AccountRow[]
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: (formule: AccountFormula[]) => void
  onPreview?: (choices: Record<string, string>) => void
}) {
  const [query, setQuery] = useState("")
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.code, row.aop])),
  )
  const preview = useRef(onPreview)
  preview.current = onPreview
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const timer = window.setTimeout(() => preview.current?.(choices), 180)
    return () => window.clearTimeout(timer)
  }, [choices])
  const needle = query.trim().toLocaleLowerCase("sl")
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (!needle) return true
        return (
          row.code.toLocaleLowerCase("sl").includes(needle) ||
          row.name.toLocaleLowerCase("sl").includes(needle) ||
          (choices[row.code] ?? "").includes(needle)
        )
      }),
    [rows, needle, choices],
  )
  const chosen = (code: string) => canonAop(choices[code] ?? "")
  const missing = rows.some((row) => !isSelectableAop(chosen(row.code)))
  const labels = useMemo(() => {
    const map = new Map<string, string>()
    for (const choice of [...AOP_CHOICES.bilanca, ...AOP_CHOICES.izkaz]) map.set(choice.aop, choice.label)
    return map
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Primite naslov in premaknite okno, da spodaj vidite bilanco {company}. Določite, v kateri AOP gre konto, na
        primer 9831 na AOP 090. Popravek se takoj pokaže na obrazcu.
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
        <ul className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {visible.map((row) => (
            <li key={row.code} className="grid gap-2 rounded-lg border border-border px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-navy" title={row.name}>
                  <span className="font-medium">{row.code}</span>{" "}
                  <span className="text-muted-foreground">{row.name}</span>
                </p>
                <p className="shrink-0 text-sm text-navy tabular-nums">{formatCents(row.amount)} €</p>
              </div>
              <label className="block">
                <span className="sr-only">AOP za konto {row.code}</span>
                <input
                  list="aop-sifrant"
                  inputMode="numeric"
                  className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-navy outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={choices[row.code] ?? ""}
                  disabled={busy}
                  onChange={(event) => setChoices((current) => ({ ...current, [row.code]: event.target.value.trim() }))}
                />
                <span className={cnLabel(isSelectableAop(chosen(row.code)) || !(choices[row.code] ?? "").trim())}>
                  {labels.get(chosen(row.code)) ?? ((choices[row.code] ?? "").trim() ? "Tega AOP ni na obrazcu." : "Vpišite AOP, na primer 090.")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <datalist id="aop-sifrant">
        {AOP_CHOICES.bilanca.map((choice) => (
          <option key={`b-${choice.aop}`} value={choice.aop} label={choice.label} />
        ))}
        {AOP_CHOICES.izkaz.map((choice) => (
          <option key={`i-${choice.aop}`} value={choice.aop} label={choice.label} />
        ))}
      </datalist>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Zapri
        </Button>
        <Button
          type="button"
          disabled={busy || missing || rows.length === 0}
          onClick={() =>
            onConfirm(rows.map((row) => ({ code: row.code, aop: chosen(row.code) })))
          }
        >
          {busy ? "Shranjujem…" : "Zapomni si za stranko"}
        </Button>
      </div>
    </div>
  )
}
