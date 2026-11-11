"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { MinusIcon, PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ACS_VINTAGE,
  BUCKET_CLASSES,
  CHAMBERS,
  DISTRICT_INDICATORS,
  ISLAND_VIEW_OPTIONS,
  districtsOnIsland,
  fetchIndicatorValues,
  formatIndicator,
  formatMoe,
  islandOfDistrict,
  loadDistrictShapes,
  parseDistrictTitle,
  quartileBreaks,
  type Chamber,
  type DistrictShapes,
  type IndicatorValue,
  type IslandView,
} from "@/lib/district-map"
import type { DistrictMapHandle } from "./district-map-view"

// Leaflet needs `window`, so load the map on the client only (Next.js
// lazy-loading guide: `ssr: false` must be used from a Client Component).
const DistrictMapView = dynamic(() => import("./district-map-view"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})


type LoadState<T> = { key: string; data?: T; error?: string }

/**
 * Fetches `load()` whenever `key` changes. Results are tagged with their key so
 * loading/stale state is derived instead of set synchronously in the effect,
 * and superseded responses are ignored (React docs: "Fetching data" with
 * cleanup to avoid race conditions).
 */
function useLiveData<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>
): { data?: T; error?: string; loading: boolean; retry: () => void } {
  const [state, setState] = React.useState<LoadState<T>>({ key: "" })
  const [attempt, setAttempt] = React.useState(0)
  const loadRef = React.useRef(load)
  React.useEffect(() => {
    loadRef.current = load
  }, [load])

  React.useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    loadRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key, data })
      },
      (err: unknown) => {
        if (controller.signal.aborted) return
        setState({ key, error: err instanceof Error ? err.message : String(err) })
      }
    )
    return () => controller.abort()
  }, [key, attempt])

  const current = key !== null && state.key === key
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    loading: key !== null && !current,
    retry: () => setAttempt((n) => n + 1),
  }
}

interface ExploreDistrictsDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** District selected in the prompt input, e.g. "House District 26". */
  initialDistrict?: string
  /** Called with e.g. "Senate District 5" whenever a district is chosen here. */
  onDistrictChange?: (district: string) => void
}

