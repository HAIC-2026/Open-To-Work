import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import { internal, components } from "./_generated/api"

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
          thinking: v.optional(v.boolean()),
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

/**
 * Remember whether a folder is expanded or collapsed in the sidebar, so the
 * state survives page reloads and follows the user across devices. Stored in
 * `defaultOpen`, the same field a folder's initial state comes from.
 */
export const setOpen = mutation({
  args: {
    id: v.id("folders"),
    open: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.id)
    // A folder deleted in another tab is not an error; skip unchanged writes.
    if (!folder || (folder.defaultOpen ?? true) === args.open) {
      return null
    }
    await ctx.db.patch(args.id, { defaultOpen: args.open })
    return null
  },
})
