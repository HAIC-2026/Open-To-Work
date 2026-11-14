import { query } from "./_generated/server"
import { v } from "convex/values"

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
