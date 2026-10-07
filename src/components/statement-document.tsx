"use client"

import { Check } from "lucide-react"
import Image from "next/image"
import { useEffect, useState, type CSSProperties, type ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { chart, descendantLeaves, isCalculated } from "@/lib/charts"
import { rollup, reviewColumn } from "@/lib/compute"
import { DavcniPanel } from "@/components/davcni-panel"
import { EkarticaPanel } from "@/components/ekartica-panel"
import { formatCents, parseCents, parseSloveneDate, splitPeriod } from "@/lib/format"
import { incomeKind, incomeLines, rollupIncome, type IncomeLine } from "@/lib/income"
import { LEGAL_FORM_OPTIONS, legalFormOf, legalFormOption, periodResultCopy, type LegalForm } from "@/lib/legal-form"
import { type LineDef } from "@/lib/schema"
import { SIGNATORIES, signatoryById } from "@/lib/signatories"
import type { Statement } from "@/lib/trial"
import { cn } from "@/lib/utils"

export function StatementDocument({
  statement,
  view,
  showZeros,
  toolbar,
  busy = false,
  onEdit,
  onPeriod,
  onSignatory,
  onLegalForm,
  checks,
  onToggleCheck,
}: {
  statement: Statement
  view: "bilanca" | "izkaz"
  showZeros: boolean
  toolbar?: ReactNode
  busy?: boolean
  onEdit?: (obrazec: "bilanca" | "izkaz", aop: string, cents: number) => void
  onPeriod?: (start: string, end: string) => void
  onSignatory?: (id: string) => void
  onLegalForm?: (form: LegalForm) => void
  checks?: ReadonlySet<string>
  onToggleCheck?: (obrazec: "bilanca" | "izkaz", aop: string) => void
}) {
  const form = legalFormOf(statement)
  const scheme = legalFormOption(form)
  const current = rollup(statement.balance.current, form)
  const income = rollupIncome(statement.income, form)
  const issues = reviewColumn(current, statement.currentDate)
  const assets = current["001"] ?? 0
  const sources = current["055"] ?? 0
  const aligned = assets === sources
  const otherIssues = issues.filter((issue) => issue.severity === "error" && !issue.message.includes("AOP 001"))
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
            Presečni izkazi
          </span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground md:text-lg print:mt-2 print:text-[12px] print:leading-snug">
          Sestavljeno iz bruto bilance {statement.company}. Shema in oznake AOP so po obrazcu AJPES za{" "}
          {scheme.scheme}.
        </p>
      </div>

      <div className={cn("px-6 pb-8 print:px-0 print:pb-0", busy && "opacity-60")}>
        <div className="rounded-xl border border-border bg-card p-6 md:p-8 print:p-4">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between print:flex-row print:items-end print:justify-between print:gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.2em] text-gold uppercase print:text-[10px]">{scheme.printName}</p>
              <h2 className="font-heading mt-1 text-3xl font-semibold text-navy print:text-[22px] print:leading-none">{statement.company}</h2>
              {onLegalForm ? (
                <div className="no-print mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Pravna oblika">
                  {LEGAL_FORM_OPTIONS.map((option) => {
                    const selected = option.id === form
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={option.hint}
                        onClick={() => onLegalForm(option.id)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-left text-sm",
                          selected ? "border-gold bg-accent text-navy" : "border-border bg-card text-navy hover:border-gold",
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground print:mt-1 print:text-[10.5px] print:leading-snug">
                Obdobje {statement.period}. Stanje na dan {statement.currentDate}. Prikazano je samo tekoče leto. Znesek
                popravite v vrstici, seštevki se osvežijo takoj. Zneski v evrih.
              </p>
              {onPeriod ? <PeriodFields period={statement.period} onCommit={onPeriod} /> : null}
            </div>
            <p
              className={cn(
                "no-print inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium",
                aligned ? "border-gold/50 bg-accent text-navy" : "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              {aligned
                ? "Bilanca stanja je usklajena"
                : `Razlika ${formatCents(assets - sources)} €`}
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3 print:mt-4 print:gap-2">
            <Metric label="Sredstva" hint={statement.currentDate} value={current["001"] ?? 0} />
            <Metric label="Obveznosti do virov" hint={statement.currentDate} value={current["055"] ?? 0} />
            <Metric
              label={periodResultCopy(form, Boolean(income[form === "sp" ? "183" : "187"]))}
              hint={statement.period}
              value={
                form === "sp"
                  ? income["183"]
                    ? income["183"]
                    : (income["182"] ?? 0)
                  : income["187"]
                    ? income["187"]
                    : (income["186"] ?? 0)
              }
              accent
            />
          </div>
        </div>

        {toolbar}

        {view === "bilanca" ? (
          <div
            className={cn(
              "no-print mt-8 rounded-xl border px-5 py-4",
              aligned ? "border-gold/50 bg-accent" : "border-destructive/40 bg-destructive/10",
            )}
            role={aligned ? "status" : "alert"}
          >
            <p className="text-xs font-medium tracking-[0.16em] text-gold uppercase print:text-[9px]">Kontrola</p>
            <p className={cn("mt-2 text-sm font-medium text-navy print:text-[11px]", !aligned && "text-destructive")}>
              {aligned
                ? `Bilanca stanja je usklajena. Sredstva in obveznosti do virov so ${formatCents(assets)} €.`
                : `Razlika v bilanci stanja je ${formatCents(Math.abs(assets - sources))} €. Sredstva ${formatCents(assets)} €. Obveznosti do virov ${formatCents(sources)} €.`}
            </p>
            {otherIssues.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-destructive">
                {otherIssues.map((issue) => (
                  <li key={issue.message}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <h2 className="font-heading mt-8 text-2xl font-semibold text-navy print:mt-4 print:text-[18px]">
          <span className="block">{view === "bilanca" ? "Bilanca stanja" : "Izkaz poslovnega izida"}</span>
          <span className="mt-1 block text-base font-medium text-gold print:text-[12px]">
            Presečni izkazi
          </span>
        </h2>

        {onToggleCheck ? (
          <p className="no-print mt-4 text-sm text-muted-foreground">
            Kljukica ob postavki je samo za vašo kontrolo.
          </p>
        ) : null}

        <div className="mt-4 min-w-0 overflow-hidden rounded-xl border border-border bg-card print:mt-3">
          {view === "bilanca" ? (
            <BalanceTable
              form={form}
              company={statement.company}
              currentDate={statement.currentDate}
              current={current}
              showZeros={showZeros}
              onEdit={onEdit}
              checks={checks}
              onToggleCheck={onToggleCheck}
            />
          ) : (
            <IncomeTable
              form={form}
              company={statement.company}
              period={statement.period}
              values={income}
              showZeros={showZeros}
              onEdit={onEdit}
              checks={checks}
              onToggleCheck={onToggleCheck}
            />
          )}
        </div>

        {form === "sp" && statement.davcni ? <DavcniPanel statement={statement} /> : null}
        {form === "sp" && statement.ekartica ? <EkarticaPanel report={statement.ekartica} /> : null}

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

        <SignatureBlock signatoryId={statement.signatory} onSignatory={onSignatory} />

        <footer className="mt-8 border-t border-border pt-6 text-center text-sm text-muted-foreground print:mt-4 print:pt-3 print:text-[10.5px]">
          <p>Hnatura d.o.o. — Računovodski servis</p>
          <p className="mt-1 text-xs">Bilance · obrazec AJPES za {scheme.scheme} · {statement.sourceName}</p>
        </footer>
      </div>
    </article>
  )
}

function SignatureBlock({ signatoryId, onSignatory }: { signatoryId?: string; onSignatory?: (id: string) => void }) {
  const signer = signatoryById(signatoryId)
  return (
    <section className="mt-8 print:mt-6">
      {onSignatory ? (
        <div className="no-print">
          <p className="text-xs font-medium tracking-[0.16em] text-gold uppercase">Podpis</p>
          <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Podpis">
            {SIGNATORIES.map((item) => {
              const selected = item.id === signer.id
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSignatory(item.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm",
                    selected ? "border-gold bg-accent text-navy" : "border-border bg-card text-navy hover:border-gold",
                  )}
                >
                  <span className="block font-medium">{item.name}</span>
                  {item.role ? <span className="block text-xs text-muted-foreground">{item.role}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      <div className="mt-8 flex justify-end print:mt-6">
        <div className="w-56 text-center">
          <p className="font-medium text-navy">{signer.name}</p>
          {signer.role ? <p className="text-xs text-muted-foreground">{signer.role}</p> : null}
        </div>
      </div>
    </section>
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
  form,
  company,
  currentDate,
  current,
  showZeros,
  onEdit,
  checks,
  onToggleCheck,
}: {
  form: LegalForm
  company: string
  currentDate: string
  current: Record<string, number>
  showZeros: boolean
  onEdit?: (obrazec: "bilanca" | "izkaz", aop: string, cents: number) => void
  checks?: ReadonlySet<string>
  onToggleCheck?: (obrazec: "bilanca" | "izkaz", aop: string) => void
}) {
  const rows = chart(form).lines.filter((line) => {
    if (showZeros) return true
    if ((current[line.aop] ?? 0) !== 0) return true
    return descendantLeaves(line.aop, form).some((aop) => (current[aop] ?? 0) !== 0)
  })

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm print:min-w-0 print:text-[10.5px]">
        <caption className="sr-only">Bilanca stanja {company}, {currentDate}</caption>
        <thead>
          <tr className="statement-head bg-deep-blue text-left text-[11px] tracking-[0.14em] text-navy-foreground uppercase print:text-[10px]">
            {onToggleCheck ? (
              <th className="no-print w-12 px-2 py-3 text-center font-medium" scope="col">
                <span className="sr-only">Kontrola</span>
              </th>
            ) : null}
            <th className="statement-edge-start px-5 py-3 font-medium md:px-7 print:px-3 print:py-2">Postavka</th>
            <th className="w-20 px-3 py-3 text-center font-medium print:w-14 print:px-2 print:py-2">AOP</th>
            <th className="statement-edge-end w-44 px-3 py-3 text-right font-medium md:pr-7 print:w-[148px] print:px-3 print:py-2">{currentDate}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <StatementRow
              key={line.aop}
              line={line}
              primary={current[line.aop] ?? 0}
              editable={Boolean(onEdit) && !isCalculated(line.aop, form)}
              onCommit={onEdit ? (cents) => onEdit("bilanca", line.aop, cents) : undefined}
              checked={checks?.has(`bilanca:${line.aop}`) ?? false}
              onToggle={onToggleCheck ? () => onToggleCheck("bilanca", line.aop) : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function IncomeTable({
  form,
  company,
  period,
  values,
  showZeros,
  onEdit,
  checks,
  onToggleCheck,
}: {
  form: LegalForm
  company: string
  period: string
  values: Record<string, number>
  showZeros: boolean
  onEdit?: (obrazec: "bilanca" | "izkaz", aop: string, cents: number) => void
  checks?: ReadonlySet<string>
  onToggleCheck?: (obrazec: "bilanca" | "izkaz", aop: string) => void
}) {
  const rows = incomeLines(form).filter((line) => showZeros || (values[line.aop] ?? 0) !== 0)

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm print:min-w-0 print:text-[10.5px]">
        <caption className="sr-only">Izkaz poslovnega izida {company}</caption>
        <thead>
          <tr className="statement-head bg-deep-blue text-left text-[11px] tracking-[0.14em] text-navy-foreground uppercase print:text-[10px]">
            {onToggleCheck ? (
              <th className="no-print w-12 px-2 py-3 text-center font-medium" scope="col">
                <span className="sr-only">Kontrola</span>
              </th>
            ) : null}
            <th className="statement-edge-start px-5 py-3 font-medium md:px-7 print:px-3 print:py-2">Postavka</th>
            <th className="w-20 px-3 py-3 text-center font-medium print:w-14 print:px-2 print:py-2">AOP</th>
            <th className="statement-edge-end w-44 px-3 py-3 text-right font-medium md:pr-7 print:w-[148px] print:px-3 print:py-2">{period}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <StatementRow
              key={line.aop}
              line={line}
              primary={values[line.aop] ?? 0}
              editable={Boolean(onEdit) && incomeKind(line.aop, form) !== null}
              onCommit={onEdit ? (cents) => onEdit("izkaz", line.aop, cents) : undefined}
              checked={checks?.has(`izkaz:${line.aop}`) ?? false}
              onToggle={onToggleCheck ? () => onToggleCheck("izkaz", line.aop) : undefined}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatementRow({
  line,
  primary,
  editable = false,
  onCommit,
  checked = false,
  onToggle,
}: {
  line: LineDef | IncomeLine
  primary: number
  editable?: boolean
  onCommit?: (cents: number) => void
  checked?: boolean
  onToggle?: () => void
}) {
  const band = line.depth === 0
  return (
    <tr className={cn("border-b border-border", band ? "statement-band bg-secondary" : "bg-card", checked && "bg-accent/60")}>
      {onToggle ? (
        <td className="no-print px-2 py-2.5 text-center">
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={`Kljukica za kontrolo, ${line.aop} ${line.label}`}
            onClick={onToggle}
            className={cn(
              "inline-flex size-4 items-center justify-center rounded-md border border-[#bca169]",
              checked ? "bg-[#bca169] text-white" : "bg-card",
            )}
          >
            {checked ? <Check className="size-3" strokeWidth={3} /> : null}
          </button>
        </td>
      ) : null}
      <th
        scope="row"
        className={cn(
          "statement-edge-start px-5 py-2.5 pl-[calc(var(--indent)*0.9rem+1.25rem)] text-left font-normal text-navy md:px-7 print:px-3 print:py-[3px] print:pl-[calc(var(--indent)*0.55rem+0.75rem)] print:text-[10.5px]",
          band && "font-heading text-lg font-semibold print:text-[13px]",
          line.depth === 1 && "font-medium",
        )}
        style={{ "--indent": line.depth } as CSSProperties}
      >
        {line.label}
      </th>
      <td className="px-3 py-2.5 text-center font-mono text-xs text-gold tabular-nums print:px-2 print:py-[3px] print:text-[10px]">{line.aop}</td>
      <td className={cn("statement-edge-end px-3 py-2.5 text-right tabular-nums md:pr-7 print:px-3 print:py-[3px]", band && "font-medium text-navy")}>
        {editable && onCommit ? (
          <AmountField label={`${line.aop} ${line.label}`} value={primary} onCommit={onCommit} />
        ) : (
          formatCents(primary)
        )}
      </td>
    </tr>
  )
}

function PeriodFields({ period, onCommit }: { period: string; onCommit: (start: string, end: string) => void }) {
  const parts = splitPeriod(period)
  const [start, setStart] = useState(parts?.start ?? "")
  const [end, setEnd] = useState(parts?.end ?? "")

  useEffect(() => {
    const next = splitPeriod(period)
    if (!next) return
    setStart(next.start)
    setEnd(next.end)
  }, [period])

  function commit(nextStart: string, nextEnd: string) {
    const parsedStart = parseSloveneDate(nextStart)
    const parsedEnd = parseSloveneDate(nextEnd)
    if (!parsedStart || !parsedEnd) {
      const back = splitPeriod(period)
      setStart(back?.start ?? "")
      setEnd(back?.end ?? "")
      return
    }
    setStart(parsedStart)
    setEnd(parsedEnd)
    const current = splitPeriod(period)
    if (current?.start === parsedStart && current.end === parsedEnd) return
    onCommit(parsedStart, parsedEnd)
  }

  return (
    <div className="no-print mt-4">
      <p className="text-sm text-navy">Vpišite začetek in konec obdobja bilance.</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="obdobje-od">Od</Label>
          <Input
            id="obdobje-od"
            value={start}
            placeholder="01.01.2026"
            className="w-36"
            onChange={(event) => setStart(event.target.value)}
            onBlur={() => commit(start, end)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="obdobje-do">Do</Label>
          <Input
            id="obdobje-do"
            value={end}
            placeholder="31.08.2026"
            className="w-36"
            onChange={(event) => setEnd(event.target.value)}
            onBlur={() => commit(start, end)}
          />
        </div>
      </div>
    </div>
  )
}

function AmountField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (cents: number) => void
}) {
  const [text, setText] = useState(() => formatCents(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(formatCents(value))
  }, [focused, value])

  return (
    <>
      <input
        aria-label={label}
        inputMode="decimal"
        className="no-print h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-right text-sm tabular-nums text-navy outline-none hover:border-border focus:border-gold focus:bg-card"
        value={text}
        onFocus={(event) => {
          setFocused(true)
          event.currentTarget.select()
        }}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          const parsed = parseCents(next)
          if (parsed !== null) onCommit(parsed)
        }}
        onBlur={() => {
          setFocused(false)
          const parsed = parseCents(text)
          onCommit(parsed ?? 0)
          setText(formatCents(parsed ?? 0))
        }}
      />
      <span className="hidden print:inline">{formatCents(value)}</span>
    </>
  )
}
