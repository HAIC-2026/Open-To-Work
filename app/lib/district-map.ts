import type { FeatureCollection, Geometry } from "geojson"

/**
 * Live data for the "Explore districts" map. Nothing is stored: district
 * boundaries come from the Hawaiʻi Statewide GIS Program ArcGIS service and
 * indicator values from data.census.gov on each request (both allow CORS).
 */

export type Chamber = "house" | "senate"

export const CHAMBERS: Record<
  Chamber,
  {
    label: string
    /** AdminBnd MapServer layer for the 2022 reapportionment plan. */
    layer: number
    /** Attribute holding the district number. */
    idField: string
    /** data.census.gov summary-level code for state legislative districts. */
    censusSummaryLevel: string
  }
> = {
  house: { label: "House", layer: 33, idField: "house_id", censusSummaryLevel: "6200000" },
  senate: { label: "Senate", layer: 34, idField: "senate_id", censusSummaryLevel: "6100000" },
}

export type IndicatorUnit = "percent" | "dollars" | "count"

export interface DistrictIndicator {
  id: string
  label: string
  /** Phrase used in the readout, e.g. "People below the poverty level". */
  readoutLabel: string
  unit: IndicatorUnit
  /** data.census.gov table ID, e.g. ACSST5Y2024.S1701. */
  table: string
  /** Variable without the E/M suffix, e.g. S1701_C03_001. */
  variable: string
}

export const ACS_VINTAGE = "2020–2024 ACS 5-year"

// Default indicators. Variables verified against the Census variable labels
// (api.census.gov/data/2024/acs/acs5/{subject,profile}/groups/<table>.json).
export const DISTRICT_INDICATORS: DistrictIndicator[] = [
  {
    id: "poverty",
    label: "People below poverty level",
    readoutLabel: "People below the poverty level",
    unit: "percent",
    table: "ACSST5Y2024.S1701",
    variable: "S1701_C03_001",
  },
  {
    id: "age65",
    label: "Residents aged 65+",
    readoutLabel: "Residents aged 65 and over",
    unit: "percent",
    table: "ACSDP5Y2024.DP05",
    variable: "DP05_0024P",
  },
  {
    id: "rent",
    label: "Median monthly gross rent",
    readoutLabel: "Median monthly gross rent",
    unit: "dollars",
    table: "ACSDP5Y2024.DP04",
    variable: "DP04_0134",
  },
  {
    id: "income",
    label: "Median household income",
    readoutLabel: "Median household income",
    unit: "dollars",
    table: "ACSDP5Y2024.DP03",
    variable: "DP03_0062",
  },
  {
    id: "unemployment",
    label: "Civilian unemployment rate",
    readoutLabel: "Civilian unemployment rate",
    unit: "percent",
    table: "ACSDP5Y2024.DP03",
    variable: "DP03_0009P",
  },
  {
    id: "population",
    label: "Total population",
    readoutLabel: "Total population",
    unit: "count",
    table: "ACSDP5Y2024.DP05",
    variable: "DP05_0001",
  },
]

/**
 * Island groups, keyed by the `county` attribute on the AdminBnd district
 * layers (every 2022-plan district lies in exactly one county).
 */
export type Island = "kauai" | "oahu" | "maui" | "hawaii"

export const ISLANDS: Record<Island, { label: string; county: string }> = {
  kauai: { label: "Kauaʻi", county: "KAUAI" },
  oahu: { label: "Oʻahu", county: "OAHU" },
  maui: { label: "Maui County (Maui, Molokaʻi, Lānaʻi)", county: "MAUI" },
  hawaii: { label: "Hawaiʻi Island", county: "HAWAII" },
}

const ISLAND_BY_COUNTY = Object.fromEntries(
  (Object.keys(ISLANDS) as Island[]).map((island) => [ISLANDS[island].county, island])
) as Record<string, Island>

/** Island dropdown value: one island group, or the whole state. */
export type IslandView = Island | "all"

/** Dropdown order; "all" is offered but never the default. */
export const ISLAND_VIEW_OPTIONS: { value: IslandView; label: string }[] = [
  { value: "all", label: "All islands" },
  { value: "oahu", label: ISLANDS.oahu.label },
  { value: "hawaii", label: ISLANDS.hawaii.label },
  { value: "maui", label: ISLANDS.maui.label },
  { value: "kauai", label: ISLANDS.kauai.label },
]

export type DistrictProperties = { district: number; island: Island | null }
export type DistrictShapes = FeatureCollection<Geometry, DistrictProperties>

export interface IndicatorValue {
  value: number
  moe: number | null
}

const ARCGIS_ADMIN_BND =
  "https://geodata.hawaii.gov/arcgis/rest/services/AdminBnd/MapServer"
