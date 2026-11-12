import { createTool } from "@convex-dev/agent";
import { z } from "zod";

/**
 * Census Data API (api.census.gov) access for American Community Survey tables.
 *
 * Fallback for Census data the Datatrove catalog doesn't carry — chiefly ACS
 * 1-year estimates (e.g. 2025) for the state and counties. Per the Census Data
 * API User Guide: every data query needs `&key=`, a query may list at most 50
 * variables, and `group(TABLE)` returns a whole table. The key is read here on
 * the server and never returned to the model or passed to the sandbox.
 */

const API_BASE = "https://api.census.gov/data";
const HAWAII_FIPS = "15";

export type CensusSurvey = "acs1" | "acs5";

const GEOGRAPHIES = {
  state: { forKey: "state", inState: false },
  county: { forKey: "county", inState: true },
  house_district: { forKey: "state legislative district (lower chamber)", inState: true },
  senate_district: { forKey: "state legislative district (upper chamber)", inState: true },
} as const;

type Geography = keyof typeof GEOGRAPHIES;

/** Census annotation codes that appear in place of an estimate or MOE. */
const SPECIAL_VALUES: Record<string, string> = {
  "-666666666": "not available (too few sample observations or not applicable)",
  "-999999999": "cannot be displayed because the number of sample cases is too small",
  "-888888888": "not applicable or not available",
  "-222222222": "margin of error not appropriate (controlled estimate or too few observations)",
  "-333333333": "median falls in the lowest or highest interval (open-ended distribution)",
  "-555555555": "estimate is controlled; margin of error not appropriate",
};

/** Which API dataset path a table lives in, from its ID prefix. */
function tableDatasetPath(table: string): string | null {
  if (/^[BC]\d/.test(table)) return "";
  if (/^S\d/.test(table)) return "/subject";
  if (/^DP\d/.test(table)) return "/profile";
  if (/^CP\d/.test(table)) return "/cprofile";
  return null;
}

/** data.census.gov table ID prefix, e.g. ACSDT1Y2025.B19013. */
function dataCensusTableId(survey: CensusSurvey, year: number, table: string): string {
  const kind = table.startsWith("S")
    ? "ACSST"
    : table.startsWith("DP")
      ? "ACSDP"
      : table.startsWith("CP")
        ? "ACSCP"
        : "ACSDT";
  return `${kind}${survey === "acs1" ? "1Y" : "5Y"}${year}.${table}`;
}

export function surveyLabel(survey: CensusSurvey, year: number): string {
  return survey === "acs1" ? `${year} ACS 1-year` : `${year - 4}–${year} ACS 5-year`;
}

/** Citation ID handed to cite_sources, e.g. "census:acs1:2025:B19013". */
export function censusCitationId(survey: CensusSurvey, year: number, table: string): string {
  return `census:${survey}:${year}:${table}`;
}

export function parseCensusCitationId(
  id: string
): { survey: CensusSurvey; year: number; table: string } | null {
  const m = /^census:(acs1|acs5):(\d{4}):([A-Z]{1,2}\d+[A-Z]?)$/i.exec(id.trim());
  if (!m) return null;
  return { survey: m[1].toLowerCase() as CensusSurvey, year: Number(m[2]), table: m[3].toUpperCase() };
}

interface TableMeta {
  title: string;
  /** Estimate variables (…E) and their cleaned labels. */
  variables: Map<string, string>;
}

const metaCache = new Map<string, Promise<TableMeta | null>>();
const titleCache = new Map<string, Promise<Map<string, string>>>();

/**
 * Table titles for one dataset from its `groups.json` listing (e.g. S1701 →
 * "Poverty Status in the Past 12 Months"). Variable `concept` fields can't be
 * used for this: in subject tables they list many tables joined by ";".
 */
function fetchGroupTitles(datasetUrl: string, signal?: AbortSignal): Promise<Map<string, string>> {
  const cached = titleCache.get(datasetUrl);
  if (cached) return cached;
  const promise = fetch(`${datasetUrl}/groups.json`, { signal })
    .then((res) => (res.ok ? res.json() : { groups: [] }))
    .then((json: { groups?: Array<{ name?: string; description?: string }> }) => {
      const titles = new Map<string, string>();
      for (const g of json.groups ?? []) if (g.name && g.description) titles.set(g.name, g.description);
      return titles;
    })
    .catch(() => new Map<string, string>());
  titleCache.set(datasetUrl, promise);
  promise.then((t) => t.size === 0 && titleCache.delete(datasetUrl));
  return promise;
}

