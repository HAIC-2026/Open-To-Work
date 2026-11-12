import { createTool } from "@convex-dev/agent";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Public program inventory: the only programs the agent may recommend.
 * Summaries are built by programRefresh.ts from the official pages listed in
 * programSources.ts (`npx convex run programRefresh:refresh`); this file holds
 * the table access, a status report, and the agent's search_programs tool.
 */

const MAX_PROGRAMS = 200;
/**
 * Flag a program as possibly out of date when its sources were last checked,
 * or a saved page copy was made, longer ago than this. The refresh runs yearly
 * (crons.ts), so this allows a year plus a margin.
 */
const STALE_AFTER_DAYS = 400;

// ─── Storage ─────────────────────────────────────────────────────────────────

const sourceValidator = v.object({
  n: v.number(),
  url: v.string(),
  via: v.union(v.literal("fetch"), v.literal("capture")),
  ok: v.boolean(),
  status: v.optional(v.number()),
  capturedAt: v.optional(v.string()),
});

export const getBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<Doc<"programs"> | null> =>
    ctx.db
      .query("programs")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique(),
});

export const listAll = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"programs">[]> => ctx.db.query("programs").take(MAX_PROGRAMS),
});

export const searchByText = internalQuery({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<Doc<"programs">[]> =>
    ctx.db
      .query("programs")
      .withSearchIndex("search_text", (q) => q.search("searchText", query))
      .take(20),
});

/** Insert or update one program after a refresh. */
export const save = internalMutation({
  args: {
    slug: v.string(),
    name: v.string(),
    agency: v.string(),
    officialUrl: v.string(),
    applyUrl: v.optional(v.string()),
    keywords: v.string(),
    sources: v.array(sourceValidator),
    pageText: v.string(),
    textHash: v.string(),
    fetchedAt: v.number(),
    summary: v.optional(v.string()),
    summarizedAt: v.optional(v.number()),
    status: v.union(v.literal("ok"), v.literal("needs_review"), v.literal("fetch_failed")),
    reviewNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const searchText = [args.name, args.agency, args.keywords, args.summary ?? ""].join(" ");
    const existing = await ctx.db
      .query("programs")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) await ctx.db.replace(existing._id, { ...args, searchText });
    else await ctx.db.insert("programs", { ...args, searchText });
    return null;
  },
});

/** Remove programs that are no longer in programSources.ts. */
export const pruneRemoved = internalMutation({
  args: { keep: v.array(v.string()) },
  returns: v.number(),
  handler: async (ctx, { keep }) => {
    let removed = 0;
    for (const doc of await ctx.db.query("programs").take(MAX_PROGRAMS)) {
      if (!keep.includes(doc.slug)) {
        await ctx.db.delete(doc._id);
        removed++;
      }
    }
    return removed;
  },
});

/** Status of every program, for checking a refresh: `npx convex run programs:report`. */
export const report = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("programs").take(MAX_PROGRAMS)).map((p) => ({
      slug: p.slug,
      status: p.status,
      summaryWords: p.summary ? p.summary.split(/\s+/).length : 0,
      summarizedAt: p.summarizedAt ? new Date(p.summarizedAt).toISOString() : null,
      sources: p.sources.map((s) => `${s.ok ? "ok" : "FAILED"} ${s.via}${s.status ? ` ${s.status}` : ""} ${s.url}`),
      reviewNote: p.reviewNote,
    })),
});

// ─── Agent tool ──────────────────────────────────────────────────────────────

function staleNote(p: Doc<"programs">, now: number): string | undefined {
  const days = (ms: number) => (now - ms) / 86_400_000;
  const notes: string[] = [];
  if (p.status === "needs_review") notes.push("The latest refresh found possible changes that have not been reviewed yet.");
  if (p.status === "fetch_failed") notes.push("The official pages could not be read at the last refresh.");
  // fetchedAt moves forward at every refresh, even when the pages are unchanged
  // and the summary is kept, so it measures when the sources were last checked.
  if (days(p.fetchedAt) > STALE_AFTER_DAYS) {
    notes.push(`The official pages were last checked more than ${STALE_AFTER_DAYS} days ago.`);
  }
  for (const s of p.sources) {
    if (s.capturedAt && days(Date.parse(`${s.capturedAt}T00:00:00Z`)) > STALE_AFTER_DAYS) {
      notes.push(`Source [${s.n}] is a saved copy from ${s.capturedAt}.`);
    }
  }
  return notes.length > 0 ? `${notes.join(" ")} Details may have changed; check the official page.` : undefined;
}

export const searchPrograms = createTool({
  description:
    "Look up this app's inventory of public programs serving Hawaiʻi residents (food, health coverage, cash assistance, housing, energy, child care, aging services, tax credits). " +
    "Each entry has a short summary condensed from the administering agency's official pages and a `citationId` (e.g. 'program:snap') to pass to cite_sources. " +
    "These are the ONLY programs you may recommend. Call with no query to get the whole inventory (about 15 programs), or with a query (e.g. 'rent', 'kūpuna', 'electric bill') to get the closest matches.",
  inputSchema: z.object({
    query: z.string().optional().describe("Free-text search over program names, keywords and summaries. Omit to list every program."),
  }),
  execute: async (ctx, args) => {
    const query = args.query?.trim();
    const found: Doc<"programs">[] = query
      ? await ctx.runQuery(internal.programs.searchByText, { query })
      : await ctx.runQuery(internal.programs.listAll, {});
    const programs = found.filter((p) => p.summary);

    if (programs.length === 0) {
      return {
        count: 0,
        programs: [],
        note: query
          ? "No programs in the inventory match. Try another word or call without a query to see all programs. Do not recommend programs that are not in this inventory."
          : "The program inventory is empty. Do not recommend programs from memory; say program information is not available.",
      };
    }

    const now = Date.now();
    return {
      count: programs.length,
      disclaimer:
        "Program information is informational only. Final eligibility is always determined by the administering agency; link each program's official page.",
      programs: programs.map((p) => ({
        slug: p.slug,
        /** Pass to cite_sources to cite this program; its card links the official page. */
        citationId: `program:${p.slug}`,
        name: p.name,
        agency: p.agency,
        officialUrl: p.officialUrl,
        applyUrl: p.applyUrl,
        // Same cleanup as programRefresh.ts: drop bracketed labels that are not source numbers.
        summary: p.summary?.replace(/ ?\[(?![\d,\s]+\])[^\]\n]*\]/g, ""),
        sources: p.sources.filter((s) => s.ok).map((s) => ({ n: s.n, url: s.url, savedCopyFrom: s.capturedAt })),
        summarizedOn: p.summarizedAt ? new Date(p.summarizedAt).toISOString().slice(0, 10) : undefined,
        sourcesCheckedOn: new Date(p.fetchedAt).toISOString().slice(0, 10),
        caution: staleNote(p, now),
      })),
    };
  },
});
