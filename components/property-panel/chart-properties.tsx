"use client"

/**
 * A chart (docs/2026-10-16-charts.md decision 8, tasks/charts-designer-plan.md
 * decision 9): the chart as a whole, its axes and zones, then its series.
 * Every change goes through normalizeChart, so the panel never stores what
 * the spec says is never stored; it offers only what fits besides.
 */

import type { ProjectFont, ScreenObject, Topic } from "../project-editor"
import { normalizeChart, type ChartAxis, type ChartProperties, type ChartZone } from "@/lib/chart"
import { ChartSeriesSection } from "./chart-series-section"
import {
  AddListItem,
  ColorField,
  FontField,
  FrameFields,
  ListItem,
  NumberField,
  NumberPair,
  PropertySection,
  PropertySections,
  SelectField,
  TextField,
  ToggleRow,
  frameSummary,
  listSummary,
} from "./fields"

interface ChartPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  colorDepth?: "1bit" | "4bit" | "24bit"
  fonts?: ProjectFont[]
  onManageFonts?: () => void
  topics?: Topic[]
  onManageTopics?: () => void
}

const MODES = [
  { value: "time", label: "Over time" },
  { value: "per-day", label: "Per day" },
]
const LEGENDS = [
  { value: "top-right", label: "Top right" },
  { value: "top-left", label: "Top left" },
  { value: "bottom", label: "Bottom" },
  { value: "none", label: "None" },
]
const SCALES = [
  { value: "auto", label: "Automatic" },
  { value: "fixed", label: "Fixed" },
  { value: "at-least", label: "At least" },
]

function AxisFields({ axis, name, onChange }: { axis: ChartAxis; name: string; onChange: (axis: ChartAxis) => void }) {
  return (
    <>
      <SelectField label="Scale" id={`${name}-scale`} value={axis.scale} options={SCALES} onChange={(scale) => onChange({ ...axis, scale: scale as ChartAxis["scale"] })} />
      {axis.scale !== "auto" ? (
        <NumberPair
          label="Range"
          names={["Min", "Max"]}
          values={[axis.min, axis.max]}
          onChange={(i, v) => onChange(i === 0 ? { ...axis, min: v } : { ...axis, max: v })}
          hint={axis.scale === "at-least" ? "Widened when a value falls outside." : undefined}
        />
      ) : null}
      <TextField label="Unit" id={`${name}-unit`} value={axis.unit} placeholder="%, °C, W" onChange={(unit) => onChange({ ...axis, unit: unit || undefined })} />
    </>
  )
}

export function ChartProperties({ selectedObject, onUpdateObject, colorDepth = "24bit", fonts = [], onManageFonts, topics = [] }: ChartPropertiesProps) {
  const chart = normalizeChart(selectedObject.properties ?? {})
  const update = (next: Partial<ChartProperties>) =>
    onUpdateObject(selectedObject.id, { properties: normalizeChart({ ...selectedObject.properties, ...next }) as unknown as Record<string, any> })
  const usesRight = chart.series.some((s) => s.axis === "right")
  const zones = chart.zones ?? []
  const setZone = (i: number, zone: ChartZone) => update({ zones: zones.map((z, k) => (k === i ? zone : z)) })

  return (
    <PropertySections>
      <PropertySection title="Chart">
        <SelectField label="Mode" id="chart-mode" value={chart.mode} options={MODES} onChange={(mode) => update({ mode: mode as ChartProperties["mode"], ...(mode === "per-day" && !chart.days ? { days: 7 } : {}) })} />
        {chart.mode === "per-day" ? <NumberField label="Days" id="chart-days" value={chart.days ?? 7} min={1} max={30} onChange={(days) => update({ days })} /> : null}
        <ToggleRow label="Scrolling" checked={chart.scroll} onChange={(scroll) => update({ scroll })} text="A swipe moves through time" />
        <SelectField label="Legend" id="chart-legend" value={chart.legend} options={LEGENDS} onChange={(legend) => update({ legend: legend as ChartProperties["legend"] })} />
        <FontField value={chart.fontId} fonts={fonts} onChange={(fontId) => update({ fontId })} onManageFonts={onManageFonts} />
      </PropertySection>

      <ChartSeriesSection chart={chart} update={update} topics={topics} colorDepth={colorDepth} />

      <PropertySection title="Left axis" defaultCollapsed>
        <AxisFields axis={chart.left} name="left" onChange={(left) => update({ left })} />
      </PropertySection>

      {usesRight ? (
        <PropertySection title="Right axis" defaultCollapsed>
          <AxisFields axis={chart.right ?? { scale: "auto" }} name="right" onChange={(right) => update({ right })} />
        </PropertySection>
      ) : null}

      <PropertySection title="Zones" defaultCollapsed summary={listSummary(zones.length, "zone")}>
        {zones.map((z, i) => (
          <ListItem key={i} title={`Zone ${i + 1}`} summary={`${z.from ?? "…"} to ${z.to ?? "…"}`} onRemove={() => update({ zones: zones.filter((_, k) => k !== i) })} defaultOpen={i === zones.length - 1}>
            {usesRight ? (
              <SelectField
                label="Axis"
                id={`zone-${i}-axis`}
                value={z.axis}
                options={[
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                ]}
                onChange={(axis) => setZone(i, { ...z, axis: axis as ChartZone["axis"] })}
              />
            ) : null}
            <NumberPair
              label="Values"
              names={["From", "To"]}
              values={[z.from, z.to]}
              onChange={(k, v) => setZone(i, k === 0 ? { ...z, from: v } : { ...z, to: v })}
              hint="Open below or above where left empty."
            />
            <ColorField label="Colour" value={z.color} colorDepth={colorDepth} onChange={(color) => setZone(i, { ...z, color })} />
          </ListItem>
        ))}
        <AddListItem label="Add zone" onClick={() => update({ zones: [...zones, { axis: "left", color: "track" }] })} />
      </PropertySection>

      <PropertySection title="Frame" defaultCollapsed summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}>
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={(key, value) => onUpdateObject(selectedObject.id, { [key]: key === "width" || key === "height" ? Math.max(1, value) : value })}
        />
      </PropertySection>
    </PropertySections>
  )
}
