"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { PromptInput } from "@/components/prompt-input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller"
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  MapPin,
  PlusIcon,
  MessageCircleDashedIcon,
  CopyIcon,
  CheckIcon,
  PencilIcon,
} from "lucide-react"

function MessageAction({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)

  const conversation = useQuery(api.conversations.get, { id })
  const messages = useQuery(api.conversations.getMessages, { conversationId: id })
  const addMessage = useMutation(api.conversations.addMessage)
  const updateMessage = useMutation(api.conversations.updateMessage)

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editDraft, setEditDraft] = React.useState("")

  const handleCopy = (messageId: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(messageId)
    setTimeout(() => {
      setCopiedId((current) => (current === messageId ? null : current))
    }, 2000)
  }

  const handleStartEdit = (message: { _id: string; content: string }) => {
    setEditingId(message._id)
    setEditDraft(message.content)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditDraft("")
  }

  const handleSaveEdit = async (messageId: string) => {
    if (!editDraft.trim()) return
    try {
      await updateMessage({
        id: messageId as Id<"messages">,
        content: editDraft.trim(),
      })
      setEditingId(null)
      setEditDraft("")
    } catch (err) {
      console.error("Failed to update message:", err)
    }
  }

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isSubmitting || !conversation) return
    try {
      setIsSubmitting(true)
      await addMessage({
        conversationId: conversation._id,
        role: "user",
        content: content.trim(),
      })
    } catch (err) {
      console.error("Failed to add message:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (conversation === undefined || messages === undefined) {
    return (
      <div className="flex flex-1 flex-col p-6 md:p-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <Skeleton className="h-8 w-2/3 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-md" />
          <div className="mt-8 flex flex-col gap-6">
            <Skeleton className="ml-auto h-16 w-3/4 rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="ml-auto h-14 w-2/3 rounded-3xl" />
          </div>
        </div>
      </div>
    )
  }

  if (conversation === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <Empty className="max-w-md">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageCircleDashedIcon />
            </EmptyMedia>
            <EmptyTitle>Conversation not found</EmptyTitle>
            <EmptyDescription>
              This conversation might have been removed or does not exist.
            </EmptyDescription>
          </EmptyHeader>
          <Button nativeButton={false} render={<Link href="/new" />} className="mt-2">
            <PlusIcon data-icon="inline-start" />
            Start New Chat
          </Button>
        </Empty>
      </div>
    )
  }

  return (
    <MessageScrollerProvider autoScroll>
        <div className="relative flex w-full flex-1 flex-col h-full min-h-0 bg-background overflow-hidden">
          {/* Header with Title and District Badge */}
          <div className="flex shrink-0 items-center justify-between border-b px-6 py-3.5 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex items-center gap-3 truncate">
              <h1 className="truncate text-base font-semibold text-foreground md:text-lg">
                {conversation.title}
              </h1>
              {conversation.district && (
                <Badge variant="secondary" className="shrink-0 gap-1 font-normal">
                  <MapPin className="size-3" />
                  <span>{conversation.district}</span>
                </Badge>
              )}
            </div>
          </div>

          {/* Thread Area (Message Scroller) */}
          <div className="relative min-h-0 flex-1">
            {messages.length === 0 ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircleDashedIcon />
                  </EmptyMedia>
                  <EmptyTitle>No messages yet</EmptyTitle>
                  <EmptyDescription>
                    Ask a question about {conversation.title} to get started.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <MessageScroller>
                <MessageScrollerViewport className="[mask-image:none]">
                  <MessageScrollerContent
                    aria-busy={isSubmitting}
                    className="gap-6 px-6 md:px-8 pt-6 pb-48 max-w-3xl mx-auto"
                  >
                    {messages.map((message) => {
                      if (message.role === "user") {
                        const isEditing = editingId === message._id
                        return (
                          <MessageScrollerItem
                            key={message._id}
                            messageId={message._id}
                            scrollAnchor
                          >
                            <Message align="end">
                              <MessageContent className="gap-2">
                                {isEditing ? (
                                  <div className="flex w-full min-w-[280px] sm:min-w-[380px] flex-col gap-2 rounded-2xl border border-input bg-muted/30 p-3 transition-colors focus-within:border-ring">
                                    <textarea
                                      value={editDraft}
                                      onChange={(e) => setEditDraft(e.target.value)}
                                      className="field-sizing-content min-h-16 w-full resize-none border-0 bg-transparent p-0 text-sm md:text-base text-foreground outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                          e.preventDefault()
                                          handleSaveEdit(message._id)
                                        } else if (e.key === "Escape") {
                                          handleCancelEdit()
                                        }
                                      }}
                                    />
                                    <div className="flex items-center justify-end gap-1.5 pt-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        type="button"
                                        onClick={handleCancelEdit}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        type="button"
                                        onClick={() => handleSaveEdit(message._id)}
                                        disabled={!editDraft.trim()}
                                      >
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <Bubble align="end" variant="muted">
                                      <BubbleContent className="text-sm md:text-base leading-relaxed">
                                        {message.content}
                                      </BubbleContent>
                                    </Bubble>
                                    <MessageFooter className="opacity-0 group-hover/message:opacity-100 focus-within:opacity-100 transition-opacity">
                                      <MessageAction
                                        label={copiedId === message._id ? "Copied" : "Copy"}
                                        onClick={() => handleCopy(message._id, message.content)}
                                      >
                                        {copiedId === message._id ? (
                                          <CheckIcon className="size-4" />
                                        ) : (
                                          <CopyIcon className="size-4" />
                                        )}
                                      </MessageAction>
                                      <MessageAction
                                        label="Edit"
                                        onClick={() => handleStartEdit(message)}
                                      >
                                        <PencilIcon className="size-4" />
                                      </MessageAction>
                                    </MessageFooter>
                                  </>
                                )}
                              </MessageContent>
                            </Message>
                          </MessageScrollerItem>
                        )
                      }

                      // Assistant Turn
                      return (
                        <MessageScrollerItem
                          key={message._id}
                          messageId={message._id}
                        >
                          <Message>
                            <MessageContent className="gap-2 text-sm md:text-base leading-relaxed text-foreground">
                              <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
                                {message.content}
                              </div>
                              <MessageFooter className="px-0">
                                <MessageAction
                                  label={copiedId === message._id ? "Copied" : "Copy"}
                                  onClick={() => handleCopy(message._id, message.content)}
                                >
                                  {copiedId === message._id ? (
                                    <CheckIcon className="size-4" />
                                  ) : (
                                    <CopyIcon className="size-4" />
                                  )}
                                </MessageAction>
                              </MessageFooter>
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      )
                    })}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton className="data-[direction=end]:bottom-[168px] z-30 shadow-md border bg-background/95 backdrop-blur hover:bg-muted" />
              </MessageScroller>
            )}
          </div>

          {/* Floating Prompt Input with Transparent Whitespace */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col bg-transparent pb-6 md:pb-8">
            <div className="pointer-events-auto mx-auto w-full max-w-3xl px-6 md:px-8">
              <PromptInput
                placeholder="Ask about this district..."
                onSubmit={handleSendMessage}
                isLoading={isSubmitting}
                className="shadow-lg"
              />
            </div>
          </div>
        </div>
      </MessageScrollerProvider>
  )
}
