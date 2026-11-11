"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { PromptInput } from "@/components/prompt-input"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Search, Building2, TrendingDown, HeartHandshake } from "lucide-react"
import { useActiveLegislator, formatDistrictTitle } from "@/lib/legislators"

// The district is not written into these prompts: it is stored on the
// conversation and injected into the agent's instructions on every turn.
const PRESETS = [
  {
    id: "district-profile",
    label: "District Profile",
    icon: Building2,
    prompt:
      "Give me a demographic and economic profile of my district: population, age, income, housing, and employment, compared to the state.",
  },
  {
    id: "poverty-rates",
    label: "Poverty Rates",
    icon: TrendingDown,
    prompt:
      "What are the poverty rates in my district, how have they changed over time, and how do they compare to Hawaiʻi statewide?",
  },
  {
    id: "public-programs",
    label: "Public Programs",
    icon: HeartHandshake,
    prompt:
      "Which public assistance programs (SNAP, Med-QUEST, TANF, housing assistance) serve residents of my district, and what does enrollment look like?",
  },
] as const

type PresetId = (typeof PRESETS)[number]["id"]

function NewPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const folderIdParam = searchParams.get("folderId") as Id<"folders"> | null

  const createConversation = useMutation(api.conversations.create)
  const [activeLegislator] = useActiveLegislator()
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [pendingPresetId, setPendingPresetId] = React.useState<PresetId | null>(null)

  const [selectedFolderId, setSelectedFolderId] = React.useState<Id<"folders"> | undefined>(
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
    prompt?: string
    district?: string
    folderId?: Id<"folders">
  }) => {
    if (!args.title.trim() || isSubmitting) return false
    try {
      setIsSubmitting(true)
      const conversationId = await createConversation({
        title: args.title.trim(),
        prompt: args.prompt,
        district: args.district,
        folderId: args.folderId,
        userId: activeLegislator._id,
      })
      router.push(`/conversations/${conversationId}`)
      return true
    } catch (error) {
      console.error("Failed to create conversation:", error)
      setIsSubmitting(false)
      return false
    }
  }

  const handleSubmit = (prompt: string, district?: string, folderId?: Id<"folders">) => {
    if (!prompt.trim()) return
    void startConversation({ title: prompt, district, folderId })
  }

  const handlePreset = async (preset: (typeof PRESETS)[number]) => {
    if (isSubmitting) return
    setPendingPresetId(preset.id)
    const ok = await startConversation({
      title: `${preset.label} · ${selectedDistrict}`,
      prompt: preset.prompt,
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
          <Search className="size-7 text-muted-foreground sm:size-8" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            What would you like to know?
          </h1>
        </div>

        {/* Prompt input container */}
        <div className="w-full">
          <PromptInput
            onSubmit={handleSubmit}
            isLoading={isSubmitting}
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
          {PRESETS.map((preset) => {
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

export default function NewPage() {
  return (
    <React.Suspense fallback={null}>
      <NewPageContent />
    </React.Suspense>
  )
}
