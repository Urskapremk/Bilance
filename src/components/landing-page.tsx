import { ArrowRight, ArrowUpRight, Inbox, Scale } from "lucide-react"
import Image from "next/image"
import type { ReactNode } from "react"

export function LandingPage() {
  return (
    <main className="min-h-svh bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
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

      <section className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center md:pt-24">
        <p className="mb-4 flex items-center justify-center gap-3 text-xs font-medium tracking-[0.25em] text-gold uppercase">
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
          Dobrodošli
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
        </p>
        <h1 className="font-heading text-4xl leading-tight font-semibold text-balance text-navy md:text-5xl">
          Digitalno okolje računovodskega servisa
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground md:text-lg">
          Izberite program za dostop. Vsi vaši računovodski pripomočki so zbrani na enem mestu.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="space-y-16">
          <section>
            <SectionTitle>Stranka</SectionTitle>
            <div className="flex flex-wrap justify-center gap-6">
              <ProgramCard
                href="https://prevzem.hnatura.app"
                external
                icon={<Inbox className="size-6" />}
                title="Prevzem"
                text="Prevzem in oddaja dokumentov ter listin med stranko in računovodskim servisom."
                label="prevzem.hnatura.app"
              />
            </div>
          </section>

          <section>
            <SectionTitle>Računovodski servis</SectionTitle>
            <div className="flex flex-wrap justify-center gap-6">
              <ProgramCard
                href="/bilance"
                icon={<Scale className="size-6" />}
                title="Bilance"
                text="Presečni izkazi in ocena poslovanja. Iz bruto bilance se sestavita bilanca stanja in izkaz poslovnega izida."
                label="Odpri program"
              />
            </div>
          </section>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
          <p>Hnatura d.o.o. — Računovodski servis</p>
          <p className="text-xs">© {new Date().getFullYear()} Vse pravice pridržane.</p>
        </div>
      </footer>
    </main>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-4">
      <span className="h-px w-12 bg-border" />
      <h2 className="text-sm font-semibold tracking-[0.2em] text-gold uppercase">{children}</h2>
      <span className="h-px w-12 bg-border" />
    </div>
  )
}

function ProgramCard({
  href,
  external = false,
  icon,
  title,
  text,
  label,
}: {
  href: string
  external?: boolean
  icon: ReactNode
  title: string
  text: string
  label: string
}) {
  return (
    <div className="w-full sm:w-80">
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        className="group relative flex h-full flex-col rounded-xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1.5 hover:border-gold/60 hover:shadow-xl hover:shadow-navy/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="flex size-12 items-center justify-center rounded-xl bg-navy text-navy-foreground transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">
            {icon}
          </span>
          {external ? (
            <ArrowUpRight className="size-5 text-muted-foreground transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-gold" />
          ) : (
            <ArrowRight className="size-5 text-muted-foreground transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-gold" />
          )}
        </div>
        <h3 className="font-heading text-2xl font-semibold text-navy">{title}</h3>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-pretty text-muted-foreground">{text}</p>
        <p className="mt-6 text-xs font-medium tracking-wide text-gold">{label}</p>
      </a>
    </div>
  )
}
