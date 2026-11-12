import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import {
  censusTableUrl,
  fetchCensusTableMeta,
  fetchStcYears,
  parseCensusCitationId,
  parseStcCitationId,
  stcCoverage,
  stcTableUrl,
  stcTitle,
  surveyLabel,
} from "./census";

const API_URL = (process.env.DATATROVE_API_URL as string).replace(/\/+$/, "");

/**
 * 1. Search Hawaii Datasets Tool
 * Queries Datatrove's public catalog for datasets matching natural language inquiries.
 * Strictly scoped to the State of Hawaii (US-HI).
 */
export const searchDatasets = createTool({
  description:
    "Search the official Datatrove public catalog for State of Hawaii and county datasets (DBEDT, Honolulu DPP, UHERO, HECO, PUC, DOH, DOTAX, DLIR, etc.). Returns dataset cards with direct download URLs, coverage years, join keys, and use cases.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Natural-language search query for Hawaii public data, e.g. 'affordable housing deficit' or 'solar energy generation'"
      ),
    source: z
      .string()
      .optional()
      .describe(
        "Restrict to a specific Hawaii agency source ID (e.g. 'honolulu_dpp', 'dbedt_warehouse', 'uhero', 'heco', 'databook')"
      ),
    minYear: z
      .number()
      .optional()
      .describe("Only datasets whose coverage reaches this year or later (e.g. 2020)"),
    freshnessMin: z
      .number()
      .optional()
      .describe("Minimum freshness score from 0 to 100"),
    topK: z
      .number()
      .optional()
      .describe("Maximum number of results to return (default 5, max 15)"),
  }),
  execute: async (_ctx, args, options?: any) => {
    try {
      const params = new URLSearchParams({
        q: args.query,
        state: "US-HI",
        top_k: String(Math.min(args.topK || 5, 15)),
      });
      if (args.source) params.set("source", args.source);
      if (args.minYear) params.set("min_year", String(args.minYear));
      if (args.freshnessMin != null) params.set("freshness_min", String(args.freshnessMin));

      const res = await fetch(`${API_URL}/api/search?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "X-Dt-State": "US-HI",
        },
        signal: options?.abortSignal,
      });

      if (!res.ok) {
        return {
          error: `Datatrove search failed with HTTP status ${res.status}`,
          results: [],
        };
      }

      const data = await res.json();
      const results = (data.results || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        organization: d.organization,
        source: d.source,
        source_url: d.source_url,
        direct_download_url: d.direct_download_url,
        formats: d.formats || [],
        start_year: d.start_year,
        end_year: d.end_year,
        geographic_granularity: d.geographic_granularity,
        temporal_granularity: d.temporal_granularity,
        freshness_score: d.freshness_score,
        use_cases: d.use_cases || [],
        join_keys: d.join_keys || [],
      }));

      return {
        query: args.query,
        state: "US-HI",
        count: results.length,
        results,
      };
    } catch (err: any) {
      return {
        error: `Error connecting to Datatrove: ${err?.message || String(err)}`,
        results: [],
      };
    }
  },
});

/**
 * 2. Get Hawaii Dataset Details & Schema Tool
 * Inspects column fields, data types, sample values, join keys, and data limitations.
 */
export const getDatasetDetails = createTool({
  description:
    "Retrieve deep metadata and schema for a specific Hawaii dataset ID. Returns exact column names, data types, sample values, AI combinability notes, and data limitations/biases.",
  inputSchema: z.object({
    datasetId: z
      .string()
      .describe(
        "The unique dataset ID from search_datasets (e.g. 'honolulu_dpp__housing_unit_shortage')"
      ),
    includeFields: z
      .boolean()
      .optional()
      .describe("Whether to include the full column fields list (default true)"),
  }),
  execute: async (_ctx, args, options?: any) => {
    try {
      const res = await fetch(`${API_URL}/api/dataset/${encodeURIComponent(args.datasetId)}`, {
        headers: {
          Accept: "application/json",
          "X-Dt-State": "US-HI",
        },
        signal: options?.abortSignal,
      });

      if (!res.ok) {
        return {
          error: `Dataset '${args.datasetId}' not found or request failed with HTTP ${res.status}`,
        };
      }

      const d = await res.json();
      const fields = (args.includeFields !== false && Array.isArray(d.fields))
        ? d.fields.map((f: any) => ({
            name: f.name,
            type: f.type,
            sample_value: f.sample_value,
            description: f.description,
          }))
        : undefined;

      return {
        id: d.id,
        title: d.title,
        description: d.description,
        organization: d.organization,
        source: d.source,
        source_url: d.source_url,
        direct_download_url: d.direct_download_url,
        formats: d.formats || [],
        start_year: d.start_year,
        end_year: d.end_year,
        update_frequency: d.update_frequency,
        geographic_granularity: d.geographic_granularity,
        ai_use_cases: d.ai_use_cases || [],
        ai_join_keys: d.ai_join_keys || [],
        ai_combinability_notes: d.ai_combinability_notes,
        ai_limitations: d.ai_limitations,
        ai_related_datasets: d.ai_related_datasets || [],
        fields,
      };
    } catch (err: any) {
      return {
        error: `Failed to fetch dataset details: ${err?.message || String(err)}`,
      };
    }
  },
});

/**
 * 3. Explore Hawaii Data Sources Tool
 * Allows browsing all 79 state and local agencies or listing all datasets from a specific department.
 */
export const exploreDataSources = createTool({
  description:
    "Explore the 79 official State of Hawaii, county, and federal publishing agencies in Datatrove, or list all datasets published by a specific department.",
  inputSchema: z.object({
    action: z
      .enum(["list_all_sources", "get_source_datasets"])
      .describe(
        "Action to take: 'list_all_sources' to see all 79 publishers with dataset counts and years, or 'get_source_datasets' to inspect a specific agency's full inventory"
      ),
    sourceId: z
      .string()
      .optional()
      .describe(
        "Agency identifier (required if action is 'get_source_datasets', e.g. 'honolulu_dpp', 'heco', 'dbedt_warehouse', 'uhero')"
      ),
  }),
  execute: async (_ctx, args, options?: any) => {
    try {
      if (args.action === "list_all_sources") {
        const res = await fetch(`${API_URL}/api/sources?state=US-HI`, {
          headers: {
            Accept: "application/json",
            "X-Dt-State": "US-HI",
          },
          signal: options?.abortSignal,
        });
        if (!res.ok) return { error: `Failed to fetch sources: HTTP ${res.status}` };
        const data = await res.json();
        const sources = (data.sources || []).map((s: any) => ({
          source: s.source,
          dataset_count: s.dataset_count,
          field_count: s.field_count,
          coverage_years: `${s.earliest_year}-${s.latest_year}`,
          last_updated: s.last_updated,
        }));
        return {
          state: "US-HI",
          total_sources: sources.length,
          sources,
        };
      }

      if (args.action === "get_source_datasets") {
        if (!args.sourceId) {
          return { error: "sourceId is required when action is 'get_source_datasets'" };
        }
        const res = await fetch(
          `${API_URL}/api/sources/${encodeURIComponent(args.sourceId)}?state=US-HI`,
          {
            headers: {
              Accept: "application/json",
              "X-Dt-State": "US-HI",
            },
            signal: options?.abortSignal,
          }
        );
        if (!res.ok) {
          return { error: `Failed to fetch source '${args.sourceId}': HTTP ${res.status}` };
        }
        const data = await res.json();
        const datasets = (data.datasets || []).map((d: any) => ({
          id: d.id,
          title: d.title,
          description: d.description,
          source_url: d.source_url,
          formats: d.formats || [],
          start_year: d.start_year,
          end_year: d.end_year,
          freshness_score: d.freshness_score,
        }));
        return {
          source: args.sourceId,
          state: "US-HI",
          stats: data.stats,
          dataset_count: datasets.length,
          datasets,
        };
      }

      return { error: "Invalid action" };
    } catch (err: any) {
      return {
        error: `Failed to explore data sources: ${err?.message || String(err)}`,
      };
    }
  },
});

/**
 * 4. Cite Hawaii Data Sources Tool
 * Allows the agent to explicitly declare and register the exact sources and datasets
 * that directly substantiated the facts, numbers, or tables in its response.
 * Strictly requires the unique dataset 'id' from search_datasets and verifies it
 * against Datatrove, preventing hallucinated external links or Wikipedia citations.
 */
export const citeSources = createTool({
  description:
    "Call this BEFORE writing your final answer to register the exact Hawaii datasets from your previous search_datasets results that supplied facts, calculations, or tables. You MUST provide the exact dataset 'id' returned by search_datasets (e.g. 'databook-21.20', 'dbedt_warehouse-construction-and-housing-home-sales-and-prices-board-of-realtors-data', or 'geo_hi__adminbnd__hawaii-state-house-districts-2022'), or the exact `citationId` returned by get_census_table (e.g. 'census:acs1:2025:B19013') or get_state_tax_collections (e.g. 'census:stc:2016-2025'). You CANNOT invent external URLs, Wikipedia links, or cite datasets that were not returned by those tools. " +
    "Returns the verified sources numbered 1..n in the order you listed them; in the answer, put the matching marker (e.g. [1] or [1, 2]) right after every figure taken from that source.",
  inputSchema: z.object({
    sources: z
      .array(
        z.object({
          datasetId: z
            .string()
            .describe(
              "The exact unique dataset 'id' from search_datasets (e.g. 'databook-21.20', 'databook-13.26', 'geo_hi__adminbnd__hawaii-state-house-districts-2022'), or the `citationId` from get_census_table (e.g. 'census:acs1:2025:B19013') or get_state_tax_collections (e.g. 'census:stc:2016-2025'). Do NOT invent fake IDs or cite Wikipedia."
            ),
          reason: z
            .string()
            .describe(
              "Brief 1-sentence note of what specific metric, calculation, or fact this dataset supplied"
            ),
          year: z
            .string()
            .describe(
              "Data year or vintage of the figures used, e.g. '2020–2024 ACS 5-year', '2025', 'FY2024', or '2022 plan' for boundaries"
            ),
          geography: z
            .string()
            .describe(
              "Geography the figures describe, e.g. 'State House District 49', 'Honolulu County', 'State of Hawaiʻi', or 'Census tracts in House District 49'"
            ),
          apportioned: z
            .boolean()
            .describe(
              "true if the figures were estimated or apportioned to the district from other geographies (tracts, ZIP codes, county); false if published directly for that geography"
            ),
          apportionmentMethod: z
            .string()
            .optional()
            .describe(
              "When apportioned is true: how, e.g. 'area-weighted from 2020 Census tracts' or 'whole tracts with ≥50% of area in the district'"
            ),
        })
      )
      .describe(
        "List of official Hawaii datasets that directly supplied data points or tables in the final answer."
      ),
  }),
  execute: async (_ctx, args, options?: any) => {
    // Keyed by input position so numbering follows the order the agent listed
    // them in, not the order the verification requests happen to finish.
    const verifiedByIndex = new Map<number, { title?: string } & Record<string, unknown>>();
    const rejectedSources: any[] = [];

    await Promise.all(
      args.sources.map(async (s, index) => {
        const cleanId = (s.datasetId || "").trim();
        if (!cleanId) return;

        // State tax collections from get_state_tax_collections: verified against
        // the years the Census dataset's own metadata says it covers.
        if (/^census:stc:/i.test(cleanId)) {
          const parsed = parseStcCitationId(cleanId);
          const range = parsed ? await fetchStcYears(options?.abortSignal) : null;
          if (!parsed || !range || parsed.startYear < range.first || parsed.endYear > range.last) {
            rejectedSources.push({
              datasetId: cleanId,
              error: `'${cleanId}' is not a citationId returned by get_state_tax_collections (expected e.g. 'census:stc:2025' or 'census:stc:2016-2025').`,
            });
            return;
          }
          verifiedByIndex.set(index, {
            id: cleanId,
            datasetId: cleanId,
            title: stcTitle(parsed),
            organization: "U.S. Census Bureau",
            source: "census_api",
            url: stcTableUrl(parsed),
            reason: s.reason,
            year: s.year,
            geography: s.geography,
            apportioned: s.apportioned,
            apportionmentMethod: s.apportioned ? s.apportionmentMethod : undefined,
            coverage: stcCoverage(parsed),
          });
          return;
        }

        // Census Data API tables from get_census_table: verified against the
        // API's own table metadata instead of the Datatrove catalog.
        if (cleanId.startsWith("census:")) {
          const parsed = parseCensusCitationId(cleanId);
          const meta = parsed
            ? await fetchCensusTableMeta(parsed.survey, parsed.year, parsed.table, options?.abortSignal)
            : null;
          if (!parsed || !meta) {
            rejectedSources.push({
              datasetId: cleanId,
              error: `'${cleanId}' is not a Census table returned by get_census_table (expected e.g. 'census:acs1:2025:B19013').`,
            });
            return;
          }
          const vintage = surveyLabel(parsed.survey, parsed.year);
          verifiedByIndex.set(index, {
            id: cleanId,
            datasetId: cleanId,
            title: `${meta.title} (${vintage}, table ${parsed.table})`,
            organization: "U.S. Census Bureau",
            source: "census_api",
            url: censusTableUrl(parsed.survey, parsed.year, parsed.table),
            reason: s.reason,
            year: s.year,
            geography: s.geography,
            apportioned: s.apportioned,
            apportionmentMethod: s.apportioned ? s.apportionmentMethod : undefined,
            coverage: vintage,
          });
          return;
        }

        try {
          const res = await fetch(`${API_URL}/api/dataset/${encodeURIComponent(cleanId)}`, {
            headers: {
              Accept: "application/json",
              "X-Dt-State": "US-HI",
            },
            signal: options?.abortSignal,
          });

          if (!res.ok) {
            rejectedSources.push({
              datasetId: cleanId,
              error: `Dataset ID '${cleanId}' was not found in the official State of Hawaii public catalog.`,
            });
            return;
          }

          const d = await res.json();
          verifiedByIndex.set(index, {
            id: d.id,
            datasetId: d.id,
            title: d.title,
            organization: d.organization,
            source: d.source,
            url: d.source_url || d.direct_download_url || `https://api.datatrove.ai/api/dataset/${d.id}`,
            direct_download_url: d.direct_download_url,
            reason: s.reason,
            year: s.year,
            geography: s.geography,
            apportioned: s.apportioned,
            apportionmentMethod: s.apportioned ? s.apportionmentMethod : undefined,
            coverage:
              d.start_year && d.end_year
                ? `${d.start_year}–${d.end_year}`
                : d.end_year
                ? String(d.end_year)
                : undefined,
          });
        } catch (err: any) {
          rejectedSources.push({
            datasetId: cleanId,
            error: `Failed to verify dataset '${cleanId}': ${err?.message || String(err)}`,
          });
        }
      })
    );

    const verifiedSources = [...verifiedByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, source], i) => ({ number: i + 1, ...source }));

    return {
      success: verifiedSources.length > 0,
      count: verifiedSources.length,
      sources: verifiedSources,
      citationGuide: verifiedSources.map((v) => `[${v.number}] ${v.title}`).join("; "),
      rejected: rejectedSources.length > 0 ? rejectedSources : undefined,
    };
  },
});
