"use client"

/**
 * A chart's series (docs/2026-10-16-charts.md decision 8,
 * tasks/charts-designer-plan.md D9): added from a topic, its kind guessed
 * (lib/chart-infer.ts), then each field of its own. Only what fits its kind
 * and the chart's mode is offered; normalizeChart drops the rest.
 */

import type { Topic } from "../project-editor"
import {
  SERIES_COLOURS,
  allowedAnnotations,
  allowedDailyValues,
  allowedDraws,
  defaultSeries,
  nextSeriesId,
  type Annotation,
  type ChartProperties,
  type ChartSeries,
  type ValueKind,
} from "@/lib/chart"
import { inferValueKind } from "@/lib/chart-infer"
import { extractJsonField } from "@/lib/json-path"
import { AddListItem, ColorField, ListItem, NumberField, PropertySection, SelectField, TextField, ToggleRow, listSummary } from "./fields"

const KINDS = [
  { value: "level", label: "Level" },
  { value: "power", label: "Power" },
  { value: "state", label: "State" },
]
const DRAW_LABELS: Record<string, string> = { line: "Line", area: "Area", steps: "Steps", band: "Band", stacked: "Stacked", bars: "Bars" }
const ANNOTATION_LABELS: Record<Annotation, string> = {
  current: "The value now",
  min: "Its minimum",
  max: "Its maximum",
  sum: "Energy in the window",
  runtime: "How long it ran",
  starts: "How often it started",
}
const DAILY_LABELS: Record<string, string> = { energy: "Energy", decline: "Decline", rise: "Rise", mean: "Mean", min: "Minimum", max: "Maximum", runtime: "Run time" }

/** Every topic and JSON field a series can read: `topic` or `topic#path`. */
function readables(topics: readonly Topic[]): { value: string; label: string }[] {
  return topics
    .filter((t) => t.topic && !t.local)
    .flatMap((t) => [{ value: t.topic, label: t.topic }, ...(t.subtopics ?? []).map((s) => ({ value: `${t.topic}#${s.path}`, label: `${t.topic} › ${s.label ?? s.path}` }))])
}

function examplesFor(reference: string, topics: readonly Topic[]): string[] {
  const [name, path] = reference.split("#")
  const examples = topics.find((t) => t.topic === name)?.examples ?? []
  return examples.map((e) => (path ? extractJsonField(e, path) : e)).filter((e): e is string => e !== undefined)
}

/** A new series reading `reference`: its kind guessed, named after the topic's last part, the next colour. */
export function newSeries(reference: string, chart: ChartProperties, topics: readonly Topic[]): ChartSeries {
  const valueKind = inferValueKind({ examples: examplesFor(reference, topics) })
  const [name, path] = reference.split("#")
  const defaults = defaultSeries(valueKind)
  return {
    id: nextSeriesId(chart.series),
    source: { kind: "topic", topic: reference },
    name: path ?? name.split("/").pop() ?? reference,
    valueKind,
    ...defaults,
    draw: chart.mode === "per-day" ? "bars" : defaults.draw,
    color: SERIES_COLOURS[chart.series.length % SERIES_COLOURS.length],
  }
}

interface Props {
  chart: ChartProperties
  update: (next: Partial<ChartProperties>) => void
  topics: readonly Topic[]
  colorDepth: "1bit" | "4bit" | "24bit"
}

