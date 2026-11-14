"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { z } from "zod"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  BUCKET_CLASSES,
  CHAMBERS,
  formatIndicator,
  loadDistrictShapes,
  quartileBreaks,
  type DistrictShapes,
  type Island,
} from "@/lib/district-map"
import { UsersRound } from "lucide-react"
import { StartWorkspaceDialog, WorkspaceStartContext } from "@/components/workspaces/start-workspace-dialog"
import { useLiveData } from "./explore-districts-drawer"
import { GROUP_FILLS, type MapBlockDistrict } from "./map-block-types"

// Leaflet needs `window`, so load the map on the client only (Next.js
// lazy-loading guide: `ssr: false` must be used from a Client Component).
const DistrictMapBlockView = dynamic(() => import("./district-map-block-view"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

/**
 * What the agent writes inside a ```district-map fenced block (see the
 * DISTRICT MAPS rules in convex/chatActions.ts).
 */
const districtNumber = z.number().int().positive()
const mapSpecSchema = z.object({
  chamber: z.enum(["house", "senate"]),
  title: z.string().min(1),
  island: z.enum(["all", "oahu", "hawaii", "maui", "kauai"]).optional(),
  home: districtNumber.optional(),
  highlight: z
    .array(
      z.object({
        district: districtNumber,
        label: z.string().optional(),
        group: z.string().optional(),
      })
    )
    .max(40)
    .optional(),
  shade: z
    .object({
      label: z.string().min(1),
      unit: z.enum(["percent", "count", "dollars"]),
      values: z.record(z.string(), z.number()),
    })
    .optional(),
  dim: z.array(z.object({ district: districtNumber, reason: z.string().optional() })).max(60).optional(),
  caption: z.string().optional(),
})
type MapSpec = z.infer<typeof mapSpecSchema>

/**
 * Lets a map block put a follow-up question in the chat box when a district
 * is clicked. Provided by the conversation page; without it, clicks do nothing.
 */
export const MapAskContext = React.createContext<((question: string) => void) | null>(null)

const ISLAND_LABELS: Record<Island, string> = {
  oahu: "Oʻahu",
  hawaii: "Hawaiʻi Island",
  maui: "Maui County",
  kauai: "Kauaʻi",
}
const ISLAND_ORDER: Island[] = ["kauai", "oahu", "maui", "hawaii"]

/** Legend swatch drawn with the same SVG classes as the map itself. */
function Swatch({ fill, dashed, weight = 1.5 }: { fill: string; dashed?: boolean; weight?: number }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="3"
        strokeWidth={weight}
        strokeDasharray={dashed ? "4 2.5" : undefined}
        className={`${fill} stroke-foreground`}
      />
    </svg>
  )
}

function parseSpec(source: string): { spec?: MapSpec; error?: string } {
  let json: unknown
  try {
    json = JSON.parse(source)
  } catch {
    return { error: "The map description is not valid JSON." }
  }
  const result = mapSpecSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    return { error: `The map description is incomplete (${issue.path.join(".") || "map"}: ${issue.message}).` }
  }
  return { spec: result.data }
}

interface DistrictMapBlockProps {
  /** The raw text inside the ```district-map block. */
  source: string
  /** While the answer streams, an unfinished block shows a placeholder. */
  isStreaming?: boolean
}

export function DistrictMapBlock({ source, isStreaming }: DistrictMapBlockProps) {
  const parsed = React.useMemo(() => parseSpec(source), [source])
  if (!parsed.spec) {
    if (isStreaming) return <Skeleton className="my-4 h-80 w-full rounded-2xl" />
    return (
      <Alert className="my-4">
        <AlertTitle>Map could not be drawn</AlertTitle>
        <AlertDescription>{parsed.error}</AlertDescription>
      </Alert>
    )
  }
  return <MapCard spec={parsed.spec} />
}

