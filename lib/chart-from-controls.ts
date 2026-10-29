// A page's history, proposed from its controls (docs/2026-10-16-charts.md
// decision 12 and «What a control gives»; tasks/charts-designer-plan.md
// decision 10). Each series takes over its control's topic, kind, colour and
// range once, when it is made; afterwards it is the chart's own.

import { SERIES_COLOURS, defaultChart, isRoleOrHex, type ChartProperties, type ChartSeries } from "@/lib/chart"
import { settableRange, type CalibrationPoint } from "@/lib/settable-level"
import type { EnergyNode } from "@/lib/energy-diagram"
import type { LiveValue } from "@/lib/live-value"

interface Control {
  id?: string
  type: string
  properties?: Record<string, any>
  children?: Control[]
}

/** What a series takes from its control: the series without id and, where the control has none, colour. */
type Proposed = Omit<ChartSeries, "id" | "color"> & { color?: string; axisRange?: { min: number; max: number } }

const lastPart = (topic: string) => {
  const [name, path] = topic.split("#")
  return path ?? name.split("/").pop() ?? topic
}

const colourOf = (c: unknown) => (isRoleOrHex(c) ? (c as string) : undefined)

/** The series one control gives; none for what tells nothing over time. */
export function seriesFromControl(obj: Control): Proposed[] {
  const p = obj.properties ?? {}
  const topic = typeof p.topic === "string" && p.topic && !p.topic.startsWith("combined:") ? p.topic : undefined
  switch (obj.type) {
    case "bar":
    case "gauge": {
      if (!topic) return []
      const range = settableRange(p.calibrationPoints as CalibrationPoint[] | undefined, undefined)
      return [{ source: { kind: "topic", topic }, name: lastPart(topic), valueKind: "level", draw: "line", annotations: ["current"], color: colourOf(p.fillColor), ...(range ? { axisRange: { min: range.min, max: range.max } } : {}) }]
    }
    case "slider":
    case "dial": {
      // What a finger set it to: a stepped target line.
      const read = typeof p.setpointTopic === "string" && p.setpointTopic ? p.setpointTopic : topic
      if (!read) return []
      const range = settableRange(p.calibrationPoints as CalibrationPoint[] | undefined, undefined)
      return [{ source: { kind: "topic", topic: read }, name: "Target", valueKind: "level", draw: "steps", annotations: [], color: colourOf(p.fillColor), ...(range ? { axisRange: { min: range.min, max: range.max } } : {}) }]
    }
    case "switch":
    case "button-group": {
      if (!topic) return []
      const on = ((p.states ?? []) as { readValue?: string; showAsOn?: boolean; showMarker?: boolean }[])
        .filter((s) => (s.showAsOn ?? s.showMarker) && s.readValue !== undefined && s.readValue !== "")
        .map((s) => ({ op: "==" as const, value: String(s.readValue) }))
      return [{ source: { kind: "topic", topic }, name: lastPart(topic), valueKind: "state", draw: "band", annotations: ["runtime"], ...(on.length > 0 ? { onMeans: on } : {}), color: colourOf(p.switchColor) }]
    }
    case "text": {
      return ((p.liveValues ?? []) as LiveValue[])
        .filter((lv) => lv.source?.namespace === "topic" && lv.source.path)
        .map((lv) => ({
          source: { kind: "topic", topic: lv.source.path! },
          name: lastPart(lv.source.path!),
          valueKind: "level" as const,
          draw: "line" as const,
          annotations: ["current" as const],
          ...(lv.format?.kind === "number" ? { decimals: lv.format.decimals } : {}),
        }))
    }
    case "energy-diagram": {
      // One stack: sources above zero, sinks below, the storage signed, the rest the balance.
      return ((p.nodes ?? []) as EnergyNode[])
        .filter((n) => n.role !== "bus" && (n.role === "rest" || n.topic))
        .map((n) => ({
          source: n.role === "rest" ? { kind: "balance" as const } : { kind: "topic" as const, topic: n.topic! },
          name: n.name,
          valueKind: "power" as const,
          unit: "W",
          draw: "stacked" as const,
          stack: obj.id ?? "energy",
          annotations: ["sum" as const],
          // A sink takes, and a storage reports taking as positive: both
          // drawn turned, so taking lies below zero and a storage giving above.
          ...((n.role === "sink" || n.role === "storage") !== !!n.reverseSign && n.role !== "rest" ? { invert: true } : {}),
          color: colourOf(n.colorRole) ?? "energyLoad",
        }))
    }
  }
  return []
}

/**
 * The charts a page's controls propose (decision 10): the series in their
 * order, each topic once; series of one unit on one axis, a second unit on
 * the right, a third and on in a chart below. None where nothing tells
 * anything over time.
 */