export function ChartSeriesSection({ chart, update, topics, colorDepth }: Props) {
  const list = chart.series
  const set = (i: number, next: Partial<ChartSeries>) => update({ series: list.map((s, k) => (k === i ? { ...s, ...next } : s)) })
  const options = readables(topics)
  const stacked = list.some((s) => s.draw === "stacked")

  return (
    <PropertySection title="Series" summary={listSummary(list.length, "series", "series")}>
      {list.map((s, i) => {
        const id = (field: string) => `series-${i}-${field}`
        const kindChanged = (valueKind: ValueKind) => set(i, { valueKind, ...defaultSeries(valueKind), ...(chart.mode === "per-day" ? { draw: "bars" as const } : {}) })
        const on = s.onMeans?.[0]
        return (
          <ListItem
            key={s.id}
            title={s.name || `Series ${i + 1}`}
            summary={`${KINDS.find((k) => k.value === s.valueKind)?.label} · ${DRAW_LABELS[s.draw]}`}
            onRemove={() => update({ series: list.filter((_, k) => k !== i) })}
            defaultOpen={i === list.length - 1}
            index={i}
            onReorder={(from, to) => {
              const next = [...list]
              const [moved] = next.splice(from, 1)
              next.splice(to, 0, moved)
              update({ series: next })
            }}
          >
            {s.draw === "stacked" ? (
              <SelectField
                label="Source"
                id={id("source")}
                value={s.source.kind}
                options={[
                  { value: "topic", label: "A topic" },
                  { value: "balance", label: "The balance of the others" },
                ]}
                onChange={(kind) => set(i, { source: kind === "balance" ? { kind: "balance" } : { kind: "topic", topic: options[0]?.value ?? "" } })}
              />
            ) : null}
            {s.source.kind === "topic" ? (
              <SelectField label="Reads" id={id("topic")} value={s.source.topic} options={options} onChange={(topic) => set(i, { source: { kind: "topic", topic } })} />
            ) : null}
            <TextField label="Name" id={id("name")} value={s.name} onChange={(name) => set(i, { name })} />
            <SelectField label="Kind" id={id("kind")} value={s.valueKind} options={KINDS} onChange={(k) => kindChanged(k as ValueKind)} />
            {s.valueKind === "state" ? (
              <>
                <SelectField
                  label="On when"
                  id={id("on")}
                  value={on ? "equals" : "yes"}
                  options={[
                    { value: "yes", label: "It says yes (on, true, 1)" },
                    { value: "equals", label: "It equals" },
                  ]}
                  onChange={(v) => set(i, { onMeans: v === "equals" ? [{ op: "==", value: "on" }] : undefined })}
                />
                {on ? <TextField label="Value" id={id("on-value")} value={on.value} onChange={(value) => set(i, { onMeans: [{ op: "==", value }] })} /> : null}
              </>
            ) : null}
            <SelectField
              label="Drawn as"
              id={id("draw")}
              value={s.draw}
              options={allowedDraws(s.valueKind, chart.mode).map((d) => ({ value: d, label: DRAW_LABELS[d] }))}
              onChange={(draw) => set(i, { draw: draw as ChartSeries["draw"] })}
            />
            {s.draw === "stacked" ? <TextField label="Stack" id={id("stack")} value={s.stack} placeholder="One name per stack" onChange={(stack) => set(i, { stack: stack || undefined })} /> : null}
            {s.valueKind !== "state" ? (
              <>
                <NumberField label="Factor" id={id("factor")} value={s.factor ?? 1} step={0.001} hint="Shown = received × factor: 0.001 for mV as V." onChange={(factor) => set(i, { factor: factor === 1 ? undefined : factor })} />
                <TextField label="Unit" id={id("unit")} value={s.unit} placeholder="%, °C, W" onChange={(unit) => set(i, { unit: unit || undefined })} />
                <NumberField label="Decimals" id={id("decimals")} value={s.decimals} min={0} max={4} placeholder="auto" onChange={(decimals) => set(i, { decimals })} />
              </>
            ) : null}
            {s.valueKind === "power" ? <ToggleRow label="Reverse sign" checked={!!s.invert} onChange={(invert) => set(i, { invert: invert || undefined })} text="The topic counts the other way round" /> : null}
            <SelectField
              label="Axis"
              id={id("axis")}
              value={s.axis ?? "left"}
              options={[
                { value: "left", label: "Left" },
                { value: "right", label: "Right" },
              ]}
              onChange={(axis) => set(i, { axis: axis === "right" ? "right" : undefined })}
            />
            <ColorField label="Colour" value={s.color} colorDepth={colorDepth} onChange={(color) => set(i, { color })} />
            {s.valueKind !== "state" && chart.mode === "time" && s.draw !== "stacked" ? (
              <ToggleRow label="Range" checked={!!s.range} onChange={(range) => set(i, { range: range || undefined })} text="Each step's minimum and maximum, faintly" />
            ) : null}
            {chart.mode === "per-day" ? (
              <SelectField
                label="Per day"
                id={id("daily")}
                value={s.dailyValue ?? allowedDailyValues(s.valueKind)[0]}
                options={allowedDailyValues(s.valueKind).map((d) => ({ value: d, label: DAILY_LABELS[d] }))}
                onChange={(dailyValue) => set(i, { dailyValue: dailyValue as ChartSeries["dailyValue"] })}
              />
            ) : null}
            {allowedAnnotations(s.valueKind).map((a) => (
              <ToggleRow
                key={a}
                label={a === allowedAnnotations(s.valueKind)[0] ? "Shows" : ""}
                checked={!!s.annotations?.includes(a)}
                onChange={(onOff) => set(i, { annotations: onOff ? [...(s.annotations ?? []), a] : (s.annotations ?? []).filter((x) => x !== a) })}
                text={ANNOTATION_LABELS[a]}
              />
            ))}
          </ListItem>
        )
      })}
      {options.length > 0 ? (
        <SelectField
          label="Add"
          id="series-add"
          value=""
          placeholder={stacked ? "Add a series to the stack…" : "Add a series from a topic…"}
          options={options}
          onChange={(reference) => reference && update({ series: [...list, newSeries(reference, chart, topics)] })}
        />
      ) : (
        <AddListItem label="Add series" onClick={() => update({ series: [...list, newSeries("", chart, topics)] })} />
      )}
    </PropertySection>
  )
}
