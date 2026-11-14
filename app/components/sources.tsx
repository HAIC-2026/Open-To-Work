"use client"

import * as React from "react"
import { GlobeIcon, ArrowUpRight } from "lucide-react"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"
import { Badge } from "@/components/ui/badge"
import { cn } from "cn"

export interface SourceItem {
  id?: string
  datasetId?: string
  url: string
  title?: string
  reason?: string
  organization?: string
  coverage?: string
  direct_download_url?: string
  /** Citation number from cite_sources, used by inline [n] markers. */
  number?: number
  /** Data year or vintage, e.g. "2020–2024 ACS 5-year". */
  year?: string
  /** Geography the figures describe, e.g. "State House District 49". */
  geography?: string
  /** True when figures were estimated/apportioned from other geographies. */
  apportioned?: boolean
  apportionmentMethod?: string
  /** "program" for a program from the program inventory (links its official page). */
  kind?: string
}

/** Shape of a cite_sources result as stored on a message part. */
interface CitedSourceOutput {
  number?: number
  id?: string
  datasetId?: string
  url?: string
  direct_download_url?: string
  title?: string
  reason?: string
  organization?: string
  source?: string
  coverage?: string
  year?: string
  geography?: string
  apportioned?: boolean
  apportionmentMethod?: string
  kind?: string
}

interface ToolPartLike {
  type?: unknown
  toolName?: unknown
  output?: { sources?: unknown }
}

const isCiteSourcesPart = (part: unknown): part is ToolPartLike => {
  if (!part || typeof part !== "object") return false
  const p = part as ToolPartLike
  return (
    p.type === "tool-cite_sources" ||
    p.toolName === "cite_sources" ||
    (p.type === "dynamic-tool" && p.toolName === "cite_sources")
  )
}

/**
 * Numbered citations for a message: the verified sources from its latest
 * cite_sources call, ordered by citation number.
 */
export function extractCitations(parts?: unknown[]): SourceItem[] {
  if (!Array.isArray(parts)) return []
  const last = [...parts]
    .reverse()
    .find((p): p is ToolPartLike => isCiteSourcesPart(p) && Array.isArray(p.output?.sources))
  if (!last) return []
  return (last.output?.sources as CitedSourceOutput[])
    .filter((item) => item && (item.url || item.direct_download_url))
    .map((item, i) => ({
      id: item.id || item.datasetId,
      datasetId: item.datasetId || item.id,
      url: (item.url || item.direct_download_url) as string,
      title: item.title,
      reason: item.reason,
      organization: item.organization || item.source,
      coverage: item.coverage,
      direct_download_url: item.direct_download_url,
      number: typeof item.number === "number" ? item.number : i + 1,
      year: item.year,
      geography: item.geography,
      apportioned: item.apportioned,
      apportionmentMethod: item.apportionmentMethod,
      kind: item.kind,
    }))
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
}

/** One-line "year · geography · apportioned" description of a citation. */
export function describeCitation(source: SourceItem): string {
  return [
    source.year,
    source.geography,
    source.kind === "program"
      ? "Official program page"
      : source.apportioned
      ? `Estimated for the district${source.apportionmentMethod ? ` (${source.apportionmentMethod})` : ""}`
      : source.geography
        ? "Published for this geography"
        : null,
  ]
    .filter(Boolean)
    .join(" · ")
}

export interface SourcesProps extends React.ComponentProps<"div"> {
  parts?: any[]
  content?: string
  sources?: SourceItem[]
}

/**
 * Normalizes a URL for comparison and deduplication:
 * - Trims whitespace
 * - Strips trailing slashes
 * - Lowercases scheme and hostname
 */
function normalizeUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim())
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null
    }
    // Filter out internal localhost URLs
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "0.0.0.0") {
      return null
    }
    parsed.hash = ""
    return parsed.toString().replace(/\/+$/, "")
  } catch {
    return null
  }
}

/**
 * Extracts a friendly hostname from a URL (e.g. "dbedt.hawaii.gov")
 */
function getHostname(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    return parsed.hostname.replace(/^www\./, "")
  } catch {
    return rawUrl
  }
}

/**
 * Component to display a site's favicon using Google's Favicon CDN with fallback to GlobeIcon.
 */