function cleanLabel(label: string): string {
  return label.replace(/^Estimate!!/, "").replace(/!!/g, " › ").replace(/:$/, "");
}

/**
 * Table title and variable labels from the API's groups metadata
 * (`/data/{year}/acs/{survey}[/subject|/profile]/groups/{table}.json`).
 * Returns null when the table or vintage doesn't exist (e.g. not yet released).
 */
export function fetchCensusTableMeta(
  survey: CensusSurvey,
  year: number,
  table: string,
  signal?: AbortSignal
): Promise<TableMeta | null> {
  const cacheKey = `${survey}:${year}:${table}`;
  const cached = metaCache.get(cacheKey);
  if (cached) return cached;

  const path = tableDatasetPath(table);
  if (path === null) return Promise.resolve(null);

  const promise = (async () => {
    const datasetUrl = `${API_BASE}/${year}/acs/${survey}${path}`;
    const [res, titles] = await Promise.all([
      fetch(`${datasetUrl}/groups/${table}.json`, { signal }),
      fetchGroupTitles(datasetUrl, signal),
    ]);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      variables?: Record<string, { label?: string; concept?: string }>;
    };
    const entries = Object.entries(json.variables ?? {});
    if (entries.length === 0) return null;
    const variables = new Map<string, string>();
    let concept = "";
    for (const [name, v] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      // Only estimate variables (e.g. B19013_001E), not NAME / GEO_ID.
      if (!/_\d+E$/.test(name) || !v.label) continue;
      variables.set(name.slice(0, -1), cleanLabel(v.label));
      if (!concept && v.concept) concept = v.concept;
    }
    const title = titles.get(table) || (concept && !concept.includes(";") ? concept : table);
    return { title, variables };
  })().catch(() => null);

  metaCache.set(cacheKey, promise);
  // Don't cache failures, so a transient error doesn't stick.
  promise.then((m) => m === null && metaCache.delete(cacheKey));
  return promise;
}

/** Human-facing link to the table on data.census.gov. */
export function censusTableUrl(survey: CensusSurvey, year: number, table: string): string {
  return `https://data.census.gov/table/${dataCensusTableId(survey, year, table)}`;
}

function parseValue(raw: string | null | undefined): { value: number | null; note?: string } {
  if (raw == null || raw === "") return { value: null, note: "no value published" };
  if (SPECIAL_VALUES[raw]) return { value: null, note: SPECIAL_VALUES[raw] };
  const n = Number(raw);
  return Number.isFinite(n) ? { value: n } : { value: null, note: `unrecognized value '${raw}'` };
}

function geographyPredicate(geography: Geography, ids: string[] | undefined): string {
  const { forKey, inState } = GEOGRAPHIES[geography];
  if (geography === "state") return `for=state:${HAWAII_FIPS}`;
  const codes =
    ids && ids.length > 0
      ? ids.map((id) => String(id).replace(/\D/g, "").padStart(3, "0")).join(",")
      : "*";
  return `for=${encodeURIComponent(forKey)}:${codes}${inState ? `&in=state:${HAWAII_FIPS}` : ""}`;
}

