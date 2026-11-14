"use client"

import * as React from "react"
import { MessageSquare, SendHorizontal } from "lucide-react"
import type { Id } from "@/convex/_generated/dataModel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Spinner } from "@/components/ui/spinner"
import type { SourceItem } from "@/components/sources"
import {
  activeMentionQuery,
  encodeMentions,
  shiftMentions,
  type Mentionable,
  type PlacedMention,
} from "@/components/workspaces/mentions"
import { cn } from "@/lib/utils"

/** Shared pieces of the project page and its workspace. */

export interface Member {
  _id: Id<"users">
  name: string
  district: string
  photoUrl?: string
}

export interface Citation {
  number: number
  url: string
  title?: string
  organization?: string
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function MemberAvatar({ member, size = "default" }: { member: Member; size?: "default" | "sm" | "lg" }) {
  return (
    <Avatar size={size}>
      {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.name} />}
      <AvatarFallback>{initials(member.name)}</AvatarFallback>
    </Avatar>
  )
}

export function formatTime(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ms)
}

/** Stored citations in the shape the markdown renderer's `[n]` markers use. */
export function toSourceItems(citations: Citation[]): SourceItem[] {
  return citations.map((c) => ({ url: c.url, title: c.title, organization: c.organization, number: c.number }))
}

/** Numbered source list under a pinned answer. */
export function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null
  return (
    <ol className="flex flex-col gap-1 text-xs text-muted-foreground">
      {citations.map((c) => (
        <li key={c.number} className="flex gap-1.5">
          <span className="tabular-nums">[{c.number}]</span>
          <a href={c.url} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline">
            {c.title || c.url}
            {c.organization ? ` · ${c.organization}` : ""}
          </a>
        </li>
      ))}
    </ol>
  )
}

/**
 * Text box with a send button, submitting on Enter (Shift+Enter for a new line).
 * With `mentionables`, typing "@" opens a menu of them (shadcn has no mention
 * component, so this composes Command): arrows move, Enter/Tab picks, Esc closes.
 */
export function Composer({
  placeholder,
  disabled,
  onSend,
  label,
  className,
  autoFocus,
  mentionables,
}: {
  placeholder: string
  disabled?: boolean
  /** Gets the text with picked mentions already turned into tokens. */
  onSend: (text: string) => Promise<void>
  label: string
  className?: string
  autoFocus?: boolean
  mentionables?: Mentionable[]
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [text, setText] = React.useState("")
  const [caret, setCaret] = React.useState(0)
  const [mentions, setMentions] = React.useState<PlacedMention[]>([])
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null)
  const [activeId, setActiveId] = React.useState("")
  const [isSending, setIsSending] = React.useState(false)
  const canSend = text.trim().length > 0 && !disabled && !isSending

  const mention = mentionables ? activeMentionQuery(text, caret) : null
  const matches = React.useMemo(() => {
    if (!mention || !mentionables) return []
    const q = mention.query.toLowerCase()
    return mentionables.filter((m) => m.title.toLowerCase().includes(q)).slice(0, 8)
  }, [mention, mentionables])
  const menuOpen = mention !== null && dismissedAt !== mention.start && !disabled
  // Keep the highlighted item valid as the list narrows.
  const highlighted = matches.some((m) => m._id === activeId) ? activeId : (matches[0]?._id ?? "")

  const syncCaret = () => setCaret(textareaRef.current?.selectionStart ?? 0)

  const pick = (m: Mentionable) => {
    if (!mention) return
    const insert = `@${m.title} `
    const next = text.slice(0, mention.start) + insert + text.slice(caret)
    const nextCaret = mention.start + insert.length
    setMentions((prev) => [
      ...shiftMentions(prev, text, next),
      { id: m._id, title: m.title, start: mention.start },
    ])
    setText(next)
    setCaret(nextCaret)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  const send = async () => {
    if (!canSend) return
    setIsSending(true)
    try {
      // Encode before trimming so the tracked positions still line up.
      await onSend(encodeMentions(text, mentions).trim())
      setText("")
      setMentions([])
      setCaret(0)
    } catch (err) {
      console.error(err)
    } finally {
      setIsSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && matches.length > 0) {
      const index = matches.findIndex((m) => m._id === highlighted)
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault()
        const step = e.key === "ArrowDown" ? 1 : -1
        setActiveId(matches[(index + step + matches.length) % matches.length]._id)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        pick(matches[Math.max(index, 0)])
        return
      }
    }
    if (menuOpen && e.key === "Escape") {
      e.preventDefault()
      setDismissedAt(mention.start)
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  return (
    <form
      className={cn("relative", className)}
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      {menuOpen && (
        <Command
          value={highlighted}
          onValueChange={setActiveId}
          shouldFilter={false}
          className="absolute inset-x-0 bottom-full z-10 mb-2 size-auto rounded-2xl shadow-md ring-1 ring-foreground/10"
          // Keep focus in the textarea while clicking an item.
          onMouseDown={(e) => e.preventDefault()}
        >
          <CommandList>
            <CommandGroup heading="Mention a conversation in this project">
              {matches.map((m) => (
                <CommandItem key={m._id} value={m._id} onSelect={() => pick(m)}>
                  <MessageSquare />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{m.title}</span>
                    {m.detail && <span className="truncate text-xs text-muted-foreground">{m.detail}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {matches.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {mentionables?.length ? "No conversation matches." : "This project has no conversations yet."}
              </p>
            )}
          </CommandList>
        </Command>
      )}
      <InputGroup>
        <InputGroupTextarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setMentions((prev) => shiftMentions(prev, text, e.target.value))
            setText(e.target.value)
            setCaret(e.target.selectionStart ?? e.target.value.length)
            setDismissedAt(null)
          }}
          onSelect={syncCaret}
          onKeyDown={onKeyDown}
          onBlur={() => mention && setDismissedAt(mention.start)}
          placeholder={placeholder}
          disabled={disabled || isSending}
          aria-label={label}
          aria-expanded={menuOpen}
          autoFocus={autoFocus}
          className="max-h-40 min-h-12"
        />
        <InputGroupAddon align="block-end" className="justify-end">
          <InputGroupButton type="submit" size="icon-sm" variant="default" disabled={!canSend} aria-label={label}>
            {isSending ? <Spinner /> : <SendHorizontal />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
