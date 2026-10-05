import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { StatementDocument } from "@/components/statement-document"
import { readPrintJob } from "@/lib/print-job"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Izpis · Bilance",
}

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = await readPrintJob(id)
  if (!job) notFound()

  return (
    <main className="mx-auto max-w-5xl bg-background">
      <StatementDocument statement={job.statement} view={job.view} showZeros={job.showZeros} />
    </main>
  )
}