export const getCensusTable = createTool({
  description:
    "Fetch American Community Survey (ACS) estimates directly from the U.S. Census Bureau's official Census Data API for Hawaiʻi. " +
    "Use it for Census figures the Datatrove catalog does not have — especially ACS 1-year estimates (e.g. 2025) for the State of Hawaiʻi and its counties — or when a needed table/variable isn't in the catalog. " +
    "ACS 1-year is published only for areas with 65,000+ people (the state and Hawaiʻi, Honolulu, Kauaʻi and Maui counties), never for State House or Senate districts; district figures are 5-year only. " +
    "Call first WITHOUT `variables` to list the table's variables and labels (use `labelFilter` to narrow them), then call again with the variable IDs you need. " +
    "Returns estimates with margins of error (90% level), standard errors, CVs, plain-language notes for Census special codes, and a `citationId` to pass to cite_sources.",
  inputSchema: z.object({
    survey: z
      .enum(["acs1", "acs5"])
      .describe("'acs1' = 1-year estimates (state and counties only); 'acs5' = 5-year estimates (all geographies, including districts)"),
    year: z
      .number()
      .int()
      .describe("Data year: the single year for acs1 (e.g. 2025), or the END year of the 5-year period for acs5 (e.g. 2024 for 2020–2024)"),
    table: z
      .string()
      .describe("ACS table ID, e.g. 'B19013' (median household income), 'S1701' (poverty status), 'DP03' (economic profile), 'DP05' (demographics)"),
    geography: z
      .enum(["state", "county", "house_district", "senate_district"])
      .describe("Geography level, always within Hawaiʻi"),
    ids: z
      .array(z.string())
      .optional()
      .describe("Optional codes to limit results: county FIPS ('001' Hawaiʻi, '003' Honolulu, '005' Kalawao, '007' Kauaʻi, '009' Maui) or district numbers ('1', '49'). Omit for all in Hawaiʻi."),
    variables: z
      .array(z.string())
      .max(16)
      .optional()
      .describe("Variable IDs WITHOUT the E/M suffix, e.g. ['S1701_C03_010', 'S1701_C01_010']. Max 16. Omit to list the table's variables instead of fetching data."),
    labelFilter: z
      .string()
      .optional()
      .describe("When listing variables, only return those whose label contains this text (case-insensitive), e.g. '65 years'"),
  }),
  execute: async (_ctx, args, options?: { abortSignal?: AbortSignal }) => {
    const signal = options?.abortSignal;
    const table = args.table.trim().toUpperCase();
    const survey = args.survey as CensusSurvey;
    const geography = args.geography as Geography;
    const vintage = surveyLabel(survey, args.year);

    const path = tableDatasetPath(table);
    if (path === null) {
      return { error: `'${table}' is not an ACS table ID. Use IDs like B19013, S1701, DP03 or DP05.` };
    }
    if (survey === "acs1" && (geography === "house_district" || geography === "senate_district")) {
      return {
        error:
          "ACS 1-year estimates are not published for State House or Senate districts (they cover areas with 65,000+ people). " +
          "Use survey 'acs5' for district figures, or 'acs1' with geography 'state' or 'county'.",
      };
    }

    const meta = await fetchCensusTableMeta(survey, args.year, table, signal);
    if (!meta) {
      return {
        error: `Table ${table} was not found for the ${vintage} estimates. The table ID may be wrong, or that year has not been released yet.`,
      };
    }

    const citation = {
      citationId: censusCitationId(survey, args.year, table),
      title: meta.title,
      vintage,
      sourceUrl: censusTableUrl(survey, args.year, table),
    };

    // Listing mode: return the table's variables so the agent can pick IDs.
    if (!args.variables || args.variables.length === 0) {
      const filter = args.labelFilter?.toLowerCase().trim();
      const all = [...meta.variables.entries()].filter(
        ([, label]) => !filter || label.toLowerCase().includes(filter)
      );
      const limit = 150;
      return {
        ...citation,
        table,
        variableCount: all.length,
        variables: all.slice(0, limit).map(([id, label]) => ({ id, label })),
        truncated: all.length > limit ? `Showing ${limit} of ${all.length}; use labelFilter to narrow.` : undefined,
        next: "Call get_census_table again with `variables` set to the IDs you need.",
      };
    }

    const key = process.env.CENSUS_API_KEY;
    if (!key) {
      return { error: "The Census Data API key (CENSUS_API_KEY) is not configured on the server." };
    }

    const requested = [...new Set(args.variables.map((v) => v.trim().toUpperCase().replace(/[EM]$/, "")))];
    const unknown = requested.filter((v) => !meta.variables.has(v));
    const valid = requested.filter((v) => meta.variables.has(v));
    if (valid.length === 0) {
      return {
        error: `None of the requested variables exist in ${table} (${vintage}): ${unknown.join(", ")}. Call without \`variables\` to list them.`,
      };
    }

    // Estimate, its annotation (e.g. "2,000,000+" for a top-coded median, which
    // the estimate field reports as 2000001) and MOE: 3 × 16 + NAME ≤ 50 variables.
    const get = ["NAME", ...valid.flatMap((v) => [`${v}E`, `${v}EA`, `${v}M`])].join(",");
    const url = `${API_BASE}/${args.year}/acs/${survey}${path}?get=${get}&${geographyPredicate(geography, args.ids)}`;

    let rows: string[][];
    try {
      const res = await fetch(`${url}&key=${encodeURIComponent(key)}`, { signal });
      const text = await res.text();
      if (res.status === 204 || !text.trim()) {
        return {
          ...citation,
          error:
            survey === "acs1"
              ? "No 1-year estimates were published for that geography (it may have fewer than 65,000 people, e.g. Kalawao County)."
              : "No estimates were returned for that geography.",
        };
      }
      if (!res.ok) {
        // Never echo the request URL: it carries the key.
        return { ...citation, error: `Census Data API error (HTTP ${res.status}): ${text.slice(0, 200)}` };
      }
      rows = JSON.parse(text) as string[][];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ...citation, error: `Could not reach the Census Data API: ${message}` };
    }

    const [header, ...data] = rows;
    const col = (name: string) => header.indexOf(name);
    const results = data.map((row) => {
      const geoCodes = header
        .map((h, i) => (h === "NAME" || /_\d+(E|EA|M)$/.test(h) ? null : `${h}=${row[i]}`))
        .filter(Boolean)
        .join("; ");
      return {
        name: row[col("NAME")],
        geoCodes,
        values: valid.map((v) => {
          const est = parseValue(row[col(`${v}E`)]);
          const moe = parseValue(row[col(`${v}M`)]);
          const annotation = row[col(`${v}EA`)];
          // A top/bottom-coded value ("2,000,000+", "2,500-") is a bound, not a point estimate.
          const bound = annotation && /\d[+-]$/.test(annotation) ? annotation : undefined;
          const se = moe.value != null && moe.value >= 0 ? moe.value / 1.645 : null;
          const cv =
            !bound && se != null && est.value != null && est.value > 0 ? (se / est.value) * 100 : null;
          return {
            variable: v,
            label: meta.variables.get(v),
            estimate: est.value,
            publishedAs: bound,
            marginOfError: moe.value,
            standardError: se != null ? Number(se.toFixed(2)) : null,
            cvPercent: cv != null ? Number(cv.toFixed(1)) : null,
            note: [
              bound && `open-ended: the published value is "${bound}", so report it as that bound, not an exact figure`,
              est.note && `estimate: ${est.note}`,
              moe.note && `MOE: ${moe.note}`,
            ]
              .filter(Boolean)
              .join("; ") || undefined,
          };
        }),
      };
    });

    return {
      ...citation,
      table,
      geography,
      moeNote: "Margins of error are at the 90% confidence level; SE = MOE ÷ 1.645, CV = SE ÷ estimate.",
      unknownVariables: unknown.length > 0 ? unknown : undefined,
      count: results.length,
      results,
    };
  },
});

