import { internalAction, internalMutation } from "./_generated/server"
import { v } from "convex/values"
import { components, internal } from "./_generated/api"
import { createThread, saveMessages } from "@convex-dev/agent"
import { LEGISLATOR_ROSTER } from "./legislatorRoster"

/**
 * Resets the app to its original state: deletes every conversation, agent
 * thread (messages, streams), folder and user, then seeds the 76 legislators
 * (real names and official photos from legislatorRoster.ts) with their starter
 * folders and sample conversations. The public program inventory (`programs`
 * table) is reference data and is left untouched; fill or update it with
 * `npx convex run programs:refresh`. Internal, so only you can run it:
 *
 *   npx convex run seed:seed            (dev)
 *   npx convex run seed:seed --prod     (prod)
 *
 * Irreversible: all conversations are deleted and user IDs change. Work is
 * split into small mutations (one batch / one legislator each) to stay within
 * Convex's 1-second mutation execution limit.
 */

/** Starter folders and sample conversations for one district. */
function defaultFolders(districtLabel: string) {
return [
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
}

const APP_TABLES = ["messages", "conversations", "folders", "users"] as const

/** Deletes up to `batchSize` documents from one app table; returns how many. */
export const deleteBatch = internalMutation({
  args: {
    table: v.union(...APP_TABLES.map((t) => v.literal(t))),
    batchSize: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const docs = await ctx.db.query(args.table).take(args.batchSize)
    for (const doc of docs) await ctx.db.delete(doc._id)
    return docs.length
  },
})

/** Creates one legislator and their starter folders and sample conversations. */
export const seedLegislator = internalMutation({
  args: {
    district: v.string(),
    name: v.string(),
    photoUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", {
      name: args.name,
      district: args.district,
      photoUrl: args.photoUrl,
    })

    // e.g. "House District 1" or "Senate District 5"
    const num = args.district.replace(/\D/g, "")
    const districtLabel = args.district.startsWith("house")
      ? `House District ${num}`
      : `Senate District ${num}`

    for (const folderData of defaultFolders(districtLabel)) {
      const folderId = await ctx.db.insert("folders", {
        name: folderData.name,
        defaultOpen: folderData.defaultOpen,
        order: folderData.order,
        userId,
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
          userId,
          thinking: false,
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
    return null
  },
})

type SeedResult = {
  agentThreadsDeleted: number
  deleted: Record<string, number>
  seededUsers: number
}

export const seed = internalAction({
  args: {},
  returns: v.object({
    agentThreadsDeleted: v.number(),
    deleted: v.record(v.string(), v.number()),
    seededUsers: v.number(),
  }),
  // Explicit return type: this handler references its own file via
  // `internal.seed`, which otherwise makes the generated API types circular.
  handler: async (ctx): Promise<SeedResult> => {
    // 1. Agent component data. Threads in this app are created without a
    //    userId, so list those directly; also clear any user-scoped threads.
    const threadIds: string[] = []
    let cursor: string | null = null
    do {
      const page: { page: { _id: string }[]; isDone: boolean; continueCursor: string } =
        await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
          paginationOpts: { cursor, numItems: 200 },
        })
      threadIds.push(...page.page.map((t) => t._id))
      cursor = page.isDone ? null : page.continueCursor
    } while (cursor)

    for (const threadId of threadIds) {
      // Deletes the thread's messages and streams in the background.
      await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, { threadId })
    }

    let userCursor: string | null = null
    do {
      const page: { page: string[]; isDone: boolean; continueCursor: string } =
        await ctx.runQuery(components.agent.users.listUsersWithThreads, {
          paginationOpts: { cursor: userCursor, numItems: 100 },
        })
      for (const userId of page.page) {
        await ctx.runMutation(components.agent.users.deleteAllForUserIdAsync, { userId })
      }
      userCursor = page.isDone ? null : page.continueCursor
    } while (userCursor)

    // 2. App tables, in batches.
    const deleted: Record<string, number> = {}
    for (const table of APP_TABLES) {
      deleted[table] = 0
      while (true) {
        const n: number = await ctx.runMutation(internal.seed.deleteBatch, { table, batchSize: 500 })
        deleted[table] += n
        if (n === 0) break
      }
    }

    // 3. Seed the legislators and their starter folders, one per transaction.
    for (const l of LEGISLATOR_ROSTER) {
      await ctx.runMutation(internal.seed.seedLegislator, {
        district: l.district,
        name: l.name,
        photoUrl: l.photoUrl,
      })
    }

    return { agentThreadsDeleted: threadIds.length, deleted, seededUsers: LEGISLATOR_ROSTER.length }
  },
})
