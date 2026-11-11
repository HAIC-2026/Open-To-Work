import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { seedAll } from "./seed";

/**
 * Admin-only maintenance. These are internal functions, so they can't be called
 * from the browser — only from the CLI or the Convex dashboard, e.g.
 *
 *   npx convex run admin:resetDatabase '{"confirm":"DELETE EVERYTHING"}'          (dev)
 *   npx convex run admin:resetDatabase '{"confirm":"DELETE EVERYTHING"}' --prod   (prod)
 */

const APP_TABLES = ["messages", "conversations", "folders", "users"] as const;

/** Deletes up to `batchSize` documents from one app table; returns how many. */
export const deleteBatch = internalMutation({
  args: {
    table: v.union(...APP_TABLES.map((t) => v.literal(t))),
    batchSize: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const docs = await ctx.db.query(args.table).take(args.batchSize);
    for (const doc of docs) await ctx.db.delete(doc._id);
    return docs.length;
  },
});

/**
 * Wipes every conversation, agent thread (messages, streams), folder and user,
 * then re-seeds the 76 legislators and their starter folders (seed.ts).
 *
 * Irreversible: user IDs change, so all existing links to conversations break.
 */
export const resetDatabase = internalAction({
  args: { confirm: v.literal("DELETE EVERYTHING") },
  returns: v.object({
    agentThreadsDeleted: v.number(),
    deleted: v.record(v.string(), v.number()),
    seededUsers: v.number(),
  }),
  // Explicit return type: this handler references its own file via
  // `internal.admin`, which otherwise makes the generated API types circular.
  handler: async (
    ctx
  ): Promise<{ agentThreadsDeleted: number; deleted: Record<string, number>; seededUsers: number }> => {
    // 1. Agent component data. Threads in this app are created without a
    //    userId, so list those directly; also clear any user-scoped threads.
    const threadIds: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { page: { _id: string }[]; isDone: boolean; continueCursor: string } =
        await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
          paginationOpts: { cursor, numItems: 200 },
        });
      threadIds.push(...page.page.map((t) => t._id));
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);

    for (const threadId of threadIds) {
      // Deletes the thread's messages and streams in the background.
      await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, { threadId });
    }

    let userCursor: string | null = null;
    do {
      const page: { page: string[]; isDone: boolean; continueCursor: string } =
        await ctx.runQuery(components.agent.users.listUsersWithThreads, {
          paginationOpts: { cursor: userCursor, numItems: 100 },
        });
      for (const userId of page.page) {
        await ctx.runMutation(components.agent.users.deleteAllForUserIdAsync, { userId });
      }
      userCursor = page.isDone ? null : page.continueCursor;
    } while (userCursor);

    // 2. App tables, in batches to stay within per-mutation limits.
    const deleted: Record<string, number> = {};
    for (const table of APP_TABLES) {
      deleted[table] = 0;
      while (true) {
        const n: number = await ctx.runMutation(internal.admin.deleteBatch, { table, batchSize: 500 });
        deleted[table] += n;
        if (n === 0) break;
      }
    }

    // 3. Re-seed the legislators and their starter folders.
    const { totalUsers } = await seedAll(ctx);

    return { agentThreadsDeleted: threadIds.length, deleted, seededUsers: totalUsers };
  },
});
