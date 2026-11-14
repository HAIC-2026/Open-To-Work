"use client"

import * as React from "react"
import {
  Trace,
  TraceLine,
  TraceIcon,
  TraceTitle,
  TraceDescription,
  TraceCollapsible,
  TraceCollapsibleTrigger,
  TraceCollapsibleContent,
} from "@/components/ui/trace"
import {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockTitle,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockContent,
} from "@/components/ui/code-block"
import { Spinner } from "@/components/ui/spinner"
import {
  CircleCheckIcon,
  Search,
  FileSpreadsheet,
  Building2,
  Terminal,
  ArrowUpRight,
  Quote,
  Receipt,
  Wrench,
  AlertCircle,
  Landmark,
  HandHeart,
} from "lucide-react"
import { SourceFavicon } from "./sources"

export interface ToolPartLike {
  type: string
  toolName?: string
  state?: "call" | "result" | "partial-call"
  input?: any
  output?: any
  error?: any
  toolCallId?: string
}

function getToolMeta(toolName?: string) {
  switch (toolName) {
    case "execute_python":
      return {
        icon: Terminal,
        label: "Python Sandbox",
        runningText: "Executing Python data analysis in E2B sandbox...",
        doneText: "Executed Python data analysis",
        errorText: "Python execution failed",
      }
    case "search_datasets":
      return {
        icon: Search,
        label: "Hawaii Data Catalog",
        runningText: "Searching official Hawaii datasets...",
        doneText: "Searched Hawaii open data catalog",
        errorText: "Dataset search failed",
      }
    case "get_dataset_details":
      return {
        icon: FileSpreadsheet,
        label: "Dataset Schema",
        runningText: "Inspecting Hawaii dataset schema...",
        doneText: "Loaded dataset schema & metadata",
        errorText: "Failed to load dataset schema",
      }
    case "explore_data_sources":
      return {
        icon: Building2,
        label: "Hawaii Agencies",
        runningText: "Exploring Hawaii public data sources...",
        doneText: "Explored Hawaii data sources",
        errorText: "Failed to load data sources",
      }
    case "get_census_table":
      return {
        icon: Landmark,
        label: "Census Data API",
        runningText: "Fetching Census Bureau data...",
        doneText: "Fetched Census Bureau data",
        errorText: "Census data request failed",
      }
    case "search_programs":
      return {
        icon: HandHeart,
        label: "Program Inventory",
        runningText: "Searching public programs...",
        doneText: "Searched public programs",
        errorText: "Program search failed",
      }
    case "get_state_tax_collections":
      return {
        icon: Receipt,
        label: "Census State Tax Collections",
        runningText: "Fetching state tax collections...",
        doneText: "Fetched state tax collections",
        errorText: "State tax collections request failed",
      }
    case "cite_sources":
      return {
        icon: Quote,
        label: "Source Attribution",
        runningText: "Attributing used Hawaii data sources...",
        doneText: "Attributed verified data sources",
        errorText: "Failed to attribute data sources",
      }
    default:
      return {
        icon: Wrench,
        label: toolName || "Tool",
        runningText: `Running ${toolName}...`,
        doneText: `Ran ${toolName}`,
        errorText: `${toolName} failed`,
      }
  }
}

