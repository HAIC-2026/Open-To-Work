import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { internal, components } from "./_generated/api"
import { createThread, saveMessages } from "@convex-dev/agent"

export const listWithConversations = query({
  args: {
    userId: v.optional(v.id("users")),
  },
  returns: v.array(
    v.object({
      _id: v.id("folders"),
      _creationTime: v.number(),
      name: v.string(),
      defaultOpen: v.optional(v.boolean()),
      order: v.optional(v.number()),
      userId: v.optional(v.id("users")),
      conversations: v.array(
        v.object({
          _id: v.id("conversations"),
          _creationTime: v.number(),
          title: v.string(),
          district: v.optional(v.string()),
          folderId: v.optional(v.id("folders")),
          threadId: v.optional(v.string()),
          isPinned: v.optional(v.boolean()),
          userId: v.optional(v.id("users")),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    let targetUserId = args.userId
    if (!targetUserId) {
      const defaultUser = await ctx.db
        .query("users")
        .withIndex("by_district", (q) => q.eq("district", "house-district-1"))
        .first()
      if (defaultUser) {
        targetUserId = defaultUser._id
      }
    }

    if (!targetUserId) {
      return []
    }

    const folders = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect()

    folders.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    const result = []
    for (const folder of folders) {
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_user_folder", (q) =>
          q.eq("userId", targetUserId).eq("folderId", folder._id)
        )
        .collect()

      // Sort pinned first, then by creationTime
      conversations.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1
        return a._creationTime - b._creationTime
      })

      result.push({
        ...folder,
        conversations,
      })
    }
    return result
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    userId: v.optional(v.id("users")),
    defaultOpen: v.optional(v.boolean()),
  },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    const trimmedName = args.name.trim()
    if (!trimmedName) {
      throw new Error("Folder name cannot be empty")
    }

    let targetUserId = args.userId
    if (!targetUserId) {
      const defaultUser = await ctx.db
        .query("users")
        .withIndex("by_district", (q) => q.eq("district", "house-district-1"))
        .first()
      if (defaultUser) {
        targetUserId = defaultUser._id
      }
    }

    const existingForUser = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect()

    return await ctx.db.insert("folders", {
      name: trimmedName,
      defaultOpen: args.defaultOpen ?? true,
      order: existingForUser.length + 1,
      userId: targetUserId,
    })
  },
})

export const remove = mutation({
  args: { id: v.id("folders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.id)
    if (!folder) {
      return null
    }

    // Find all conversations in this folder
    const convs = folder.userId
      ? await ctx.db
          .query("conversations")
          .withIndex("by_user_folder", (q) =>
            q.eq("userId", folder.userId).eq("folderId", args.id)
          )
          .collect()
      : await ctx.db
          .query("conversations")
          .withIndex("by_folder", (q) => q.eq("folderId", args.id))
          .collect()

    for (const conv of convs) {
      // 1. Asynchronously clean up agent thread, messages, and streams
      if (conv.threadId) {
        await ctx.scheduler.runAfter(0, internal.chatActions.cleanupSandbox, {
          userId: conv.userId,
          threadId: conv.threadId,
        })
        await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
          threadId: conv.threadId,
        })
      }

      // 2. Clean up legacy messages table rows
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
        .collect()
      for (const msg of msgs) {
        await ctx.db.delete(msg._id)
      }

      // 3. Delete the conversation record
      await ctx.db.delete(conv._id)
    }

    // 4. Delete the folder record
    await ctx.db.delete(args.id)
    return null
  },
})

