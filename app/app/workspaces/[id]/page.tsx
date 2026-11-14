"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import {
  ChevronRight,
  MessageSquare,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RenameConversationDialog, type RenameTarget } from "@/components/rename-conversation-dialog"
import { PromptInput } from "@/components/prompt-input"
import { MembersDialog } from "@/components/workspaces/add-members-dialog"
import { MemberAvatar, formatTime } from "@/components/workspaces/workspace-ui"
import { mentionsToPlain } from "@/components/workspaces/mentions"
import { formatDistrictTitle, useActiveLegislator } from "@/lib/legislators"

/**
 * A project: its members, its workspace (discussion and pinned items), a
 * prompt box that starts a conversation saved here, and its conversations.
 */
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const users = useQuery(api.users.list)
  const [me] = useActiveLegislator(users)
  const workspace = useQuery(api.workspaces.get, { id })
  const workspaceId = workspace?._id
  const messages = useQuery(api.workspaces.listMessages, workspaceId ? { workspaceId } : "skip")
  const pins = useQuery(api.workspaces.listPins, workspaceId ? { workspaceId } : "skip")
  const conversations = useQuery(api.workspaces.listConversations, workspaceId ? { workspaceId } : "skip")
  const createConversation = useMutation(api.conversations.create)
  const removeConversation = useMutation(api.conversations.remove)
  const togglePin = useMutation(api.conversations.togglePin)
  const [renaming, setRenaming] = React.useState<RenameTarget | null>(null)
  const [addMembersOpen, setAddMembersOpen] = React.useState(false)
  const [isStarting, setIsStarting] = React.useState(false)

  if (workspace === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-28 w-full" />
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
  const isShared = workspace.members.length > 1
  const last = messages?.at(-1)

  const startConversation = async (prompt: string, district?: string) => {
    if (!me._id || !prompt.trim() || isStarting) return
    setIsStarting(true)
    try {
      const conversationId = await createConversation({
        title: prompt.trim(),
        userId: me._id,
        district: district ?? formatDistrictTitle(me.district),
        mode: "collaborate",
        workspaceId: workspace._id,
      })
      router.push(`/conversations/${conversationId}`)
    } catch (err) {
      console.error("Failed to start conversation", err)
      setIsStarting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-4 md:p-8">
        {/* Header with the members */}
        <div className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UsersRound className="size-4" />
              {isShared ? "Shared project" : "Project"}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{workspace.name}</h1>
            {workspace.focus && workspace.focus !== workspace.name && (
              <p className="text-sm text-muted-foreground">{workspace.focus}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ItemGroup className="w-auto flex-row flex-wrap">
              {workspace.members.map((m) => (
                <Item key={m._id} role="listitem" variant="muted" size="xs" className="w-auto">
                  <ItemMedia>
                    <MemberAvatar member={m} size="sm" />
                  </ItemMedia>
                  <ItemContent className="gap-0">
                    <ItemTitle>
                      {m.name}
                      {m._id === me._id && <Badge variant="secondary">You</Badge>}
                    </ItemTitle>
                    <ItemDescription>{formatDistrictTitle(m.district)}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
            {isMember && (
              <Button variant="outline" onClick={() => setAddMembersOpen(true)}>
                <UserPlus data-icon="inline-start" />
                Manage members
              </Button>
            )}
          </div>
        </div>

        {/* Workspace: the members' discussion and pinned items */}
        <Item variant="muted" render={<Link href={`/workspaces/${workspace._id}/discussion`} />}>
          <ItemMedia variant="icon">
            <UsersRound />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Workspace</ItemTitle>
          </ItemContent>
          <ItemActions>
            <ChevronRight className="size-4 text-muted-foreground" />
          </ItemActions>
          <ItemFooter>
            <ItemDescription className="line-clamp-1 min-w-0 flex-1">
              {last ? `${last.author?.name ?? "Former member"}: ${mentionsToPlain(last.body)}` : "No messages yet"}
            </ItemDescription>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary">
                <MessageSquare data-icon="inline-start" />
                {messages?.length ?? 0} {messages?.length === 1 ? "message" : "messages"}
              </Badge>
              <Badge variant="secondary">
                <Pin data-icon="inline-start" />
                {pins?.length ?? 0} pinned
              </Badge>
            </div>
          </ItemFooter>
        </Item>

        {/* Start a conversation saved in this project */}
        {isMember ? (
          <PromptInput
            onSubmit={(prompt, district) => void startConversation(prompt, district)}
            isLoading={isStarting}
          />
        ) : (
          <Alert>
            <AlertDescription>
              You are viewing as {me.name}, who is not a member of this project. Switch legislators from the menu at
              the bottom of the sidebar to start a conversation here.
            </AlertDescription>
          </Alert>
        )}

        {/* Conversations in this project */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Conversations</h2>
          {conversations === undefined ? (
            <Skeleton className="h-16 w-full" />
          ) : conversations.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No conversations yet. Ask something above to start one.</p>
          ) : (
            <ItemGroup>
              {conversations.map((c) => (
                // The title link stretches over the row (the menu button can't sit inside a link).
                <Item
                  key={c._id}
                  role="listitem"
                  variant="muted"
                  size="sm"
                  className="relative has-[a:hover]:bg-muted"
                >
                  {/* Default ItemMedia so the icon can be larger (as in the Item docs); layout classes center it on both lines. */}
                  <ItemMedia className="group-has-data-[slot=item-description]/item:translate-y-0 group-has-data-[slot=item-description]/item:self-center">
                    {c.thinking ? <Spinner className="size-5" /> : <MessageSquare className="size-5 text-muted-foreground" />}
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full">
                      <Link
                        href={`/conversations/${c._id}`}
                        className="truncate outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
                      >
                        {c.title}
                      </Link>
                    </ItemTitle>
                    <ItemDescription>
                      {c.owner ? (c.owner._id === me._id ? "You" : c.owner.name) : "Unknown"} · {formatTime(c._creationTime)}
                    </ItemDescription>
                  </ItemContent>
                  {c.isPinned && (
                    <Badge variant="outline">
                      <Pin data-icon="inline-start" />
                      Pinned
                    </Badge>
                  )}
                  {isMember && (
                    <ItemActions className="relative">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${c.title}`} />}
                        >
                          <MoreVertical />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem onClick={() => setRenaming({ _id: c._id, title: c.title })}>
                              <Pencil />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void togglePin({ id: c._id })}>
                              {c.isPinned ? <PinOff /> : <Pin />}
                              {c.isPinned ? "Unpin" : "Pin"}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem variant="destructive" onClick={() => void removeConversation({ id: c._id })}>
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </ItemActions>
                  )}
                </Item>
              ))}
            </ItemGroup>
          )}
        </section>
      </div>
      <RenameConversationDialog conversation={renaming} onOpenChange={(open) => !open && setRenaming(null)} />
      <MembersDialog
        open={addMembersOpen}
        onOpenChange={setAddMembersOpen}
        workspaceId={workspace._id}
        members={workspace.members}
        meId={me._id}
      />
    </div>
  )
}
