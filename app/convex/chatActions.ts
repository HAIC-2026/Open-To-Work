"use node";

import { internalAction } from "./_generated/server";
import { components, internal, api } from "./_generated/api";
import { v } from "convex/values";
import { Agent, listUIMessages, listStreams } from "@convex-dev/agent";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { searchDatasets, getDatasetDetails, exploreDataSources, citeSources } from "./datatrove";
import { executePython, sandboxes } from "./e2bTools";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const THINKING_LEVEL = "high";
const MAX_COUNT = 30;
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
  "- Use `execute_python` to download datasets, perform numerical analysis, calculate growth rates/percentages/statistics, and verify findings.\n" +
  "- Use `cite_sources` after finishing your data retrieval and Python calculations to declare the exact datasets that directly contributed facts, metrics, or tables to your final answer. You must supply the exact dataset 'id' returned by search_datasets (e.g. 'databook-21.20', 'geo_hi__adminbnd__hawaii-state-house-districts-2022'). You CANNOT cite external websites, Wikipedia, or datasets not found in search_datasets.\n\n" +
  "AVAILABLE PRE-INSTALLED PYTHON LIBRARIES:\n" +
  "Only the following libraries are available in the E2B sandbox. Do not import anything not listed here:\n" +
  "• Data & Tables: `pandas`, `numpy`, `openpyxl`, `xlrd`, `xarray`\n" +
  "• HTTP & Web Scraping: `requests`, `httpx`, `aiohttp`, `beautifulsoup4`, `lxml`\n" +
  "• Statistics & Math: `scipy`, `scikit-learn`, `sympy`, `mpmath`\n" +
  "• Visualization: `matplotlib`, `seaborn`, `plotly`, `bokeh`\n" +
  "• Documents & Validation: `python-docx`, `pydantic`, `nltk`, `spacy`\n" +
  "• Geospatial: `geopandas`, `shapely`, `pyproj`, `pyogrio` (GDAL bundled). NOT installed: `fiona`, `rasterio`, `folium`, `contextily`.\n\n" +
  "GEOSPATIAL ANALYSIS (address → district, district overlaps, tracts within a district, area shares):\n" +
  "1. Use `geopandas` for all polygon work. Never hand-roll point-in-polygon, ray casting, or Monte Carlo sampling.\n" +
  "2. Load boundaries directly with `gpd.read_file(url)` from the ArcGIS GeoJSON query URLs returned by `search_datasets` (e.g. Hawaii Statewide GIS AdminBnd and Census MapServer layers). " +
  "Keep downloads small to stay within the time limit: filter with the `where` parameter (e.g. `where=house_id%3D49` or `where=county%3D%27Honolulu%27`) and request only needed `outFields`.\n" +
  "3. Before measuring area or overlap, reproject every layer to the same projected CRS, e.g. `utm = gdf.estimate_utm_crs(); gdf = gdf.to_crs(utm)`. Never compute area in latitude/longitude (EPSG:4326).\n" +
  "4. Use `gdf1.overlay(gdf2, how='intersection')` for overlaps and `gpd.sjoin` for containment. Report shares as intersection area ÷ total area.\n" +
  "5. When building district totals from Census tracts, a tract may be only partly inside a district: report the fraction of each tract inside, and state whether totals are area-weighted or include whole tracts.\n" +
  "6. Address → district: geocode the street address with the U.S. Census Geocoder via `requests` " +
  "(`https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=...&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json`), " +
  "which returns coordinates plus Census tract, block group and state legislative districts. To use an older district plan, build a point from the returned coordinates and `gpd.sjoin` it with that plan's layer. " +
  "The Census Geocoder only accepts full street addresses, not town or landmark names.\n" +
  "7. Boundaries are time-bound. The Hawaii Statewide GIS AdminBnd MapServer (`https://geodata.hawaii.gov/arcgis/rest/services/AdminBnd/MapServer`) publishes each reapportionment plan as a separate layer: " +
  "2022 plan (current): House 33, Senate 34, Congress 32; 2012 plan (used until 2022): House 6 (`hdist`), Senate 9 (`sdist`), Congress 3 (`usdist`); 2001 plan: 5, 8, 2; 1991 plan: 4, 7, 1 (field `district`). " +
  "Match the plan to the data year: 2022 plan with 2020 Census tracts; 2012 plan with 2010 Census tracts and data published 2012-2021. " +
  "County council districts (Honolulu 11, Maui 35, Hawaii County 10) are 2021-2022 boundaries; school complex areas (layer 16) date from June 2017 and may be outdated. " +
  "Only the 2022 plan and current layers are in the Datatrove catalog, so older plans cannot be passed to `cite_sources`; cite their ArcGIS URL in the answer text instead. Always state the boundary plan/date used.\n" +
  "8. Exact field names (use these instead of guessing; there is no `shape_area` or `name` field). AdminBnd: House 33 `house_id`, `house_name`, `county` (values like 'OAHU', 'MAUI', 'HAWAII', 'KAUAI'); Senate 34 `senate_id`, `senate_name`, `county`; Congress 32 `us_house_id`, `us_house_name`; " +
  "School complex 16 `complex_area`; Honolulu council 11 `distnumber`, `distname`; Maui council 35 `districtnumber`, `district`, `councilmember`; Hawaii County council 10 `shortname`, `distname`. " +
  "Census MapServer (`https://geodata.hawaii.gov/arcgis/rest/services/Census/MapServer`): 2020 tracts 31 `geoid20`, `name20`, `county` (values like 'Honolulu'), `pop20`; 2020 block groups 26 `geoid20`, `pop20`; 2020 ZIP Code Tabulation Areas 32 `zcta5ce20`, `pop20`; " +
  "2020 Census Designated Places 28 `geoid20`, `name20`, `pop20` (use this layer for town names such as Kailua; some names exist on more than one island, so check the location); 2010 tracts 21.\n" +
  "9. `overlay` keeps columns from both layers and renames duplicates with `_1`/`_2` suffixes (e.g. `county_1`, `county_2`); `gpd.sjoin` renames them with `_left`/`_right`. Select only the columns you need from each layer before joining.\n\n" +
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
    cite_sources: citeSources,
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
          saveStreamDeltas: {
            chunking: "word",
            sendSources: true,
          },
        }
      );

      // If all turns were consumed by tools and no text was produced, force synthesis using generateText
      let fullText = "";
      try {
        fullText = await result.text;
      } catch (err: any) {
        // If aborted or failed mid-stream, result.text will reject
        console.log("Stream text aborted or finished with error:", err?.message || err);
        return;
      }

      // Safeguard: verify stream was not aborted before running fallback synthesis
      const abortedStreams = await listStreams(ctx, components.agent, {
        threadId: args.threadId,
        includeStatuses: ["aborted"],
      });
      if (abortedStreams.length > 0) {
        console.log("Stream was aborted; skipping fallback synthesis.");
        return;
      }

      // Safeguard: verify conversation is still marked as thinking
      if (args.conversationId) {
        const conv = await ctx.runQuery(api.conversations.get, { id: args.conversationId });
        if (!conv || conv.thinking === false) {
          console.log("Conversation thinking was halted; skipping fallback synthesis.");
          return;
        }
      }

      if (!fullText || fullText.trim().length === 0) {
        const uiMessages = await listUIMessages(ctx, components.agent, {
          threadId: args.threadId,
          paginationOpts: { numItems: 50, cursor: null },
        });

        const assistantMsg = uiMessages.page.find((m: any) => m.role === "assistant");
        const userMsg = uiMessages.page.find((m: any) => m.role === "user");

        const toolOutputs: string[] = [];
        const fallbackSources: Array<{
          sourceType: "url";
          id: string;
          url: string;
          title?: string;
        }> = [];
        const seenUrls = new Set<string>();

        for (const rawPart of assistantMsg?.parts || []) {
          const p = rawPart as any;
          if (p.type?.startsWith("tool-") || p.toolName) {
            const name = p.toolName || p.type?.replace("tool-", "");
            const stdout = p.output?.stdout || (p.output ? JSON.stringify(p.output) : "");
            if (stdout) {
              toolOutputs.push(`### Data from ${name}:\n${stdout.slice(0, 1000)}`);
            }

            // Extract official dataset URLs from tool results
            if (p.type === "tool-cite_sources" || p.toolName === "cite_sources") {
              const citedList = Array.isArray(p.output?.sources) ? p.output.sources : [];
              for (const c of citedList) {
                const url = c?.url || c?.direct_download_url;
                if (url && typeof url === "string" && !seenUrls.has(url)) {
                  seenUrls.add(url);
                  fallbackSources.push({
                    sourceType: "url",
                    id: url,
                    url,
                    title: c.title,
                  });
                }
              }
            } else {
              const results = Array.isArray(p.output?.results)
                ? p.output.results
                : p.output?.source_url
                ? [p.output]
                : [];
              for (const r of results) {
                const url = r?.source_url || r?.direct_download_url;
                if (url && typeof url === "string" && !seenUrls.has(url)) {
                  seenUrls.add(url);
                  fallbackSources.push({
                    sourceType: "url",
                    id: url,
                    url,
                    title: r.title || r.name,
                  });
                }
              }
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
            ...(fallbackSources.length > 0 ? { metadata: { sources: fallbackSources } } : {}),
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