export function historyCharts(objects: readonly Control[], colours: readonly string[]): ChartProperties[] {
  const proposed: Proposed[] = []
  const walk = (list: readonly Control[]) => {
    for (const o of list) {
      for (const s of seriesFromControl(o)) {
        const key = s.source.kind === "topic" ? s.source.topic : `balance:${s.stack}`
        if (!proposed.some((x) => (x.source.kind === "topic" ? x.source.topic : `balance:${x.stack}`) === key)) proposed.push(s)
      }
      if (o.children) walk(o.children)
    }
  }
  walk(objects)
  if (proposed.length === 0) return []

  // Grouped by unit (a state has none and goes with the first), two units a chart.
  const units: string[] = []
  for (const s of proposed) if (s.valueKind !== "state" && !units.includes(s.unit ?? "")) units.push(s.unit ?? "")
  if (units.length === 0) units.push("")
  const charts: ChartProperties[] = []
  for (let c = 0; c < units.length; c += 2) {
    const [leftUnit, rightUnit] = [units[c], units[c + 1]]
    const unitOf = (s: Proposed) => s.unit ?? ""
    const inChart = proposed.filter((s) => (s.valueKind === "state" ? c === 0 : unitOf(s) === leftUnit || unitOf(s) === rightUnit))
    const series: ChartSeries[] = inChart.map((s, i) => {
      const { axisRange: _range, color, ...rest } = s
      const right = rightUnit !== undefined && s.valueKind !== "state" && (s.unit ?? "") === rightUnit
      return { ...rest, id: `s${i + 1}`, color: color ?? colours[i % colours.length], ...(right ? { axis: "right" as const } : {}) }
    })
    const axisFor = (unit: string | undefined) => {
      const ranges = inChart.filter((s) => (s.unit ?? "") === (unit ?? "") && s.axisRange).map((s) => s.axisRange!)
      const min = ranges.length > 0 ? Math.min(...ranges.map((r) => r.min)) : undefined
      const max = ranges.length > 0 ? Math.max(...ranges.map((r) => r.max)) : undefined
      return min !== undefined && max !== undefined && max > min
        ? { scale: "fixed" as const, min, max, ...(unit ? { unit } : {}) }
        : { scale: "auto" as const, ...(unit ? { unit } : {}) }
    }
    charts.push({
      ...defaultChart(),
      scroll: true,
      left: axisFor(leftUnit),
      ...(rightUnit !== undefined && series.some((s) => s.axis === "right") ? { right: axisFor(rightUnit) } : {}),
      series,
    })
  }
  return charts
}

// ---- «Add history below» (decision 10)

interface HistoryProject {
  nextId?: number
  hardwareButtons?: readonly { id: string; name: string }[]
  screenWidth: number
  screenHeight: number
  fonts?: readonly { id: string; size?: number }[]
  screens: readonly { id: string; name: string; isMaster?: boolean; hidden?: boolean; screenType?: string; masterScreenId?: string; dock?: { screenId: string; edge: string }; objects: readonly Control[] }[]
}

/** The charts a page would get below it; none where it cannot have a history or its controls tell nothing. */
export function historyBelowOf(project: HistoryProject, screenId: string): ChartProperties[] {
  const page = project.screens.find((s) => s.id === screenId)
  if (!page || page.isMaster || page.hidden || page.screenType === "popup" || page.dock) return []
  if (project.screens.some((s) => s.dock?.screenId === screenId && s.dock.edge === "down")) return []
  return historyCharts(page.objects, SERIES_COLOURS)
}

/**
 * The project with a history docked below a page (decision 12): «<page>
 * history», opening on 24 hours, its charts the full width, stacked under a
 * pull tab's height. Null where the page offers none.
 */
export function withHistoryBelow<P extends HistoryProject>(project: P, screenId: string): { project: P; newId: string } | null {
  const charts = historyBelowOf(project, screenId)
  if (charts.length === 0) return null
  const page = project.screens.find((s) => s.id === screenId)!
  let nextId = project.nextId || 0
  const top = 40
  const height = Math.floor((project.screenHeight - top) / charts.length)
  const font = [...(project.fonts ?? [])].sort((a, b) => Math.abs((a.size || 0) - 14) - Math.abs((b.size || 0) - 14))[0]
  const objects = charts.map((chart, i) => {
    nextId++
    return {
      id: `obj-${nextId}`,
      type: "chart",
      x: 0,
      y: top + i * height,
      width: project.screenWidth,
      height,
      zIndex: i + 1,
      properties: { ...chart, ...(font ? { fontId: font.id } : {}) },
    }
  })
  const id = `screen-${nextId + 1}`
  nextId += 2
  const screen = {
    id,
    name: `${page.name} history`,
    masterScreenId: page.masterScreenId,
    timeRange: "24h",
    dock: { screenId, edge: "down" },
    ...(Object.keys(historyActions(project.hardwareButtons ?? [])).length > 0 ? { buttonActions: historyActions(project.hardwareButtons ?? []) } : {}),
    objects,
  }
  return { project: { ...project, nextId, screens: [...project.screens, screen] }, newId: id }
}

/**
 * What a history page's gestures and keys do from the start
 * (tasks/charts-actions-plan.md decision 6): pinch in widens, pinch out
 * narrows, where the device reads two fingers; a ring turned right moves
 * later and left earlier. The knob has no press of its own among its keys,
 * so «Set the time range» on it is the author's to give.
 */
export function historyActions(buttons: readonly { id: string; name: string }[]): Record<string, { type: string; rangeDirection?: string }> {
  const out: Record<string, { type: string; rangeDirection?: string }> = {}
  for (const b of buttons) {
    if (b.id === "pinch-in") out[b.id] = { type: "widen-range" }
    else if (b.id === "pinch-out") out[b.id] = { type: "narrow-range" }
    else if (/rotate\s*right/i.test(b.name)) out[b.id] = { type: "move-range", rangeDirection: "later" }
    else if (/rotate\s*left/i.test(b.name)) out[b.id] = { type: "move-range", rangeDirection: "earlier" }
  }
  return out
}
