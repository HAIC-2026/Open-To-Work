import { query, mutation } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  listUIMessages,
  syncStreams,
  vStreamArgs,
  createThread,
  saveMessage,
  saveMessages,
} from "@convex-dev/agent";

export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const trimmedContent = args.content.trim();
    if (!trimmedContent) {
      throw new Error("Message content cannot be empty");
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    let threadId = conversation.threadId;
    if (!threadId) {
      threadId = await createThread(ctx, components.agent, {
        title: conversation.title,
      });

      // Migrate existing legacy messages if any
      const legacyMsgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("asc")
        .collect();

      if (legacyMsgs.length > 0) {
        await saveMessages(ctx, components.agent, {
          threadId,
          messages: legacyMsgs.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });
      }

      await ctx.db.patch(args.conversationId, { threadId });
    }

    // Save user message to thread
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      prompt: trimmedContent,
    });

    // Schedule background action to stream the AI response
    await ctx.scheduler.runAfter(0, internal.chatActions.streamResponse, {
      threadId,
      promptMessageId: messageId,
      district: conversation.district,
      userId: conversation.userId,
    });

    return null;
  },
});

export const resubmitMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.string(),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const trimmedContent = args.content.trim();
    if (!trimmedContent) {
      throw new Error("Message content cannot be empty");
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    let threadId = conversation.threadId;

    // Handle legacy conversation that didn't have an agent thread
    if (!threadId) {
      threadId = await createThread(ctx, components.agent, {
        title: conversation.title,
      });

      // Migrate existing legacy messages up to the edited message
      const legacyMsgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", args.conversationId)
        )
        .order("asc")
        .collect();

      const targetIdx = legacyMsgs.findIndex((m) => m._id === args.messageId);
      const priorMsgs =
        targetIdx !== -1 ? legacyMsgs.slice(0, targetIdx) : legacyMsgs;

      if (priorMsgs.length > 0) {
        await saveMessages(ctx, components.agent, {
          threadId,
          messages: priorMsgs.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });
      }

      // Delete subsequent legacy messages from DB
      if (targetIdx !== -1) {
        for (const m of legacyMsgs.slice(targetIdx)) {
          await ctx.db.delete(m._id);
        }
      }

      // Save the new edited message into the agent thread
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId,
        prompt: trimmedContent,
      });

      if (targetIdx === 0) {
        await ctx.db.patch(args.conversationId, {
          title: trimmedContent,
          threadId,
        });
      } else {
        await ctx.db.patch(args.conversationId, { threadId });
      }

      await ctx.scheduler.runAfter(0, internal.chatActions.streamResponse, {
        threadId,
        promptMessageId: messageId,
        district: conversation.district,
        userId: conversation.userId,
      });

      return null;
    }

    // It is an Agent Thread:
    // 1. Fetch the target message to get its order and stepOrder
    const [targetMsg] = await ctx.runQuery(
      components.agent.messages.getMessagesByIds,
      {
        messageIds: [args.messageId],
      }
    );

    if (!targetMsg) {
      throw new Error("Target message not found in thread");
    }

    // 2. Truncate all subsequent messages and active streams
    let isDone = false;
    let currentStartOrder = targetMsg.order;
    let currentStartStepOrder = 1;
    while (!isDone) {
      const res = await ctx.runMutation(
        components.agent.messages.deleteByOrder,
        {
          threadId,
          startOrder: currentStartOrder,
          startStepOrder: currentStartStepOrder,
          endOrder: Number.MAX_SAFE_INTEGER,
          endStepOrder: Number.MAX_SAFE_INTEGER,
        }
      );
      isDone = res.isDone;
      if (!isDone && res.lastOrder !== undefined) {
        currentStartOrder = res.lastOrder;
        currentStartStepOrder = (res.lastStepOrder ?? 0) + 1;
      }
    }

    // 3. Update the prompt message with the new content
    await ctx.runMutation(components.agent.messages.updateMessage, {
      messageId: args.messageId,
      patch: {
        message: {
          role: "user",
          content: trimmedContent,
        },
        status: "success",
      },
    });

    // 4. If this was the first user prompt (Turn 0), also update conversation title
    if (targetMsg.order === 0) {
      await ctx.db.patch(args.conversationId, {
        title: trimmedContent,
      });
    }

    // Clean up any existing sandbox for this thread so the rerun starts completely fresh
    await ctx.scheduler.runAfter(0, internal.chatActions.cleanupSandbox, {
      userId: conversation.userId,
      threadId,
    });

    // 5. Schedule the LLM to stream the response for this updated prompt
    await ctx.scheduler.runAfter(0, internal.chatActions.streamResponse, {
      threadId,
      promptMessageId: args.messageId,
      district: conversation.district,
      userId: conversation.userId,
    });

    return null;
  },
});
