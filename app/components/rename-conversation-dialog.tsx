"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export interface RenameTarget {
  _id: Id<"conversations">
  title: string
}

/** Rename a conversation. Open it by passing a target; close by setting it to null. */
export function RenameConversationDialog({
  conversation,
  onOpenChange,
}: {
  conversation: RenameTarget | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={conversation !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename conversation</DialogTitle>
          <DialogDescription>The new name shows in the sidebar and the project.</DialogDescription>
        </DialogHeader>
        {/* Keyed so the field starts from each conversation's current name. */}
        {conversation && (
          <RenameForm key={conversation._id} conversation={conversation} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RenameForm({ conversation, onDone }: { conversation: RenameTarget; onDone: () => void }) {
  const rename = useMutation(api.conversations.rename)
  const inputId = React.useId()
  const [title, setTitle] = React.useState(conversation.title)
  const [isSaving, setIsSaving] = React.useState(false)
  const trimmed = title.trim()

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!trimmed || isSaving) return
    setIsSaving(true)
    try {
      await rename({ id: conversation._id, title: trimmed })
      onDone()
    } catch (err) {
      console.error("Failed to rename conversation", err)
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={inputId}>Name</FieldLabel>
          <Input
            id={inputId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            disabled={isSaving}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={!trimmed || isSaving}>
          {isSaving && <Spinner data-icon="inline-start" />}
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}
