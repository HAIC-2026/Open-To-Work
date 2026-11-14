"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { MessageSquare, Pin, PinOff, Trash2, UsersRound } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { CitationList, Composer, MemberAvatar, formatTime, toSourceItems } from "@/components/workspaces/workspace-ui"
import { MentionText } from "@/components/workspaces/mentions"
import { formatDistrictTitle, useActiveLegislator } from "@/lib/legislators"

/**
 * A pinned message's title: clicking anywhere on the pinned item scrolls the
 * discussion to that message (the button's ::after covers the item).
 */
function JumpToMessage({
  messageId,
  label,
  onJump,
}: {
  messageId: string
  label: string
  onJump: (messageId: string) => void
}) {
  const { scrollToMessage } = useMessageScroller()
  return (
    <button
      type="button"
      data-jump
      title="Show in discussion"
      aria-label={`Show ${label}'s message in the discussion`}
      className="truncate text-left outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
      onClick={() => {
        // "nearest" scrolls only as far as needed; "center"/"start" pad below the last message to make room.
        if (scrollToMessage(messageId, { align: "nearest", behavior: "smooth", scrollMargin: 16 })) onJump(messageId)
      }}
    >
      {label}
    </button>
  )
}

/** Hidden until its message is hovered or has keyboard focus (opacity, so it stays focusable and keeps its space). */
const REVEAL_ON_HOVER =
  "opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100 focus-visible:opacity-100"

/** Labeled Pin / Pinned button in a discussion message's footer; pressing "Pinned" unpins it. */
function PinToggle({
  pinned,
  onPin,
  onUnpin,
  className,
}: {
  pinned: boolean
  onPin: () => void
  onUnpin: () => void
  className?: string
}) {
  const button = (
    <Button
      variant={pinned ? "secondary" : "ghost"}
      size="xs"
      className={className}
      aria-pressed={pinned}
      onClick={pinned ? onUnpin : onPin}
    >
      <Pin data-icon="inline-start" />
      {pinned ? "Pinned" : "Pin"}
    </Button>
  )
  if (!pinned) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>Unpin</TooltipContent>
    </Tooltip>
  )
}

