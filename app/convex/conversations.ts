import { mutation, query, internalMutation } from "./_generated/server"
import { v } from "convex/values"
import { paginationOptsValidator, paginationResultValidator } from "convex/server"
import type { Id } from "./_generated/dataModel"
import { internal, components } from "./_generated/api"
import { createThread, saveMessage } from "@convex-dev/agent"

const conversationValidator = v.object({
  _id: v.id("conversations"),
  _creationTime: v.number(),
  title: v.string(),
  district: v.optional(v.string()),
  threadId: v.optional(v.string()),
  isPinned: v.optional(v.boolean()),
  userId: v.optional(v.id("users")),
  thinking: v.optional(v.boolean()),
  mode: v.optional(v.union(v.literal("district"), v.literal("collaborate"))),
  workspaceId: v.optional(v.id("workspaces")),
})

/**
 * Recent conversations (not in a workspace), newest first, one page at a time.
 * Paginated per the Convex pagination docs so the sidebar can keep loading
 * older conversations with `usePaginatedQuery` instead of a fixed `.take(20)`.
 */
export const list = query({
  args: {
    userId: v.optional(v.id("users")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(conversationValidator),
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
      return { page: [], isDone: true, continueCursor: "" }
    }

    return await ctx.db
      .query("conversations")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", targetUserId).eq("workspaceId", undefined)
      )
      .order("desc")
      .paginate(args.paginationOpts)
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
      threadId: v.optional(v.string()),
      isPinned: v.optional(v.boolean()),
      userId: v.optional(v.id("users")),
      thinking: v.optional(v.boolean()),
      mode: v.optional(v.union(v.literal("district"), v.literal("collaborate"))),
      workspaceId: v.optional(v.id("workspaces")),
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
    // First user message. Defaults to `title` when omitted, so callers can
    // pass a short sidebar title with a longer preset prompt.
    prompt: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    district: v.optional(v.string()),
    // "collaborate" for conversations started from the Collaborate tab.
    mode: v.optional(v.union(v.literal("district"), v.literal("collaborate"))),
    // Put the new conversation in a workspace (shared with its members).
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const trimmedTitle = args.title.trim()
    if (!trimmedTitle) {
      throw new Error("Conversation title cannot be empty")
    }
    const trimmedPrompt = args.prompt?.trim() || trimmedTitle

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

    if (args.workspaceId && targetUserId) {
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", args.workspaceId!).eq("userId", targetUserId!)
        )
        .unique()
      if (!membership) {
        throw new Error("Only workspace members can add conversations to it")
      }
    }

    const threadId = await createThread(ctx, components.agent, {
      title: trimmedTitle,
    })

    const conversationId = await ctx.db.insert("conversations", {
      title: trimmedTitle,
      district: args.district,
      threadId,
      isPinned: false,
      userId: targetUserId,
      thinking: true,
      mode: args.mode,
      workspaceId: args.workspaceId,
    })

    // Save first user prompt message into the agent thread
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      prompt: trimmedPrompt,
    })

    // Trigger the background LLM response stream
    await ctx.scheduler.runAfter(0, internal.chatActions.streamResponse, {
      conversationId,
      threadId,
      promptMessageId: messageId,
      district: args.district,
      userId: targetUserId,
      mode: args.mode,
    })

    return conversationId
  },
})

export const setThinking = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    thinking: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId)
    if (conv) {
      await ctx.db.patch(args.conversationId, { thinking: args.thinking })
    }
    return null
  },
})

export const updateMessage = mutation({
  args: {
    id: v.string(),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const trimmed = args.content.trim()
    if (!trimmed) {
      throw new Error("Message content cannot be empty")
    }

    const legacyId = ctx.db.normalizeId("messages", args.id)
    if (legacyId) {
      await ctx.db.patch(legacyId, { content: trimmed })
      return null
    }

    // Update in the Agent component
    await ctx.runMutation(components.agent.messages.updateMessage, {
      messageId: args.id,
      patch: {
        message: {
          role: "user",
          content: trimmed,
        },
        status: "success",
      },
    })
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

/** Rename a conversation (its title in the sidebar, project page and header). */
export const rename = mutation({
  args: { id: v.id("conversations"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const title = args.title.trim()
    if (!title) throw new Error("Conversation name cannot be empty")
    if (title.length > 200) throw new Error("Conversation names are limited to 200 characters")
    const conv = await ctx.db.get(args.id)
    if (!conv) throw new Error("Conversation not found")
    if (conv.title !== title) await ctx.db.patch(args.id, { title })
    return null
  },
})

/** Move a conversation into a workspace, or back to Recents (no workspace). */
export const moveToWorkspace = mutation({
  args: {
    id: v.id("conversations"),
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.id)
    if (!conv) {
      throw new Error("Conversation not found")
    }
    if (args.workspaceId && conv.userId) {
      const membership = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", args.workspaceId!).eq("userId", conv.userId!)
        )
        .unique()
      if (!membership) {
        throw new Error("Only workspace members can add conversations to it")
      }
    }
    await ctx.db.patch(args.id, { workspaceId: args.workspaceId })
    return null
  },
})

export const remove = mutation({
  args: { id: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.id)
    if (!conv) {
      return null
    }

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

    // 2. Clean up legacy messages table rows if any exist
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.id))
      .collect()
    for (const msg of messages) {
      await ctx.db.delete(msg._id)
    }

    // 3. Delete the conversation record
    await ctx.db.delete(args.id)
    return null
  },
})
