"use client"

import * as React from "react"
import { Search, Building2, TrendingDown, HeartHandshake } from "lucide-react"
import { ChatStart, type ChatStartPreset } from "@/components/chat-start"

const PRESETS: ChatStartPreset[] = [
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

export default function NewPage() {
  return (
    <React.Suspense fallback={null}>
      <ChatStart heading="What would you like to know?" icon={Search} presets={PRESETS} />
    </React.Suspense>
  )
}