export function ExploreDistrictsDrawer({
  open,
  onOpenChange,
  initialDistrict,
  onDistrictChange,
}: ExploreDistrictsDrawerProps) {
  const initial = parseDistrictTitle(initialDistrict)
  const [chamber, setChamber] = React.useState<Chamber>(initial?.chamber ?? "house")
  const [district, setDistrict] = React.useState<number>(initial?.district ?? 1)
  // null until the user picks an island; until then the island is derived
  // from the selected district, so it defaults to that district's island.
  const [islandChoice, setIslandChoice] = React.useState<IslandView | null>(null)
  const [indicatorId, setIndicatorId] = React.useState(DISTRICT_INDICATORS[0].id)
  // Mount the map only after the open animation, so Leaflet measures the
  // final container size (Base UI Drawer `onOpenChangeComplete`).
  const [opened, setOpened] = React.useState(false)
  const mapHandle = React.useRef<DistrictMapHandle>(null)

  const indicator =
    DISTRICT_INDICATORS.find((i) => i.id === indicatorId) ?? DISTRICT_INDICATORS[0]

  const shapes = useLiveData<DistrictShapes>(open ? `shapes:${chamber}` : null, () =>
    loadDistrictShapes(chamber)
  )
  const values = useLiveData<Map<number, IndicatorValue>>(
    open ? `values:${chamber}:${indicator.id}` : null,
    (signal) => fetchIndicatorValues(chamber, indicator, signal)
  )

  const island: IslandView | null =
    islandChoice ?? (shapes.data ? islandOfDistrict(shapes.data, district) : null)

  const islandShapes = React.useMemo<DistrictShapes | null>(() => {
    if (!shapes.data || !island) return null
    return {
      type: "FeatureCollection",
      features:
        island === "all"
          ? shapes.data.features
          : shapes.data.features.filter((f) => f.properties.island === island),
    }
  }, [shapes.data, island])

  const districtOptions = React.useMemo(
    () => (shapes.data && island ? districtsOnIsland(shapes.data, island) : []),
    [shapes.data, island]
  )

  // The color scale is fitted to the districts on screen: statewide for
  // "All islands", per island otherwise, so differences within one island
  // stay visible instead of collapsing into a single statewide bucket.
  const scaleValues = React.useMemo(() => {
    if (!values.data) return []
    const shown = new Set(districtOptions)
    return [...values.data.entries()].filter(([d]) => shown.has(d)).map(([, v]) => v.value)
  }, [values.data, districtOptions])
  const breaks = React.useMemo(() => quartileBreaks(scaleValues), [scaleValues])
  const range = React.useMemo(
    () =>
      scaleValues.length === 0
        ? null
        : { min: Math.min(...scaleValues), max: Math.max(...scaleValues), count: scaleValues.length },
    [scaleValues]
  )
  const scaleLabel =
    island === "all"
      ? `statewide across ${CHAMBERS[chamber].label} districts`
      : `across ${ISLAND_VIEW_OPTIONS.find((o) => o.value === island)?.label ?? ""} ${CHAMBERS[chamber].label} districts`

  const chamberLabel = CHAMBERS[chamber].label
  const selected = values.data?.get(district)

  // District the map is zoomed to via the button; the button zooms back out
  // only while that district is still the selected one.
  const [zoomedDistrict, setZoomedDistrict] = React.useState<number | null>(null)
  const isZoomedIn = zoomedDistrict === district
  const toggleDistrictZoom = () => {
    if (isZoomedIn) {
      mapHandle.current?.fitView()
      setZoomedDistrict(null)
    } else {
      mapHandle.current?.zoomToDistrict(district)
      setZoomedDistrict(district)
    }
  }

  const selectDistrict = (next: number, nextChamber: Chamber = chamber) => {
    setDistrict(next)
    onDistrictChange?.(`${CHAMBERS[nextChamber].label} District ${next}`)
  }

  const handleIslandChange = (next: IslandView) => {
    setIslandChoice(next)
    setZoomedDistrict(null) // the map re-fits to the new island
    if (!shapes.data) return
    const onIsland = districtsOnIsland(shapes.data, next)
    if (!onIsland.includes(district) && onIsland.length > 0) selectDistrict(onIsland[0])
  }

  const handleChamberChange = async (next: Chamber) => {
    // Keep the current island; pick a district on it in the other chamber.
    const keepIsland = island
    if (keepIsland) setIslandChoice(keepIsland)
    setChamber(next)
    setZoomedDistrict(null) // the map re-fits for the new chamber
    if (!keepIsland) return
    try {
      const nextShapes = await loadDistrictShapes(next)
      const onIsland = districtsOnIsland(nextShapes, keepIsland)
      if (onIsland.length > 0) {
        selectDistrict(onIsland.includes(district) ? district : onIsland[0], next)
      }
    } catch {
      // The shapes error is shown by the map area, which offers a retry.
    }
  }

  return (
    <Drawer
      swipeDirection="left"
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(isOpen) => setOpened(isOpen)}
    >
      <DrawerContent className="data-[swipe-direction=left]:w-[min(56rem,calc(100vw-1rem))]">
        <DrawerHeader className="flex-row items-start justify-between gap-4 pb-2">
          <div className="flex flex-col gap-1">
            <DrawerTitle className="text-xl font-semibold">Explore districts</DrawerTitle>
            <DrawerDescription className="text-left">
              {ACS_VINTAGE} estimates by state legislative district (2022 plan).
            </DrawerDescription>
          </div>
          <DrawerClose render={<Button variant="ghost" size="icon" aria-label="Close" />}>
            <XIcon />
          </DrawerClose>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-2 pb-4">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
            <Field className="gap-1.5">
              <FieldLabel htmlFor="explore-chamber" className="text-xs text-muted-foreground">
                Chamber
              </FieldLabel>
              <Select
                value={chamber}
                onValueChange={(v) => v && void handleChamberChange(v as Chamber)}
                items={(Object.keys(CHAMBERS) as Chamber[]).map((c) => ({
                  value: c,
                  label: CHAMBERS[c].label,
                }))}
              >
                <SelectTrigger id="explore-chamber" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(CHAMBERS) as Chamber[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CHAMBERS[c].label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="gap-1.5">
              <FieldLabel htmlFor="explore-island" className="text-xs text-muted-foreground">
                Island
              </FieldLabel>
              <Select
                value={island}
                onValueChange={(v) => v && handleIslandChange(v as IslandView)}
                items={ISLAND_VIEW_OPTIONS}
                disabled={!shapes.data}
              >
                <SelectTrigger id="explore-island" className="w-full">
                  <SelectValue placeholder="Loading…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ISLAND_VIEW_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="gap-1.5">
              <FieldLabel htmlFor="explore-district" className="text-xs text-muted-foreground">
                District
              </FieldLabel>
              <Select
                value={district}
                onValueChange={(v) => typeof v === "number" && selectDistrict(v)}
                items={districtOptions.map((d) => ({
                  value: d,
                  label: `${chamberLabel} District ${d}`,
                }))}
                disabled={districtOptions.length === 0}
              >
                <SelectTrigger id="explore-district" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {districtOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {chamberLabel} District {d}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="gap-1.5">
              <FieldLabel htmlFor="explore-indicator" className="text-xs text-muted-foreground">
                Indicator
              </FieldLabel>
              <Select
                value={indicatorId}
                onValueChange={(v) => typeof v === "string" && setIndicatorId(v)}
                items={DISTRICT_INDICATORS.map((i) => ({ value: i.id, label: i.label }))}
              >
                <SelectTrigger id="explore-indicator" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DISTRICT_INDICATORS.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Map: swipes here pan the map instead of dismissing the drawer. */}
          <div
            data-base-ui-swipe-ignore=""
            className="relative isolate min-h-80 flex-1 overflow-hidden rounded-2xl border border-border"
          >
            {shapes.error ? (
              <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                <p>Couldn&apos;t load district boundaries: {shapes.error}</p>
                <Button variant="outline" size="sm" onClick={shapes.retry}>
                  Try again
                </Button>
              </div>
            ) : opened && islandShapes && island ? (
              <>
                <DistrictMapView
                  handleRef={mapHandle}
                  chamber={chamber}
                  shapes={islandShapes}
                  viewKey={`${chamber}-${island}`}
                  values={values.data ?? null}
                  breaks={breaks}
                  unit={indicator.unit}
                  selectedDistrict={district}
                  onSelectDistrict={(d) => {
                    // Clicking a district on the map picks it: sync it to the
                    // prompt box and close the drawer to return to the page.
                    selectDistrict(d)
                    onOpenChange(false)
                  }}
                />
                <ButtonGroup orientation="vertical" className="absolute top-3 left-3 z-[1000]">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Zoom in"
                    onClick={() => mapHandle.current?.zoomIn()}
                  >
                    <PlusIcon />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Zoom out"
                    onClick={() => mapHandle.current?.zoomOut()}
                  >
                    <MinusIcon />
                  </Button>
                </ButtonGroup>
              </>
            ) : (
              <Skeleton className="size-full rounded-none" />
            )}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1 text-sm">
              {values.error ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>
                    Couldn&apos;t load {indicator.label.toLowerCase()}: {values.error}
                  </span>
                  <Button variant="outline" size="sm" onClick={values.retry}>
                    Try again
                  </Button>
                </div>
              ) : range ? (
                <>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {range.count === 1 ? (
                      // One district: its value maps to the first bucket, so show just that swatch.
                      <>
                        <svg width={32} height={14} aria-hidden="true">
                          <rect width={32} height={14} rx={3} className={BUCKET_CLASSES[0]} />
                        </svg>
                        <span>{formatIndicator(range.min, indicator.unit)}</span>
                      </>
                    ) : (
                      <>
                        <span>{formatIndicator(range.min, indicator.unit)}</span>
                        <svg width={4 * 32 + 3 * 4} height={14} aria-hidden="true">
                          {BUCKET_CLASSES.map((cls, i) => (
                            <rect key={cls} x={i * 36} y={0} width={32} height={14} rx={3} className={cls} />
                          ))}
                        </svg>
                        <span>{formatIndicator(range.max, indicator.unit)}</span>
                      </>
                    )}
                  </div>
                  <p className="text-muted-foreground">
                    {range.count < 4
                      ? `Only ${range.count} ${range.count === 1 ? "district" : "districts"} here, so shades compare just ${range.count === 1 ? "this one" : "these"}`
                      : `Quartiles ${scaleLabel}`}
                    {" · dashed outline: unavailable"}
                  </p>
                </>
              ) : (
                <Skeleton className="h-10 w-64" />
              )}
            </div>
            <Button
              variant="outline"
              onClick={toggleDistrictZoom}
              disabled={!islandShapes}
              aria-pressed={isZoomedIn}
            >
              {isZoomedIn ? "Zoom out" : "Zoom to district"}
            </Button>
          </div>
        </div>

        <DrawerFooter className="flex-row items-end justify-between gap-4 border-t border-border pt-4">
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <p className="font-semibold">
              {chamberLabel} District {district}
            </p>
            {values.loading ? (
              <Skeleton className="h-5 w-56" />
            ) : (
              <p>
                {indicator.readoutLabel}:{" "}
                {selected ? (
                  <>
                    <span className="font-semibold">
                      {formatIndicator(selected.value, indicator.unit)}
                    </span>
                    {selected.moe !== null && ` (${formatMoe(selected.moe, indicator.unit)})`}
                  </>
                ) : (
                  <span className="text-muted-foreground">unavailable</span>
                )}
              </p>
            )}
            <p className="text-muted-foreground">
              {ACS_VINTAGE} · 90% margin of error · U.S. Census Bureau
            </p>
          </div>
          <DrawerClose render={<Button />}>Return to conversation</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
