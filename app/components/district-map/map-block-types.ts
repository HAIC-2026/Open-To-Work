/**
 * Shared by the map block and its Leaflet view. Kept out of the view file so
 * importing these does not pull Leaflet (which needs `window`) into the
 * server render.
 */

/** How one district is drawn, as set by the agent's map block. */
export interface MapBlockDistrict {
  kind: "home" | "highlight" | "dim"
  /** Short text drawn on the map, e.g. a rank matching the answer's table. */
  label?: string
  /** Index into the legend's highlight groups (highlight only). */
  group?: number
  /** Lines for the hover tooltip. */
  tooltip: string[]
}

/** Fills for highlight groups when there is no shading, in legend order. */
export const GROUP_FILLS = ["fill-chart-2", "fill-chart-4", "fill-chart-1", "fill-chart-3"]