export const rename = mutation({
  args: {
    id: v.id("folders"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const trimmedName = args.name.trim()
    if (!trimmedName) {
      throw new Error("Folder name cannot be empty")
    }
    const folder = await ctx.db.get(args.id)
    if (!folder) {
      throw new Error("Folder not found")
    }
    await ctx.db.patch(args.id, {
      name: trimmedName,
    })
    return null
  },
})

export const initDefaults = mutation({
  args: {
    userId: v.optional(v.id("users")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    let targetUser = null
    if (args.userId) {
      targetUser = await ctx.db.get(args.userId)
    }
    if (!targetUser) {
      targetUser = await ctx.db
        .query("users")
        .withIndex("by_district", (q) => q.eq("district", "house-district-1"))
        .first()
    }
    if (!targetUser) {
      return false
    }

    const existing = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", targetUser._id))
      .first()

    if (existing) {
      return false
    }

    // Format district label (e.g. "House District 1" or "Senate District 5")
    const isHouse = targetUser.district.startsWith("house")
    const num = targetUser.district.replace(/\D/g, "")
    const districtLabel = isHouse ? `House District ${num}` : `Senate District ${num}`

    const defaultFolders = [
      {
        name: "District Initiatives",
        defaultOpen: true,
        order: 1,
        conversations: [
          {
            title: "Housing & Zoning Reform",
            district: districtLabel,
            messages: [
              {
                role: "user" as const,
                content: `What are the latest housing and zoning reform initiatives in ${districtLabel}?`,
              },
              {
                role: "assistant" as const,
                content:
                  "Recent legislative efforts focus on encouraging transit-oriented development and easing single-family zoning restrictions for multi-family affordable duplexes and accessory dwelling units (ADUs).",
              },
            ],
          },
          {
            title: "Public Transit Expansion",
            district: districtLabel,
            messages: [
              {
                role: "user" as const,
                content: `What is the status of the public transit expansion plans for ${districtLabel}?`,
              },
              {
                role: "assistant" as const,
                content:
                  "The regional transit authority has proposed two new high-capacity bus corridors connecting urban centers with funding approved under the infrastructure grant.",
              },
            ],
          },
          {
            title: "Clean Energy Grants",
            district: districtLabel,
            messages: [
              {
                role: "user" as const,
                content: "Are there solar and clean energy grants available for commercial buildings?",
              },
              {
                role: "assistant" as const,
                content:
                  "Yes, the state energy office recently launched the 2026 Clean Energy Incentive Program providing matching grants up to $50,000 for energy-efficiency retrofits.",
              },
            ],
          },
        ],
      },
      {
        name: "Constituent Services",
        defaultOpen: true,
        order: 2,
        conversations: [
          {
            title: "Town Hall Feedback Q1",
            district: districtLabel,
            messages: [
              {
                role: "user" as const,
                content: "Summarize top concerns raised by constituents during Q1 town halls.",
              },
              {
                role: "assistant" as const,
                content:
                  "Top concerns centered on road resurfacing delays, pedestrian safety around school zones, and utility rate hikes.",
              },
            ],
          },
          {
            title: "Casework Tracker",
            district: districtLabel,
            messages: [
              {
                role: "user" as const,
                content: "How many constituent casework requests are currently pending resolution?",
              },
              {
                role: "assistant" as const,
                content:
                  "There are currently 14 active inquiries: 6 regarding Department of Transportation signage, 5 for public benefits access, and 3 for water drainage.",
              },
            ],
          },
        ],
      },
      {
        name: "Legislative Research",
        defaultOpen: false,
        order: 3,
        conversations: [
          {
            title: "2026 Budget Overview",
            district: districtLabel,
            messages: [
              {
                role: "user" as const,
                content: "Give me an overview of the 2026 fiscal year capital improvement budget.",
              },
              {
                role: "assistant" as const,
                content:
                  "The proposed budget allocates $1.2B towards infrastructure, with priority allocations for coastal protection, water facilities, and public school renovations.",
              },
            ],
          },
          {
            title: "Education Funding Bill",
            district: districtLabel,
            messages: [
              {
                role: "user" as const,
                content: "What are the key provisions of House Bill 104 regarding school funding?",
              },
              {
                role: "assistant" as const,
                content:
                  "HB 104 updates the weighted student formula, increasing per-pupil funding allocations for multilingual learners and special education resources.",
              },
            ],
          },
        ],
      },
    ]

    for (const folderData of defaultFolders) {
      const folderId = await ctx.db.insert("folders", {
        name: folderData.name,
        defaultOpen: folderData.defaultOpen,
        order: folderData.order,
        userId: targetUser._id,
      })

      for (const convData of folderData.conversations) {
        const threadId = await createThread(ctx, components.agent, {
          title: convData.title,
        })

        await ctx.db.insert("conversations", {
          title: convData.title,
          district: convData.district,
          folderId,
          threadId,
          isPinned: false,
          userId: targetUser._id,
        })

        await saveMessages(ctx, components.agent, {
          threadId,
          messages: convData.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        })
      }
    }

    return true
  },
})
