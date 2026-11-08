import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      _creationTime: v.number(),
      title: v.string(),
      district: v.optional(v.string()),
      folderId: v.optional(v.id("folders")),
      isPinned: v.optional(v.boolean()),
    })
  ),
  handler: async (ctx) => {
    const all = await ctx.db
      .query("conversations")
      .order("desc")
      .take(50)
    // Filter to unfiled conversations for the Recents group
    return all.filter((conv) => !conv.folderId).slice(0, 20)
  },
})

export const get = query({
  args: { id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("conversations"),
      _creationTime: v.number(),
      title: v.string(),
      district: v.optional(v.string()),
      folderId: v.optional(v.id("folders")),
      isPinned: v.optional(v.boolean()),
    })
  ),
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("conversations", args.id)
    if (normalizedId) {
      return await ctx.db.get(normalizedId)
    }

    // Gracefully support legacy mock route slugs (e.g. "housing", "transit", etc.)
    const slug = args.id.toLowerCase().replace(/[-_]/g, " ").trim()
    if (slug) {
      const all = await ctx.db.query("conversations").collect()
      const match = all.find((c) =>
        c.title.toLowerCase().includes(slug)
      )
      if (match) return match
    }

    return null
  },
})

export const getMessages = query({
  args: { conversationId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      conversationId: v.id("conversations"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    let targetId = ctx.db.normalizeId("conversations", args.conversationId)
    if (!targetId) {
      // Gracefully resolve mock route slugs
      const slug = args.conversationId.toLowerCase().replace(/[-_]/g, " ").trim()
      if (slug) {
        const all = await ctx.db.query("conversations").collect()
        const match = all.find((c) =>
          c.title.toLowerCase().includes(slug)
        )
        if (match) targetId = match._id
      }
    }

    if (!targetId) return []

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", targetId as Id<"conversations">)
      )
      .order("asc")
      .take(100)
  },
})

export const create = mutation({
  args: {
    title: v.string(),
    district: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const conversationId = await ctx.db.insert("conversations", {
      title: args.title,
      district: args.district,
      folderId: args.folderId,
      isPinned: false,
    })

    // Store the first user query as the initial message in history
    await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: args.title,
    })

    return conversationId
  },
})

export const addMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
    })
  },
})

export const updateMessage = mutation({
  args: {
    id: v.id("messages"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { content: args.content })
    return null
  },
})

export const togglePin = mutation({
  args: { id: v.id("conversations") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.id)
    if (!conv) {
      throw new Error("Conversation not found")
    }
    const nextPinned = !conv.isPinned
    await ctx.db.patch(args.id, { isPinned: nextPinned })
    return nextPinned
  },
})

export const moveToFolder = mutation({
  args: {
    id: v.id("conversations"),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.id)
    if (!conv) {
      throw new Error("Conversation not found")
    }
    await ctx.db.patch(args.id, {
      folderId: args.folderId,
    })
    return null
  },
})

export const remove = mutation({
  args: { id: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.id))
      .collect()
    for (const msg of messages) {
      await ctx.db.delete(msg._id)
    }
    await ctx.db.delete(args.id)
    return null
  },
})

export const seedThread = mutation({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect()
    for (const m of existing) {
      await ctx.db.delete(m._id)
    }

    const thread = [
      {
        role: "user" as const,
        content: "What are the latest housing and zoning reform initiatives in House District 1?",
      },
      {
        role: "assistant" as const,
        content: "Recent legislative efforts in House District 1 focus on three primary pillars:\n\n1. Transit-Oriented Development (TOD): Permitting multi-family and mixed-use structures within a 0.5-mile radius of high-capacity transit corridors.\n2. ADU & Duplex Streamlining: Easing single-family zoning restrictions to allow accessory dwelling units (ADUs) and by-right duplex conversions on residential lots meeting minimum square footage thresholds.\n3. Affordable Housing Tax Incentives: Expanding county property tax exemptions for developers dedicating at least 20% of units to families earning below 80% Area Median Income (AMI).",
      },
      {
        role: "user" as const,
        content: "How will these changes affect existing infrastructure and parking requirements in residential neighborhoods?",
      },
      {
        role: "assistant" as const,
        content: "Under the proposed amendment (HB 1402):\n\n• Parking Minimums: Off-street parking minimums are reduced from 2 spaces per dwelling to 1 space per unit within designated TOD overlay zones.\n• Water & Sewage Capacity: Priority review protocols require developers to contribute to the district infrastructure trust fund for sewer line upgrades before ground-breaking.\n• Tree Canopy Protection: Requires preserving at least 15% permeable surface on redeveloped lots to maintain urban runoff drainage.",
      },
      {
        role: "user" as const,
        content: "Can you draft a short summary I can share with constituents during next week's neighborhood board meeting?",
      },
      {
        role: "assistant" as const,
        content: "Here is a concise summary tailored for your neighborhood board meeting:\n\nDistrict 1 Housing & Infrastructure Update\n\"We are advancing balanced zoning reforms designed to increase local housing inventory while safeguarding neighborhood character. Key highlights include:\n• Enabling multi-generational living through streamlined permits for ADUs and cottage homes.\n• Directing growth near existing transit corridors to ease commute congestion.\n• Ensuring new construction directly funds municipal water, road, and stormwater improvements.\"\n\nFeel free to adjust the wording based on your board's key concerns!",
      },
    ]

    for (const msg of thread) {
      await ctx.db.insert("messages", {
        conversationId: args.conversationId,
        role: msg.role,
        content: msg.content,
      })
    }
    return null
  },
})