// ─── State government tax collections ────────────────────────────────────────

/**
 * Census Bureau Annual Survey of State Government Tax Collections (STC), via the
 * survey-specific `timeseries/govsstatetax` Census Data API dataset. Facts from
 * the STC 2025 Technical Documentation: amounts are current dollars reported in
 * thousands (not inflation-adjusted); they cover the state government only, not
 * state plus local (so county property taxes are excluded); Hawaiʻi's fiscal year
 * ends June 30; FY2025 was released April 2026 with revisions to FY2024 and FY2023.
 */
const STC_DATASET = `${API_BASE}/timeseries/govsstatetax`;
const STC_DOCS_URL =
  "https://www2.census.gov/programs-surveys/stc/technical-documentation/complete-technical-documentation/statetaxtechdoc2025.pdf";

export interface StcYears {
  startYear: number;
  endYear: number;
}

/** Citation ID handed to cite_sources: "census:stc:2025" for one year, "census:stc:2016-2025" for a range. */
export function stcCitationId({ startYear, endYear }: StcYears): string {
  return startYear === endYear ? `census:stc:${startYear}` : `census:stc:${startYear}-${endYear}`;
}

export function parseStcCitationId(id: string): StcYears | null {
  const m = /^census:stc:(\d{4})(?:-(\d{4}))?$/i.exec(id.trim());
  if (!m) return null;
  const startYear = Number(m[1]);
  const endYear = m[2] ? Number(m[2]) : startYear;
  return endYear >= startYear ? { startYear, endYear } : null;
}

function fiscalYearsLabel({ startYear, endYear }: StcYears): string {
  return startYear === endYear ? `fiscal year ${startYear}` : `fiscal years ${startYear}–${endYear}`;
}

export function stcTitle(years: StcYears): string {
  return `State Government Tax Collections: Hawaiʻi, ${fiscalYearsLabel(years)}`;
}

export function stcCoverage({ startYear, endYear }: StcYears): string {
  return startYear === endYear
    ? `Fiscal year ${startYear} (July ${startYear - 1}–June ${startYear})`
    : `Fiscal years ${startYear}–${endYear} (July ${startYear - 1}–June ${endYear})`;
}

