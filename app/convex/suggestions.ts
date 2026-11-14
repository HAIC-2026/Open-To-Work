"use node";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { v } from "convex/values";
import { listMessages } from "@convex-dev/agent";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Follow-up question suggestions, shown as buttons above the prompt input
 * (shadcn AI Elements "Suggestion": a row of Buttons that send their label).
 *
 * The conversations trigger (convex/functions.ts) schedules this when an
 * answer finishes. It reads the latest question and answer from the agent
 * thread and asks the model, at minimal thinking, for three short follow-ups.
 * Actions run at most once; on failure the conversation just has no suggestions.
 */

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

const COUNT = 3;
const MAX_LENGTH = 90;
/** Enough of the answer for context without sending a whole report. */
const MAX_ANSWER_CHARS = 6000;

const INSTRUCTIONS =
  `Suggest ${COUNT} short follow-up questions a Hawaiʻi state legislator might ask next, given their question and the assistant's answer below. ` +
  "Each should go one step further (a comparison, a trend, a program, a specific group, or what it means for their constituents) and be answerable with public data. " +
  "Write each as the legislator would type it, in first person where natural (e.g. \"my district\"), under 12 words, ending with a question mark. " +
  "Do not repeat the original question or ask about something the answer already covered in full. Stay nonpartisan: no questions about parties, elections or opinions of legislators. " +
  "Keep Hawaiian place names and words with their ʻokina and kahakō. " +
  `Reply with exactly ${COUNT} lines, one question per line, with no numbering, bullets or quotes.`;

function cleanSuggestions(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const q = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .replace(/[*_`]/g, "")
      .trim();
    if (!q || q.length > MAX_LENGTH || !q.endsWith("?")) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === COUNT) break;
  }
  return out;
}

export const generate = internalAction({
  args: { conversationId: v.id("conversations"), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Raw thread messages (the grouped UI view folds the question into the
    // answer's turn), newest first; tool calls and results are left out.
    const { page } = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: { numItems: 40, cursor: null },
      excludeToolMessages: true,
    });
    const newestFirst = [...page].sort((a, b) => b.order - a.order || b.stepOrder - a.stepOrder);
    const answer = newestFirst.find(
      (m) => m.message?.role === "assistant" && m.status === "success" && m.text?.trim()
    );
    if (!answer?.text) return null;
    const question = newestFirst.find((m) => m.message?.role === "user" && m.order <= answer.order && m.text?.trim());
    if (!question?.text) return null;

    let suggestions: string[] = [];
    try {
      const { text } = await generateText({
        model: google(process.env.GEMINI_MODEL!),
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
        instructions: INSTRUCTIONS,
        prompt: `Question: ${question.text.slice(0, 2000)}\n\nAnswer:\n${answer.text.slice(0, MAX_ANSWER_CHARS)}`,
      });
      suggestions = cleanSuggestions(text);
    } catch (err) {
      console.error("Follow-up suggestion generation failed:", err);
      return null;
    }
    if (suggestions.length === 0) return null;
    await ctx.runMutation(internal.conversations.applySuggestions, {
      conversationId: args.conversationId,
      suggestions,
    });
    return null;
  },
});