export function SourceFavicon({
  url,
  className,
}: {
  url?: string
  className?: string
}) {
  const [hasError, setHasError] = React.useState(false)

  const domain = React.useMemo(() => {
    if (!url) return null
    try {
      const parsed = new URL(url)
      if (!["http:", "https:"].includes(parsed.protocol)) return null
      if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) return null
      return parsed.hostname.replace(/^www\./, "")
    } catch {
      return null
    }
  }, [url])

  if (!domain || hasError) {
    return (
      <div
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md border border-border/40 bg-muted/40 text-muted-foreground",
          className
        )}
      >
        <GlobeIcon className="size-3.5" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md border border-border/40 bg-background/80 overflow-hidden",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt=""
        width={16}
        height={16}
        className="size-4 object-contain"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </div>
  )
}

/**
 * Extract and deduplicate sources across:
 * 1. Explicit `sources` passed as prop
 * 2. Native AI SDK / provider grounding parts (`part.type === "source-url"`)
 * 3. Explicit semantic model attribution via cite_sources tool
 * 4. Tool outputs from Hawaii dataset search and detail tools
 * 5. Markdown links in response content (`[Title](https://...)`)
 */
export function extractSources(
  parts?: any[],
  content?: string,
  explicitSources?: SourceItem[]
): SourceItem[] {
  const sourceMap = new Map<string, SourceItem>()

  const addSource = (
    rawUrl: any,
    rawTitle?: any,
    meta?: Partial<SourceItem>
  ) => {
    if (!rawUrl || typeof rawUrl !== "string") return
    const normalized = normalizeUrl(rawUrl)
    if (!normalized) return

    const cleanTitle =
      typeof rawTitle === "string" && rawTitle.trim().length > 0 && !rawTitle.startsWith("http")
        ? rawTitle.trim()
        : undefined

    const key = meta?.datasetId || meta?.id || normalized

    const existing = sourceMap.get(key)
    if (!existing) {
      sourceMap.set(key, {
        url: normalized,
        title: cleanTitle,
        ...meta,
      })
    } else {
      if (!existing.title && cleanTitle) {
        existing.title = cleanTitle
      }
      if (!existing.reason && meta?.reason) {
        existing.reason = meta.reason
      }
      if (!existing.organization && meta?.organization) {
        existing.organization = meta.organization
      }
      if (!existing.coverage && meta?.coverage) {
        existing.coverage = meta.coverage
      }
      if (!existing.direct_download_url && meta?.direct_download_url) {
        existing.direct_download_url = meta.direct_download_url
      }
      if (!existing.datasetId && meta?.datasetId) {
        existing.datasetId = meta.datasetId
      }
    }
  }

  // 1. Explicit sources
  if (Array.isArray(explicitSources)) {
    for (const s of explicitSources) {
      if (s) addSource(s.url, s.title, s)
    }
  }

  // 2. Explicit semantic model attribution via cite_sources (numbered citations)
  const citations = extractCitations(parts)
  if (citations.length > 0) {
    for (const item of citations) addSource(item.url, item.title, item)
    return Array.from(sourceMap.values())
  }

  // 3. Fallback: message parts (streaming deltas or persisted tool calls)
  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (!part) continue

      // Native source-url parts (AI SDK / provider grounding)
      if (part.type === "source-url" && part.url) {
        addSource(part.url, part.title)
      } else if (part.type === "source-document") {
        if (part.url) addSource(part.url, part.title || part.filename)
      }

      // Tool outputs: search_datasets
      const isSearchTool =
        part.type === "tool-search_datasets" ||
        part.toolName === "search_datasets" ||
        (part.type === "dynamic-tool" && part.toolName === "search_datasets")
      if (isSearchTool && part.output?.results && Array.isArray(part.output.results)) {
        for (const item of part.output.results) {
          if (!item) continue
          const title = item.title || item.name
          const url = item.source_url || item.direct_download_url
          const coverage =
            item.start_year && item.end_year
              ? `${item.start_year}–${item.end_year}`
              : item.end_year
              ? String(item.end_year)
              : undefined

          addSource(url, title, {
            id: item.id,
            datasetId: item.id,
            organization: item.organization || item.source,
            coverage,
            direct_download_url: item.direct_download_url,
          })
        }
      }

      // Tool outputs: get_dataset_details
      const isDetailTool =
        part.type === "tool-get_dataset_details" ||
        part.toolName === "get_dataset_details" ||
        (part.type === "dynamic-tool" && part.toolName === "get_dataset_details")
      if (isDetailTool && part.output) {
        const out = part.output
        const title = out.title || out.name
        const url = out.source_url || out.direct_download_url
        const coverage =
          out.start_year && out.end_year
            ? `${out.start_year}–${out.end_year}`
            : out.end_year
            ? String(out.end_year)
            : undefined

        addSource(url, title, {
          id: out.id,
          datasetId: out.id,
          organization: out.organization || out.source,
          coverage,
          direct_download_url: out.direct_download_url,
        })
      }
    }
  }

  // 4. Response markdown content links: [Title](https://...)
  if (content && typeof content === "string") {
    const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g
    let match: RegExpExecArray | null
    while ((match = mdLinkRegex.exec(content)) !== null) {
      const [, linkText, linkUrl] = match
      addSource(linkUrl, linkText)
    }
  }

  return Array.from(sourceMap.values())
}

