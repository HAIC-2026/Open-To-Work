"use node";

import { internalAction } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
import { Agent, listUIMessages } from "@convex-dev/agent";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { searchDatasets, getDatasetDetails, exploreDataSources } from "./datatrove";
import { executePython, sandboxes } from "./e2bTools";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const THINKING_LEVEL = "high";
const MAX_COUNT = 25;
const MAX_ERROR_ALLOWANCE = 10;
const SYNTHESIS_STEP_THRESHOLD = Math.max(MAX_COUNT - 2, 1);

/**
 * Checks whether a single step in the agent execution loop resulted in a tool error.
 * A tool step is an error if a tool threw an exception or execute_python returned success: false.
 */
export function isStepError(step: any): boolean {
  return step?.toolResults?.some(
    (tr: any) => tr.error || tr.output?.success === false
  ) ?? false;
}

/**
 * Calculates effective productive turns and error count.
 * Errors up to MAX_ERROR_ALLOWANCE (10) are forgiven and do not count as a productive turn.
 */
export function calculateEffectiveStep(steps: any[]) {
  const totalSteps = Array.isArray(steps) ? steps.length : 0;
  const errorCount = Array.isArray(steps) ? steps.filter(isStepError).length : 0;
  const forgivenErrors = Math.min(errorCount, MAX_ERROR_ALLOWANCE);
  const effectiveTurns = totalSteps - forgivenErrors;
  return {
    totalSteps,
    errorCount,
    forgivenErrors,
    effectiveTurns,
  };
}

/**
 * Custom StopCondition:
 * Stops the agent loop when MAX_COUNT (15) productive turns are reached,
 * allowing up to MAX_ERROR_ALLOWANCE (10) forgiven tool errors before halting.
 * Guaranteed hard ceiling of (MAX_COUNT + MAX_ERROR_ALLOWANCE = 25) total steps.
 */
export function isProductiveLimitReached({ steps }: { steps: any[] }): boolean {
  const { effectiveTurns, totalSteps } = calculateEffectiveStep(steps);
  if (totalSteps >= MAX_COUNT + MAX_ERROR_ALLOWANCE) {
    return true;
  }
  return effectiveTurns >= MAX_COUNT;
}

const BASE_INSTRUCTIONS =
  "You are an expert legislative and policy research assistant for the Hawaii State Legislature. " +
  "You provide clear, accurate, well-structured, insightful responses on Hawaii state policy, county matters, public data, and district issues.\n\n" +
  "You have access to tools for querying official State of Hawaii open datasets (via Datatrove) and executing Python in an isolated E2B sandbox:\n" +
  "- Use `search_datasets` to find official Hawaii datasets (DBEDT, Honolulu DPP, UHERO, HECO, PUC, DOH, DOTAX, DLIR, etc.) and obtain direct download URLs.\n" +
  "- Use `get_dataset_details` to inspect exact column schemas, data types, sample values, and data limitations/biases before analyzing.\n" +
  "- Use `explore_data_sources` to browse what Hawaii agencies publish.\n" +
  "- Use `execute_python` to download datasets, perform numerical analysis, calculate growth rates/percentages/statistics, and verify findings.\n\n" +
  "AVAILABLE PRE-INSTALLED PYTHON LIBRARIES:\n" +
  "The E2B sandbox environment has over 180 data science packages pre-installed. The following are available to import directly:\n" +
  "• Data & Tables: `pandas`, `numpy`, `openpyxl`, `xlrd`, `xarray`\n" +
  "• HTTP & Web Scraping: `requests`, `httpx`, `aiohttp`, `beautifulsoup4`, `lxml`\n" +
  "• Statistics & Math: `scipy`, `scikit-learn`, `sympy`, `mpmath`\n" +
  "• Visualization: `matplotlib`, `seaborn`, `plotly`, `bokeh`\n" +
  "• Documents & Validation: `python-docx`, `pydantic`, `nltk`, `spacy`\n\n" +
  "NO PIP INSTALL:\n" +
  "You cannot do any pip install in the sandbox environment. Do NOT attempt to run `pip install`, `!pip`, or subprocess pip commands; rely strictly on the pre-installed libraries listed above.\n\n" +
  "CRITICAL PYTHON EXECUTION RULES:\n" +
  "1. Variables from previous tool calls (such as `res`, `df`, `data`, `url`) do NOT exist in memory. Each script runs in a fresh process. You must download/load and analyze within the SAME script (or load from a file saved to `/tmp`).\n" +
  "2. Never split downloading into one tool call and parsing into another. Always combine them in a single script:\n" +
  "   ```python\n" +
  "   import requests, io, pandas as pd\n" +
  "   res = requests.get(url, timeout=30)\n" +
  "   df = pd.read_excel(io.BytesIO(res.content))\n" +
  "   print(df.describe())\n" +
  "   ```\n" +
  "3. When downloading datasets or CSV files from Hawaii open data (CKAN) URLs, always use Python's `requests` library (e.g., `requests.get(url, timeout=30)`) instead of `urllib.request`. Open data downloads 302-redirect to Amazon S3 presigned URLs, which require clean header handling via `requests` to avoid 403 Forbidden signature mismatch errors.\n" +
  "4. If a script ever fails with `NameError` for an undefined variable, immediately re-run the full script with the variable declaration and download included in that same script.\n\n" +
  "TOOL USAGE EFFICIENCY GUIDELINE:\n" +
  `Be efficient and targeted with tools. Complete your data retrieval and Python calculations within ${SYNTHESIS_STEP_THRESHOLD} steps. Once you have fetched the relevant dataset or tables and computed key figures, synthesize your findings into a comprehensive, detailed markdown profile and present your final answer to the user.\n\n` +
  "Always cite the official publishing organization (e.g. Honolulu DPP, DBEDT, UHERO) and provide direct download URLs when referencing data. " +
  "Format responses in clear, readable markdown with bullet points, tables, and bold highlights. " +
  "When citing currency or monetary figures, write plain dollar notation (e.g., $75,000, $1.2M) without escaping or LaTeX math syntax.";

