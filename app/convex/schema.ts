import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  users: defineTable({
    name: v.string(),
    district: v.string(),
    photoUrl: v.optional(v.string()),
  }).index("by_district", ["district"]),

  folders: defineTable({
    name: v.string(),
    defaultOpen: v.optional(v.boolean()),
    order: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  }).index("by_user", ["userId"]),

  conversations: defineTable({
    title: v.string(),
    district: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    threadId: v.optional(v.string()),
    isPinned: v.optional(v.boolean()),
    userId: v.optional(v.id("users")),
  })
    .index("by_user_folder", ["userId", "folderId"])
    .index("by_folder", ["folderId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  }).index("by_conversation", ["conversationId"]),
})
