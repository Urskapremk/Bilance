"use client"

import { useMemo, useState } from "react"
import { Check } from "lucide-react"
import Image from "next/image"

import { rollup } from "@/lib/compute"
import { formatCents } from "@/lib/format"
import { grafam, mappingNotes } from "@/lib/grafam"
import { INCOME_LINES, rollupIncome, type IncomeLine } from "@/lib/income"
import { LINES, descendantLeaves, type LineDef } from "@/lib/schema"
import { cn } from "@/lib/utils"

type View = "bilanca" | "izkaz"

export function BilanceApp() {
  const [view, setView] = useState<View>("bilanca")
  const [showZeros, setShowZeros] = useState(false)

  const current = useMemo(() => rollup(grafam.balance.current), [])
  const previous = useMemo(() => rollup(grafam.balance.previous), [])
  const income = useMemo(() => rollupIncome(grafam.income), [])

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-center px-6 py-5">
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

      <section className="mx-auto max-w-3xl px-6 pt-14 pb-8 text-center md:pt-20">
        <p className="mb-4 flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-gold uppercase">
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
          Bilance
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
        </p>
        <h1 className="font-heading text-4xl leading-tight font-semibold text-balance text-navy md:text-5xl">
          Bilanca stanja in izkaz poslovnega izida
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">
          Sestavljeno iz bruto bilance {grafam.company}. Shema in oznake AOP so po
          poenotenem obrazcu AJPES za gospodarske družbe.
        </p>
      </section>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        <div className="rounded-xl border border-border bg-card p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium tracking-[0.2em] text-gold uppercase">Družba</p>
              <h2 className="font-heading mt-1 text-3xl font-semibold text-navy">{grafam.company}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Obdobje {grafam.period}. Stanje na dan {grafam.currentDate}, primerjava z{" "}
                {grafam.previousDate}. Zneski v evrih.
              </p>
            </div>
            <p className="inline-flex w-fit items-center gap-1.5 rounded-full border border-gold/50 bg-accent px-3 py-1 text-xs font-medium text-navy">
              <Check className="size-3.5 text-gold" />
              Stranici sta usklajeni
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Metric label="Sredstva" hint={grafam.currentDate} value={current["001"]} />
            <Metric label="Obveznosti do virov" hint={grafam.currentDate} value={current["055"]} />
            <Metric label="Čisti dobiček obdobja" hint="osem mesecev" value={income["186"]} accent />
          </div>
        </div>

        <div className="no-print mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-lg border border-border bg-secondary p-1">
            <Tab active={view === "bilanca"} onClick={() => setView("bilanca")}>
              Bilanca stanja
            </Tab>
            <Tab active={view === "izkaz"} onClick={() => setView("izkaz")}>
              Izkaz poslovnega izida
            </Tab>
          </div>
          <button
            type="button"
            aria-pressed={showZeros}
            onClick={() => setShowZeros((value) => !value)}
            className="text-sm font-medium text-navy underline-offset-4 hover:text-gold hover:underline"
          >
            {showZeros ? "Skrij prazne postavke" : "Prikaži celotno shemo AJPES"}
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {view === "bilanca" ? (
            <BalanceTable current={current} previous={previous} showZeros={showZeros} />
          ) : (
            <IncomeTable values={income} showZeros={showZeros} />
          )}
        </div>

        <details className="group mt-8 rounded-xl border border-border bg-card px-6 py-5">
          <summary className="cursor-pointer list-none text-sm font-semibold tracking-[0.16em] text-gold uppercase">
            Kako so konti razporejeni
          </summary>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            {mappingNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
          <p>Hnatura d.o.o. — Računovodski servis</p>
          <p className="text-xs">Bilance · obrazec po shemi AJPES</p>
        </div>
      </footer>
    </div>
  )
}

function Metric({
  label,
  hint,
  value,
  accent = false,
}: {
  label: string
  hint: string
  value: number
  accent?: boolean
}) {
  return (
    <div className={cn("rounded-xl border px-5 py-4", accent ? "border-gold/50 bg-accent" : "border-border bg-secondary")}>
      <p className="text-xs font-medium tracking-[0.16em] text-gold uppercase">{label}</p>
      <p className="font-heading mt-2 text-3xl font-semibold text-navy tabular-nums">{formatCents(value)} €</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-navy text-navy-foreground" : "text-muted-foreground hover:text-navy",
      )}
    >
      {children}
    </button>
  )
}

function BalanceTable({
  current,
  previous,
  showZeros,
}: {
  current: Record<string, number>
  previous: Record<string, number>
  showZeros: boolean
}) {
  const rows = LINES.filter((line) => {
    if (showZeros) return true
    return descendantLeaves(line.aop).some(
      (aop) => (current[aop] ?? 0) !== 0 || (previous[aop] ?? 0) !== 0,
    )
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">Bilanca stanja {grafam.company}</caption>
        <thead>
          <tr className="bg-navy text-left text-[11px] tracking-[0.14em] text-navy-foreground uppercase">
            <th className="px-5 py-3 font-medium md:px-7">Postavka</th>
            <th className="w-20 px-3 py-3 text-center font-medium">AOP</th>
            <th className="w-40 px-3 py-3 text-right font-medium">
              {grafam.currentDate}
            </th>
            <th className="w-40 px-3 py-3 text-right font-medium md:pr-7">
              {grafam.previousDate}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <StatementRow
              key={line.aop}
              line={line}
              primary={current[line.aop] ?? 0}
              secondary={previous[line.aop] ?? 0}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IncomeTable({
  values,
  showZeros,
}: {
  values: Record<string, number>
  showZeros: boolean
}) {
  const rows = INCOME_LINES.filter((line) => showZeros || (values[line.aop] ?? 0) !== 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="sr-only">Izkaz poslovnega izida {grafam.company}</caption>
        <thead>
          <tr className="bg-navy text-left text-[11px] tracking-[0.14em] text-navy-foreground uppercase">
            <th className="px-5 py-3 font-medium md:px-7">Postavka</th>
            <th className="w-20 px-3 py-3 text-center font-medium">AOP</th>
            <th className="w-44 px-3 py-3 text-right font-medium md:pr-7">{grafam.period}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <StatementRow key={line.aop} line={line} primary={values[line.aop] ?? 0} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatementRow({
  line,
  primary,
  secondary,
}: {
  line: LineDef | IncomeLine
  primary: number
  secondary?: number
}) {
  const band = line.depth === 0
  return (
    <tr className={cn("border-b border-border", band ? "bg-secondary" : "bg-card")}>
      <th
        scope="row"
        className={cn(
          "px-5 py-2.5 text-left font-normal text-navy md:px-7",
          band && "font-heading text-lg font-semibold",
          line.depth === 1 && "font-medium",
        )}
        style={{ paddingLeft: `${line.depth * 0.9 + 1.25}rem` }}
      >
        {line.label}
      </th>
      <td className="px-3 py-2.5 text-center font-mono text-xs text-gold tabular-nums">{line.aop}</td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums", band && "font-medium text-navy")}>
        {formatCents(primary)}
      </td>
      {secondary !== undefined ? (
        <td className={cn("px-3 py-2.5 text-right text-muted-foreground tabular-nums md:pr-7", band && "font-medium text-navy")}>
          {formatCents(secondary)}
        </td>
      ) : null}
    </tr>
  )
}