/** A project's workspace: the members' discussion and what they pinned from it or from conversations. */
export default function WorkspaceDiscussionPage() {
  const { id } = useParams<{ id: string }>()
  const users = useQuery(api.users.list)
  const [me] = useActiveLegislator(users)
  const workspace = useQuery(api.workspaces.get, { id })
  const workspaceId = workspace?._id
  const messages = useQuery(api.workspaces.listMessages, workspaceId ? { workspaceId } : "skip")
  const pins = useQuery(api.workspaces.listPins, workspaceId ? { workspaceId } : "skip")
  // Conversations in this project, offered when someone types "@" in the discussion.
  const projectConversations = useQuery(api.workspaces.listConversations, workspaceId ? { workspaceId } : "skip")
  // Who started it and when, so conversations with the same name can be told apart in the menu.
  const mentionables = React.useMemo(
    () =>
      projectConversations?.map((c) => ({
        _id: c._id,
        title: c.title,
        detail: `${c.owner ? (c.owner._id === me._id ? "You" : c.owner.name) : "Unknown"} · ${formatTime(c._creationTime)}`,
      })),
    [projectConversations, me._id]
  )
  const sendMessage = useMutation(api.workspaces.sendMessage)
  const unpin = useMutation(api.workspaces.unpin)
  const pinMessage = useMutation(api.workspaces.pinMessage)
  const deleteMessage = useMutation(api.workspaces.deleteMessage)
  // Message briefly highlighted after jumping to it from the Pinned list.
  const [flashId, setFlashId] = React.useState<string | null>(null)
  const flashTimer = React.useRef<number | null>(null)
  const flash = React.useCallback((messageId: string) => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    setFlashId(messageId)
    flashTimer.current = window.setTimeout(() => setFlashId(null), 700)
  }, [])
  React.useEffect(() => () => {
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
  }, [])
  const pinsByMessage = React.useMemo(
    () => new Map(pins?.filter((p) => p.messageId).map((p) => [p.messageId as string, p._id])),
    [pins]
  )

  if (workspace === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (workspace === null) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRound />
          </EmptyMedia>
          <EmptyTitle>Project not found</EmptyTitle>
          <EmptyDescription>It may have been removed when the app data was reset.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const isMember = Boolean(me._id && workspace.members.some((m) => m._id === me._id))

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
      {/* On large screens the two cards fill the rest of the window's height. */}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8 lg:min-h-0 lg:flex-1">
        {/* Header */}
        <div className="flex shrink-0 flex-col gap-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={`/workspaces/${workspace._id}`} />}>{workspace.name}</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Workspace</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Workspace</h1>
        </div>

        {!isMember && (
          <Alert>
            <AlertDescription>
              You are viewing as {me.name}, who is not a member of this project. Switch legislators from the menu at
              the bottom of the sidebar to post as a member.
            </AlertDescription>
          </Alert>
        )}

        {/* The scroller's provider wraps both cards so a pinned item can scroll the discussion to its message. */}
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-1">
          {/* Discussion */}
          <Card className="lg:min-h-0">
            <CardHeader>
              <CardTitle>Discussion</CardTitle>
            </CardHeader>
            <CardContent className="h-[28rem] lg:h-auto lg:min-h-0 lg:flex-1">
              {/* Always mounted: the scroller starts at the newest message only if its viewport
                  exists when the first messages arrive. */}
                  <MessageScroller>
                    <MessageScrollerViewport>
                      {/* Padding keeps bubbles off the scroll area's edges (the first message's top, your messages' right). */}
                      <MessageScrollerContent className="gap-4 px-2 py-3">
                        {messages === undefined ? null : messages.length === 0 ? (
                          <Empty className="h-full">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <MessageSquare />
                              </EmptyMedia>
                              <EmptyTitle>No messages yet</EmptyTitle>
                              <EmptyDescription>Start the discussion: propose a first step for the group.</EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : messages.map((m) => {
                          const mine = Boolean(m.author && m.author._id === me._id)
                          const pinned = pinsByMessage.has(m._id)
                          const actions = isMember && (
                            <div className={cn("flex items-center gap-1", mine && "flex-row-reverse")}>
                              <PinToggle
                                pinned={pinned}
                                className={pinned ? undefined : REVEAL_ON_HOVER}
                                onPin={() => me._id && void pinMessage({ messageId: m._id, pinnedBy: me._id })}
                                onUnpin={() => {
                                  const pinId = pinsByMessage.get(m._id)
                                  if (pinId) void unpin({ id: pinId })
                                }}
                              />
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      className={REVEAL_ON_HOVER}
                                      aria-label="Delete message"
                                      onClick={() => me._id && void deleteMessage({ messageId: m._id, userId: me._id })}
                                    />
                                  }
                                >
                                  <Trash2 />
                                </TooltipTrigger>
                                <TooltipContent>Delete</TooltipContent>
                              </Tooltip>
                            </div>
                          )
                          return (
                            // No scrollAnchor: that pins a sent message to the top and pads below it for an
                            // assistant reply (AI chat). A group discussion just follows the newest message.
                            <MessageScrollerItem
                              key={m._id}
                              messageId={m._id}
                            >
                              <Message align={mine ? "end" : "start"}>
                                {!mine && (
                                  <MessageAvatar>
                                    {m.author ? (
                                      <MemberAvatar member={m.author} size="sm" />
                                    ) : (
                                      <Avatar size="sm">
                                        <AvatarFallback>?</AvatarFallback>
                                      </Avatar>
                                    )}
                                  </MessageAvatar>
                                )}
                                <MessageContent className="gap-1">
                                  {!mine && (
                                    <MessageHeader>
                                      {m.author
                                        ? `${m.author.name} · ${formatDistrictTitle(m.author.district)}`
                                        : "Former member"}
                                    </MessageHeader>
                                  )}
                                  <Bubble variant={mine ? "default" : "secondary"} align={mine ? "end" : "start"}>
                                    {/* Min width + centered text: short messages ("hi") get a round pill, not a tall oval.
                                        After a jump from Pinned the bubble's own color shifts slightly for a moment. */}
                                    <BubbleContent
                                      className={cn(
                                        "flex min-w-11 justify-center whitespace-pre-wrap transition-[filter] duration-300",
                                        flashId === m._id && (mine ? "brightness-150" : "brightness-95")
                                      )}
                                    >
                                      <span>
                                        <MentionText body={m.body} />
                                      </span>
                                    </BubbleContent>
                                  </Bubble>
                                  {/* Pin and Delete appear while the message is hovered (or focused); "Pinned" always shows.
                                      They sit on the far side of the time, so the time stays next to the bubble and
                                      never moves (hidden buttons keep their space). */}
                                  <MessageFooter className="gap-1">
                                    {mine && actions}
                                    <span>{formatTime(m._creationTime)}</span>
                                    {!mine && actions}
                                  </MessageFooter>
                                </MessageContent>
                              </Message>
                            </MessageScrollerItem>
                          )
                        })}
                      </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton />
                  </MessageScroller>
            </CardContent>
            <CardFooter>
              <Composer
                className="w-full"
                label="Send message"
                mentionables={mentionables}
                placeholder={isMember ? "Write a message to the group..." : "Only members can post"}
                disabled={!isMember}
                onSend={async (body) => {
                  if (!me._id) return
                  await sendMessage({ workspaceId: workspace._id, authorId: me._id, body })
                }}
              />
            </CardFooter>
          </Card>

          {/* Pinned: sidebar background so it reads as a side panel; items keep the card background. */}
          <Card className="bg-sidebar lg:min-h-0">
            <CardHeader>
              <CardTitle>Pinned</CardTitle>
              <CardDescription>Messages and answers the group wants to keep at hand.</CardDescription>
            </CardHeader>
            <CardContent className="flex max-h-[28rem] min-h-0 flex-col lg:max-h-none lg:flex-1">
              {pins === undefined ? (
                <Skeleton className="h-24 w-full" />
              ) : pins.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Pin />
                    </EmptyMedia>
                    <EmptyTitle>Nothing pinned yet</EmptyTitle>
                    <EmptyDescription>
                      Pin a message in the discussion, or an answer from a conversation in this project.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                <ItemGroup>
                  {pins.map((p) => (
                    <Item
                      key={p._id}
                      role="listitem"
                      variant="outline"
                      size="sm"
                      className="relative bg-card has-[[data-jump]:hover]:bg-muted"
                    >
                      {p.messageId && (
                        <ItemMedia>
                          {p.messageAuthor ? (
                            <MemberAvatar member={p.messageAuthor} size="sm" />
                          ) : (
                            <Avatar size="sm">
                              <AvatarFallback>?</AvatarFallback>
                            </Avatar>
                          )}
                        </ItemMedia>
                      )}
                      <ItemContent className="min-w-0">
                        <ItemTitle className="w-full">
                          {p.conversationId ? (
                            <Link href={`/conversations/${p.conversationId}`} className="truncate hover:underline">
                              {p.sourceLabel}
                            </Link>
                          ) : (
                            p.messageId && (
                              <JumpToMessage
                                messageId={p.messageId}
                                label={p.messageAuthor?.name ?? p.sourceLabel}
                                onJump={flash}
                              />
                            )
                          )}
                        </ItemTitle>
                        <ItemDescription>
                          {p.messageId ? "Message" : "Conversation answer"} · pinned by{" "}
                          {p.pinnedBy ? (p.pinnedBy._id === me._id ? "you" : p.pinnedBy.name) : "a former member"} ·{" "}
                          {formatTime(p._creationTime)}
                        </ItemDescription>
                      </ItemContent>
                      {isMember && (
                        // Top-aligned with the avatar and title rather than centered on the row.
                        <ItemActions className="relative self-start">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Unpin"
                                  className="opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100"
                                  onClick={() => void unpin({ id: p._id })}
                                />
                              }
                            >
                              <PinOff />
                            </TooltipTrigger>
                            <TooltipContent>Unpin</TooltipContent>
                          </Tooltip>
                        </ItemActions>
                      )}
                      {/* The pinned text spans the item's full width below its title row. */}
                      <div className="flex max-h-96 basis-full flex-col gap-2 overflow-y-auto">
                        {p.messageId ? (
                          <p className="text-sm whitespace-pre-wrap">
                            <MentionText body={p.body} />
                          </p>
                        ) : (
                          <>
                            <MarkdownRenderer content={p.body} citations={toSourceItems(p.citations)} className="text-sm md:text-sm" />
                            <CitationList citations={p.citations} />
                          </>
                        )}
                      </div>
                    </Item>
                  ))}
                </ItemGroup>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
        </MessageScrollerProvider>
      </div>
    </div>
  )
}
