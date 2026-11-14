"use client"

import "leaflet/dist/leaflet.css"
import * as React from "react"
import L from "leaflet"
import { GeoJSON, MapContainer, Marker } from "react-leaflet"
import type { Layer, Map as LeafletMap, Path, PathOptions } from "leaflet"
import type { Feature, Geometry, Position } from "geojson"
import {
  BUCKET_CLASSES,
  bucketFor,
  type DistrictProperties,
  type DistrictShapes,
} from "@/lib/district-map"

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

interface DistrictMapBlockViewProps {
  /** Districts to draw (already filtered to one island group). */
  shapes: DistrictShapes
  /** Changes with the island view, so the map re-fits to the new shapes. */
  viewKey: string
  districts: Map<number, MapBlockDistrict>
  /** When set, districts are filled by value instead of by highlight group. */
  shading: { values: Map<number, number>; breaks: number[] } | null
  /** Tooltip for districts the block does not mention. */
  describeOther: (district: number) => string[]
  onSelectDistrict: (district: number) => void
}

/** Fills for highlight groups when there is no shading, in legend order. */
export const GROUP_FILLS = ["fill-chart-2", "fill-chart-4", "fill-chart-1", "fill-chart-3"]

const FIT_OPTIONS = { padding: [16, 16] as [number, number] }

/** Bounding box [minLng, minLat, maxLng, maxLat] of a coordinate tree. */
function bbox(coords: unknown, box = [180, 90, -180, -90]): number[] {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    const [lng, lat] = coords as Position
    box[0] = Math.min(box[0], lng)
    box[1] = Math.min(box[1], lat)
    box[2] = Math.max(box[2], lng)
    box[3] = Math.max(box[3], lat)
  } else if (Array.isArray(coords)) {
    for (const c of coords) bbox(c, box)
  }
  return box
}

/**
 * Where to put a district's label: the middle of its largest part, so a
 * district spanning several islands is not labelled in the sea between them.
 */
function labelPosition(geometry: Geometry): [number, number] | null {
  let parts: unknown[]
  if (geometry.type === "Polygon") parts = [geometry.coordinates]
  else if (geometry.type === "MultiPolygon") parts = geometry.coordinates
  else return null
  let best: number[] | null = null
  for (const part of parts) {
    const b = bbox(part)
    if (!best || (b[2] - b[0]) * (b[3] - b[1]) > (best[2] - best[0]) * (best[3] - best[1])) best = b
  }
  return best ? [(best[1] + best[3]) / 2, (best[0] + best[2]) / 2] : null
}