const CENSUS_TABLE_API = "https://data.census.gov/api/access/data/table"

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`)
  return (await res.json()) as T
}

/**
 * District boundaries, simplified server-side (~200 KB instead of ~6 MB) via
 * the ArcGIS query `maxAllowableOffset` / `geometryPrecision` parameters.
 */
export async function fetchDistrictShapes(
  chamber: Chamber,
  signal?: AbortSignal
): Promise<DistrictShapes> {
  const { layer, idField } = CHAMBERS[chamber]
  const params = new URLSearchParams({
    where: "1=1",
    outFields: `${idField},county`,
    outSR: "4326",
    maxAllowableOffset: "0.0005",
    geometryPrecision: "5",
    f: "geojson",
  })
  const data = await fetchJson<FeatureCollection<Geometry, Record<string, unknown>>>(
    `${ARCGIS_ADMIN_BND}/${layer}/query?${params}`,
    signal
  )
  return {
    type: "FeatureCollection",
    features: data.features
      .map((feature) => ({
        ...feature,
        properties: {
          district: Number(feature.properties?.[idField]),
          island: ISLAND_BY_COUNTY[String(feature.properties?.county)] ?? null,
        },
      }))
      .filter((feature) => Number.isFinite(feature.properties.district)),
  }
}

// In-memory only (cleared on reload): lets the drawer and its event handlers
// share one live request per chamber instead of refetching.
const shapeRequests = new Map<Chamber, Promise<DistrictShapes>>()

export function loadDistrictShapes(chamber: Chamber): Promise<DistrictShapes> {
  let request = shapeRequests.get(chamber)
  if (!request) {
    request = fetchDistrictShapes(chamber)
    // Drop failed requests so "Try again" refetches.
    request.catch(() => shapeRequests.delete(chamber))
    shapeRequests.set(chamber, request)
  }
  return request
}

/** Districts on an island, in ascending order. */
export function districtsOnIsland(shapes: DistrictShapes, island: IslandView): number[] {
  return shapes.features
    .filter((f) => island === "all" || f.properties.island === island)
    .map((f) => f.properties.district)
    .sort((a, b) => a - b)
}

export function islandOfDistrict(shapes: DistrictShapes, district: number): Island | null {
  return shapes.features.find((f) => f.properties.district === district)?.properties.island ?? null
}

/** Parses a Census estimate; sentinel codes, blanks and negatives become null. */
function parseCensusNumber(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null
  const n = Number(String(raw).replace(/[,+]/g, ""))
  return Number.isFinite(n) && n >= 0 ? n : null
}

interface CensusTableResponse {
  response?: { data?: string[][] }
}

/**
 * Indicator values keyed by district number, from the data.census.gov table
 * API (no API key required). GEO_IDs look like 620L900US15026 (House 26).
 */
export async function fetchIndicatorValues(
  chamber: Chamber,
  indicator: DistrictIndicator,
  signal?: AbortSignal
): Promise<Map<number, IndicatorValue>> {
  const params = new URLSearchParams({
    g: `040XX00US15$${CHAMBERS[chamber].censusSummaryLevel}`,
    id: indicator.table,
  })
  const data = await fetchJson<CensusTableResponse>(`${CENSUS_TABLE_API}?${params}`, signal)
  const rows = data.response?.data
  if (!rows || rows.length < 2) throw new Error("The Census table returned no rows")

  const header = rows[0]
  const geoIdx = header.indexOf("GEO_ID")
  const estIdx = header.indexOf(`${indicator.variable}E`)
  const moeIdx = header.indexOf(`${indicator.variable}M`)
  if (geoIdx < 0 || estIdx < 0) {
    throw new Error(`Variable ${indicator.variable} is missing from ${indicator.table}`)
  }

  const values = new Map<number, IndicatorValue>()
  for (const row of rows.slice(1)) {
    const district = Number(row[geoIdx]?.slice(-3))
    const value = parseCensusNumber(row[estIdx])
    if (!Number.isFinite(district) || value === null) continue
    values.set(district, { value, moe: moeIdx >= 0 ? parseCensusNumber(row[moeIdx]) : null })
  }
  return values
}

/**
 * Sequential ramp from the theme's --chart-* tokens (one hue, light → dark).
 * Leaflet writes fill/stroke as SVG presentation attributes, which any CSS
 * class overrides, so these Tailwind classes set the colors. Dark mode uses
 * its own order so low values recede into the dark surface.
 */
export const BUCKET_CLASSES = [
  "fill-chart-1 dark:fill-chart-4",
  "fill-chart-2 dark:fill-chart-3",
  "fill-chart-3 dark:fill-chart-2",
  "fill-chart-5 dark:fill-chart-1",
]

/** Quartile breaks: returns the 3 inner cut points for 4 classes. */
export function quartileBreaks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const at = (q: number) => {
    const pos = (sorted.length - 1) * q
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
  }
  return [at(0.25), at(0.5), at(0.75)]
}

export function bucketFor(value: number, breaks: number[]): number {
  let bucket = 0
  for (const cut of breaks) if (value > cut) bucket++
  return bucket
}

export function formatIndicator(value: number, unit: IndicatorUnit): string {
  if (unit === "percent") return `${value.toFixed(1)}%`
  if (unit === "dollars") return `$${Math.round(value).toLocaleString("en-US")}`
  return Math.round(value).toLocaleString("en-US")
}

export function formatMoe(moe: number, unit: IndicatorUnit): string {
  if (unit === "percent") return `±${moe.toFixed(1)} pp`
  if (unit === "dollars") return `±$${Math.round(moe).toLocaleString("en-US")}`
  return `±${Math.round(moe).toLocaleString("en-US")}`
}

/** Parses "House District 26" / "Senate District 5" from the prompt input. */
export function parseDistrictTitle(
  title: string | undefined
): { chamber: Chamber; district: number } | null {
  const match = title?.match(/^(House|Senate) District (\d+)$/i)
  if (!match) return null
  return {
    chamber: match[1].toLowerCase() === "senate" ? "senate" : "house",
    district: Number(match[2]),
  }
}