/**
 * Official shadcn/ui AI Elements Sources Component
 * Displays collapsible sources trace at the end of assistant response.
 * Uses the Datatrove interactive dataset card design with website favicons.
 * Reference: https://ui.shadcn.com/docs/ai-elements/base/sources
 */
export function Sources({
  parts,
  content,
  sources: explicitSources,
  className,
  ...props
}: SourcesProps) {
  const sources = React.useMemo(
    () => extractSources(parts, content, explicitSources),
    [parts, content, explicitSources]
  )

  if (sources.length === 0) return null

  return (
    <Trace className={cn("w-full pt-1", className)} {...props}>
      {/* Collapsed by default: the inline [n] markers already show each
          source's details on hover, and one click here expands the list. */}
      <TraceCollapsible>
        <TraceCollapsibleTrigger>
          <TraceLine>
            <TraceIcon>
              <GlobeIcon className="size-3.5" />
            </TraceIcon>
            <TraceTitle>
              Used {sources.length} {sources.length === 1 ? "source" : "sources"}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>
        <TraceCollapsibleContent>
          <div className="flex flex-col gap-1.5 pt-1">
            {sources.map((source, idx) => {
              const vintage = [source.year, source.geography].filter(Boolean).join(" · ")
              const isProgram = source.kind === "program"
              const isCitation = source.apportioned !== undefined || isProgram
              const subtitle =
                source.reason ||
                [
                  source.organization,
                  source.coverage ? `Coverage: ${source.coverage}` : null,
                ]
                  .filter(Boolean)
                  .join(" • ") ||
                (source.title && source.url ? getHostname(source.url) : undefined)

              return (
                <a
                  key={source.datasetId || source.id || `${source.url}-${idx}`}
                  href={source.url || source.direct_download_url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "group/dataset flex justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs transition-colors hover:border-border hover:bg-muted/70",
                    isCitation ? "items-start" : "items-center"
                  )}
                >
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 gap-2.5",
                      isCitation ? "items-start" : "items-center"
                    )}
                  >
                    {source.number !== undefined && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-muted px-1 font-mono text-[11px] font-semibold text-muted-foreground">
                        {source.number}
                      </span>
                    )}
                    <SourceFavicon url={source.url || source.direct_download_url} />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate font-medium text-foreground group-hover/dataset:text-primary">
                        {source.title ?? getHostname(source.url)}
                      </span>
                      {subtitle && (
                        <span
                          className={cn(
                            "text-muted-foreground",
                            isCitation ? "line-clamp-2" : "truncate"
                          )}
                        >
                          {subtitle}
                        </span>
                      )}
                      {isCitation && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Badge variant={source.apportioned ? "secondary" : "outline"}>
                            {isProgram
                              ? "Official program page"
                              : source.apportioned
                                ? "Estimated for district"
                                : "Published for this geography"}
                          </Badge>
                          {vintage && <span className="text-muted-foreground">{vintage}</span>}
                        </div>
                      )}
                      {source.apportioned && source.apportionmentMethod && (
                        <span className="text-muted-foreground">
                          Method: {source.apportionmentMethod}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover/dataset:text-primary transition-colors" />
                </a>
              )
            })}
          </div>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
