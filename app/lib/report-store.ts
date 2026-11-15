import type { SourceItem } from "@/components/sources"

/**
 * Hands one answer from the conversation page to the report page (/report/[key])
 * through localStorage, so the report opens in a new tab with no server round
 * trip. Entries older than a day are pruned on each save.
 */

export interface ReportPayload {
  conversationTitle: string
  district?: string
  /** The question the answer responds to. */
  question?: string
  /** The answer as markdown (maps and tables included). */
  answer: string
  /** Numbered sources behind the answer's [n] markers. */
  citations: SourceItem[]
  /** Every source listed under "Used N sources". */
  sources: SourceItem[]
  answeredAt?: number
  exportedAt: number
}

const PREFIX = "mohala-report:"
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function saveReport(payload: ReportPayload): string {
  const key = `${payload.exportedAt.toString(36)}${Math.random().toString(36).slice(2, 8)}`
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      try {
        const old = JSON.parse(localStorage.getItem(k) ?? "{}") as Partial<ReportPayload>
        if (!old.exportedAt || payload.exportedAt - old.exportedAt > MAX_AGE_MS) localStorage.removeItem(k)
      } catch {
        localStorage.removeItem(k)
      }
    }
    localStorage.setItem(PREFIX + key, JSON.stringify(payload))
  } catch (err) {
    console.error("Could not save the report for export", err)
  }
  return key
}

export function loadReport(key: string): ReportPayload | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as ReportPayload) : null
  } catch {
    return null
  }
}
