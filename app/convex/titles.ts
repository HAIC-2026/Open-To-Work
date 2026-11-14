"use node";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Background title generation for new conversations.
 *
 * A conversation is created titled with its first question. The trigger on
 * the conversations table (convex/functions.ts) schedules this action with
 * `ctx.scheduler.runAfter(0, ...)` in the same transaction as the insert, so it
 * runs only if the conversation was created and never delays it opening.
 * Actions run at most once and are not retried (Convex scheduling docs); if
 * the model call fails, the question simply stays as the title.
 */

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

const MAX_TITLE_LENGTH = 60;

const TITLE_INSTRUCTIONS =
  "Write a short title for a conversation that starts with the user's question below. " +
  "Use 3 to 6 words in sentence case, naming the topic and the district or place when one is given. " +
  "Reply with the title only: no quotes, no trailing punctuation, no emoji, no markdown. " +
  "Keep Hawaiian place names and words with their ʻokina and kahakō (e.g. Hawaiʻi, Oʻahu, kūpuna). " +
  "Do not add facts, numbers or opinions that are not in the question, and stay nonpartisan.";

/** One line, no wrapping quotes or trailing punctuation, at most MAX_TITLE_LENGTH characters. */
function cleanTitle(raw: string): string {
  let title = raw.split("\n").find((line) => line.trim())?.trim() ?? "";
  title = title.replace(/^(title:\s*)/i, "").replace(/[*_`#]/g, "");
  title = title.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").replace(/[.!?:;,]+$/, "").trim();
  title = title.replace(/\s+/g, " ");
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.slice(0, MAX_TITLE_LENGTH).replace(/\s+\S*$/, "").trim();
  }
  return title;
}

export const generate = internalAction({
  args: {
    conversationId: v.id("conversations"),
    /** The question the conversation was created with (also its current title). */
    question: v.string(),
    /** The district it is about; preset questions leave the district out of the text. */
    district: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let title = "";
    try {
      const { text } = await generateText({
        model: google(process.env.GEMINI_MODEL!),
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
        instructions: TITLE_INSTRUCTIONS,
        prompt: (args.district ? `District: ${args.district}\n\n` : "") + `Question: ${args.question.slice(0, 2000)}`,
      });
      title = cleanTitle(text);
    } catch (err) {
      console.error("Title generation failed; keeping the question as the title:", err);
      return null;
    }
    if (!title) return null;
    await ctx.runMutation(internal.conversations.applyGeneratedTitle, {
      conversationId: args.conversationId,
      expectedTitle: args.question,
      title,
    });
    return null;
  },
});
