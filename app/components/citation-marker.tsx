"use client"

import * as React from "react"
import type { Element, ElementContent, Root, RootContent } from "hast"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { describeCitation, SourceFavicon, type SourceItem } from "@/components/sources"

/** Matches [1], [1, 2], [1-3] / [1–3] citation markers. */
const MARKER_RE = /\[(\d{1,2}(?:\s*(?:,|-|–)\s*\d{1,2})*)\]/g
/** Cheap, stateless pre-check (MARKER_RE is global, so it isn't used with .test). */
const HAS_MARKER = /\[\d/
/** Never rewrite inside code, links, math, or existing citations. */
const SKIP_TAGS = new Set(["code", "pre", "a", "kbd", "sup", "script", "style"])

function expand(spec: string): number[] {
  const out: number[] = []
  for (const part of spec.split(",")) {
    const [a, b] = part.split(/-|–/).map((n) => Number(n.trim()))
    if (b === undefined) out.push(a)
    else for (let n = Math.min(a, b); n <= Math.max(a, b) && n - a < 20; n++) out.push(n)
  }
  return [...new Set(out)]
}

function isSkipped(node: Element): boolean {
  if (SKIP_TAGS.has(node.tagName)) return true
  const cls = node.properties?.className
  return Array.isArray(cls) && cls.some((c) => String(c).startsWith("katex"))
}

/**
 * Rehype plugin: turns `[n]` markers in text into
 * `<sup data-citations="n,…">` elements, only for numbers that exist in the
 * message's cite_sources list (so ordinary bracketed text is left alone).
 */
export function rehypeCitations(options: { count: number }) {
  const { count } = options
  const valid = (n: number) => Number.isInteger(n) && n >= 1 && n <= count

  const transform = (parent: Root | Element) => {
    const next: (RootContent | ElementContent)[] = []
    for (const child of parent.children) {
      if (child.type === "element") {
        if (!isSkipped(child)) transform(child)
        next.push(child)
        continue
      }
      if (child.type !== "text" || !HAS_MARKER.test(child.value)) {
        next.push(child)
        continue
      }
      let last = 0
      for (const match of child.value.matchAll(MARKER_RE)) {
        const numbers = expand(match[1])
        if (numbers.length === 0 || !numbers.every(valid)) continue
        if (match.index > last) next.push({ type: "text", value: child.value.slice(last, match.index) })
        next.push({
          type: "element",
          tagName: "sup",
          properties: { dataCitations: numbers.join(",") },
          children: [{ type: "text", value: match[0] }],
        })
        last = match.index + match[0].length
      }
      if (last < child.value.length) next.push({ type: "text", value: child.value.slice(last) })
    }
    parent.children = next as typeof parent.children
  }

  return (tree: Root) => {
    if (count > 0) transform(tree)
  }
}

/**
 * Inline citation badge(s). Each number is a real link to the official
 * dataset with a descriptive label; the hover card is a visual enhancement
 * only (Base UI preview-card guidance), and the same details are listed in
 * the numbered Sources cards under the answer.
 */
export function CitationMarkers({
  numbers,
  citations,
}: {
  numbers: number[]
  citations: SourceItem[]
}) {
  return (
    <sup className="ml-0.5 inline-flex gap-0.5 align-super leading-none">
      {numbers.map((n) => {
        const source = citations.find((c) => c.number === n)
        if (!source) return null
        const details = describeCitation(source)
        const label = `Source ${n}: ${source.title ?? source.url}${details ? `, ${details}` : ""}`
        return (
          <HoverCard key={n}>
            <HoverCardTrigger
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              delay={150}
              className="inline-flex h-4 min-w-4 items-center justify-center rounded-md bg-muted px-1 font-mono text-[10px] font-semibold text-muted-foreground no-underline transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              {n}
            </HoverCardTrigger>
            <HoverCardContent side="top" className="w-80 rounded-2xl p-3 text-xs">
              <div className="flex items-start gap-2.5">
                <SourceFavicon url={source.url} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium text-foreground">{source.title ?? source.url}</span>
                  {source.organization && (
                    <span className="text-muted-foreground">{source.organization}</span>
                  )}
                  {details && <span className="text-muted-foreground">{details}</span>}
                  {source.reason && <span className="text-foreground/80">{source.reason}</span>}
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        )
      })}
    </sup>
  )
}
