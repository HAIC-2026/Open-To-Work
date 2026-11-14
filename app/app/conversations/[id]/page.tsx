"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { useUIMessages, optimisticallySendMessage } from "@convex-dev/agent/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { PromptInput, type PromptInputHandle } from "@/components/prompt-input"
import { MapAskContext } from "@/components/district-map/district-map-block"
import { WorkspaceStartContext } from "@/components/workspaces/start-workspace-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { AgentTrace } from "@/components/agent-trace"
import { Sources, extractCitations } from "@/components/sources"
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
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
  Pin,
  RotateCcw,
} from "lucide-react"
import { useActiveLegislator } from "@/lib/legislators"

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

function EditMessageTextarea({
  value,
  onChange,
  onKeyDown,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (textareaRef.current) {
      const length = textareaRef.current.value.length
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(length, length)
    }
  }, [])

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      onFocus={(e) => {
        const length = e.currentTarget.value.length
        e.currentTarget.setSelectionRange(length, length)
      }}
      className="field-sizing-content min-h-16 w-full resize-none border-0 bg-transparent p-0 text-sm md:text-base text-foreground outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
      onKeyDown={onKeyDown}
    />
  )
}

function ThreadScrollManager({
  conversationId,
  messageCount,
  isLoading,
  isSubmitting,
}: {
  conversationId: string
  messageCount: number
  isLoading: boolean
  isSubmitting: boolean
}) {
  const { scrollToEnd } = useMessageScroller()
  const lastConversationIdRef = React.useRef<string | null>(null)
  const initialScrollDoneRef = React.useRef(false)
  const prevCountRef = React.useRef(messageCount)

  // Reset initial scroll flag when switching conversations
  React.useEffect(() => {
    if (lastConversationIdRef.current !== conversationId) {
      lastConversationIdRef.current = conversationId
      initialScrollDoneRef.current = false
    }
  }, [conversationId])

  // Scroll to bottom when conversation messages initially load
  React.useEffect(() => {
    if (!isLoading && messageCount > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true
      const timer = setTimeout(() => {
        scrollToEnd({ behavior: "auto" })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [conversationId, isLoading, messageCount, scrollToEnd])

  // Ensure scroll is at the end when sending a new message
  React.useEffect(() => {
    if (messageCount > prevCountRef.current || isSubmitting) {
      scrollToEnd({ behavior: "smooth" })
    }
    prevCountRef.current = messageCount
  }, [messageCount, isSubmitting, scrollToEnd])

  return null
}

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)

  const conversation = useQuery(api.conversations.get, { id })
  const promptRef = React.useRef<PromptInputHandle>(null)
  // Clicking a district on a map puts a follow-up question in the chat box.
  const askAboutDistrict = React.useCallback((question: string) => {
    promptRef.current?.setDraft(question)
  }, [])
  // Project invite cards in this conversation's answers start (or add to) a
  // project owned by its legislator; a new project takes this conversation with it.
  const workspaceStart = React.useMemo(
    () =>
      conversation?.userId
        ? {
            createdBy: conversation.userId,
            conversationId: conversation.workspaceId ? undefined : conversation._id,
            workspaceId: conversation.workspaceId,
          }
        : null,
    [conversation]
  )
  const threadId = conversation?.threadId
  const threadMessages = useUIMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true }
  )
  const legacyMessages = useQuery(api.conversations.getMessages, { conversationId: id })
  const sendMessageMutation = useMutation(api.chat.sendMessage).withOptimisticUpdate(
    (store, args) => {
      if (conversation?.threadId) {
        optimisticallySendMessage(api.chat.listThreadMessages)(store, {
          threadId: conversation.threadId,
          prompt: args.content,
        })
      }
    }
  )
  const resubmitMessageMutation = useMutation(api.chat.resubmitMessage)
  // Answers in a project's conversations can be pinned in its workspace.
  const users = useQuery(api.users.list)
  const [me] = useActiveLegislator(users)
  const projectId = conversation?.workspaceId
  const project = useQuery(api.workspaces.get, projectId ? { id: projectId } : "skip")
  const projectPins = useQuery(api.workspaces.listPins, projectId ? { workspaceId: projectId } : "skip")
  const pinMutation = useMutation(api.workspaces.pin)
  const canPin = Boolean(project && me._id && project.members.some((m) => m._id === me._id))
  const pinnedBodies = React.useMemo(() => new Set(projectPins?.map((p) => p.body)), [projectPins])
  const stopThinkingMutation = useMutation(api.chat.stopThinking)
  const [isHalting, setIsHalting] = React.useState(false)

  const handleStopThinking = async () => {
    if (!conversation || isHalting) return
    try {
      setIsHalting(true)
      await stopThinkingMutation({
        conversationId: conversation._id,
      })
    } catch (err) {
      console.error("Failed to stop thinking:", err)
    } finally {
      setIsHalting(false)
    }
  }

  const messages = React.useMemo(() => {
    if (threadId) {
      return threadMessages.results.map((m) => ({
        _id: m.id,
        role: m.role as "user" | "assistant",
        content: m.text,
        status: m.status,
        parts: (m as any).parts,
      }))
    }
    if (legacyMessages) {
      return legacyMessages.map((m) => ({
        ...m,
        status: "success" as const,
      }))
    }
    return []
  }, [threadId, threadMessages.results, legacyMessages])

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isResubmitting, setIsResubmitting] = React.useState(false)
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

  const isThinking = Boolean(conversation?.thinking)

  const handleResubmit = async (messageId: string) => {
    if (!editDraft.trim() || isResubmitting || isThinking || !conversation) return
    try {
      setIsResubmitting(true)
      await resubmitMessageMutation({
        conversationId: conversation._id,
        messageId,
        content: editDraft.trim(),
      })
      setEditingId(null)
      setEditDraft("")
    } catch (err) {
      console.error("Failed to resubmit message:", err)
    } finally {
      setIsResubmitting(false)
    }
  }

  // Regenerate the newest answer: resubmit the latest question unchanged. The
  // resubmit mutation deletes the old answer (and its tool steps), resets the
  // Python sandbox and schedules a fresh response; the title is kept.
  const lastQuestion = [...messages].reverse().find((m) => m.role === "user")
  const handleRegenerate = async () => {
    if (!lastQuestion || isResubmitting || isThinking || !conversation) return
    try {
      setIsResubmitting(true)
      await resubmitMessageMutation({
        conversationId: conversation._id,
        messageId: lastQuestion._id,
        content: lastQuestion.content,
      })
    } catch (err) {
      console.error("Failed to regenerate response:", err)
    } finally {
      setIsResubmitting(false)
    }
  }

  // Follow-up questions for the newest answer (generated in the background once it finishes).
  const showSuggestions = !isThinking && !isSubmitting && (conversation?.suggestions?.length ?? 0) > 0

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isSubmitting || isThinking || !conversation) return
    try {
      setIsSubmitting(true)
      await sendMessageMutation({
        conversationId: conversation._id,
        content: content.trim(),
      })
    } catch (err) {
      console.error("Failed to add message:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLoading =
    conversation === undefined ||
    (threadId
      ? threadMessages.status === "LoadingFirstPage" && messages.length === 0
      : legacyMessages === undefined)

  if (isLoading) {
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
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="end"
      scrollEdgeThreshold={48}
    >
      <ThreadScrollManager
        conversationId={id}
        messageCount={messages.length}
        isLoading={isLoading}
        isSubmitting={isSubmitting || isResubmitting}
      />
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
              <WorkspaceStartContext.Provider value={workspaceStart}>
              <MapAskContext.Provider value={askAboutDistrict}>
              <MessageScroller>
                <MessageScrollerViewport className="[mask-image:none]">
                  <MessageScrollerContent
                    aria-busy={isSubmitting}
                    className="gap-6 px-6 md:px-8 pt-6 pb-48 max-w-3xl mx-auto"
                  >
                    {messages.map((message, index) => {
                      if (message.role === "user") {
                        const isEditing = editingId === message._id
                        return (
                          <MessageScrollerItem
                            key={message._id}
                            messageId={message._id}
                            className="[content-visibility:visible] [contain-intrinsic-size:none]"
                          >
                            <Message align="end">
                              <MessageContent className="gap-2">
                                {isEditing ? (
                                  <div className="flex w-full min-w-[280px] sm:min-w-[380px] flex-col gap-2 rounded-2xl border border-input bg-muted/30 p-3 transition-colors focus-within:border-ring">
                                    <EditMessageTextarea
                                      value={editDraft}
                                      onChange={(e) => setEditDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                          e.preventDefault()
                                          handleResubmit(message._id)
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
                                        disabled={isResubmitting}
                                      >
                                        Cancel
                                      </Button>
                                      <Button
                                        size="sm"
                                        type="button"
                                        onClick={() => handleResubmit(message._id)}
                                        disabled={!editDraft.trim() || isResubmitting}
                                      >
                                        {isResubmitting ? (
                                          <>
                                            <Spinner className="size-3.5 animate-spin" />
                                            <span>Resubmitting...</span>
                                          </>
                                        ) : (
                                          "Resubmit"
                                        )}
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
                      const isStreaming = isThinking && message.status === "streaming"
                      const isPending =
                        isThinking && (message.status === "pending" || (isStreaming && !message.content))
                      const isLastAssistantMessage = index === messages.length - 1
                      const isMessageThinking = isStreaming || isPending || (isThinking && isLastAssistantMessage)

                      return (
                        <MessageScrollerItem
                          key={message._id}
                          messageId={message._id}
                          className="[content-visibility:visible] [contain-intrinsic-size:none]"
                        >
                          <Message>
                            <MessageContent className="gap-2 text-sm md:text-base leading-relaxed text-foreground">
                              {/* Real-time Agent Execution Trace (shadcn/ui AI Elements) */}
                              <AgentTrace
                                parts={(message as any).parts}
                                isThinking={isMessageThinking}
                              />

                              {isPending && !(message as any).parts?.some((p: any) => p && ((typeof p.type === "string" && p.type.startsWith("tool-")) || p.type === "dynamic-tool" || p.toolName)) ? (
                                <div className="flex items-center gap-2 text-muted-foreground text-sm py-1.5 animate-pulse">
                                  <Spinner className="size-4 animate-spin text-muted-foreground" />
                                  <span>Analyzing Hawaii legislative data...</span>
                                </div>
                              ) : message.content ? (
                                <MarkdownRenderer
                                  content={message.content}
                                  citations={extractCitations((message as any).parts)}
                                  isStreaming={isStreaming}
                                >
                                  {isStreaming && (
                                    <span
                                      aria-hidden="true"
                                      className="inline-block w-1.5 h-4 ml-1 bg-foreground/70 animate-pulse align-middle"
                                    />
                                  )}
                                </MarkdownRenderer>
                              ) : isStreaming ? (
                                <div className="flex items-center gap-2 text-muted-foreground text-sm py-1.5 animate-pulse">
                                  <Spinner className="size-4 animate-spin text-muted-foreground" />
                                  <span>Formulating response...</span>
                                </div>
                              ) : !isThinking && (message.status === "failed" || !message.content) ? (
                                <div className="text-xs text-muted-foreground italic py-1">
                                  Thinking process halted.
                                </div>
                              ) : null}
                              {/* Real-time Sources Trace (shadcn/ui AI Elements) */}
                              {Boolean(message.content) && (
                                <Sources
                                  parts={(message as any).parts}
                                  content={message.content}
                                />
                              )}
                              {!isPending && (Boolean(message.content) || (isLastAssistantMessage && !isThinking)) && (
                                <MessageFooter className="px-0">
                                  {Boolean(message.content) && (
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
                                  )}
                                  {/* Only the newest answer can be regenerated (it is replaced, not added to). */}
                                  {isLastAssistantMessage && !isThinking && lastQuestion && (
                                    <MessageAction
                                      label="Regenerate"
                                      onClick={() => void handleRegenerate()}
                                      disabled={isResubmitting}
                                    >
                                      <RotateCcw className="size-4" />
                                    </MessageAction>
                                  )}
                                  {canPin && project && me._id && !isMessageThinking && Boolean(message.content) && (
                                    pinnedBodies.has(message.content.trim()) ? (
                                      <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                                        <Pin className="size-3.5" /> Pinned in {project.name}
                                      </span>
                                    ) : (
                                      <MessageAction
                                        label={`Pin in ${project.name} workspace`}
                                        onClick={() =>
                                          void pinMutation({
                                            workspaceId: project._id,
                                            pinnedBy: me._id!,
                                            body: message.content,
                                            sourceLabel: conversation.title,
                                            conversationId: conversation._id,
                                            citations: extractCitations("parts" in message ? message.parts : undefined)
                                              .filter((c) => typeof c.number === "number")
                                              .map((c) => ({
                                                number: c.number as number,
                                                url: c.url,
                                                title: c.title,
                                                organization: c.organization,
                                              })),
                                          })
                                        }
                                      >
                                        <Pin className="size-4" />
                                      </MessageAction>
                                    )
                                  )}
                                </MessageFooter>
                              )}
                              {/* Follow-up suggestions (shadcn AI Elements "Suggestion"), only under the
                                  newest answer; they're cleared as soon as another question is sent. */}
                              {isLastAssistantMessage && showSuggestions && (
                                <div className="flex flex-wrap gap-2">
                                  {conversation.suggestions!.map((suggestion) => (
                                    <Button
                                      key={suggestion}
                                      variant="outline"
                                      size="sm"
                                      className="h-auto min-h-7 max-w-full py-1 text-left whitespace-normal"
                                      onClick={() => void handleSendMessage(suggestion)}
                                    >
                                      {suggestion}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      )
                    })}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton className="data-[direction=end]:bottom-[168px] z-30 shadow-md border bg-background/95 backdrop-blur hover:bg-muted" />
              </MessageScroller>
              </MapAskContext.Provider>
              </WorkspaceStartContext.Provider>
            )}
          </div>

          {/* Floating Prompt Input with Transparent Whitespace */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col bg-transparent pb-6 md:pb-8">
            <div className="pointer-events-auto mx-auto w-full max-w-3xl px-6 md:px-8">
              <PromptInput
                handleRef={promptRef}
                placeholder={
                  isThinking
                    ? "Assistant is thinking..."
                    : conversation.mode === "collaborate"
                      ? "Ask about programs for your district, or who to partner with..."
                      : "Ask about this district..."
                }
                onSubmit={handleSendMessage}
                onStop={handleStopThinking}
                isLoading={isSubmitting || isThinking || isHalting}
                disabled={isThinking}
                className="shadow-lg"
              />
            </div>
          </div>
        </div>
      </MessageScrollerProvider>
  )
}
