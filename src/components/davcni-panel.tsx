import { normiraniSplit } from "@/lib/davcni-obracun"
import { formatCents } from "@/lib/format"
import { rollupIncome } from "@/lib/income"
import type { Statement } from "@/lib/trial"

export function DavcniPanel({ statement }: { statement: Statement }) {
  const tax = statement.davcni
  if (!tax) return null
  const split = normiraniSplit(tax.revenuesCents, statement.ekartica?.totalCents ?? 0)
  const income = rollupIncome(statement.income, "sp")
  const profit = (income["182"] ?? 0) - (income["183"] ?? 0)
  return (
    <section className="no-print mt-8 rounded-xl border border-border bg-card px-5 py-5 md:px-6" aria-label="Obračun davka">
      <p className="text-xs font-medium tracking-[0.16em] text-gold uppercase">Obračun davka</p>
      <h3 className="font-heading mt-2 text-2xl font-semibold text-navy">Normirani odhodki {tax.year}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {tax.holder ? `${tax.holder}. ` : null}
        Prihodki v poslovnem izidu so {formatCents(split.revenuesCents)} €, enako kot na obračunu davka. Davčno priznani
        stroški so 80 % prihodkov, {formatCents(split.recognizedCents)} €. Od tega so prispevki s kartice eDavkov. Od
        preostanka je 20 % stroškov materiala, ostanek so drugi stroški storitev.
      </p>
      <dl className="mt-5 space-y-2 text-sm">
        <Row label="Prihodki, AOP 112" value={split.revenuesCents} />
        <Row label="Davčno priznani stroški, 80 %" value={split.recognizedCents} />
        <Row label="Prispevki za socialno varnost podjetnika, AOP 148a" value={split.contributionsCents} />
        <Row label="Stroški materiala, AOP 131, 20 % preostanka" value={split.materialCents} />
        <Row label="Drugi stroški storitev, AOP 138" value={split.servicesCents} />
        <Row label="Podjetnikov dohodek" value={profit} />
      </dl>
      {statement.ekartica ? null : (
        <p className="mt-4 text-sm text-muted-foreground">Prispevki se vpišejo, ko naložite kartico eDavkov.</p>
      )}
      {tax.statedContributionsCents !== split.contributionsCents ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Obračun davka navaja prispevke {formatCents(tax.statedContributionsCents)} €. Na izkazu je seštevek kartice
          eDavkov.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">{tax.sourceName}</p>
    </section>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
      <dt className="text-navy">{label}</dt>
      <dd className="font-medium text-navy tabular-nums">{formatCents(value)} €</dd>
    </div>
  )
}
