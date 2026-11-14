import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

/**
 * Workspaces are the sidebar's Projects: a space for one legislator, or
 * several working together, holding conversations, a discussion and members.
 * Demo model: the app has no login, so members are added directly (no
 * invitations) and any listed member can read, post and add conversations.
 */

const MAX_MEMBERS = 40
const MAX_MESSAGE_LENGTH = 4000
const MAX_WORKSPACES_PER_USER = 100
const MAX_CONVERSATIONS = 200
const MAX_PINS = 100

const memberValidator = v.object({
  _id: v.id("users"),
  name: v.string(),
  district: v.string(),
  photoUrl: v.optional(v.string()),
})

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
  suggestions: v.optional(v.array(v.string())),
})

function toMember(u: Doc<"users">) {
  return { _id: u._id, name: u.name, district: u.district, photoUrl: u.photoUrl }
}

async function membershipOf(ctx: QueryCtx, workspaceId: Id<"workspaces">, userId: Id<"users">) {
  return await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .unique()
}

async function membersOf(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const rows = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(MAX_MEMBERS)
  const users = await Promise.all(rows.map((r) => ctx.db.get(r.userId)))
  return users.filter((u): u is Doc<"users"> => u !== null).map(toMember)
}

/** Adds a user to a workspace (no-op if already a member), last in their Projects list. */
async function addMember(ctx: MutationCtx, workspaceId: Id<"workspaces">, userId: Id<"users">) {
  if (await membershipOf(ctx, workspaceId, userId)) return
  const theirs = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(MAX_WORKSPACES_PER_USER)
  const order = theirs.reduce((max, m) => Math.max(max, m.order ?? 0), 0) + 1
  await ctx.db.insert("workspaceMembers", { workspaceId, userId, order, isOpen: true })
}

async function userIdsForDistricts(ctx: MutationCtx, districts: string[]) {
  const ids: Id<"users">[] = []
  for (const district of districts) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_district", (q) => q.eq("district", district))
      .first()
    if (user) ids.push(user._id)
  }
  return ids
}

/**
 * Create a workspace. The creator is always a member; `memberDistricts`
 * (e.g. "house-district-2") adds those legislators. When started from a
 * conversation, that conversation moves into the workspace.
 */
export const create = mutation({
  args: {
    name: v.string(),
    createdBy: v.id("users"),
    memberDistricts: v.optional(v.array(v.string())),
    focus: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
  },
  returns: v.id("workspaces"),
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) throw new Error("Workspace name cannot be empty")
    const districts = args.memberDistricts ?? []
    if (districts.length > MAX_MEMBERS) throw new Error(`A workspace can have at most ${MAX_MEMBERS} members`)
    if (!(await ctx.db.get(args.createdBy))) throw new Error("Creator not found")

    const workspaceId = await ctx.db.insert("workspaces", {
      name,
      createdBy: args.createdBy,
      focus: args.focus?.trim() || undefined,
    })
    await addMember(ctx, workspaceId, args.createdBy)
    for (const userId of await userIdsForDistricts(ctx, districts)) {
      await addMember(ctx, workspaceId, userId)
    }

    if (args.conversationId) {
      const conversation = await ctx.db.get(args.conversationId)
      if (conversation && conversation.userId === args.createdBy) {
        await ctx.db.patch(args.conversationId, { workspaceId })
      }
    }
    return workspaceId
  },
})

/**
 * Change a workspace's members in one step: add legislators (by district, e.g.
 * "house-district-5") and remove others (by user id). Only a member can do
 * this, they can't remove themselves, and at least one member stays.
 */
