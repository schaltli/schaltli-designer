// A chart on a canvas (docs/2026-10-16-charts.md, tasks/charts-designer-plan.md
// D4): the editor, the thumbnails, the preview and test-render draw it here.
// Every place comes from lib/chart-layout.ts; this file only paints it, at
// the device's resolution. On a grey or black-and-white device series are
// told apart by hatching and dashes, in series order (decision 4).

import type { ScreenObject } from "@/components/project-editor"
import type { ChartProperties, TimeRange } from "@/lib/chart"
import { DEFAULT_TIME_RANGE, normalizeChart } from "@/lib/chart"
import { chartLayout, type ChartLayout, type SeriesData } from "@/lib/chart-layout"
import { chartWindow } from "@/lib/chart-window"
import { applyColorDepth } from "@/lib/color-depth"

export interface ChartRenderOptions {
  colorDepth?: string
  /** The label font's height in px; the chart's font's size where it has one. */
  fontSize?: number
  /** The screen's time range. */
  range?: TimeRange
  /** Each series' history by id; none, and the chart is drawn empty. */
  data?: Record<string, SeriesData>
  now?: number
  tz?: string
  /** Said in the chart's middle instead of curves: no recorder, no history yet. */
  message?: string
  decimal?: string
}

const HEX = /^#[0-9a-f]{6}$/i
const DASHES: number[][] = [[], [6, 4], [2, 3], [8, 3, 2, 3]]

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function path(ctx: CanvasRenderingContext2D, points: [number, number][], close: boolean) {
  ctx.beginPath()
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  if (close) ctx.closePath()
}

/** Hatching inside the current path: four kinds, by the series' place. */
function hatch(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, pattern: number, colour: string) {
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = colour
  ctx.lineWidth = 1
  const kind = pattern % 4
  const gap = 5
  ctx.beginPath()
  const { x, y, w, h } = box
  if (kind === 2) {
    for (let yy = y; yy <= y + h; yy += gap) {
      ctx.moveTo(x, yy + 0.5)
      ctx.lineTo(x + w, yy + 0.5)
    }
  } else {
    for (let d = -h; d <= w + h; d += gap) {
      if (kind === 0 || kind === 3) {
        ctx.moveTo(x + d, y + h)
        ctx.lineTo(x + d + h, y)
      }
      if (kind === 1 || kind === 3) {
        ctx.moveTo(x + d, y)
        ctx.lineTo(x + d + h, y + h)
      }
    }
  }
  ctx.stroke()
  ctx.restore()
}

/** The chart's label size: its font's, else 14 px. */
export function chartFontSize(obj: ScreenObject, fonts: readonly { id: string; size?: number }[]): number {
  const id = (obj.properties as Record<string, unknown> | undefined)?.fontId
  return fonts.find((f) => f.id === id)?.size || 14
}

/** The layout of a chart object as the canvas draws it, now: for a test to read. */
export function layoutOf(obj: ScreenObject, options: ChartRenderOptions): ChartLayout {
  const chart = normalizeChart(obj.properties ?? {}) as ChartProperties
  const now = options.now ?? Date.now() / 1000
  const tz = options.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const window = chartWindow(chart, options.range ?? DEFAULT_TIME_RANGE, now, tz)
  return chartLayout(chart, window, options.data ?? {}, { width: obj.width, height: obj.height, fontSize: options.fontSize ?? 14, now, tz, decimal: options.decimal })
}

