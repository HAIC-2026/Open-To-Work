"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Building2,
  HandHeart,
  HeartHandshake,
  MapPinned,
  Megaphone,
  Search,
  TrendingDown,
  Users,
} from "lucide-react"
import { ChatStart, type ChatStartPreset } from "@/components/chat-start"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const RESEARCH_PRESETS: ChatStartPreset[] = [
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
]

// Collaborate conversations use the same chat; the agent answers about the
// official's own district first, then finds districts in the same situation.
const COLLABORATE_PRESETS: ChatStartPreset[] = [
  {
    id: "programs-for-constituents",
    label: "Programs for My Constituents",
    icon: HandHeart,
    prompt:
      "Which existing programs are my constituents most likely to qualify for, and where could enrollment improve?",
  },
  {
    id: "districts-like-mine",
    label: "Districts Like Mine",
    icon: MapPinned,
    prompt:
      "Which other districts have constituents in the same situation as mine for these programs, and who represents them?",
  },
  {
    id: "joint-outreach",
    label: "Plan Joint Outreach",
    icon: Megaphone,
    prompt:
      "Pick the program with the biggest enrollment gap in my district and suggest which districts I could run joint outreach with.",
  },
]

type Mode = "district" | "collaborate"

/**
 * New conversation, in one of two modes picked with the tabs at the top:
 * Research (questions about the district) or Collaborate (programs and
 * partner districts). The mode lives in the URL (?mode=collaborate), so links
 * and the back button keep it. useSearchParams needs a Suspense boundary
 * (Next.js useSearchParams docs).
 */
export default function NewPage() {
  return (
    <React.Suspense fallback={null}>
      <NewConversation />
    </React.Suspense>
  )
}

function NewConversation() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode: Mode = searchParams.get("mode") === "collaborate" ? "collaborate" : "district"

  const setMode = (value: Mode) => {
    const next = new URLSearchParams(searchParams.toString())
    if (value === "collaborate") next.set("mode", "collaborate")
    else next.delete("mode")
    const query = next.toString()
    router.replace(query ? `/new?${query}` : "/new")
  }

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => setMode(value as Mode)}
      className="relative h-full min-h-0 flex-1 gap-0"
    >
      {/* Mode switcher near the top; each mode's start screen stays centered below. */}
      <div className="absolute inset-x-0 top-6 z-20 flex justify-center md:top-8">
        {/* Larger than the default tabs (h-8, text-sm) so the mode switch stands out. */}
        <TabsList className="p-1 group-data-horizontal/tabs:h-11">
          <TabsTrigger value="district" className="gap-2 px-5 text-base">
            <Search className="size-5" />
            Research
          </TabsTrigger>
          <TabsTrigger value="collaborate" className="gap-2 px-5 text-base">
            <Users className="size-5" />
            Collaborate
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="district" className="flex min-h-0 flex-col">
        <ChatStart heading="What would you like to know?" icon={Search} presets={RESEARCH_PRESETS} />
      </TabsContent>
      <TabsContent value="collaborate" className="flex min-h-0 flex-col">
        <ChatStart
          heading="Who could you partner with?"
          icon={Users}
          presets={COLLABORATE_PRESETS}
          mode="collaborate"
          placeholder="Ask about programs for your district, or who to partner with..."
          showProjectSelect={false}
        />
      </TabsContent>
    </Tabs>
  )
}