export const updateMembers = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    actorId: v.id("users"),
    addDistricts: v.array(v.string()),
    removeUserIds: v.array(v.id("users")),
  },
  returns: v.object({ added: v.number(), removed: v.number() }),
  handler: async (ctx, args) => {
    if (!(await ctx.db.get(args.workspaceId))) throw new Error("Workspace not found")
    if (!(await membershipOf(ctx, args.workspaceId, args.actorId))) throw new Error("Only members can change members")
    if (args.removeUserIds.includes(args.actorId)) throw new Error("You can't remove yourself")

    const current = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(MAX_MEMBERS + 1)
    const removeSet = new Set(args.removeUserIds)
    const toRemove = current.filter((m) => removeSet.has(m.userId))
    const currentIds = new Set(current.map((m) => m.userId))
    const toAdd = (await userIdsForDistricts(ctx, args.addDistricts)).filter((id) => !currentIds.has(id))
    if (current.length - toRemove.length + toAdd.length > MAX_MEMBERS) {
      throw new Error(`A workspace can have at most ${MAX_MEMBERS} members`)
    }

    for (const m of toRemove) await ctx.db.delete(m._id)
    for (const userId of toAdd) await addMember(ctx, args.workspaceId, userId)
    return { added: toAdd.length, removed: toRemove.length }
  },
})

/**
 * The legislator's Projects list for the sidebar: each workspace they belong
 * to, with their open/closed state and its conversations (pinned first).
 */
export const listForSidebar = query({
  args: { userId: v.optional(v.id("users")) },
  returns: v.array(
    v.object({
      _id: v.id("workspaces"),
      _creationTime: v.number(),
      name: v.string(),
      isOpen: v.boolean(),
      order: v.number(),
      memberCount: v.number(),
      conversations: v.array(conversationValidator),
    })
  ),
  handler: async (ctx, { userId }) => {
    if (!userId) return []
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_WORKSPACES_PER_USER)
    // Each project's reads are independent, so they run in parallel instead of one project at a time.
    const rows = await Promise.all(
      memberships.map(async (m) => {
        const workspace = await ctx.db.get(m.workspaceId)
        if (!workspace) return null
        const [members, conversations] = await Promise.all([
          ctx.db
            .query("workspaceMembers")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
            .take(MAX_MEMBERS),
          // Index order is oldest first (_creationTime); a stable split puts pinned first without sorting.
          ctx.db
            .query("conversations")
            .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
            .take(MAX_CONVERSATIONS),
        ])
        return {
          _id: workspace._id,
          _creationTime: workspace._creationTime,
          name: workspace.name,
          isOpen: m.isOpen ?? true,
          order: m.order ?? 0,
          memberCount: members.length,
          conversations: [
            ...conversations.filter((c) => c.isPinned),
            ...conversations.filter((c) => !c.isPinned),
          ],
        }
      })
    )
    const result = rows.filter((r): r is NonNullable<typeof r> => r !== null)
    return result.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime)
  },
})

export const rename = mutation({
  args: { id: v.id("workspaces"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const name = args.name.trim()
    if (!name) throw new Error("Workspace name cannot be empty")
    if (!(await ctx.db.get(args.id))) throw new Error("Workspace not found")
    await ctx.db.patch(args.id, { name })
    return null
  },
})

/** Remember whether this member has the workspace expanded in their sidebar. */
export const setOpen = mutation({
  args: { workspaceId: v.id("workspaces"), userId: v.id("users"), open: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const membership = await membershipOf(ctx, args.workspaceId, args.userId)
    // A workspace deleted in another tab is not an error; skip unchanged writes.
    if (!membership || (membership.isOpen ?? true) === args.open) return null
    await ctx.db.patch(membership._id, { isOpen: args.open })
    return null
  },
})

/**
 * Delete a workspace with its members and discussion. Its conversations are
 * not deleted: they move back to their owners' Recents, since a shared
 * workspace can hold other legislators' conversations.
 */
export const remove = mutation({
  args: { id: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (!(await ctx.db.get(id))) return null
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", id))
      .take(MAX_CONVERSATIONS)
    for (const c of conversations) await ctx.db.patch(c._id, { workspaceId: undefined })
    const members = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", id))
      .take(MAX_MEMBERS)
    for (const m of members) await ctx.db.delete(m._id)
    const messages = await ctx.db
      .query("workspaceMessages")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", id))
      .take(1000)
    for (const m of messages) await ctx.db.delete(m._id)
    const pins = await ctx.db
      .query("workspacePins")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", id))
      .take(MAX_PINS)
    for (const p of pins) await ctx.db.delete(p._id)
    await ctx.db.delete(id)
    return null
  },
})

export const get = query({
  args: { id: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("workspaces"),
      _creationTime: v.number(),
      name: v.string(),
      focus: v.optional(v.string()),
      createdBy: v.id("users"),
      members: v.array(memberValidator),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("workspaces", args.id)
    if (!id) return null
    const workspace = await ctx.db.get(id)
    if (!workspace) return null
    return {
      _id: workspace._id,
      _creationTime: workspace._creationTime,
      name: workspace.name,
      focus: workspace.focus,
      createdBy: workspace.createdBy,
      members: await membersOf(ctx, workspace._id),
    }
  },
})

/** The most recent discussion messages, oldest first. */
export const listMessages = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({
      _id: v.id("workspaceMessages"),
      _creationTime: v.number(),
      body: v.string(),
      author: v.union(memberValidator, v.null()),
    })
  ),
  handler: async (ctx, { workspaceId }) => {
    const recent = await ctx.db
      .query("workspaceMessages")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(200)
    const authors = new Map<Id<"users">, Doc<"users"> | null>()
    for (const m of recent) {
      if (!authors.has(m.authorId)) authors.set(m.authorId, await ctx.db.get(m.authorId))
    }
    return recent.reverse().map((m) => {
      const a = authors.get(m.authorId)
      return { _id: m._id, _creationTime: m._creationTime, body: m.body, author: a ? toMember(a) : null }
    })
  },
})

