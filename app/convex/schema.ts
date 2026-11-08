import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  folders: defineTable({
    name: v.string(),
    defaultOpen: v.optional(v.boolean()),
    order: v.optional(v.number()),
  }),
  conversations: defineTable({
    title: v.string(),
    district: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    isPinned: v.optional(v.boolean()),
  }).index("by_folder", ["folderId"]),
  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  }).index("by_conversation", ["conversationId"]),
})