function MapCard({ spec }: { spec: MapSpec }) {
  const askAbout = React.useContext(MapAskContext)
  const workspaceInfo = React.useContext(WorkspaceStartContext)
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false)
  const chamberLabel = CHAMBERS[spec.chamber].label
  const shapesState = useLiveData<DistrictShapes>(`map-block-shapes:${spec.chamber}`, () =>
    loadDistrictShapes(spec.chamber)
  )

  // The user's district is drawn as "home" even if also listed as a highlight.
  const highlights = React.useMemo(
    () => (spec.highlight ?? []).filter((h) => h.district !== spec.home),
    [spec.highlight, spec.home]
  )

  // Group names in the order they first appear, for colours and the legend.
  const groups = React.useMemo(() => {
    const names: string[] = []
    for (const h of highlights) {
      const name = h.group?.trim() || "Highlighted"
      if (!names.includes(name)) names.push(name)
    }
    return names
  }, [highlights])

  const shadeValues = React.useMemo(() => {
    const values = new Map<number, number>()
    for (const [district, value] of Object.entries(spec.shade?.values ?? {})) {
      const n = Number(district)
      if (Number.isInteger(n) && Number.isFinite(value)) values.set(n, value)
    }
    return values
  }, [spec.shade])

  const formatValue = React.useCallback(
    (value: number) => (spec.shade ? formatIndicator(value, spec.shade.unit) : String(value)),
    [spec.shade]
  )

  const districts = React.useMemo(() => {
    const map = new Map<number, MapBlockDistrict>()
    const valueLine = (d: number) => {
      const v = shadeValues.get(d)
      return v !== undefined && spec.shade ? [`${spec.shade.label}: ${formatValue(v)}`] : []
    }
    for (const d of spec.dim ?? []) {
      map.set(d.district, {
        kind: "dim",
        tooltip: [`${chamberLabel} District ${d.district}`, ...(d.reason ? [d.reason] : []), ...valueLine(d.district)],
      })
    }
    for (const h of highlights) {
      const group = h.group?.trim() || "Highlighted"
      map.set(h.district, {
        kind: "highlight",
        label: h.label,
        group: groups.indexOf(group),
        tooltip: [
          `${h.label ? `${h.label}. ` : ""}${chamberLabel} District ${h.district}`,
          group,
          ...valueLine(h.district),
        ],
      })
    }
    if (spec.home !== undefined) {
      map.set(spec.home, {
        kind: "home",
        tooltip: [`${chamberLabel} District ${spec.home} (your district)`, ...valueLine(spec.home)],
      })
    }
    return map
  }, [spec, highlights, groups, shadeValues, formatValue, chamberLabel])

  const shading = React.useMemo(
    () => (shadeValues.size > 0 ? { values: shadeValues, breaks: quartileBreaks([...shadeValues.values()]) } : null),
    [shadeValues]
  )

  const describeOther = React.useCallback(
    (district: number) => {
      const v = shadeValues.get(district)
      return [
        `${chamberLabel} District ${district}`,
        ...(v !== undefined && spec.shade ? [`${spec.shade.label}: ${formatValue(v)}`] : []),
      ]
    },
    [shadeValues, spec.shade, formatValue, chamberLabel]
  )

  // Island groups holding the user's district or a highlighted district.
  const islandOf = React.useCallback(
    (district: number): Island | null =>
      shapesState.data?.features.find((f) => f.properties.district === district)?.properties.island ?? null,
    [shapesState.data]
  )
  const islands = React.useMemo(() => {
    const counts = new Map<Island, number>()
    if (spec.home !== undefined) {
      const home = islandOf(spec.home)
      if (home) counts.set(home, counts.get(home) ?? 0)
    }
    for (const h of highlights) {
      const island = islandOf(h.district)
      if (island) counts.set(island, (counts.get(island) ?? 0) + 1)
    }
    return ISLAND_ORDER.filter((i) => counts.has(i)).map((island) => ({ island, count: counts.get(island) ?? 0 }))
  }, [spec, highlights, islandOf])

  const [pickedView, setPickedView] = React.useState<Island | "all" | null>(null)
  const defaultView: Island | "all" =
    spec.island ?? (islands.length === 1 ? islands[0].island : spec.home !== undefined ? (islandOf(spec.home) ?? "all") : "all")
  const view = pickedView ?? defaultView

  const visibleShapes = React.useMemo((): DistrictShapes | null => {
    if (!shapesState.data) return null
    if (view === "all") return shapesState.data
    return { type: "FeatureCollection", features: shapesState.data.features.filter((f) => f.properties.island === view) }
  }, [shapesState.data, view])

  const handleSelect = React.useCallback(
    (district: number) => {
      if (!askAbout || district === spec.home) return
      askAbout(`Tell me more about ${chamberLabel} District ${district} for this: ${spec.title}.`)
    },
    [askAbout, spec.home, spec.title, chamberLabel]
  )

  const breaks = shading?.breaks ?? []
  const listed = highlights

  return (
    <Card size="sm" className="my-4 w-full">
      <CardHeader>
        <CardTitle>{spec.title}</CardTitle>
        <CardDescription>
          {chamberLabel} districts
          {spec.home !== undefined ? ` · your district: ${chamberLabel} District ${spec.home}` : ""}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {islands.length > 1 && (
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[view]}
            onValueChange={(value) => {
              // Keep the current view when the active item is pressed again.
              if (value[0]) setPickedView(value[0] as Island | "all")
            }}
            aria-label="Island shown on the map"
            className="flex-wrap"
          >
            {islands.map(({ island, count }) => (
              <ToggleGroupItem key={island} value={island}>
                {ISLAND_LABELS[island]}
                {count > 0 ? ` · ${count}` : ""}
              </ToggleGroupItem>
            ))}
            <ToggleGroupItem value="all">All islands</ToggleGroupItem>
          </ToggleGroup>
        )}

        <div className="h-72 overflow-hidden rounded-xl border bg-background sm:h-80">
          {shapesState.error ? (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
              <span>The district boundaries could not be loaded.</span>
              <Button variant="outline" size="sm" onClick={shapesState.retry}>
                Try again
              </Button>
            </div>
          ) : visibleShapes ? (
            <DistrictMapBlockView
              shapes={visibleShapes}
              viewKey={`${spec.chamber}-${view}`}
              districts={districts}
              shading={shading}
              describeOther={describeOther}
              onSelectDistrict={handleSelect}
            />
          ) : (
            <Skeleton className="size-full" />
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {spec.home !== undefined && (
            <span className="flex items-center gap-1.5">
              <Swatch fill={shading ? "fill-transparent" : "fill-primary"} weight={2.5} />
              Your district
            </span>
          )}
          {shading && spec.shade ? (
            <>
              <span className="text-foreground">{spec.shade.label}:</span>
              {BUCKET_CLASSES.map((fill, i) => (
                <span key={fill} className="flex items-center gap-1.5">
                  <Swatch fill={fill} weight={0.75} />
                  {i === 0
                    ? `up to ${formatValue(breaks[0] ?? 0)}`
                    : i === BUCKET_CLASSES.length - 1
                      ? `over ${formatValue(breaks[i - 1] ?? 0)}`
                      : `${formatValue(breaks[i - 1] ?? 0)}–${formatValue(breaks[i] ?? 0)}`}
                </span>
              ))}
              {groups.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Swatch fill="fill-transparent" weight={2} />
                  {groups.join(", ")} (outlined)
                </span>
              )}
            </>
          ) : (
            groups.map((name, i) => (
              <span key={name} className="flex items-center gap-1.5">
                <Swatch fill={GROUP_FILLS[i % GROUP_FILLS.length]} />
                {name}
              </span>
            ))
          )}
          {(spec.dim?.length ?? 0) > 0 && (
            <span className="flex items-center gap-1.5">
              <Swatch fill="fill-transparent" dashed weight={1} />
              Not included (dashed)
            </span>
          )}
        </div>

        {/* Text equivalent of the map for screen readers. */}
        <ul className="sr-only">
          {spec.home !== undefined && <li>Your district: {chamberLabel} District {spec.home}</li>}
          {listed.map((h) => (
            <li key={h.district}>
              {h.label ? `${h.label}. ` : ""}
              {chamberLabel} District {h.district}: {h.group || "Highlighted"}
              {shadeValues.has(h.district) && spec.shade
                ? `, ${spec.shade.label} ${formatValue(shadeValues.get(h.district) ?? 0)}`
                : ""}
            </li>
          ))}
          {(spec.dim ?? []).map((d) => (
            <li key={`dim-${d.district}`}>
              {chamberLabel} District {d.district}: not included{d.reason ? ` (${d.reason})` : ""}
            </li>
          ))}
        </ul>
      </CardContent>

      {(spec.caption || askAbout || (workspaceInfo && highlights.length > 0)) && (
        <CardFooter className="flex-wrap items-end justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex flex-col gap-1">
            {spec.caption && <span>{spec.caption}</span>}
            {askAbout && <span>Click a district to ask about it.</span>}
          </div>
          {workspaceInfo && highlights.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setWorkspaceOpen(true)}>
              <UsersRound data-icon="inline-start" />
              Start a shared project with these legislators
            </Button>
          )}
        </CardFooter>
      )}
      {workspaceInfo && highlights.length > 0 && (
        <StartWorkspaceDialog
          open={workspaceOpen}
          onOpenChange={setWorkspaceOpen}
          chamber={spec.chamber}
          districts={highlights.map((h) => h.district)}
          defaultName={spec.title}
          focus={spec.title}
        />
      )}
    </Card>
  )
}
