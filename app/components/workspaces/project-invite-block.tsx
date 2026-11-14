"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { z } from "zod"
import { Check, Pencil, UserPlus, UsersRound } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StartWorkspaceDialog, WorkspaceStartContext } from "@/components/workspaces/start-workspace-dialog"
import { MemberAvatar } from "@/components/workspaces/workspace-ui"
import { formatDistrictTitle } from "@/lib/legislators"

/**
 * What the agent writes inside a ```project-invite fenced block (see the
 * PROJECT INVITE rules in convex/chatActions.ts) when an answer names partner
 * districts: a one-click card that starts a project with those legislators.
 */
const inviteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  focus: z.string().trim().max(200).optional(),
  chamber: z.enum(["house", "senate"]),
  districts: z.array(z.number().int().positive()).min(1).max(15),
})
type InviteSpec = z.infer<typeof inviteSchema>

function parseInvite(source: string): InviteSpec | null {
  try {
    const result = inviteSchema.safeParse(JSON.parse(source))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function ProjectInviteBlock({ source, isStreaming }: { source: string; isStreaming?: boolean }) {
  const spec = React.useMemo(() => parseInvite(source), [source])
  if (!spec) {
    // Still being written: hold its place. A finished but invalid block shows nothing.
    return isStreaming ? <Skeleton className="h-40 w-full rounded-2xl" /> : null
  }
  return <InviteCard spec={spec} />
}

function InviteCard({ spec }: { spec: InviteSpec }) {
  const info = React.useContext(WorkspaceStartContext)
  const router = useRouter()
  const users = useQuery(api.users.list)
  const project = useQuery(api.workspaces.get, info?.workspaceId ? { id: info.workspaceId } : "skip")
  const createWorkspace = useMutation(api.workspaces.create)
  const updateMembers = useMutation(api.workspaces.updateMembers)
  const [isWorking, setIsWorking] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)

  if (!info) return null
  if (users === undefined || (info.workspaceId && project === undefined)) {
    return <Skeleton className="h-40 w-full rounded-2xl" />
  }

  // Only real legislators, never the owner's own district, each once.
  const legislators = [...new Set(spec.districts)]
    .map((n) => users.find((u) => u.district === `${spec.chamber}-district-${n}`))
    .filter((u): u is NonNullable<typeof u> => Boolean(u) && u!._id !== info.createdBy)
  if (legislators.length === 0) return null

  const inProject = Boolean(info.workspaceId && project)
  const memberIds = new Set(project?.members.map((m) => m._id))
  const toAdd = inProject ? legislators.filter((u) => !memberIds.has(u._id)) : legislators

  const create = async () => {
    if (isWorking) return
    setIsWorking(true)
    try {
      const workspaceId = await createWorkspace({
        name: spec.name,
        createdBy: info.createdBy,
        memberDistricts: legislators.map((u) => u.district),
        focus: spec.focus,
        conversationId: info.conversationId,
      })
      router.push(`/workspaces/${workspaceId}`)
    } catch (err) {
      console.error("Failed to create project", err)
      setIsWorking(false)
    }
  }

  const addToProject = async () => {
    if (isWorking || !info.workspaceId) return
    setIsWorking(true)
    try {
      await updateMembers({
        workspaceId: info.workspaceId,
        actorId: info.createdBy,
        addDistricts: toAdd.map((u) => u.district),
        removeUserIds: [],
      })
    } catch (err) {
      console.error("Failed to add legislators", err)
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <Card size="sm" className="my-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="size-4 text-muted-foreground" />
          {inProject
            ? toAdd.length > 0
              ? `Add these legislators to ${project!.name}`
              : `These legislators are in ${project!.name}`
            : "Start a project with these legislators"}
        </CardTitle>
        <CardDescription>
          {inProject
            ? toAdd.length > 0
              ? "They join this project's discussion and can read its conversations."
              : `All of them are already members of ${project!.name}.`
            : `Creates “${spec.name}” with you and ${legislators.length} ${
                legislators.length === 1 ? "legislator" : "legislators"
              }, and moves this conversation into it.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="flex-row flex-wrap gap-2">
          {legislators.map((u) => (
            <Item key={u._id} role="listitem" variant="muted" size="xs" className="w-auto">
              <ItemMedia>
                <MemberAvatar member={u} size="sm" />
              </ItemMedia>
              <ItemContent className="gap-0">
                <ItemTitle>{u.name}</ItemTitle>
                <ItemDescription>{formatDistrictTitle(u.district)}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
      <CardFooter className="gap-2">
        {inProject ? (
          toAdd.length > 0 ? (
            <Button size="sm" onClick={() => void addToProject()} disabled={isWorking}>
              {isWorking ? <Spinner data-icon="inline-start" /> : <UserPlus data-icon="inline-start" />}
              Add {toAdd.length} to project
            </Button>
          ) : (
            <Button size="sm" variant="outline" render={<Link href={`/workspaces/${info.workspaceId}`} />} nativeButton={false}>
              <Check data-icon="inline-start" />
              Open {project!.name}
            </Button>
          )
        ) : (
          <>
            <Button size="sm" onClick={() => void create()} disabled={isWorking}>
              {isWorking ? <Spinner data-icon="inline-start" /> : <UsersRound data-icon="inline-start" />}
              Create project
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)} disabled={isWorking}>
              <Pencil data-icon="inline-start" />
              Edit first
            </Button>
          </>
        )}
      </CardFooter>
      {!inProject && (
        <StartWorkspaceDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          chamber={spec.chamber}
          districts={legislators.map((u) => Number(u.district.split("-").at(-1)))}
          defaultName={spec.name}
          focus={spec.focus}
        />
      )}
    </Card>
  )
}