export const sendMessage = mutation({
  args: { workspaceId: v.id("workspaces"), authorId: v.id("users"), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const body = args.body.trim()
    if (!body) throw new Error("Message cannot be empty")
    if (body.length > MAX_MESSAGE_LENGTH) throw new Error(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`)
    if (!(await membershipOf(ctx, args.workspaceId, args.authorId))) throw new Error("Only workspace members can post")
    await ctx.db.insert("workspaceMessages", {
      workspaceId: args.workspaceId,
      authorId: args.authorId,
      body: await keepProjectMentions(ctx, args.workspaceId, body),
    })
    return null
  },
})

/** A conversation mention in a message: `@[Title](conversationId)`. Must match components/workspaces/mentions.tsx. */
const MENTION_TOKEN = /@\[([^\]\n]{1,200})\]\(([a-z0-9]{10,64})\)/g
const MAX_MENTIONS = 20

/**
 * Only conversations in this project can be mentioned: other tokens (wrong
 * project, deleted, or hand-typed) become plain "@Title" text. Each distinct
 * id is read once, and at most MAX_MENTIONS are kept as links.
 */
async function keepProjectMentions(ctx: QueryCtx, workspaceId: Id<"workspaces">, body: string) {
  const ids = [...new Set([...body.matchAll(MENTION_TOKEN)].map((m) => m[2]))].slice(0, MAX_MENTIONS)
  if (ids.length === 0) return body
  const allowed = new Set<string>()
  await Promise.all(
    ids.map(async (raw) => {
      const id = ctx.db.normalizeId("conversations", raw)
      const conversation = id ? await ctx.db.get(id) : null
      if (conversation?.workspaceId === workspaceId) allowed.add(raw)
    })
  )
  return body.replace(MENTION_TOKEN, (token, title: string, id: string) => (allowed.has(id) ? token : `@${title}`))
}

/** Delete a discussion message (any member can delete any message), and unpin it if pinned. */
export const deleteMessage = mutation({
  args: { messageId: v.id("workspaceMessages"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (!message) return null
    if (!(await membershipOf(ctx, message.workspaceId, args.userId))) throw new Error("Only members can delete messages")
    const pins = await ctx.db
      .query("workspacePins")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", message.workspaceId))
      .take(MAX_PINS)
    for (const p of pins) if (p.messageId === args.messageId) await ctx.db.delete(p._id)
    await ctx.db.delete(args.messageId)
    return null
  },
})

/**
 * Discussion messages pinned in the workspace, newest first. People (pinners
 * and authors) are read once each rather than once per pin.
 */
export const listPins = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({
      _id: v.id("workspacePins"),
      _creationTime: v.number(),
      messageId: v.id("workspaceMessages"),
      body: v.string(),
      /** Author name saved when pinned (used if the author is no longer found). */
      sourceLabel: v.string(),
      messageAuthor: v.union(memberValidator, v.null()),
      pinnedBy: v.union(memberValidator, v.null()),
    })
  ),
  handler: async (ctx, { workspaceId }) => {
    const pins = await ctx.db
      .query("workspacePins")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(MAX_PINS)
    const messages = await Promise.all(pins.map((p) => ctx.db.get(p.messageId)))
    const userIds = new Set<Id<"users">>()
    pins.forEach((p, i) => {
      userIds.add(p.pinnedBy)
      const authorId = messages[i]?.authorId
      if (authorId) userIds.add(authorId)
    })
    const users = new Map<Id<"users">, ReturnType<typeof toMember>>()
    for (const u of await Promise.all([...userIds].map((id) => ctx.db.get(id)))) {
      if (u) users.set(u._id, toMember(u))
    }
    return pins.map((p, i) => {
      const authorId = messages[i]?.authorId
      return {
        _id: p._id,
        _creationTime: p._creationTime,
        messageId: p.messageId,
        body: p.body,
        sourceLabel: p.sourceLabel,
        messageAuthor: (authorId && users.get(authorId)) || null,
        pinnedBy: users.get(p.pinnedBy) ?? null,
      }
    })
  },
})

/** Pin a discussion message in its workspace. Any member can pin any message. */
export const pinMessage = mutation({
  args: { messageId: v.id("workspaceMessages"), pinnedBy: v.id("users") },
  returns: v.id("workspacePins"),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId)
    if (!message) throw new Error("Message not found")
    if (!(await membershipOf(ctx, message.workspaceId, args.pinnedBy))) throw new Error("Only members can pin messages")
    const existing = await ctx.db
      .query("workspacePins")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", message.workspaceId))
      .take(MAX_PINS)
    const duplicate = existing.find((p) => p.messageId === args.messageId)
    if (duplicate) return duplicate._id
    if (existing.length >= MAX_PINS) throw new Error(`A workspace holds at most ${MAX_PINS} pinned items`)
    const author = await ctx.db.get(message.authorId)
    return await ctx.db.insert("workspacePins", {
      workspaceId: message.workspaceId,
      pinnedBy: args.pinnedBy,
      body: message.body,
      sourceLabel: author?.name ?? "Former member",
      messageId: args.messageId,
    })
  },
})

export const unpin = mutation({
  args: { id: v.id("workspacePins") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (await ctx.db.get(id)) await ctx.db.delete(id)
    return null
  },
})

/**
 * Conversations in the workspace with their owners: pinned ones first, each
 * group newest first.
 *
 * One index range read (`by_workspace`, already newest first because index
 * order ends in _creationTime) bounded by MAX_CONVERSATIONS, then a stable
 * O(n) split into pinned / unpinned, so no second query or sort. Owners are
 * read once each (a project has at most MAX_MEMBERS), not once per conversation.
 */
export const listConversations = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      _creationTime: v.number(),
      title: v.string(),
      isPinned: v.boolean(),
      thinking: v.optional(v.boolean()),
      owner: v.union(memberValidator, v.null()),
    })
  ),
  handler: async (ctx, { workspaceId }) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(MAX_CONVERSATIONS)

    const ownerIds = [...new Set(conversations.flatMap((c) => (c.userId ? [c.userId] : [])))]
    const owners = new Map<Id<"users">, ReturnType<typeof toMember>>()
    for (const user of await Promise.all(ownerIds.map((uid) => ctx.db.get(uid)))) {
      if (user) owners.set(user._id, toMember(user))
    }

    const toRow = (c: Doc<"conversations">) => ({
      _id: c._id,
      _creationTime: c._creationTime,
      title: c.title,
      isPinned: c.isPinned ?? false,
      thinking: c.thinking,
      owner: (c.userId && owners.get(c.userId)) || null,
    })
    const pinned: ReturnType<typeof toRow>[] = []
    const rest: ReturnType<typeof toRow>[] = []
    for (const c of conversations) (c.isPinned ? pinned : rest).push(toRow(c))
    return [...pinned, ...rest]
  },
})

