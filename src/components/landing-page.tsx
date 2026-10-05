"use client"

import { ArrowRight, ArrowUpRight, BookOpen, Calculator, FileText, Inbox, Lock, Scale, Send } from "lucide-react"
import Image from "next/image"
import { useState, type ReactNode } from "react"

export function LandingPage() {
  const [servisOpen, setServisOpen] = useState(true)

  return (
    <main className="min-h-svh bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-6 py-5">
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

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="space-y-16">
          <section>
            <SectionTitle>Stranka</SectionTitle>
            <div className="flex flex-wrap justify-center gap-4">
              <ProgramCard
                href="https://prevzem.hnatura.app"
                external
                tone="navy"
                icon={<Inbox className="size-6" />}
                title="Prevzem"
                text="Prevzem in oddaja dokumentov ter listin med stranko in računovodskim servisom."
                label="prevzem.hnatura.app"
              />
            </div>
          </section>

          <section>
            <SectionTitle>Računovodski servis</SectionTitle>
            {servisOpen ? (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <ProgramCard
                    href="https://place.hnatura.app"
                    external
                    tone="navy"
                    icon={<Calculator className="size-6" />}
                    title="Obračun plač"
                    text="Priprava in obračun plač za vaše stranke z izvozom podatkov ter pregledom nad zaposlenimi."
                    label="place.hnatura.app"
                  />
                  <ProgramCard
                    href="https://revizija.hnatura.app"
                    external
                    tone="muted"
                    icon={<FileText className="size-6" />}
                    title="Revizijska poročila"
                    text="Priprava letnih in mesečnih poročil ter obrazcev za AJPES in MDDSZ na enem mestu."
                    label="revizija.hnatura.app"
                  />
                  <ProgramCard
                    href="https://bilance.hnatura.app"
                    external
                    tone="navy"
                    icon={<Scale className="size-6" />}
                    title="Bilance"
                    text="Presečni izkazi in ocena poslovanja. Iz bruto bilance se sestavita bilanca stanja in izkaz poslovnega izida."
                    label="bilance.hnatura.app"
                  />
                  <ProgramCard
                    href="https://prirocnik.hnatura.app"
                    external
                    tone="gold"
                    icon={<BookOpen className="size-6" />}
                    title="Računovodski priročnik"
                    text="Zbirka navodil, postopkov in pojasnil za vsakodnevno računovodsko delo."
                    label="prirocnik.hnatura.app"
                  />
                  <ProgramCard
                    href="https://oddaja.hnatura.app"
                    external
                    tone="navy"
                    highlighted
                    icon={<Send className="size-6" />}
                    title="Oddaja"
                    text="Elektronska oddaja obrazcev in poročil na eDavki in AJPES."
                    label="oddaja.hnatura.app"
                  />
                </div>
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setServisOpen(false)}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-navy transition-colors hover:border-gold/60 hover:text-gold"
                  >
                    <Lock className="size-4" />
                    Zakleni razdelek
                  </button>
                </div>
              </>
            ) : (
              <LockedServis onUnlock={() => setServisOpen(true)} />
            )}
          </section>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
          <p>Hnatura d.o.o. — Računovodski servis</p>
          <p className="text-xs">© {new Date().getFullYear()} Vse pravice pridržane.</p>
        </div>
      </footer>
    </main>
  )
}

function LockedServis({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
      <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent text-gold">
        <Lock className="size-6" />
      </span>
      <h3 className="font-heading text-2xl font-semibold text-navy">Razdelek je zaklenjen</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Programi računovodskega servisa so skriti. Odklenite razdelek, da jih znova vidite.
      </p>
      <button
        type="button"
        onClick={onUnlock}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-3 text-sm font-semibold text-navy-foreground transition-colors hover:bg-navy/90"
      >
        Odkleni razdelek
      </button>
    </div>
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
  highlighted = false,
  tone,
  icon,
  title,
  text,
  label,
}: {
  href: string
  external?: boolean
  highlighted?: boolean
  tone: "navy" | "muted" | "gold"
  icon: ReactNode
  title: string
  text: string
  label: string
}) {
  const iconTone = {
    navy: "bg-navy text-navy-foreground",
    muted: "bg-[#5e686f] text-white",
    gold: "bg-gold text-navy",
  }[tone]

  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`group relative flex h-full flex-col rounded-xl border bg-card p-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-navy/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        highlighted ? "border-gold shadow-md shadow-gold/10" : "border-border hover:border-gold/60"
      }`}
    >
      <div className="mb-6 flex items-center justify-between">
        <span
          className={`flex size-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${iconTone}`}
        >
          {icon}
        </span>
        {external ? (
          <ArrowUpRight className="size-5 text-muted-foreground transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-gold" />
        ) : (
          <ArrowRight className="size-5 text-muted-foreground transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-gold" />
        )}
      </div>
      <h3 className="font-heading text-2xl leading-tight font-semibold text-navy">{title}</h3>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-pretty text-muted-foreground">{text}</p>
      <p className="mt-6 text-xs font-medium tracking-wide text-gold">{label}</p>
    </a>
  )
}