/**
 * The detailed table on data.census.gov. One year uses the link form census.gov's
 * STC tables page uses; a range uses the table URL from the table's Suggested
 * Citation. Both show all states: a Hawaiʻi geography filter (`g=`) makes
 * data.census.gov report "Data not available" for this table, so none is added.
 */
export function stcTableUrl({ startYear, endYear }: StcYears): string {
  const base = "https://data.census.gov/table/GOVSSTATETAXTIMESERIES.GS00STATETAX";
  return startYear === endYear ? `${base}?q=GOVSSTATETAX&nkd=time~${startYear}` : `${base}?q=GS00STATETAX`;
}

/** Symbols from the GS00STATETAX table's Data Notes on data.census.gov. */
const STC_FLAGS: Record<string, string> = {
  N: "not available or not comparable",
  X: "not applicable",
  Z: "represents zero or rounds to zero",
};

let stcYearsCache:Promise<{ first: number; last: number } | null> | null = null;

/** Years the dataset covers, from its own catalog metadata (`temporal`, e.g. "2016/2025"). */
export function fetchStcYears(signal?: AbortSignal): Promise<{ first: number; last: number } | null> {
  if (stcYearsCache) return stcYearsCache;
  const promise = fetch(`${STC_DATASET}.json`, { signal })
    .then((res) => (res.ok ? res.json() : null))
    .then((json: { dataset?: Array<{ temporal?: string }> } | null) => {
      const m = /^(\d{4})\/(\d{4})$/.exec(json?.dataset?.[0]?.temporal ?? "");
      return m ? { first: Number(m[1]), last: Number(m[2]) } : null;
    })
    .catch(() => null);
  stcYearsCache = promise;
  promise.then((y) => y === null && (stcYearsCache = null));
  return promise;
}

