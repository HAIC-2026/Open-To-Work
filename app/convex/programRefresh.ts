"use node";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { v } from "convex/values";
import { extractText, getDocumentProxy } from "unpdf";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { PROGRAM_CAPTURES } from "./programCaptures";
import { PROGRAM_SOURCES, type ProgramSource } from "./programSources";

/**
 * Builds the program inventory's summaries (Node.js runtime: PDF text
 * extraction needs it).
 *
 *   npx convex run programRefresh:refresh                     all programs
 *   npx convex run programRefresh:refresh '{"slug":"snap"}'   one program
 *   add "force": true to re-summarize even if the sources did not change
 *
 * Each program's official pages (programSources.ts; saved copies in
 * programCaptures.ts for sites that block automated requests) are fetched and
 * stored as plain text, and the model condenses them into a short summary.
 * Every number in a new summary must appear in the source text, or the summary
 * is rejected and the program is marked for review. The model is called again
 * only when a program's source text changes.
 */

const MAX_CHARS_PER_SOURCE = 25_000;
const FETCH_TIMEOUT_MS = 30_000;
/** Summaries longer than this are sent back once to be shortened. */
const MAX_SUMMARY_WORDS = 350;
const USER_AGENT = "Mozilla/5.0 (compatible; MohalaProgramRefresh/1.0)";

// ─── Source text ─────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  okina: "ʻ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Readable text of an HTML page's main content (navigation, scripts and footers removed). */
export function htmlToText(html: string): string {
  const pick = (tag: string) => new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(html)?.[1];
  let body = pick("main") ?? pick("article") ?? pick("body") ?? html;
  body = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe|button)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|table|ul|ol|dt|dd|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line, i, all) => line.length > 0 && line !== all[i - 1])
    .join("\n");
}