export default function DistrictMapBlockView({
  shapes,
  viewKey,
  districts,
  shading,
  describeOther,
  onSelectDistrict,
}: DistrictMapBlockViewProps) {
  const mapRef = React.useRef<LeafletMap>(null)
  const layersRef = React.useRef(new Map<number, Path>())
  const onSelectRef = React.useRef(onSelectDistrict)
  React.useEffect(() => {
    onSelectRef.current = onSelectDistrict
  }, [onSelectDistrict])

  const bounds = React.useMemo((): [[number, number], [number, number]] => {
    const b = bbox(shapes.features.map((f) => ("coordinates" in f.geometry ? f.geometry.coordinates : [])))
    return [
      [b[1], b[0]],
      [b[3], b[2]],
    ]
  }, [shapes])

  // MapContainer props are immutable after mount (react-leaflet docs), so
  // re-fit imperatively when the island view changes.
  const boundsRef = React.useRef(bounds)
  React.useEffect(() => {
    boundsRef.current = bounds
  }, [bounds])
  React.useEffect(() => {
    mapRef.current?.fitBounds(boundsRef.current, FIT_OPTIONS)
  }, [viewKey])

  const style = React.useCallback(
    (feature?: Feature<Geometry, DistrictProperties>): PathOptions => {
      const district = feature?.properties.district ?? -1
      const info = districts.get(district)
      const value = shading?.values.get(district)
      let fill: string
      if (info?.kind === "dim") fill = "fill-transparent"
      else if (shading) fill = value !== undefined ? BUCKET_CLASSES[bucketFor(value, shading.breaks)] : "fill-muted"
      else if (info?.kind === "home") fill = "fill-primary"
      else if (info?.kind === "highlight") fill = GROUP_FILLS[(info.group ?? 0) % GROUP_FILLS.length]
      else fill = "fill-muted"
      const emphasized = info?.kind === "home" || info?.kind === "highlight"
      return {
        className: `${fill} ${
          emphasized ? "stroke-foreground" : "stroke-border hover:stroke-muted-foreground"
        } cursor-pointer transition-[stroke] duration-150`,
        fillOpacity: 1,
        weight: info?.kind === "home" ? 3 : emphasized ? 2 : 1,
        // Dimmed (excluded) districts get a dashed outline, so they read as
        // "left out" without relying on colour alone.
        dashArray: info?.kind === "dim" ? "4 4" : undefined,
      }
    },
    [districts, shading]
  )

  const onEachFeature = React.useCallback(
    (feature: Feature<Geometry, DistrictProperties>, layer: Layer) => {
      const district = feature.properties.district
      layersRef.current.set(district, layer as Path)
      const lines = districts.get(district)?.tooltip ?? describeOther(district)
      // Built with textContent, so agent-written text is never parsed as HTML.
      const content = document.createElement("div")
      lines.forEach((line, i) => {
        const row = document.createElement("div")
        row.textContent = line
        if (i === 0) row.className = "font-medium"
        content.appendChild(row)
      })
      layer.bindTooltip(content, {
        sticky: true,
        direction: "top",
        className:
          "rounded-lg! border-border! bg-popover! px-2! py-1! text-xs! text-popover-foreground! shadow-md! before:hidden!",
      })
      layer.on("click", () => onSelectRef.current(district))
    },
    [districts, describeOther]
  )

  // GeoJSON `data` is immutable in react-leaflet and Leaflet only applies a
  // path's className when it is created, so re-create the layer on changes.
  const layerKey = `${viewKey}-${shading ? shading.breaks.join(",") : "groups"}-${[...districts.keys()].join(".")}`

  // Draw emphasised outlines above their plain neighbours, the user's last.
  React.useEffect(() => {
    for (const [district, info] of districts) {
      if (info.kind === "highlight") layersRef.current.get(district)?.bringToFront()
    }
    for (const [district, info] of districts) {
      if (info.kind === "home") layersRef.current.get(district)?.bringToFront()
    }
  }, [layerKey, districts])

  const labels = React.useMemo(
    () =>
      shapes.features.flatMap((feature) => {
        const info = districts.get(feature.properties.district)
        const text = info?.kind === "home" ? (info.label ?? "You") : info?.kind === "highlight" ? info.label : undefined
        const position = text ? labelPosition(feature.geometry) : null
        if (!text || !position) return []
        // The label is agent-written, so it goes in as text, not HTML.
        const span = document.createElement("span")
        span.className =
          "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground bg-background px-1.5 text-[11px] leading-4 font-semibold whitespace-nowrap text-foreground shadow-sm"
        span.textContent = text.slice(0, 12)
        const icon = L.divIcon({ className: "", iconSize: [0, 0], html: span })
        return [{ district: feature.properties.district, position, icon }]
      }),
    [shapes, districts]
  )

  return (
    <MapContainer
      ref={mapRef}
      bounds={bounds}
      boundsOptions={FIT_OPTIONS}
      zoomSnap={0.25}
      // Inside a chat message, the wheel should scroll the conversation.
      scrollWheelZoom={false}
      attributionControl
      // leaflet.css is unlayered, so overrides need Tailwind's `!` modifier.
      className="size-full bg-transparent! font-sans! [&_.leaflet-control-attribution]:bg-popover/80! [&_.leaflet-control-attribution]:text-muted-foreground! [&_.leaflet-control-attribution_a]:text-foreground!"
    >
      <GeoJSON key={layerKey} data={shapes} style={style} onEachFeature={onEachFeature} />
      {labels.map((label) => (
        // Not interactive: clicks and hovers go to the district underneath.
        <Marker
          key={`${layerKey}-${label.district}`}
          position={label.position}
          icon={label.icon}
          interactive={false}
          keyboard={false}
        />
      ))}
    </MapContainer>
  )
}
