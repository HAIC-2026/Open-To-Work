"use client"

import * as React from "react"
import { useParams, useSearchParams } from "next/navigation"
import { FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { describeCitation, type SourceItem } from "@/components/sources"
import { loadReport, type ReportPayload } from "@/lib/report-store"

/**
 * Printable report for one answer. Opened in a new tab by the conversation
 * page's "Download PDF" action; it lays the answer out for paper and opens the
 * browser's print dialog, where "Save as PDF" writes the file (named after the
 * document title). Rendered outside the app shell (see AppLayout).
 */

// Paper setup and a fixed light palette, so the PDF looks the same even when
// the app is in dark mode. Page numbers use @page margin boxes where supported.
const PRINT_STYLES = `
@page {
  size: letter;
  margin: 0.75in 0.75in 0.85in;
  @bottom-left { content: "Mohala · District research"; font: 8pt Inter, sans-serif; color: #4d6256; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Inter, sans-serif; color: #4d6256; }
}
.mohala-report {
  color-scheme: light;
  --background: oklch(1 0 0);
  --foreground: oklch(0.288 0.027 159.5);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.288 0.027 159.5);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.288 0.027 159.5);
  --primary: oklch(0.453 0.090 157.6);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.952 0.008 157.1);
  --secondary-foreground: oklch(0.288 0.027 159.5);
  --muted: oklch(0.952 0.008 157.1);
  --muted-foreground: oklch(0.475 0.032 159.9);
  --accent: oklch(0.922 0.022 155.9);
  --accent-foreground: oklch(0.288 0.027 159.5);
  --border: oklch(0.888 0.019 155.8);
  --input: oklch(0.888 0.019 155.8);
}
@media print {
  html, body { background: #fff !important; height: auto !important; overflow: visible !important; }
  .mohala-report { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

function formatDate(ms?: number) {
  if (!ms) return null
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(ms)
}

/** Numbered citations first (they match the [n] markers), then any other sources used. */
function reportSources(payload: ReportPayload): SourceItem[] {
  const cited = [...payload.citations].sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
  const citedUrls = new Set(cited.map((c) => c.url))
  return [...cited, ...payload.sources.filter((s) => !citedUrls.has(s.url))]
}

// localStorage only exists in the browser: read it through useSyncExternalStore
// (undefined on the server, the saved report in the browser). Cached per key so
// the snapshot keeps a stable identity between renders.
const reportCache = new Map<string, ReportPayload | null>()
const noSubscribe = () => () => {}
function readReport(key: string) {
  if (!reportCache.has(key)) reportCache.set(key, loadReport(key))
  return reportCache.get(key) ?? null
}

export default function ReportPage() {
  return (
    // useSearchParams needs a Suspense boundary (Next.js useSearchParams docs).
    <React.Suspense fallback={null}>
      <Report />
    </React.Suspense>
  )
}

function Report() {
  const { key } = useParams<{ key: string }>()
  // ?preview=1 shows the report without opening the print dialog.
  const preview = useSearchParams().get("preview") === "1"
  const payload = React.useSyncExternalStore<ReportPayload | null | undefined>(
    noSubscribe,
    () => readReport(key),
    () => undefined
  )

  // Name the saved file after the conversation, then open the print dialog once
  // fonts and maps have had a moment to render.
  React.useEffect(() => {
    if (!payload) return
    document.title = `${payload.conversationTitle} · Mohala`
    if (preview) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      await document.fonts?.ready
      if (!cancelled) window.print()
    }, 1500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [payload, preview])

  if (payload === undefined) return null
  if (payload === null) {
    return (
      <Empty className="min-h-svh">
        <EmptyHeader>
          <EmptyTitle>Report not available</EmptyTitle>
          <EmptyDescription>
            Reports open from the Download PDF button under an answer, in the same browser. Go back to the
            conversation and export it again.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const sources = reportSources(payload)
  const answeredOn = formatDate(payload.answeredAt)
  const exportedOn = formatDate(payload.exportedAt)

  return (
    <div className="mohala-report min-h-svh bg-muted py-10 text-foreground print:bg-white print:py-0">
      <style>{PRINT_STYLES}</style>

      {/* On screen only: the print dialog can be reopened from here. */}
      <div className="mx-auto mb-6 flex max-w-[8.5in] items-center justify-between gap-4 px-6 print:hidden">
        <p className="text-sm text-muted-foreground">
          In the print window, choose <span className="font-medium text-foreground">Save as PDF</span>. For a
          clean page, turn off the browser&apos;s headers and footers.
        </p>
        <Button onClick={() => window.print()}>
          <FileDown data-icon="inline-start" />
          Save as PDF
        </Button>
      </div>

      {/* The sheet: a Letter-size page on screen, plain paper in print. */}
      <article className="mx-auto max-w-[8.5in] bg-white px-[0.75in] py-[0.75in] shadow-sm ring-1 ring-border print:max-w-none print:p-0 print:shadow-none print:ring-0">
        {/* Header */}
        <header className="flex flex-col gap-5 border-b border-border pb-6">
          <div className="flex items-center gap-2 text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element -- static app icon in a print layout */}
            <img src="/icon.svg" alt="" className="size-6" />
            <span className="text-lg font-semibold tracking-tight">Mohala</span>
            <span className="ml-auto text-xs font-medium tracking-wide text-muted-foreground uppercase">
              District research report
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance">
              {payload.conversationTitle}
            </h1>
            <p className="text-sm text-muted-foreground">
              {[payload.district, answeredOn ? `Answered ${answeredOn}` : null, exportedOn ? `Exported ${exportedOn}` : null]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
          </div>
        </header>

        {/* Question */}
        {payload.question && (
          <section className="mt-6 break-inside-avoid rounded-xl bg-muted px-5 py-4">
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Question</h2>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{payload.question}</p>
          </section>
        )}

        {/* Answer: same rendering as the app; tables and maps are kept whole across pages. */}
        <section className="mt-6 [&_h1]:break-after-avoid [&_h2]:break-after-avoid [&_h3]:break-after-avoid [&_table]:break-inside-avoid [&_[data-slot=card]]:break-inside-avoid">
          <MarkdownRenderer
            content={payload.answer}
            citations={payload.citations}
            className="text-[14.5px] leading-[1.7] md:text-[14.5px]"
          />
        </section>

        {/* Sources */}
        {sources.length > 0 && (
          <section className="mt-10 border-t border-border pt-6">
            <h2 className="mb-4 text-base font-semibold tracking-tight">Sources</h2>
            <ol className="flex flex-col gap-3">
              {sources.map((s, i) => {
                const details = [s.organization, describeCitation(s)].filter(Boolean).join(" · ")
                return (
                  <li key={`${s.url}-${i}`} className="flex break-inside-avoid gap-3 text-[13px] leading-relaxed">
                    <span className="w-6 shrink-0 text-right font-medium text-muted-foreground tabular-nums">
                      {s.number ?? i + 1}.
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-medium">{s.title || s.url}</span>
                      {details && <span className="text-muted-foreground">{details}</span>}
                      <a href={s.url} className="break-all text-primary underline-offset-2 hover:underline">
                        {s.url}
                      </a>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        <footer className="mt-10 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          Generated by Mohala from public data. Figures come from the sources listed above; check them against the
          original publications before citing.
        </footer>
      </article>
    </div>
  )
}
