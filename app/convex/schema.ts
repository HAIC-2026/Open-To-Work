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
    thinking: v.optional(v.boolean()),
    /**
     * What the conversation is for. "collaborate" conversations start from the
     * Collaborate tab: the official's own district first, then other districts in the same situation;
     * absent or "district" is a normal district conversation.
     */
    mode: v.optional(v.union(v.literal("district"), v.literal("collaborate"))),
  })
    .index("by_user_folder", ["userId", "folderId"])
    .index("by_folder", ["folderId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  }).index("by_conversation", ["conversationId"]),

  /**
   * Public program inventory (sources listed in convex/programSources.ts).
   * `programs:refresh` fetches each program's official pages, stores their text,
   * and has the model condense it into `summary`, which the agent reads.
   */
  programs: defineTable({
    slug: v.string(),
    name: v.string(),
    agency: v.string(),
    officialUrl: v.string(),
    applyUrl: v.optional(v.string()),
    /** Search words beyond the summary, e.g. "food groceries EBT". */
    keywords: v.string(),
    /** Each official source and how its text was obtained. */
    sources: v.array(
      v.object({
        n: v.number(),
        url: v.string(),
        /** "fetch" = downloaded at refresh; "capture" = saved copy for a site that blocks automated requests. */
        via: v.union(v.literal("fetch"), v.literal("capture")),
        ok: v.boolean(),
        /** HTTP status of the fetch, when one was attempted. */
        status: v.optional(v.number()),
        /** ISO date the saved copy was made (capture only). */
        capturedAt: v.optional(v.string()),
      })
    ),
    /** Plain text of all sources, each headed "[n] url". Kept for review and the number check. */
    pageText: v.string(),
    /** SHA-256 of pageText; the model is called again only when it changes. */
    textHash: v.string(),
    fetchedAt: v.number(),
    /** Model-condensed summary with [n] markers referring to `sources`. */
    summary: v.optional(v.string()),
    summarizedAt: v.optional(v.number()),
    /**
     * ok = summary matches the current text; needs_review = the latest summary
     * failed the number check (the previous summary, if any, is kept);
     * fetch_failed = no source text could be obtained.
     */
    status: v.union(v.literal("ok"), v.literal("needs_review"), v.literal("fetch_failed")),
    reviewNote: v.optional(v.string()),
    /** Name, agency, keywords and summary, for full-text search. */
    searchText: v.string(),
  })
    .index("by_slug", ["slug"])
    .searchIndex("search_text", { searchField: "searchText" }),
})
