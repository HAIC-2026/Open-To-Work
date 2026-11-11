"use client"

import "leaflet/dist/leaflet.css"
import * as React from "react"
import { GeoJSON, MapContainer } from "react-leaflet"
import type { LatLngBounds, Layer, Map as LeafletMap, Path, PathOptions } from "leaflet"
import type { Feature, Geometry } from "geojson"
import {
  BUCKET_CLASSES,
  bucketFor,
  CHAMBERS,
  formatIndicator,
  type Chamber,
  type DistrictProperties,
  type DistrictShapes,
  type IndicatorUnit,
  type IndicatorValue,
} from "@/lib/district-map"

const UNAVAILABLE_CLASS = "fill-transparent stroke-muted-foreground"

export interface DistrictMapHandle {
  zoomIn: () => void
  zoomOut: () => void
  zoomToDistrict: (district: number) => void
  /** Fit the whole current view (the selected island, or all islands). */
  fitView: () => void
}

interface DistrictMapViewProps {
  chamber: Chamber
  /** Districts to draw (already filtered to one island). */
  shapes: DistrictShapes
  /** Changes with the island/chamber, so the map re-fits to the new shapes. */
  viewKey: string
  values: Map<number, IndicatorValue> | null
  breaks: number[]
  unit: IndicatorUnit
  selectedDistrict: number | null
  onSelectDistrict: (district: number) => void
  /** Imperative controls (a plain prop, so it passes through next/dynamic). */
  handleRef?: React.Ref<DistrictMapHandle>
}

const FIT_OPTIONS = { padding: [24, 24] as [number, number] }

function boundsOf(shapes: DistrictShapes): [[number, number], [number, number]] {
  let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180
  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === "number") {
      const [lng, lat] = coords as number[]
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng)
    } else if (Array.isArray(coords)) coords.forEach(visit)
  }
  for (const f of shapes.features) {
    if ("coordinates" in f.geometry) visit(f.geometry.coordinates)
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

export default function DistrictMapView({
  chamber,
  shapes,
  viewKey,
  values,
  breaks,
  unit,
  selectedDistrict,
  onSelectDistrict,
  handleRef,
}: DistrictMapViewProps) {
  const mapRef = React.useRef<LeafletMap>(null)
  const layersRef = React.useRef(new Map<number, Path>())
  const onSelectRef = React.useRef(onSelectDistrict)
  React.useEffect(() => {
    onSelectRef.current = onSelectDistrict
  }, [onSelectDistrict])

  const bounds = React.useMemo(() => boundsOf(shapes), [shapes])

  // MapContainer props are immutable after mount (react-leaflet docs), so
  // re-fit imperatively when the island or chamber changes.
  const boundsRef = React.useRef(bounds)
  React.useEffect(() => {
    boundsRef.current = bounds
  }, [bounds])
  React.useEffect(() => {
    mapRef.current?.fitBounds(boundsRef.current, FIT_OPTIONS)
  }, [viewKey])

  React.useImperativeHandle(
    handleRef,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      fitView: () => mapRef.current?.fitBounds(boundsRef.current, FIT_OPTIONS),
      zoomToDistrict: (district) => {
        const layer = layersRef.current.get(district) as
          | (Path & { getBounds?: () => LatLngBounds })
          | undefined
        const districtBounds = layer?.getBounds?.()
        if (districtBounds) {
          mapRef.current?.fitBounds(districtBounds, { ...FIT_OPTIONS, maxZoom: 12 })
        }
      },
    }),
    []
  )

  const label = CHAMBERS[chamber].label

  const style = React.useCallback(
    (feature?: Feature<Geometry, DistrictProperties>): PathOptions => {
      const district = feature?.properties.district ?? -1
      const v = values?.get(district)
      const selected = district === selectedDistrict
      const fillClass = v ? BUCKET_CLASSES[bucketFor(v.value, breaks)] : UNAVAILABLE_CLASS
      // The ramp is the theme's grays, so a plain gray outline would vanish on
      // some bucket: the selected district gets a surface-colored line with a
      // thin foreground halo, which reads on every fill.
      const strokeClass = selected
        ? "stroke-popover [filter:drop-shadow(0_0_1px_var(--color-foreground))]"
        : v
          ? "stroke-popover hover:stroke-foreground"
          : "hover:stroke-foreground"
      return {
        className: `${fillClass} ${strokeClass} transition-[stroke] duration-150`,
        fillOpacity: 1,
        weight: selected ? 2 : 1,
        dashArray: v ? undefined : "3 3",
      }
    },
    [values, breaks, selectedDistrict]
  )

  const onEachFeature = React.useCallback(
    (feature: Feature<Geometry, DistrictProperties>, layer: Layer) => {
      const district = feature.properties.district
      layersRef.current.set(district, layer as Path)
      const v = values?.get(district)
      layer.bindTooltip(
        `${label} District ${district}: ${v ? formatIndicator(v.value, unit) : "unavailable"}`,
        {
          sticky: true,
          direction: "top",
          className:
            "rounded-lg! border-border! bg-popover! px-2! py-1! text-xs! text-popover-foreground! shadow-md! before:hidden!",
        }
      )
      layer.on("click", () => onSelectRef.current(district))
    },
    [values, unit, label]
  )

  // Raise the selected outline above its neighbours once the layer is on the map.
  React.useEffect(() => {
    if (selectedDistrict !== null) layersRef.current.get(selectedDistrict)?.bringToFront()
  })

  // GeoJSON `data` is immutable in react-leaflet and Leaflet only applies a
  // path's className when it is created, so re-create the layer on changes.
  const layerKey = `${viewKey}-${selectedDistrict}-${breaks.join(",")}-${values?.size ?? 0}-${unit}`

  return (
    <MapContainer
      ref={mapRef}
      bounds={bounds}
      boundsOptions={FIT_OPTIONS}
      zoomControl={false}
      zoomSnap={0.25}
      attributionControl
      // leaflet.css is unlayered, so overrides need Tailwind's `!` modifier.
      className="size-full bg-transparent! font-sans! [&_.leaflet-control-attribution]:bg-popover/80! [&_.leaflet-control-attribution]:text-muted-foreground! [&_.leaflet-control-attribution_a]:text-foreground!"
    >
      <GeoJSON
        key={layerKey}
        data={shapes}
        style={style}
        onEachFeature={onEachFeature}
      />
    </MapContainer>
  )
}
