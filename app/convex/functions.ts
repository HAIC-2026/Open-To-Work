import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "./_generated/server"
import type { DataModel } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { Triggers } from "convex-helpers/server/triggers"
import { customCtx, customMutation } from "convex-helpers/server/customFunctions"

/**
 * Database triggers (convex-helpers `Triggers`). A trigger runs inside the same
 * transaction as the write that caused it, but only for mutations built with
 * the wrapped `mutation` / `internalMutation` below; writes from the raw
 * `_generated/server` builders, the dashboard, or `npx convex import` skip them.
 */
const triggers = new Triggers<DataModel>()

// Every new conversation gets a short LLM-written title. It is created titled
// with its first question; this schedules the background job that replaces
// it. Scheduling here is atomic with the insert, so the job only runs if the
// conversation was really created.
triggers.register("conversations", async (ctx, change) => {
  if (change.operation !== "insert") return
  await ctx.scheduler.runAfter(0, internal.titles.generate, {
    conversationId: change.id,
    question: change.newDoc.title,
    district: change.newDoc.district,
  })
})

// Follow-up suggestions. `thinking` turning off means an answer finished
// (conversations.setThinking, from the agent action): schedule the job that
// suggests next questions. Turning on means a new question was sent: clear the
// old suggestions (innerDb so this write doesn't run triggers again). Pressing
// Stop (chat.stopThinking) uses the raw builder, so a stopped answer gets none.
triggers.register("conversations", async (ctx, change) => {
  if (change.operation !== "update") return
  const wasThinking = change.oldDoc.thinking === true
  const isThinking = change.newDoc.thinking === true
  if (wasThinking && !isThinking && change.newDoc.threadId) {
    await ctx.scheduler.runAfter(0, internal.suggestions.generate, {
      conversationId: change.id,
      threadId: change.newDoc.threadId,
    })
  } else if (!wasThinking && isThinking && change.newDoc.suggestions?.length) {
    await ctx.innerDb.patch(change.id, { suggestions: undefined })
  }
})

/** Use these instead of the `_generated/server` builders for writes that should fire triggers. */
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB))
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB))
