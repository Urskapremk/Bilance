import type { ContributionAccount, ContributionLine, EkarticaReport } from "@/lib/ekartica"
import { formatCents } from "@/lib/format"

export function EkarticaPanel({
  report,
  obracunContributionsCents,
}: {
  report: EkarticaReport
  obracunContributionsCents?: number
}) {
  return (
    <section className="no-print mt-8 rounded-xl border border-border bg-card px-5 py-5 md:px-6" aria-label="Kartica eDavkov">
      <p className="text-xs font-medium tracking-[0.16em] text-gold uppercase">Kartica eDavkov</p>
      <h3 className="font-heading mt-2 text-2xl font-semibold text-navy">Obračuni prispevkov {report.year}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {report.holder ? `${report.holder}. ` : null}
        {obracunContributionsCents == null
          ? `Seštevek obračunov prispevkov je na izkazu poslovnega izida pod AOP 148a, Prispevki za socialno varnost podjetnika: ${formatCents(report.totalCents)} €. AJPES ta strošek vodi na postavki 148a.`
          : `Dvanajstmesečni seznam obračunov ostane na tej kartici. Na izkazu poslovnega izida je pod AOP 148a znesek prispevkov z obračuna davka, ${formatCents(obracunContributionsCents)} €. Seštevek kartice eDavkov za kontrolo je ${formatCents(report.totalCents)} €.`}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{report.sourceName}</p>
      <div className="mt-6 space-y-6">
        {report.accounts.map((account) => (
          <AccountSheet key={account.code} account={account} />
        ))}
      </div>
    </section>
  )
}

function AccountSheet({ account }: { account: ContributionAccount }) {
  const missing = account.months.filter((month) => month.lines.length === 0).map((month) => month.label)
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border px-4 py-3">
        <p className="font-medium text-navy">
          Konto {account.code} {account.name}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {account.monthsWithCharge === 12
            ? "12 mesecev ima obračun."
            : `Obračun manjka v: ${missing.join(", ")}.`}
        </p>
      </div>
      <ul className="divide-y divide-border">
        {account.months.map((month) => (
          <li key={month.month} className="px-4 py-3">
            <p className="text-sm font-medium text-navy capitalize">{month.label}</p>
            {month.lines.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">V tem mesecu ni obračuna prispevkov.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {month.lines.map((line, index) => (
                  <LineRow key={`${line.date}-${index}`} line={line} />
                ))}
              </ul>
            )}
            {month.lines.length > 1 ? (
              <p className="mt-2 text-sm font-medium text-navy">Skupaj v mesecu {formatCents(month.totalCents)} €</p>
            ) : null}
          </li>
        ))}
      </ul>
      {account.following.length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <p className="text-sm font-medium text-navy">Knjižbe v januarju naslednjega leta, ki so še na tej kartici</p>
          <ul className="mt-1 space-y-1">
            {account.following.map((line, index) => (
              <LineRow key={`${line.date}-${index}`} line={line} />
            ))}
          </ul>
        </div>
      ) : null}
      <p className="border-t border-border px-4 py-3 text-sm font-medium text-navy">
        Skupaj konto {account.code}: {formatCents(account.totalCents)} €
      </p>
    </div>
  )
}

function LineRow({ line }: { line: ContributionLine }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
      <span className="text-navy">
        {line.date} {line.description}
      </span>
      <span className="font-medium text-navy tabular-nums">{formatCents(line.cents)} €</span>
    </li>
  )
}