export const getStateTaxCollections = createTool({
  description:
    "Fetch the State of Hawaiʻi government's tax collections by type of tax from the U.S. Census Bureau's Annual Survey of State Government Tax Collections (official Census Data API). " +
    "Covers state fiscal years (Hawaiʻi's ends June 30) from 2016 to the latest release. " +
    "Categories include general sales and gross receipts (item T09, which Census defines as taxes on all sales or all gross receipts — the category that fits Hawaiʻi's general excise tax), selective sales taxes (motor fuels, tobacco, alcohol, insurance premiums, public utilities, other), individual and corporate income, licenses, and death/gift and documentary taxes. " +
    "STATEWIDE, STATE GOVERNMENT ONLY: there are no county or district figures, and county taxes such as property tax are not included. " +
    "Returns amounts in dollars and ONE `citationId` covering every year requested (e.g. 'census:stc:2016-2025') to pass to cite_sources.",
  inputSchema: z.object({
    startYear: z.number().int().describe("First fiscal year, e.g. 2025 (FY2025 = July 2024–June 2025)"),
    endYear: z
      .number()
      .int()
      .optional()
      .describe("Last fiscal year for a trend, e.g. 2025. Omit for a single year. At most 10 years."),
    detail: z
      .enum(["summary", "full"])
      .optional()
      .describe(
        "'summary' = total taxes plus the 5 broad categories (sales & gross receipts, selective sales, income, license, other); 'full' = also every individual tax item. Defaults to 'full' for one year, 'summary' for a range."
      ),
    itemCodes: z
      .array(z.string())
      .optional()
      .describe(
        "Optional Census tax item codes to return only those items, e.g. ['T09'] general sales & gross receipts, ['T40','T41'] individual and corporate income, ['T13'] motor fuels. Overrides `detail`."
      ),
  }),
  execute: async (_ctx, args, options?: { abortSignal?: AbortSignal }) => {
    const signal = options?.abortSignal;
    const startYear = args.startYear;
    const endYear = args.endYear ?? startYear;

    const range = await fetchStcYears(signal);
    if (!range) return { error: "Could not read the Census state tax collections dataset's metadata. Try again." };
    if (endYear < startYear) return { error: "endYear must be the same as or after startYear." };
    if (startYear < range.first || endYear > range.last) {
      return {
        error:
          `State tax collections are available for fiscal years ${range.first}–${range.last}.` +
          (endYear > range.last ? ` FY${range.last + 1} has not been released yet.` : ""),
      };
    }
    if (endYear - startYear + 1 > 10) return { error: "Request at most 10 fiscal years at a time." };

    const key = process.env.CENSUS_API_KEY;
    if (!key) return { error: "The Census Data API key (CENSUS_API_KEY) is not configured on the server." };

    const itemFilter = args.itemCodes?.map((c) => c.trim().toUpperCase()).filter(Boolean);
    const detail = args.detail ?? (startYear === endYear ? "full" : "summary");
    const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
    // GOVTYPE must be requested: without it the API returns no rows (HTTP 204).
    const get = "AGG_DESC,AGG_DESC_LABEL,GOVTYPE,ITEM_CODE,ITEM_CODE_LABEL,AMOUNT,AMOUNT_F";

    type Row = Record<string, string | null>;
    const fetchYear = async (year: number): Promise<{ year: number; rows?: Row[]; error?: string }> => {
      try {
        const res = await fetch(
          `${STC_DATASET}?get=${get}&for=state:${HAWAII_FIPS}&time=${year}&key=${encodeURIComponent(key)}`,
          { signal }
        );
        const text = await res.text();
        if (res.status === 204 || !text.trim()) return { year, error: "no data published for this year" };
        // Never echo the request URL: it carries the key.
        if (!res.ok) return { year, error: `Census Data API error (HTTP ${res.status}): ${text.slice(0, 200)}` };
        const [header, ...data] = JSON.parse(text) as Array<Array<string | null>>;
        return {
          year,
          rows: data.map((r) => Object.fromEntries(header.map((h, i) => [h as string, r[i]]))),
        };
      } catch (err) {
        return { year, error: `Could not reach the Census Data API: ${err instanceof Error ? err.message : String(err)}` };
      }
    };

    const fetched = await Promise.all(years.map(fetchYear));

    const results = fetched.map(({ year, rows, error }) => {
      if (!rows) return { fiscalYear: year, error };
      const selected = rows.filter((r) => {
        if (itemFilter && itemFilter.length > 0) return itemFilter.includes(String(r.ITEM_CODE));
        return detail === "full" || r.ITEM_CODE === "AGG";
      });
      const label = (r: Row) => String(r.AGG_DESC_LABEL ?? "").replace(/^Taxes - /, "");
      const flagText = (r: Row) => (r.AMOUNT_F ? STC_FLAGS[r.AMOUNT_F] ?? `flag '${r.AMOUNT_F}'` : undefined);
      const hasAmount = (r: Row) => r.AMOUNT != null && r.AMOUNT !== "" && Number.isFinite(Number(r.AMOUNT));

      // Items with no published amount are listed apart from the numbers, so a
      // blank is never read as $0.
      const noAmount = selected
        .filter((r) => !hasAmount(r))
        .map((r) => ({ itemCode: r.ITEM_CODE, category: label(r), censusStatus: flagText(r) ?? "no amount published" }));

      const items = selected.filter(hasAmount).map((r) => {
        const isAggregate = r.ITEM_CODE === "AGG";
        const flag = flagText(r);
        return {
          code: r.AGG_DESC,
          itemCode: isAggregate ? undefined : r.ITEM_CODE,
          category: label(r),
          level: isAggregate ? "category total" : "tax item",
          amountDollars: Number(r.AMOUNT) * 1000,
          note: flag ? `Census symbol: ${flag}` : undefined,
        };
      });

      return {
        fiscalYear: year,
        items,
        itemsWithNoAmount:
          noAmount.length > 0
            ? {
                note: "Census published no amount for these items for Hawaiʻi. Do not show them as $0 or 0%; if you mention them, use the Census status given.",
                items: noAmount,
              }
            : undefined,
      };
    });

    const unmatched =
      itemFilter && itemFilter.length > 0
        ? itemFilter.filter((c) => !fetched.some((f) => f.rows?.some((r) => r.ITEM_CODE === c)))
        : [];

    const covered = { startYear, endYear };
    return {
      citationId: stcCitationId(covered),
      title: stcTitle(covered),
      sourceUrl: stcTableUrl(covered),
      source: "U.S. Census Bureau, Annual Survey of State Government Tax Collections",
      scope:
        "State of Hawaiʻi government only (excludes county taxes such as property tax); statewide figures, not available by county or district.",
      units:
        "Current dollars (not adjusted for inflation), converted from the Census's published thousands. Fiscal years end June 30.",
      caution:
        "Census classifications can differ from the Hawaiʻi Department of Taxation's own reports because of how the Census defines 'state government'. These are full counts of collections (no sampling, so no margin of error). Each annual release (typically April) also revises the two prior fiscal years.",
      documentation: STC_DOCS_URL,
      unknownItemCodes: unmatched.length > 0 ? unmatched : undefined,
      results,
    };
  },
});
