"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

/**
 * Who is creating the project and from which conversation. Provided by the
 * conversation page; without it, project invite cards in answers don't show.
 */
export interface WorkspaceStartInfo {
  createdBy: Id<"users">
  /** Set when the conversation is not in a project yet: it moves into the new one. */
  conversationId?: Id<"conversations">
  /** The project the conversation is already in, if any (invites then add to it). */
  workspaceId?: Id<"workspaces">
}

export const WorkspaceStartContext = React.createContext<WorkspaceStartInfo | null>(null)

interface StartWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  chamber: "house" | "senate"
  /** District numbers suggested as members (e.g. the districts a map highlights). */
  districts: number[]
  defaultName: string
  focus?: string
}

export function StartWorkspaceDialog({
  open,
  onOpenChange,
  chamber,
  districts,
  defaultName,
  focus,
}: StartWorkspaceDialogProps) {
  const info = React.useContext(WorkspaceStartContext)
  const router = useRouter()
  const users = useQuery(api.users.list, open ? {} : "skip")
  const createWorkspace = useMutation(api.workspaces.create)
  const formId = React.useId()

  const [name, setName] = React.useState(defaultName)
  const [unchecked, setUnchecked] = React.useState<Set<number>>(new Set())
  const [isCreating, setIsCreating] = React.useState(false)

  const chamberLabel = chamber === "house" ? "House" : "Senate"
  const candidates = districts.map((district) => ({
    district,
    key: `${chamber}-district-${district}`,
    legislator: users?.find((u) => u.district === `${chamber}-district-${district}`)?.name,
  }))
  const selected = candidates.filter((c) => !unchecked.has(c.district))

  const toggle = (district: number, checked: boolean) =>
    setUnchecked((prev) => {
      const next = new Set(prev)
      if (checked) next.delete(district)
      else next.add(district)
      return next
    })

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!info || !name.trim() || isCreating) return
    setIsCreating(true)
    try {
      const workspaceId = await createWorkspace({
        name: name.trim(),
        createdBy: info.createdBy,
        memberDistricts: selected.map((c) => c.key),
        focus,
        conversationId: info.conversationId,
      })
      onOpenChange(false)
      router.push(`/workspaces/${workspaceId}`)
    } catch (err) {
      console.error("Failed to create project", err)
      setIsCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start a shared project</DialogTitle>
          <DialogDescription>
            A project in everyone&apos;s sidebar, with a discussion and the conversations you add to it.
            This conversation moves into it.
          </DialogDescription>
        </DialogHeader>
        <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${formId}-name`}>Project name</FieldLabel>
              <Input
                id={`${formId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isCreating}
                autoFocus
              />
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Members</FieldLegend>
              <FieldDescription>You are added automatically.</FieldDescription>
              <FieldGroup className="max-h-56 gap-3 overflow-y-auto">
                {candidates.map((c) => {
                  const id = `${formId}-${c.district}`
                  return (
                    <Field key={c.district} orientation="horizontal">
                      <Checkbox
                        id={id}
                        checked={!unchecked.has(c.district)}
                        onCheckedChange={(checked) => toggle(c.district, checked === true)}
                        disabled={isCreating}
                      />
                      <FieldLabel htmlFor={id} className="font-normal">
                        {chamberLabel} District {c.district}
                        {c.legislator ? ` · ${c.legislator}` : ""}
                      </FieldLabel>
                    </Field>
                  )
                })}
              </FieldGroup>
            </FieldSet>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isCreating || !info}>
              {isCreating && <Spinner data-icon="inline-start" />}
              Create project ({selected.length + 1})
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