export const assistantAgent = new Agent(components.agent, {
  name: "Hawaii Policy Assistant",
  languageModel: google(process.env.GEMINI_MODEL!),
  providerOptions: {
    google: {
      thinkingConfig: {
        thinkingLevel: THINKING_LEVEL,
      },
    },
  },
  instructions: BASE_INSTRUCTIONS,
  tools: {
    search_datasets: searchDatasets,
    get_dataset_details: getDatasetDetails,
    explore_data_sources: exploreDataSources,
    execute_python: executePython,
  },
  stopWhen: isProductiveLimitReached,
});

export const streamResponse = internalAction({
  args: {
    conversationId: v.optional(v.id("conversations")),
    threadId: v.string(),
    promptMessageId: v.string(),
    district: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const instructions = args.district
        ? `${BASE_INSTRUCTIONS}\n\nYou are currently assisting with inquiries regarding ${args.district}.`
        : BASE_INSTRUCTIONS;

      const result = await assistantAgent.streamText(
        ctx,
        { threadId: args.threadId, userId: args.userId },
        {
          promptMessageId: args.promptMessageId,
          instructions,
          stopWhen: isProductiveLimitReached,
          prepareStep: async ({ stepNumber, steps, messages }: any) => {
            const { effectiveTurns, errorCount, forgivenErrors } = calculateEffectiveStep(steps || []);

            // Step warning on the penultimate productive step
            if (effectiveTurns === MAX_COUNT - 2) {
              return {
                messages: [
                  ...messages,
                  {
                    role: "user" as const,
                    content: `WARNING: You are on productive turn ${effectiveTurns + 1} of ${MAX_COUNT}. You have only 1 tool operation remaining. Conclude your data gathering now.`,
                  },
                ],
              };
            }
            // Fix 1: On the final productive step, steer the model with an authoritative user prompt to synthesize text immediately
            if (effectiveTurns >= MAX_COUNT - 1) {
              return {
                messages: [
                  ...messages,
                  {
                    role: "user" as const,
                    content: `STOP: You have reached the maximum allowed turns (${MAX_COUNT} of ${MAX_COUNT}). Do NOT call any more tools under any circumstances. Immediately synthesize all findings, calculations, and data gathered above into your final comprehensive markdown answer and present it to the user now.`,
                  },
                ],
              };
            }
            return undefined;
          },
        },
        {
          saveStreamDeltas: { chunking: "word" },
        }
      );

      // If all turns were consumed by tools and no text was produced, force synthesis using generateText
      const fullText = await result.text;
      if (!fullText || fullText.trim().length === 0) {
        const uiMessages = await listUIMessages(ctx, components.agent, {
          threadId: args.threadId,
          paginationOpts: { numItems: 50, cursor: null },
        });

        const assistantMsg = uiMessages.page.find((m: any) => m.role === "assistant");
        const userMsg = uiMessages.page.find((m: any) => m.role === "user");

        const toolOutputs: string[] = [];
        for (const rawPart of assistantMsg?.parts || []) {
          const p = rawPart as any;
          if (p.type?.startsWith("tool-") || p.toolName) {
            const name = p.toolName || p.type?.replace("tool-", "");
            const stdout = p.output?.stdout || (p.output ? JSON.stringify(p.output) : "");
            if (stdout) {
              toolOutputs.push(`### Data from ${name}:\n${stdout.slice(0, 1000)}`);
            }
          }
        }

        const synthesisPrompt =
          `You are an expert legislative and policy research assistant for the Hawaii State Legislature.\n` +
          `User Inquiry: "${userMsg?.text || "District Profile"}"\n\n` +
          `The following official State of Hawaii open datasets and calculations were retrieved for ${args.district || "the district"}:\n\n` +
          toolOutputs.join("\n\n") +
          `\n\nPlease provide a clear, comprehensive, detailed final district profile markdown response. Include headings, bullet points, statistics, and tables. Cite official sources.`;

        const { text: synthesizedText } = await generateText({
          model: google(process.env.GEMINI_MODEL!),
          providerOptions: {
            google: {
              thinkingConfig: {
                thinkingLevel: THINKING_LEVEL,
              },
            },
          },
          prompt: synthesisPrompt,
        });

        if (synthesizedText) {
          await assistantAgent.saveMessage(ctx, {
            threadId: args.threadId,
            message: {
              role: "assistant",
              content: synthesizedText,
            },
          });
        }
      }
    } finally {
      // Idiomatic Convex & E2B cleanup: kill sandbox immediately after the LLM response is generated
      try {
        await sandboxes.kill(ctx, { scope: "hawaii", key: args.threadId });
      } catch (err) {
        // Safe no-op if no sandbox was initialized
      }

      // Guaranteed reset of conversation thinking state
      if (args.conversationId) {
        try {
          await ctx.runMutation(internal.conversations.setThinking, {
            conversationId: args.conversationId,
            thinking: false,
          });
        } catch (err) {
          console.error("Failed to reset conversation thinking state:", err);
        }
      }
    }
  },
});

export const cleanupSandbox = internalAction({
  args: {
    userId: v.optional(v.string()),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await sandboxes.kill(ctx, { scope: "hawaii", key: args.threadId });
    } catch (err) {
      // Safe no-op if sandbox is already killed
    }
  },
});