async function pdfToText(bytes: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

type SourceResult = {
  n: number;
  url: string;
  via: "fetch" | "capture";
  ok: boolean;
  status?: number;
  capturedAt?: string;
  text: string;
};

async function getSourceText(url: string, n: number): Promise<SourceResult> {
  let status: number | undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    clearTimeout(timer);
    status = res.status;
    if (res.ok) {
      const isPdf = /pdf/i.test(res.headers.get("content-type") ?? "") || /\.pdf($|\?)/i.test(url);
      const text = isPdf ? await pdfToText(await res.arrayBuffer()) : htmlToText(await res.text());
      // A near-empty page is usually a script-rendered shell; prefer a saved copy if there is one.
      if (text.length >= 200 || !PROGRAM_CAPTURES[url]) {
        return { n, url, via: "fetch", ok: text.length > 0, status, text: text.slice(0, MAX_CHARS_PER_SOURCE) };
      }
    }
  } catch {
    // Network error or timeout: fall through to the saved copy.
  }
  const capture = PROGRAM_CAPTURES[url];
  if (capture) {
    return { n, url, via: "capture", ok: true, status, capturedAt: capture.capturedAt, text: capture.text };
  }
  return { n, url, via: "fetch", ok: false, status, text: "" };
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Number check ────────────────────────────────────────────────────────────

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Numbers written as words in the source ("sixty-five", "nineteen"), as digits. */
function spelledNumbers(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b(${TENS.slice(2).join("|")})(?:[- ](${ONES.slice(1, 10).join("|")}))?\\b|\\b(${ONES.join("|")})\\b`, "gi");
  for (const m of text.matchAll(re)) {
    if (m[3]) out.push(String(ONES.indexOf(m[3].toLowerCase())));
    else out.push(String(TENS.indexOf(m[1].toLowerCase()) * 10 + (m[2] ? ONES.indexOf(m[2].toLowerCase()) : 0)));
  }
  return out;
}

function numbersIn(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, "").replace(/\.0+$/, ""));
}

/** Numbers in the summary (ignoring URLs and [n] markers) that never appear in the source text. */
export function unmatchedNumbers(summary: string, sourceText: string): string[] {
  const known = new Set([...numbersIn(sourceText), ...spelledNumbers(sourceText)]);
  const cleaned = summary.replace(/https?:\/\/\S+/g, " ").replace(/\[\d+(?:\s*,\s*\d+)*\]/g, " ");
  return [...new Set(numbersIn(cleaned).filter((n) => !known.has(n)))];
}

// ─── Summarizing ─────────────────────────────────────────────────────────────

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

const SUMMARY_INSTRUCTIONS =
  "You condense official government program pages into a short reference brief that an AI assistant for Hawaiʻi state legislators will read before recommending the program. " +
  "Use ONLY the source text provided. Never add facts from general knowledge, and never guess.\n\n" +
  "Write 150–300 words of plain text with these labeled parts, each a few short sentences or bullets:\n" +
  "What it provides:\nWho qualifies:\nIncome and asset limits:\nOther requirements:\nHow to apply:\nWhere and who administers it:\n\n" +
  "Rules:\n" +
  "- End every sentence or bullet with the number of the source it came from, e.g. [1] or [1, 2]. Markers are only source numbers. Facts taken from the program details above the sources (name, agency, links) and \"Not stated in the sources.\" lines get no marker.\n" +
  "- Copy every number exactly as the source writes it, with its unit and the effective date or tax year the source gives. If the source spells a number in words, keep the words. Do not calculate new numbers.\n" +
  "- Stay under 250 words.\n" +
  "- When the sources give figures for several years or effective dates, give only the most recent one, and label it in the source's own words (e.g. \"effective 10/1/2026\", \"2026 income limits\"); call something a tax year only if the source does.\n" +
  "- For tables by household size or number of children, give only the smallest and largest categories (e.g. household of 1 and of 8, or no children and three or more) and say the full table is on the source page. When a table has several income tiers, give only the tier the program uses for eligibility, or say the tiers are on the source page.\n" +
  "- If a part is not covered by the sources, write \"Not stated in the sources.\"\n" +
  "- Note waitlist status, application windows, and upcoming rule changes with their dates when the sources mention them.\n" +
  "- When the sources name local offices or agencies by island or county, list each one BY NAME with the island or county it serves under \"Where and who administers it\" (e.g. \"Oʻahu: <agency name>\"); this list matters more than other details when shortening. If the sources do not name them, say local administrators are not named in the sources.\n" +
  "- No markdown headings, no introduction, no closing remarks.";

async function summarize(program: ProgramSource, sources: SourceResult[]): Promise<string> {
  const prompt =
    `Program: ${program.name}\nAdministering agency: ${program.agency}\nOfficial page: ${program.officialUrl}\n` +
    (program.applyUrl ? `Apply: ${program.applyUrl}\n` : "") +
    "\nSOURCES:\n\n" +
    sources
      .filter((s) => s.ok)
      .map((s) => `[${s.n}] ${s.url}${s.capturedAt ? ` (saved copy from ${s.capturedAt})` : ""}\n${s.text}`)
      .join("\n\n---\n\n");
  const model = google(process.env.GEMINI_MODEL!);
  const first = (await generateText({ model, instructions: SUMMARY_INSTRUCTIONS, prompt })).text.trim();
  const words = wordCount(first);
  if (words <= MAX_SUMMARY_WORDS) return cleanMarkers(first);
  // Too long: ask once for a shorter version of the same summary.
  const { text } = await generateText({
    model,
    instructions: SUMMARY_INSTRUCTIONS,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: first },
      {
        role: "user",
        content: `That is ${words} words. Rewrite it in under 250 words, following the same rules: keep the most important eligibility facts, the [n] markers, and every number exactly as written.`,
      },
    ],
  });
  return cleanMarkers(text.trim());
}

/** Drop bracketed labels that are not source numbers (e.g. "[Admin. Agency]"); keep [1] and [1, 2]. */
export function cleanMarkers(text: string): string {
  return text.replace(/ ?\[(?![\d,\s]+\])[^\]\n]*\]/g, "");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ─── Refresh ─────────────────────────────────────────────────────────────────

type RefreshResult = {
  slug: string;
  outcome: "unchanged" | "summarized" | "needs_review" | "fetch_failed";
  unmatched?: string[];
  failedSources?: string[];
};

/** Refresh every program (each in its own scheduled action), or one with `slug`. */
export const refresh = internalAction({
  args: { slug: v.optional(v.string()), force: v.optional(v.boolean()) },
  handler: async (ctx, { slug, force }): Promise<{ scheduled: string[]; removed: number }> => {
    const slugs = slug ? [slug] : PROGRAM_SOURCES.map((p) => p.slug);
    const unknown = slugs.filter((s) => !PROGRAM_SOURCES.some((p) => p.slug === s));
    if (unknown.length > 0) throw new Error(`Unknown program slug(s): ${unknown.join(", ")}`);
    for (const s of slugs) await ctx.scheduler.runAfter(0, internal.programRefresh.refreshOne, { slug: s, force });
    const removed: number = slug
      ? 0
      : await ctx.runMutation(internal.programs.pruneRemoved, { keep: PROGRAM_SOURCES.map((p) => p.slug) });
    return { scheduled: slugs, removed };
  },
});

export const refreshOne = internalAction({
  args: { slug: v.string(), force: v.optional(v.boolean()) },
  handler: async (ctx, { slug, force }): Promise<RefreshResult> => {
    const program = PROGRAM_SOURCES.find((p) => p.slug === slug);
    if (!program) throw new Error(`Unknown program slug: ${slug}`);

    const results = await Promise.all(program.sources.map((url, i) => getSourceText(url, i + 1)));
    const failedSources = results.filter((r) => !r.ok).map((r) => `${r.url}${r.status ? ` (HTTP ${r.status})` : ""}`);
    const pageText = results
      .filter((r) => r.ok)
      .map((r) => `[${r.n}] ${r.url}${r.capturedAt ? ` (saved copy from ${r.capturedAt})` : ""}\n${r.text}`)
      .join("\n\n");
    const textHash = await sha256(pageText);
    const sources = results.map((r) => ({
      n: r.n,
      url: r.url,
      via: r.via,
      ok: r.ok,
      status: r.status,
      capturedAt: r.capturedAt,
    }));
    const existing: Doc<"programs"> | null = await ctx.runQuery(internal.programs.getBySlug, { slug });
    const base = {
      slug,
      name: program.name,
      agency: program.agency,
      officialUrl: program.officialUrl,
      applyUrl: program.applyUrl,
      keywords: program.keywords,
      fetchedAt: Date.now(),
    };

    if (!pageText) {
      // Nothing could be read: keep the previous text and summary.
      await ctx.runMutation(internal.programs.save, {
        ...base,
        sources,
        pageText: existing?.pageText ?? "",
        textHash: existing?.textHash ?? textHash,
        summary: existing?.summary,
        summarizedAt: existing?.summarizedAt,
        status: "fetch_failed",
        reviewNote: `No source could be read: ${failedSources.join("; ")}`,
      });
      return { slug, outcome: "fetch_failed", failedSources };
    }

    const sourceNote = failedSources.length > 0 ? `Some sources could not be read: ${failedSources.join("; ")}` : undefined;

    if (!force && existing?.summary && existing.status === "ok" && existing.textHash === textHash) {
      await ctx.runMutation(internal.programs.save, {
        ...base,
        sources,
        pageText,
        textHash,
        summary: existing.summary,
        summarizedAt: existing.summarizedAt,
        status: "ok",
        reviewNote: sourceNote,
      });
      return { slug, outcome: "unchanged", failedSources };
    }

    const summary = await summarize(program, results);
    const unmatched = unmatchedNumbers(summary, pageText);

    if (unmatched.length > 0) {
      // Reject the new summary; keep the previous one (if any) for the agent.
      await ctx.runMutation(internal.programs.save, {
        ...base,
        sources,
        pageText,
        textHash,
        summary: existing?.summary,
        summarizedAt: existing?.summarizedAt,
        status: "needs_review",
        reviewNote:
          `A new summary was rejected: these numbers do not appear in the source text: ${unmatched.join(", ")}. ` +
          `Rejected summary: ${summary}`,
      });
      return { slug, outcome: "needs_review", unmatched, failedSources };
    }

    await ctx.runMutation(internal.programs.save, {
      ...base,
      sources,
      pageText,
      textHash,
      summary,
      summarizedAt: Date.now(),
      status: "ok",
      reviewNote: sourceNote,
    });
    return { slug, outcome: "summarized", failedSources };
  },
});
