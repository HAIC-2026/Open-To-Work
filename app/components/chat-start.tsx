"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation } from "convex/react"
import type { LucideIcon } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { PromptInput } from "@/components/prompt-input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useActiveLegislator, formatDistrictTitle } from "@/lib/legislators"

export interface ChatStartPreset {
  id: string
  label: string
  icon: LucideIcon
  // The district is not written into these prompts: it is stored on the
  // conversation and injected into the agent's instructions on every turn.
  prompt: string
}

export interface ChatStartProps {
  heading: string
  icon: LucideIcon
  presets: ReadonlyArray<ChatStartPreset>
  /** "collaborate" starts conversations that put partner-finding first. */
  mode?: "district" | "collaborate"
  placeholder?: string
}

/**
 * Start screen for a new conversation: headline, prompt box, and preset
 * buttons. Shared by the New and Collaborate tabs. Uses useSearchParams, so
 * render it inside a Suspense boundary (Next.js useSearchParams docs).
 */
export function ChatStart({ heading, icon: HeadingIcon, presets, mode, placeholder }: ChatStartProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // ?workspaceId=... preselects a project (from a project's "+" button).
  const folderIdParam = searchParams.get("workspaceId") as Id<"workspaces"> | null

  const createConversation = useMutation(api.conversations.create)
  const [activeLegislator] = useActiveLegislator()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [pendingPresetId, setPendingPresetId] = React.useState<string | null>(null)

  const [selectedFolderId, setSelectedFolderId] = React.useState<Id<"workspaces"> | undefined>(
    folderIdParam ?? undefined
  )

  React.useEffect(() => {
    setSelectedFolderId(folderIdParam ?? undefined)
  }, [folderIdParam])

  // District is lifted here so the preset buttons and the prompt input share it.
  // A manual pick only applies to the legislator it was made for; switching
  // legislators falls back to their home district (computed during render).
  const legislatorDistrict = formatDistrictTitle(activeLegislator.district)
  const [pickedDistrict, setPickedDistrict] = React.useState<{
    forDistrict: string
    value: string
  } | null>(null)
  const selectedDistrict =
    pickedDistrict?.forDistrict === legislatorDistrict
      ? pickedDistrict.value
      : legislatorDistrict

  const startConversation = async (args: {
    title: string
    district?: string
    folderId?: Id<"workspaces">
  }) => {
    if (!args.title.trim() || isSubmitting) return false
    try {
      setIsSubmitting(true)
      const conversationId = await createConversation({
        title: args.title.trim(),
        district: args.district,
        workspaceId: args.folderId,
        userId: activeLegislator._id,
        mode,
      })
      router.push(`/conversations/${conversationId}`)
      return true
    } catch (error) {
      console.error("Failed to create conversation:", error)
      setIsSubmitting(false)
      return false
    }
  }

  const handleSubmit = (prompt: string, district?: string, folderId?: Id<"workspaces">) => {
    if (!prompt.trim()) return
    void startConversation({ title: prompt, district, folderId })
  }

  const handlePreset = async (preset: ChatStartPreset) => {
    if (isSubmitting) return
    setPendingPresetId(preset.id)
    const ok = await startConversation({
      // The preset's question is the first message and the starting title;
      // a background job replaces the title with a short LLM-written one.
      title: preset.prompt,
      district: selectedDistrict,
      folderId: selectedFolderId,
    })
    if (!ok) setPendingPresetId(null)
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center p-4 md:p-8 h-full min-h-0 overflow-hidden">
      {/* Main interactive area: perfectly centered as before */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col items-center">
        {/* Big headline with magnifying glass icon on the left */}
        <div className="mb-5 flex items-center gap-3 text-center sm:mb-6">
          <HeadingIcon className="size-7 text-muted-foreground sm:size-8" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {heading}
          </h1>
        </div>

        {/* Prompt input container */}
        <div className="w-full">
          <PromptInput
            onSubmit={handleSubmit}
            isLoading={isSubmitting}
            placeholder={placeholder}
            showFolderSelect={true}
            selectedFolderId={selectedFolderId}
            onFolderChange={setSelectedFolderId}
            selectedDistrict={selectedDistrict}
            onDistrictChange={(value) =>
              setPickedDistrict({ forDistrict: legislatorDistrict, value })
            }
          />
        </div>

        {/* Preset buttons: each starts a conversation with a canned prompt */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {presets.map((preset) => {
            const Icon = preset.icon
            const isPending = pendingPresetId === preset.id
            return (
              <Button
                key={preset.id}
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => handlePreset(preset)}
                className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                {isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Icon data-icon="inline-start" />
                )}
                {preset.label}
              </Button>
            )
          })}
        </div>
      </div>

      {/* Background Polynesian tapa pattern shifted down at the bottom */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-8 sm:-bottom-10 md:-bottom-12 z-0 h-48 sm:h-56 md:h-64 lg:h-72 select-none overflow-hidden"
      >
        <div className="size-full bg-accent-foreground/15 dark:bg-accent-foreground/20 [mask-image:url('/new-page-pattern.svg')] [-webkit-mask-image:url('/new-page-pattern.svg')] [mask-repeat:repeat-x] [-webkit-mask-repeat:repeat-x] [mask-position:bottom_center] [-webkit-mask-position:bottom_center] [mask-size:contain] [-webkit-mask-size:contain]" />
      </div>
    </div>
  )
}
