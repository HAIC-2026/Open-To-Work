import { mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

/**
 * Batch backfill mutation for the `thinking` field on `conversations`.
 * Follows the official Convex migration pattern: processes documents in batches
 * to prevent transaction timeouts and excessive memory usage on large datasets.
 */
export const backfillThinking = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    migratedCount: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = args.batchSize ?? 100;
    const unmigrated = await ctx.db
      .query("conversations")
      .filter((q) => q.eq(q.field("thinking"), undefined))
      .take(limit);

    for (const conv of unmigrated) {
      await ctx.db.patch(conv._id, { thinking: false });
    }

    return {
      migratedCount: unmigrated.length,
      hasMore: unmigrated.length === limit,
    };
  },
});

/**
 * Runner action that iterates backfill batches until all unmigrated documents are updated.
 * Can be run during Vercel deployment: `npx convex run migrations:runBackfill`
 */
export const runBackfill = action({
  args: {},
  returns: v.object({
    totalMigrated: v.number(),
  }),
  handler: async (ctx) => {
    let total = 0;
    while (true) {
      const { migratedCount, hasMore } = await ctx.runMutation(
        api.migrations.backfillThinking,
        { batchSize: 100 }
      );
      total += migratedCount;
      if (!hasMore || migratedCount === 0) break;
    }
    return { totalMigrated: total };
  },
});
