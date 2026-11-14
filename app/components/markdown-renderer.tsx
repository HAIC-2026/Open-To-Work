"use client"

import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"

import { Separator } from "@/components/ui/separator"
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockContent,
} from "@/components/ui/code-block"
import { cn } from "@/lib/utils"
import { CitationMarkers, rehypeCitations } from "@/components/citation-marker"
import type { SourceItem } from "@/components/sources"
import { DistrictMapBlock } from "@/components/district-map/district-map-block"

interface MarkdownRendererProps {
  content: string
  className?: string
  children?: React.ReactNode
  /** Numbered sources from cite_sources; `[n]` markers become citation links. */
  citations?: SourceItem[]
  /** True while the answer is still streaming (unfinished map blocks show a placeholder). */
  isStreaming?: boolean
}

export function MarkdownRenderer({
  content,
  className,
  children,
  citations = [],
  isStreaming = false,
}: MarkdownRendererProps) {
  return (
    <div className={cn("text-sm md:text-base leading-relaxed text-foreground", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false }],
          // After KaTeX so math output is skipped.
          [rehypeCitations, { count: citations.length }],
        ]}
        components={{
          sup: ({ node, children: supChildren, ...props }) => {
            const spec = node?.properties?.dataCitations
            if (typeof spec === "string" && spec) {
              return <CitationMarkers numbers={spec.split(",").map(Number)} citations={citations} />
            }
            return <sup {...props}>{supChildren}</sup>
          },
          hr: () => <Separator className="my-6 bg-border" />,
          h1: ({ children: hChildren }) => (
            <h1 className="scroll-m-20 text-xl font-bold tracking-tight mt-6 mb-2 text-foreground first:mt-0">
              {hChildren}
            </h1>
          ),
          h2: ({ children: hChildren }) => (
            <h2 className="scroll-m-20 border-b pb-1.5 text-lg font-semibold tracking-tight mt-5 mb-2 text-foreground first:mt-0">
              {hChildren}
            </h2>
          ),
          h3: ({ children: hChildren }) => (
            <h3 className="scroll-m-20 text-base font-semibold tracking-tight mt-4 mb-1.5 text-foreground first:mt-0">
              {hChildren}
            </h3>
          ),
          h4: ({ children: hChildren }) => (
            <h4 className="scroll-m-20 text-sm font-semibold tracking-tight mt-3 mb-1 text-foreground first:mt-0">
              {hChildren}
            </h4>
          ),
          p: ({ children: pChildren }) => (
            <p className="leading-relaxed my-2 text-foreground">{pChildren}</p>
          ),
          strong: ({ children: strongChildren }) => (
            <strong className="font-semibold text-foreground">{strongChildren}</strong>
          ),
          em: ({ children: emChildren }) => (
            <em className="italic">{emChildren}</em>
          ),
          ul: ({ children: ulChildren }) => (
            <ul className="my-2.5 ml-6 list-disc space-y-1.5 text-foreground [&>li]:leading-relaxed">
              {ulChildren}
            </ul>
          ),
          ol: ({ children: olChildren }) => (
            <ol className="my-2.5 ml-6 list-decimal space-y-1.5 text-foreground [&>li]:leading-relaxed">
              {olChildren}
            </ol>
          ),
          li: ({ children: liChildren }) => (
            <li className="leading-relaxed text-foreground">{liChildren}</li>
          ),
          blockquote: ({ children: bqChildren }) => (
            <blockquote className="mt-3 border-l-2 border-border pl-4 italic text-muted-foreground">
              {bqChildren}
            </blockquote>
          ),
          table: ({ children: tableChildren }) => (
            <div className="my-4 w-full overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">{tableChildren}</table>
            </div>
          ),
          thead: ({ children: theadChildren }) => (
            <thead className="bg-muted/50 border-b border-border">{theadChildren}</thead>
          ),
          th: ({ children: thChildren }) => (
            <th className="px-4 py-2 text-left font-semibold text-muted-foreground">
              {thChildren}
            </th>
          ),
          td: ({ children: tdChildren }) => (
            <td className="border-b border-border/50 px-4 py-2 text-foreground last:border-b-0">
              {tdChildren}
            </td>
          ),
          a: ({ href, children: aChildren }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-4 hover:opacity-80 transition-opacity"
            >
              {aChildren}
            </a>
          ),
          pre: ({ children: preChildren }) => <>{preChildren}</>,
          code: ({ className: codeClassName, children: codeChildren, ...props }) => {
            // ```district-map blocks are map descriptions written by the agent
            // (DISTRICT MAPS rules in convex/chatActions.ts), drawn as a map.
            if (/(^|\s)language-district-map(\s|$)/.test(codeClassName || "")) {
              return <DistrictMapBlock source={String(codeChildren)} isStreaming={isStreaming} />
            }
            const match = /language-(\w+)/.exec(codeClassName || "")
            const isInline = !match && !String(codeChildren).includes("\n")

            if (isInline) {
              return (
                <code
                  className="relative rounded bg-muted px-[0.35rem] py-[0.15rem] font-mono text-xs font-semibold text-foreground"
                  {...props}
                >
                  {codeChildren}
                </code>
              )
            }

            const language = match ? match[1] : ""
            const codeString = String(codeChildren).replace(/\n$/, "")

            return (
              <CodeBlock className="my-4" size="sm">
                <CodeBlockHeader>
                  <CodeBlockTitle>{language || "code"}</CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton value={codeString} />
                  </CodeBlockActions>
                </CodeBlockHeader>
                <CodeBlockContent wrap>
                  {codeString}
                </CodeBlockContent>
              </CodeBlock>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {children}
    </div>
  )
}