export function renderChart(ctx: CanvasRenderingContext2D, obj: ScreenObject, options: ChartRenderOptions = {}): void {
  const p = obj.properties as Record<string, any>
  const depth = options.colorDepth ?? "24bit"
  const grey = depth !== "24bit"
  const colour = (c: unknown, fallback: string) => applyColorDepth(typeof c === "string" && HEX.test(c) ? c : fallback, depth)
  const text = colour(p.textColor, "#1d1b20")
  const muted = colour(p.mutedColor, "#49454f")
  const grid = colour(p.lineColor, "#cac4d0")
  const fontSize = options.fontSize ?? 14
  const l = layoutOf(obj, options)

  ctx.save()
  ctx.translate(obj.x, obj.y)
  ctx.beginPath()
  ctx.rect(0, 0, obj.width, obj.height)
  ctx.clip()
  ctx.font = `${fontSize}px sans-serif`
  ctx.textBaseline = "middle"
  const { plot } = l

  // Zones, faint behind everything.
  for (const z of l.zones) {
    const c = colour(z.color, grid)
    if (grey) {
      ctx.beginPath()
      ctx.rect(z.x, z.y, z.w, z.h)
      hatch(ctx, z, 2, c)
    } else {
      ctx.fillStyle = rgba(c, 0.18)
      ctx.fillRect(z.x, z.y, z.w, z.h)
    }
  }

  // The grid: a line per value tick, the midnights stronger.
  ctx.strokeStyle = grid
  ctx.lineWidth = 1
  for (const t of l.left.ticks) {
    ctx.beginPath()
    ctx.moveTo(plot.x, Math.round(t.y) + 0.5)
    ctx.lineTo(plot.x + plot.w, Math.round(t.y) + 0.5)
    ctx.stroke()
  }
  ctx.lineWidth = 2
  for (const m of l.midnights) {
    ctx.beginPath()
    ctx.moveTo(Math.round(m.x), plot.y)
    ctx.lineTo(Math.round(m.x), plot.y + plot.h)
    ctx.stroke()
  }

  // The labels: values left (and right), times under the plot, a day's name over its midnight.
  ctx.fillStyle = muted
  ctx.textAlign = "right"
  for (const t of l.left.ticks) ctx.fillText(t.label, plot.x - 4, t.y)
  ctx.textAlign = "left"
  for (const t of l.right?.ticks ?? []) ctx.fillText(t.label, plot.x + plot.w + 4, t.y)
  ctx.textAlign = "center"
  const under = plot.y + plot.h + fontSize / 2 + 4
  for (const t of l.times) ctx.fillText(t.label, t.x, under)
  ctx.textAlign = "left"
  for (const m of l.midnights) if (m.x < plot.x + plot.w - fontSize * 2) ctx.fillText(m.label, m.x + 3, plot.y + fontSize / 2)

  // The series, clipped to the plot.
  ctx.save()
  ctx.beginPath()
  ctx.rect(plot.x, plot.y, plot.w, plot.h)
  ctx.clip()
  for (const s of l.series) {
    const c = colour(s.color, "#6750a4")
    for (const r of s.ranges) {
      path(ctx, r, true)
      ctx.fillStyle = rgba(c, 0.15)
      ctx.fill()
    }
    for (const a of s.areas) {
      path(ctx, a, true)
      if (grey) hatch(ctx, plot, s.pattern, c)
      else {
        ctx.fillStyle = rgba(c, s.draw === "stacked" ? 0.6 : 0.3)
        ctx.fill()
      }
    }
    for (const b of [...s.bands, ...s.bars]) {
      ctx.beginPath()
      ctx.rect(b.x, b.y, b.w, b.h)
      if (grey) {
        hatch(ctx, b, s.pattern, c)
        ctx.strokeStyle = c
        ctx.lineWidth = 1
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1)
      } else {
        ctx.fillStyle = c
        ctx.fill()
      }
    }
    // Where a run began: a small triangle over the band.
    ctx.fillStyle = c
    for (const x of s.starts) {
      const top = (s.bands[0]?.y ?? plot.y + plot.h) - 2
      ctx.beginPath()
      ctx.moveTo(x - 4, top - 6)
      ctx.lineTo(x + 4, top - 6)
      ctx.lineTo(x, top)
      ctx.closePath()
      ctx.fill()
    }
    ctx.strokeStyle = c
    ctx.lineWidth = 2
    ctx.setLineDash(grey ? DASHES[s.pattern % DASHES.length] : [])
    for (const line of s.lines) {
      path(ctx, line, false)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
  ctx.restore()

  // Min and max, with their figures; the NowPoint.
  for (const s of l.series) {
    const c = colour(s.color, "#6750a4")
    for (const m of s.marks) {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = text
      ctx.textAlign = "center"
      ctx.fillText(m.label, m.x, m.below ? m.y + fontSize : m.y - fontSize)
    }
    if (s.nowPoint) {
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(s.nowPoint[0], s.nowPoint[1], 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // A window that ended before now: an arrow at its right edge, now lies beyond.
  if (l.now && "past" in l.now) {
    ctx.fillStyle = muted
    ctx.textAlign = "right"
    ctx.fillText("→", plot.x + plot.w - 2, plot.y + plot.h / 2)
  }

  // The legend: a swatch in the series' colour, its name, its figures.
  for (const row of l.legend) {
    const c = colour(row.color, "#6750a4")
    const line = [row.name, ...row.figures].join("  ")
    const width = ctx.measureText(line).width
    const x0 = row.align === "right" ? row.x - width - 14 : row.x
    const y = row.y + fontSize / 2
    ctx.fillStyle = c
    ctx.fillRect(x0, y - 2, 10, 4)
    ctx.fillStyle = text
    ctx.textAlign = "left"
    ctx.fillText(line, x0 + 14, y)
  }

  // Said in the middle: no recorder, no history yet - or nothing to show at all.
  const message = options.message ?? (l.series.length === 0 ? "Chart: add a series" : undefined)
  if (message) {
    ctx.fillStyle = muted
    ctx.textAlign = "center"
    ctx.fillText(message, plot.x + plot.w / 2, plot.y + plot.h / 2)
  }
  ctx.restore()
}
