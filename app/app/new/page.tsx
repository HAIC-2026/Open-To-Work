"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { AppLayout } from "@/components/app-layout"
import { PromptInput } from "@/components/prompt-input"
import { Button } from "@/components/ui/button"
import { Search, Building2, TrendingDown, HeartHandshake } from "lucide-react"

export default function NewPage() {
  const router = useRouter()
  const createConversation = useMutation(api.conversations.create)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleSubmit = async (prompt: string, district?: string) => {
    if (!prompt.trim() || isSubmitting) return
    try {
      setIsSubmitting(true)
      const conversationId = await createConversation({
        title: prompt.trim(),
        district: district,
      })
      router.push(`/conversations/${conversationId}`)
    } catch (error) {
      console.error("Failed to create conversation:", error)
      setIsSubmitting(false)
    }
  }

  return (
    <AppLayout>
      <div className="relative flex flex-1 flex-col items-center justify-center p-4 md:p-8 min-h-svh overflow-hidden">
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
            <PromptInput onSubmit={handleSubmit} isLoading={isSubmitting} />
          </div>

          {/* Three buttons grouped and centered below prompt input (larger size) */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <Building2 className="size-4" />
              <span>District Profile</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <TrendingDown className="size-4" />
              <span>Poverty Rates</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <HeartHandshake className="size-4" />
              <span>Public Programs</span>
            </Button>
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
    </AppLayout>
  )
}
