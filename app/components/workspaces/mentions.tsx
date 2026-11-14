"use client"

import * as React from "react"
import Link from "next/link"
import { MessageSquare } from "lucide-react"

/**
 * Conversation mentions in workspace discussion messages.
 *
 * While typing, the box shows "@Title"; on send each picked mention becomes a
 * token `@[Title](conversationId)` (the server keeps it only if the
 * conversation is in the project). Messages render tokens as links.
 */

/** Must match MENTION_TOKEN in convex/workspaces.ts. */
const MENTION_TOKEN = /@\[([^\]\n]{1,200})\]\(([a-z0-9]{10,64})\)/g

export interface Mentionable {
  _id: string
  title: string
  /** Shown under the title in the menu, e.g. "Sue Lee Loy · Nov 14", to tell same-named conversations apart. */
  detail?: string
}

/** A picked mention, tracked by conversation id and where its "@Title" sits in the typed text. */
export interface PlacedMention {
  id: string
  title: string
  start: number
}

const mentionText = (m: { title: string }) => `@${m.title}`

/**
 * Keep mention positions in step with an edit (prev → next). The edit is the
 * span between the texts' common prefix and suffix: mentions before it stay,
 * mentions after it shift, and a mention the edit touches is dropped.
 */
export function shiftMentions(mentions: PlacedMention[], prev: string, next: string): PlacedMention[] {
  let prefix = 0
  const maxPrefix = Math.min(prev.length, next.length)
  while (prefix < maxPrefix && prev[prefix] === next[prefix]) prefix++
  let suffix = 0
  while (
    suffix < prev.length - prefix &&
    suffix < next.length - prefix &&
    prev[prev.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix++
  }
  const editEnd = prev.length - suffix
  const delta = next.length - prev.length
  return mentions.flatMap((m) => {
    const end = m.start + mentionText(m).length
    if (end <= prefix) return [m]
    if (m.start >= editEnd) return [{ ...m, start: m.start + delta }]
    return []
  })
}

/**
 * Replace each tracked mention's "@Title" with a token carrying its
 * conversation id, so same-named conversations stay distinct.
 */
export function encodeMentions(text: string, mentions: PlacedMention[]): string {
  let out = ""
  let last = 0
  for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
    const plain = mentionText(m)
    if (m.start < last || text.slice(m.start, m.start + plain.length) !== plain) continue
    out += text.slice(last, m.start) + `@[${m.title.replace(/[\]\n]/g, " ")}](${m.id})`
    last = m.start + plain.length
  }
  return out + text.slice(last)
}

/** Plain "@Title" text for previews (pinned items, the project page's latest message). */
export function mentionsToPlain(body: string): string {
  return body.replace(MENTION_TOKEN, (_, title: string) => `@${title}`)
}

/** A message body with mention tokens rendered as links to the conversations. */
export function MentionText({ body }: { body: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const match of body.matchAll(MENTION_TOKEN)) {
    const [token, title, id] = match
    const at = match.index ?? 0
    if (at > last) parts.push(body.slice(last, at))
    parts.push(
      <Link
        key={`${at}-${id}`}
        href={`/conversations/${id}`}
        className="relative inline-flex items-baseline gap-1 font-medium underline underline-offset-2"
      >
        <MessageSquare className="size-3.5 self-center" />
        {title}
      </Link>
    )
    last = at + token.length
  }
  if (last < body.length) parts.push(body.slice(last))
  return <>{parts}</>
}

/** The "@query" being typed right before the caret, if any (start of text or after whitespace). */
export function activeMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret)
  const match = /(^|\s)@([^\s@]{0,60})$/.exec(before)
  if (!match) return null
  return { query: match[2], start: caret - match[2].length - 1 }
}
