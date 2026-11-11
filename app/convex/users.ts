import { mutation, query } from "./_generated/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.string(),
      district: v.string(),
      photoUrl: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect()
    // Sort House districts first (1..51), then Senate districts (1..25)
    return users.sort((a, b) => {
      const aIsHouse = a.district.startsWith("house")
      const bIsHouse = b.district.startsWith("house")
      if (aIsHouse && !bIsHouse) return -1
      if (!aIsHouse && bIsHouse) return 1

      const aNum = parseInt(a.district.replace(/\D/g, ""), 10) || 0
      const bNum = parseInt(b.district.replace(/\D/g, ""), 10) || 0
      return aNum - bNum
    })
  },
})

export const get = query({
  args: { id: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.string(),
      district: v.string(),
      photoUrl: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const getByDistrict = query({
  args: { district: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.string(),
      district: v.string(),
      photoUrl: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_district", (q) => q.eq("district", args.district))
      .first()
  },
})

export const migrateToUserAccounts = mutation({
  args: {},
  returns: v.object({
    defaultUserId: v.id("users"),
    migratedFolders: v.number(),
    migratedConversations: v.number(),
  }),
  handler: async (ctx) => {
    // 1. Ensure all 76 users exist
    const expectedDistricts: Array<{ name: string; district: string }> = [
      ...Array.from({ length: 51 }, (_, i) => ({
        name: `Representative District ${i + 1}`,
        district: `house-district-${i + 1}`,
      })),
      ...Array.from({ length: 25 }, (_, i) => ({
        name: `Senator District ${i + 1}`,
        district: `senate-district-${i + 1}`,
      })),
    ]

    for (const item of expectedDistricts) {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_district", (q) => q.eq("district", item.district))
        .first()

      if (!existing) {
        await ctx.db.insert("users", {
          name: item.name,
          district: item.district,
          photoUrl: "",
        })
      }
    }

    const defaultUser = await ctx.db
      .query("users")
      .withIndex("by_district", (q) => q.eq("district", "house-district-1"))
      .first()

    if (!defaultUser) {
      throw new Error("Default user house-district-1 not found")
    }

    // 2. Backfill legacy folders with userId
    const allFolders = await ctx.db.query("folders").collect()
    let migratedFolders = 0
    for (const folder of allFolders) {
      if (!folder.userId) {
        await ctx.db.patch(folder._id, { userId: defaultUser._id })
        migratedFolders++
      }
    }

    // 3. Backfill legacy conversations with userId
    const allConversations = await ctx.db.query("conversations").collect()
    let migratedConversations = 0
    for (const conv of allConversations) {
      if (!conv.userId) {
        await ctx.db.patch(conv._id, { userId: defaultUser._id })
        migratedConversations++
      }
    }

    return {
      defaultUserId: defaultUser._id,
      migratedFolders,
      migratedConversations,
    }
  },
})
