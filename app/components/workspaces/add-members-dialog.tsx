"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { Search } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { formatDistrictTitle } from "@/lib/legislators"

interface MembersDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: Id<"workspaces">
  /** Current members; they start checked and can be unchecked to remove them. */
  members: Array<{ _id: Id<"users">; district: string }>
  /** The legislator making the change, who can't remove themselves. */
  meId?: Id<"users">
}

/** Check legislators to add them to the project, uncheck members to remove them. */
export function MembersDialog({ open, onOpenChange, workspaceId, members, meId }: MembersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
          <DialogDescription>
            Check legislators to add them, uncheck members to remove them. Members can read this project&apos;s
            conversations, post in the discussion and add conversations.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the checkboxes start from the current members each time. */}
        {open && (
          <MembersForm workspaceId={workspaceId} members={members} meId={meId} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MembersForm({
  workspaceId,
  members,
  meId,
  onDone,
}: Omit<MembersDialogProps, "open" | "onOpenChange"> & { onDone: () => void }) {
  const users = useQuery(api.users.list)
  const updateMembers = useMutation(api.workspaces.updateMembers)
  const formId = React.useId()
  const [query, setQuery] = React.useState("")
  const [initial] = React.useState(() => new Set(members.map((m) => m.district)))
  const [checked, setChecked] = React.useState(() => new Set(members.map((m) => m.district)))
  const [isSaving, setIsSaving] = React.useState(false)

  const added = [...checked].filter((d) => !initial.has(d))
  const removed = members.filter((m) => !checked.has(m.district))
  const hasChanges = added.length > 0 || removed.length > 0

  // Current members first, then everyone else; the search narrows both.
  const candidates = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return (users ?? [])
      .filter(
        (u) =>
          !q || u.name.toLowerCase().includes(q) || formatDistrictTitle(u.district).toLowerCase().includes(q)
      )
      .sort((a, b) => Number(initial.has(b.district)) - Number(initial.has(a.district)))
  }, [users, query, initial])

  const toggle = (district: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(district)
      else next.delete(district)
      return next
    })

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!meId || !hasChanges || isSaving) return
    setIsSaving(true)
    try {
      await updateMembers({
        workspaceId,
        actorId: meId,
        addDistricts: added,
        removeUserIds: removed.map((m) => m._id),
      })
      onDone()
    } catch (err) {
      console.error("Failed to update members", err)
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or district"
          aria-label="Search legislators"
          autoFocus
        />
      </InputGroup>
      <FieldGroup className="max-h-72 gap-3 overflow-y-auto">
        {users === undefined ? (
          <Spinner />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No legislators match.</p>
        ) : (
          candidates.map((u) => {
            const id = `${formId}-${u.district}`
            const isMe = u._id === meId
            return (
              <Field key={u._id} orientation="horizontal" data-disabled={isMe || isSaving || undefined}>
                <Checkbox
                  id={id}
                  checked={checked.has(u.district)}
                  onCheckedChange={(on) => toggle(u.district, on === true)}
                  disabled={isMe || isSaving}
                />
                <FieldLabel htmlFor={id} className="font-normal">
                  {u.name} · {formatDistrictTitle(u.district)}
                  {isMe && <Badge variant="secondary">You</Badge>}
                </FieldLabel>
              </Field>
            )
          })
        )}
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={!hasChanges || isSaving || !meId}>
          {isSaving && <Spinner data-icon="inline-start" />}
          {hasChanges
            ? [added.length > 0 && `Add ${added.length}`, removed.length > 0 && `Remove ${removed.length}`]
                .filter(Boolean)
                .join(", ")
            : "Save"}
        </Button>
      </DialogFooter>
    </form>
  )
}