export function AgentTrace({
  parts,
  isThinking = false,
}: {
  parts?: any[]
  isThinking?: boolean
}) {
  // Extract all tool-related parts (safely handle null/undefined)
  const toolParts = React.useMemo(() => {
    if (!parts || !Array.isArray(parts)) return []
    return parts.filter(
      (p) =>
        p &&
        (p.type === "dynamic-tool" ||
          (typeof p.type === "string" && p.type.startsWith("tool-")) ||
          p.type === "tool-call" ||
          p.type === "tool-result" ||
          Boolean(p.toolName))
    )
  }, [parts])

  // Determine if any tool is currently streaming or pending
  const hasActiveTool = toolParts.some(
    (p) =>
      p.state === "input-streaming" ||
      p.state === "input-available" ||
      p.state === "call" ||
      (!p.output && !p.error && !p.errorText && !p.result)
  )

  const activeThinking = Boolean(isThinking && (isThinking || hasActiveTool))

  // Track expansion state: auto-expanded while thinking, auto-collapsed when done.
  // All hooks must be called unconditionally at the top level before any early return.
  const [isOpen, setIsOpen] = React.useState(activeThinking)
  const prevThinkingRef = React.useRef(activeThinking)

  React.useEffect(() => {
    // When generation completes (transition from active thinking -> done): auto-collapse
    if (prevThinkingRef.current && !activeThinking) {
      setIsOpen(false)
    }
    // When generation begins (transition from done -> active thinking): auto-expand
    else if (!prevThinkingRef.current && activeThinking) {
      setIsOpen(true)
    }
    prevThinkingRef.current = activeThinking
  }, [activeThinking])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }

  // Early return only after all hooks have been invoked
  if (toolParts.length === 0) return null

  return (
    <Trace className="mb-1.5">
      {/* Outer Chain-of-Thought collapsible */}
      <TraceCollapsible open={isOpen} onOpenChange={handleOpenChange}>
        <TraceCollapsibleTrigger>
          <TraceLine status={activeThinking ? "running" : undefined}>
            <TraceIcon>
              {activeThinking ? (
                <Spinner className="size-3.5 animate-spin text-primary" />
              ) : (
                <CircleCheckIcon className="size-3.5" aria-hidden="true" />
              )}
            </TraceIcon>
            <TraceTitle>
              {activeThinking
                ? "Researching"
                : toolParts.length === 1
                ? "Researched in 1 step"
                : `Researched in ${toolParts.length} steps`}
            </TraceTitle>
          </TraceLine>
        </TraceCollapsibleTrigger>

        {/* Nested Inner Trace containing all individual tool calls */}
        <TraceCollapsibleContent>
          <Trace className="gap-1 pt-0.5">
            {toolParts.map((part, index) => {
              const rawToolName =
                part.toolName ||
                (typeof part.type === "string" && part.type.startsWith("tool-")
                  ? part.type.slice(5)
                  : "")
              const meta = getToolMeta(rawToolName)
              const IconComponent = meta.icon

              const isToolPending =
                part.state === "input-streaming" ||
                part.state === "input-available" ||
                part.state === "call" ||
                (!part.output && !part.error && !part.errorText && !part.result)

              const isRunning = Boolean(isThinking && isToolPending)
              const isInterrupted = Boolean(!isThinking && isToolPending)

              const isError =
                part.state === "output-error" ||
                Boolean(part.error) ||
                Boolean(part.errorText) ||
                (part.output && part.output.success === false) ||
                (part.result && part.result.success === false)

              const status: "running" | "error" | undefined = isRunning
                ? "running"
                : isError
                ? "error"
                : undefined

              const input = part.input || part.args || {}
              const output = part.output || part.result

              // Dynamic step label
              let title = isRunning
                ? meta.runningText
                : isInterrupted
                ? `${meta.runningText.replace(/\.\.\.$/, "")} (halted)`
                : isError
                ? meta.errorText
                : meta.doneText

              if (rawToolName === "search_datasets" && input.query) {
                title = isRunning
                  ? `Searching Hawaii data for "${input.query}"...`
                  : isInterrupted
                  ? `Searched Hawaii data for "${input.query}" (halted)`
                  : output?.results?.length != null
                  ? `Found ${output.results.length} Hawaii datasets for "${input.query}"`
                  : `Searched Hawaii data for "${input.query}"`
              } else if (rawToolName === "get_dataset_details" && (input.datasetId || input.id)) {
                const dsId = input.datasetId || input.id
                title = isRunning
                  ? `Inspecting schema for ${dsId}...`
                  : isInterrupted
                  ? `Inspecting schema for ${dsId} (halted)`
                  : `Loaded schema for ${dsId}`
              } else if (
                rawToolName === "execute_python" &&
                typeof input.purpose === "string" &&
                input.purpose.trim()
              ) {
                // Older messages have no `purpose` and keep the generic labels.
                const purpose = input.purpose.trim().replace(/[.\s]+$/, "")
                title = isRunning
                  ? `${purpose}...`
                  : isInterrupted
                  ? `${purpose} (halted)`
                  : isError
                  ? `Failed: ${purpose}`
                  : purpose
              } else if (rawToolName === "get_census_table" && input.table) {
                const survey =
                  input.survey === "acs1"
                    ? `${input.year} ACS 1-year`
                    : input.survey === "acs5" && typeof input.year === "number"
                    ? `${input.year - 4}–${input.year} ACS 5-year`
                    : "ACS"
                const where =
                  typeof input.geography === "string"
                    ? input.geography.replace(/_/g, " ").replace(/^state$/, "state of Hawaiʻi")
                    : "Hawaiʻi"
                const what = input.variables?.length
                  ? `${survey} ${input.table} for ${where}`
                  : `variables in ${survey} ${input.table}`
                title = isRunning
                  ? `Fetching ${what} from the Census Bureau...`
                  : isInterrupted
                  ? `Fetching ${what} (halted)`
                  : isError || output?.error
                  ? `Census request for ${input.table} failed`
                  : input.variables?.length
                  ? `Fetched ${what} from the Census Bureau`
                  : `Listed ${what}`
              } else if (rawToolName === "search_programs") {
                const count = typeof output?.count === "number" ? output.count : undefined
                const what = input?.query ? `programs matching "${input.query}"` : "public programs"
                title = isRunning
                  ? `Searching ${what}...`
                  : isInterrupted
                  ? `Searching ${what} (halted)`
                  : isError
                  ? "Program search failed"
                  : count !== undefined
                  ? `Found ${count} ${count === 1 ? "program" : "programs"}${input?.query ? ` matching "${input.query}"` : ""}`
                  : `Searched ${what}`
              } else if (
                rawToolName === "get_state_tax_collections" &&
                typeof input.startYear === "number"
              ) {
                const end = typeof input.endYear === "number" ? input.endYear : input.startYear
                const years =
                  end === input.startYear ? `FY${input.startYear}` : `FY${input.startYear}–FY${end}`
                title = isRunning
                  ? `Fetching Hawaiʻi state tax collections for ${years}...`
                  : isInterrupted
                  ? `Fetching Hawaiʻi state tax collections for ${years} (halted)`
                  : isError || output?.error
                  ? `State tax collections request for ${years} failed`
                  : `Fetched Hawaiʻi state tax collections for ${years} from the Census Bureau`
              } else if (rawToolName === "cite_sources") {
                const count = output?.count ?? output?.sources?.length ?? input?.sources?.length
                title = isRunning
                  ? "Attributing used Hawaii data sources..."
                  : isInterrupted
                  ? "Attributed data sources (halted)"
                  : count != null
                  ? `Attributed ${count} verified ${count === 1 ? "source" : "sources"}`
                  : "Attributed verified data sources"
              }

              const line = (
                <TraceLine status={status}>
                  <TraceIcon>
                    {isRunning ? (
                      <Spinner className="size-3.5 animate-spin text-primary" />
                    ) : isError ? (
                      <AlertCircle className="size-3.5 text-destructive" />
                    ) : (
                      // A finished step shows what kind of step it was.
                      <IconComponent className="size-3.5" aria-hidden="true" />
                    )}
                  </TraceIcon>
                  <TraceTitle>{title}</TraceTitle>
                  {!isRunning && (
                    isInterrupted ? (
                      <TraceDescription>
                        Halted
                      </TraceDescription>
                    ) : activeThinking ? (
                      <TraceDescription>
                        {isError ? "Error" : "Done"}
                      </TraceDescription>
                    ) : isError ? (
                      <TraceDescription>
                        Error
                      </TraceDescription>
                    ) : null
                  )}
                </TraceLine>
              )

              // While running or halted without output, render as plain non-collapsible line
              if ((isRunning || isInterrupted) && !output) {
                return (
                  <React.Fragment key={part.toolCallId || index}>
                    {line}
                  </React.Fragment>
                )
              }

              // Collapsible detailed output for completed tool calls
              return (
                <TraceCollapsible key={part.toolCallId || index} defaultOpen={false}>
                  <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
                  <TraceCollapsibleContent>
                    {/* Python execution code and output */}
                    {rawToolName === "execute_python" && (
                      <div className="flex flex-col gap-2 pt-1 text-xs">
                        {input.code && (
                          <CodeBlock size="sm">
                            <CodeBlockHeader>
                              <CodeBlockTitle>Python Code</CodeBlockTitle>
                              <CodeBlockActions>
                                <CodeBlockCopyButton value={input.code} />
                              </CodeBlockActions>
                            </CodeBlockHeader>
                            <CodeBlockContent wrap lineNumbers className="max-h-60 font-mono text-xs">
                              {input.code}
                            </CodeBlockContent>
                          </CodeBlock>
                        )}
                        {output?.stdout && output.stdout !== "(no output)" && (
                          <CodeBlock size="sm">
                            <CodeBlockHeader>
                              <CodeBlockTitle>Standard Output</CodeBlockTitle>
                              <CodeBlockActions>
                                <CodeBlockCopyButton value={output.stdout} />
                              </CodeBlockActions>
                            </CodeBlockHeader>
                            <CodeBlockContent wrap className="max-h-60 font-mono text-xs text-foreground/90">
                              {output.stdout}
                            </CodeBlockContent>
                          </CodeBlock>
                        )}
                        {(output?.stderr || part.errorText) && (
                          <CodeBlock size="sm" variant="destructive">
                            <CodeBlockHeader>
                              <CodeBlockTitle>Standard Error / Traceback</CodeBlockTitle>
                            </CodeBlockHeader>
                            <CodeBlockContent wrap className="max-h-60 font-mono text-xs">
                              {output?.stderr || part.errorText}
                            </CodeBlockContent>
                          </CodeBlock>
                        )}
                      </div>
                    )}

                    {/* Dataset search results presentation */}
                    {rawToolName === "search_datasets" && output?.results && Array.isArray(output.results) && (
                      <div className="flex flex-col gap-1.5 pt-1">
                        {output.results.slice(0, 5).map((d: any) => (
                          <a
                            key={d.id}
                            href={d.direct_download_url || d.source_url || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="group/dataset flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs transition-colors hover:border-border hover:bg-muted/70"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              <SourceFavicon url={d.source_url || d.direct_download_url} />
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate font-medium text-foreground group-hover/dataset:text-primary">
                                  {d.title}
                                </span>
                                <span className="truncate text-muted-foreground">
                                  {d.organization || d.source} • Coverage: {d.start_year || "?"}–{d.end_year || "?"}
                                </span>
                              </div>
                            </div>
                            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover/dataset:text-primary transition-colors" />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Schema details presentation */}
                    {rawToolName === "get_dataset_details" && output?.fields && (
                      <div className="flex flex-col gap-1.5 pt-1 text-xs">
                        <div className="font-medium text-muted-foreground">
                          Columns ({output.fields.length}):
                        </div>
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          {output.fields.slice(0, 8).map((f: any) => (
                            <div
                              key={f.name}
                              className="truncate rounded border border-border/40 bg-muted/20 px-2 py-1 font-mono text-[11px]"
                            >
                              <span className="text-foreground">{f.name}</span>
                              {f.type && <span className="text-muted-foreground/70"> ({f.type})</span>}
                            </div>
                          ))}
                        </div>
                        {output.ai_limitations && (
                          <div className="mt-1 text-[11px] text-amber-500/90 dark:text-amber-400/90">
                            <strong>Limitations:</strong> {output.ai_limitations}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Source attribution presentation */}
                    {rawToolName === "cite_sources" &&
                      (output?.sources || input?.sources) &&
                      Array.isArray(output?.sources || input?.sources) && (
                        <div className="flex flex-col gap-1.5 pt-1">
                          {(output?.sources || input?.sources).map((s: any, idx: number) => (
                            <a
                              key={s.datasetId || s.id || `${s.url || "source"}-${idx}`}
                              href={s.url || s.direct_download_url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="group/dataset flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs transition-colors hover:border-border hover:bg-muted/70"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                <SourceFavicon url={s.url || s.direct_download_url} />
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <span className="truncate font-medium text-foreground group-hover/dataset:text-primary">
                                    {s.title || s.datasetId}
                                  </span>
                                  {s.reason && (
                                    <span className="truncate text-muted-foreground">
                                      {s.reason}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover/dataset:text-primary transition-colors" />
                            </a>
                          ))}
                        </div>
                      )}

                    {/* Generic fallback presentation */}
                    {rawToolName !== "execute_python" &&
                      rawToolName !== "search_datasets" &&
                      rawToolName !== "get_dataset_details" &&
                      rawToolName !== "cite_sources" &&
                      output && (
                        <CodeBlock size="sm">
                          <CodeBlockContent wrap className="max-h-60 font-mono text-xs">
                            {JSON.stringify(output, null, 2)}
                          </CodeBlockContent>
                        </CodeBlock>
                      )}
                  </TraceCollapsibleContent>
                </TraceCollapsible>
              )
            })}
          </Trace>
        </TraceCollapsibleContent>
      </TraceCollapsible>
    </Trace>
  )
}
