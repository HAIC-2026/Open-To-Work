import { internalAction, internalMutation, type ActionCtx } from "./_generated/server"
import { v } from "convex/values"
import { components, internal } from "./_generated/api"
import { createThread, saveMessages } from "@convex-dev/agent"
import { LEGISLATOR_ROSTER } from "./legislatorRoster"

/**
 * One seeder for the whole app: the 76 legislators (real names and official
 * photos from legislatorRoster.ts) and each legislator's starter folders with
 * sample conversations. Safe to run any number of times — it only fills in
 * what's missing and refreshes names/photos, never duplicates or deletes.
 *
 *   npx convex run seed:seed            (dev)
 *   npx convex run seed:seed --prod     (prod)
 *
 * It runs one legislator per transaction, because creating every thread in a
 * single mutation could exceed Convex's 1-second mutation execution limit.
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

/** Upserts one legislator, then gives them starter folders if they have none. */
export const seedLegislator = internalMutation({
  args: {
    district: v.string(),
    name: v.string(),
    photoUrl: v.optional(v.string()),
  },
  returns: v.object({ userCreated: v.boolean(), foldersCreated: v.boolean() }),
  handler: async (ctx, args) => {
    // Matched by district so existing user IDs (and their conversations) are kept.
    const existing = await ctx.db
      .query("users")
      .withIndex("by_district", (q) => q.eq("district", args.district))
      .first()

    let userId = existing?._id
    if (!existing) {
      userId = await ctx.db.insert("users", {
        name: args.name,
        district: args.district,
        photoUrl: args.photoUrl,
      })
    } else if (existing.name !== args.name || existing.photoUrl !== args.photoUrl) {
      await ctx.db.patch(existing._id, { name: args.name, photoUrl: args.photoUrl })
    }
    if (!userId) throw new Error(`Could not seed ${args.district}`)

    const hasFolders = await ctx.db
      .query("folders")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
    if (hasFolders) return { userCreated: !existing, foldersCreated: false }

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

    return { userCreated: !existing, foldersCreated: true }
  },
})

const seedResult = v.object({
  totalUsers: v.number(),
  usersCreated: v.number(),
  foldersCreatedFor: v.number(),
})

/** Seeds every legislator; shared by `seed` and admin:resetDatabase. */
export async function seedAll(ctx: ActionCtx) {
  let usersCreated = 0
  let foldersCreatedFor = 0
  for (const l of LEGISLATOR_ROSTER) {
    const r: { userCreated: boolean; foldersCreated: boolean } = await ctx.runMutation(
      internal.seed.seedLegislator,
      { district: l.district, name: l.name, photoUrl: l.photoUrl }
    )
    if (r.userCreated) usersCreated++
    if (r.foldersCreated) foldersCreatedFor++
  }
  return { totalUsers: LEGISLATOR_ROSTER.length, usersCreated, foldersCreatedFor }
}

/**
 * Internal: run it yourself from the CLI or the Convex dashboard (the app never
 * seeds on its own). It only adds missing legislators/folders and refreshes
 * names/photos.
 */
export const seed = internalAction({
  args: {},
  returns: seedResult,
  // Explicit return type: this file references itself via `internal.seed`.
  handler: async (
    ctx
  ): Promise<{ totalUsers: number; usersCreated: number; foldersCreatedFor: number }> => seedAll(ctx),
})
