import Image from "next/image"
import type { CSSProperties, ReactNode } from "react"

import { rollup, reviewColumn } from "@/lib/compute"
import { formatCents } from "@/lib/format"
import { INCOME_LINES, rollupIncome, type IncomeLine } from "@/lib/income"
import { LINES, descendantLeaves, type LineDef } from "@/lib/schema"
import type { Statement } from "@/lib/trial"
import { cn } from "@/lib/utils"

export function StatementDocument({
  statement,
  view,
  showZeros,
  toolbar,
  busy = false,
}: {
  statement: Statement
  view: "bilanca" | "izkaz"
  showZeros: boolean
  toolbar?: ReactNode
  busy?: boolean
}) {
  const current = rollup(statement.balance.current)
  const income = rollupIncome(statement.income)
  const issues = reviewColumn(current, statement.currentDate)
  const balanced = issues.every((issue) => issue.severity !== "error")
  const notes = statement.notes.filter(
    (note) => !note.includes(statement.previousDate) && !note.includes("javna objava"),
  )

  return (
    <article className="print-sheet min-w-0">
      <header className="border-b border-border print:border-0">
        <div className="flex justify-center px-6 py-5 print:px-0 print:py-2">
          <Image
            src="/images/hnatura-logo.png"
            alt="Hnatura d.o.o. — Računovodski servis"
            width={340}
            height={100}
            priority
            className="h-auto w-[200px] md:w-[240px] print:w-[150px]"
          />
        </div>
      </header>

      <div className="px-6 pt-10 pb-6 text-center md:pt-14 print:px-0 print:pt-3 print:pb-3">
        <p className="mb-4 flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-gold uppercase print:mb-2 print:text-[10px]">
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
          Bilance
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
        </p>
        <h1 className="font-heading max-w-full text-4xl leading-tight font-semibold text-balance break-words text-navy md:text-5xl print:text-[28px] print:leading-tight">
          <span className="block">{view === "bilanca" ? "Bilanca stanja" : "Izkaz poslovnega izida"}</span>
          <span className="mt-3 block text-2xl font-medium text-gold md:text-3xl print:mt-1 print:text-[16px]">
            Presečni izkazi, ocena poslovanja
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground md:text-lg print:mt-2 print:text-[12px] print:leading-snug">
          Sestavljeno iz bruto bilance {statement.company}. Shema in oznake AOP so po poenotenem
          obrazcu AJPES za gospodarske družbe.
        </p>
      </div>

      <div className={cn("px-6 pb-8 print:px-0 print:pb-0", busy && "opacity-60")}>
        <div className="rounded-xl border border-border bg-card p-6 md:p-8 print:p-4">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between print:flex-row print:items-end print:justify-between print:gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.2em] text-gold uppercase print:text-[10px]">Družba</p>
              <h2 className="font-heading mt-1 text-3xl font-semibold text-navy print:text-[22px] print:leading-none">{statement.company}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground print:mt-1 print:text-[10.5px] print:leading-snug">
                Obdobje {statement.period}. Stanje na dan {statement.currentDate}. Prikazano je samo tekoče leto. Zneski v evrih.
              </p>
            </div>
            <p
              className={cn(
                "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium print:text-[10px]",
                balanced ? "border-gold/50 bg-accent text-navy" : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {balanced
                ? "Stranici sta usklajeni"
                : `Razlika ${formatCents((current["001"] ?? 0) - (current["055"] ?? 0))} €`}
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3 print:mt-4 print:gap-2">
            <Metric label="Sredstva" hint={statement.currentDate} value={current["001"] ?? 0} />
            <Metric label="Obveznosti do virov" hint={statement.currentDate} value={current["055"] ?? 0} />
            <Metric
              label={income["187"] ? "Čista izguba obdobja" : "Čisti dobiček obdobja"}
              hint={statement.period}
              value={income["187"] ? income["187"] : (income["186"] ?? 0)}
              accent
            />
          </div>
        </div>

        {toolbar}

        <h2 className="font-heading mt-8 text-2xl font-semibold text-navy print:mt-4 print:text-[18px]">
          <span className="block">{view === "bilanca" ? "Bilanca stanja" : "Izkaz poslovnega izida"}</span>
          <span className="mt-1 block text-base font-medium text-gold print:text-[12px]">
            Presečni izkazi, ocena poslovanja
          </span>
        </h2>

        <div className="mt-4 min-w-0 overflow-hidden rounded-xl border border-border bg-card print:mt-3">
          {view === "bilanca" ? (
            <BalanceTable
              company={statement.company}
              currentDate={statement.currentDate}
              current={current}
              showZeros={showZeros}
            />
          ) : (
            <IncomeTable
              company={statement.company}
              period={statement.period}
              values={income}
              showZeros={showZeros}
            />
          )}
        </div>

        {statement.warnings.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-destructive" role="alert">
            {statement.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}

        <details className="no-print group mt-8 rounded-xl border border-border bg-card px-6 py-5">
          <summary className="cursor-pointer list-none text-sm font-semibold tracking-[0.16em] text-gold uppercase">
            Kako so konti razporejeni
          </summary>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>

        <footer className="mt-8 border-t border-border pt-6 text-center text-sm text-muted-foreground print:mt-4 print:pt-3 print:text-[10.5px]">
          <p>Hnatura d.o.o. — Računovodski servis</p>
          <p className="mt-1 text-xs">Bilance · obrazec po shemi AJPES · {statement.sourceName}</p>
        </footer>
      </div>
    </article>
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
    <div className={cn("rounded-xl border px-5 py-4 print:px-3 print:py-2", accent ? "border-gold/50 bg-accent" : "border-border bg-secondary")}>
      <p className="text-xs font-medium tracking-[0.16em] text-gold uppercase print:text-[9px]">{label}</p>
      <p className="font-heading mt-2 text-3xl font-semibold text-navy tabular-nums print:mt-1 print:text-[16px] print:leading-none">{formatCents(value)} €</p>
      <p className="mt-1 text-xs text-muted-foreground print:text-[10px]">{hint}</p>
    </div>
  )
}

function BalanceTable({
  company,
  currentDate,
  current,
  showZeros,
}: {
  company: string
  currentDate: string
  current: Record<string, number>
  showZeros: boolean
}) {
  const rows = LINES.filter((line) => {
    if (showZeros) return true
    if ((current[line.aop] ?? 0) !== 0) return true
    return descendantLeaves(line.aop).some((aop) => (current[aop] ?? 0) !== 0)
  })

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm print:min-w-0 print:text-[10.5px]">
        <caption className="sr-only">Bilanca stanja {company}, {currentDate}</caption>
        <thead>
          <tr className="statement-head bg-deep-blue text-left text-[11px] tracking-[0.14em] text-navy-foreground uppercase print:text-[10px]">
            <th className="px-5 py-3 font-medium md:px-7 print:px-3 print:py-2">Postavka</th>
            <th className="w-20 px-3 py-3 text-center font-medium print:w-14 print:px-2 print:py-2">AOP</th>
            <th className="w-44 px-3 py-3 text-right font-medium md:pr-7 print:w-[148px] print:px-3 print:py-2">{currentDate}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <StatementRow key={line.aop} line={line} primary={current[line.aop] ?? 0} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IncomeTable({
  company,
  period,
  values,
  showZeros,
}: {
  company: string
  period: string
  values: Record<string, number>
  showZeros: boolean
}) {
  const rows = INCOME_LINES.filter((line) => showZeros || (values[line.aop] ?? 0) !== 0)

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm print:min-w-0 print:text-[10.5px]">
        <caption className="sr-only">Izkaz poslovnega izida {company}</caption>
        <thead>
          <tr className="statement-head bg-deep-blue text-left text-[11px] tracking-[0.14em] text-navy-foreground uppercase print:text-[10px]">
            <th className="px-5 py-3 font-medium md:px-7 print:px-3 print:py-2">Postavka</th>
            <th className="w-20 px-3 py-3 text-center font-medium print:w-14 print:px-2 print:py-2">AOP</th>
            <th className="w-44 px-3 py-3 text-right font-medium md:pr-7 print:w-[148px] print:px-3 print:py-2">{period}</th>
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
}: {
  line: LineDef | IncomeLine
  primary: number
}) {
  const band = line.depth === 0
  return (
    <tr className={cn("border-b border-border", band ? "statement-band bg-secondary" : "bg-card")}>
      <th
        scope="row"
        className={cn(
          "px-5 py-2.5 pl-[calc(var(--indent)*0.9rem+1.25rem)] text-left font-normal text-navy md:px-7 print:px-3 print:py-[3px] print:pl-[calc(var(--indent)*0.55rem+0.75rem)] print:text-[10.5px]",
          band && "font-heading text-lg font-semibold print:text-[13px]",
          line.depth === 1 && "font-medium",
        )}
        style={{ "--indent": line.depth } as CSSProperties}
      >
        {line.label}
      </th>
      <td className="px-3 py-2.5 text-center font-mono text-xs text-gold tabular-nums print:px-2 print:py-[3px] print:text-[10px]">{line.aop}</td>
      <td className={cn("px-3 py-2.5 text-right tabular-nums md:pr-7 print:px-3 print:py-[3px]", band && "font-medium text-navy")}>
        {formatCents(primary)}
      </td>
    </tr>
  )
}
