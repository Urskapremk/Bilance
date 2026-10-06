"use client"

import { useMemo, useState } from "react"

import { AOP_CHOICES, isSelectableAop, type AccountFormula, type AccountRow } from "@/lib/account-map"
import { formatCents } from "@/lib/format"
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

export function FormulaDialog({
  open,
  company,
  rows,
  mode,
  busy,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  company: string
  rows: AccountRow[]
  mode: "nova" | "vse"
  busy: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (formule: AccountFormula[]) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        showCloseButton={!busy}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        {open ? (
          <div className="flex max-h-[min(560px,calc(100vh-6rem))] min-h-0 flex-col gap-4">
            <FormulaForm
              key={`${company}:${mode}:${rows.map((row) => row.code).join(",")}`}
              company={company}
              rows={rows}
              mode={mode}
              busy={busy}
              error={error}
              onClose={() => onOpenChange(false)}
              onConfirm={onConfirm}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
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
  mode,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  company: string
  rows: AccountRow[]
  mode: "nova" | "vse"
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: (formule: AccountFormula[]) => void
}) {
  const [query, setQuery] = useState("")
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.code, row.aop])),
  )
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
    <>
      <DialogHeader>
        <DialogTitle className="text-2xl text-navy">Kam gre konto?</DialogTitle>
        <DialogDescription>
          {mode === "nova"
            ? `Za ${company} so predlogi že vpisani. Spremenite samo konte, ki gredo drugam, na primer 9831 na AOP 090. Izbor se shrani in velja tudi za naslednje bruto bilance te stranke.`
            : `Formule stranke ${company}. Spremenjeni konto velja za to in za naslednje bruto bilance.`}
        </DialogDescription>
      </DialogHeader>
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
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Pozneje
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
      </DialogFooter>
    </>
  )
}
