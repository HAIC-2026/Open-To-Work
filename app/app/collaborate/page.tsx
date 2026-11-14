"use client"

import * as React from "react"
import { Users, HandHeart, MapPinned, Megaphone } from "lucide-react"
import { ChatStart, type ChatStartPreset } from "@/components/chat-start"

// Collaborate conversations use the same chat as the New tab. The agent
// answers about the official's own district first (which existing programs
// residents likely qualify for), then finds districts in the same situation.
const PRESETS: ChatStartPreset[] = [
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

export default function CollaboratePage() {
  return (
    <React.Suspense fallback={null}>
      <ChatStart
        heading="Who could you partner with?"
        icon={Users}
        presets={PRESETS}
        mode="collaborate"
        placeholder="Ask about programs for your district, or who to partner with..."
      />
    </React.Suspense>
  )
}
