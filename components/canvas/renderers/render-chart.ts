// A chart on a canvas (docs/2026-10-16-charts.md, tasks/charts-designer-plan.md
// D4): the editor, the thumbnails, the preview and test-render draw it here.
// Every place comes from lib/chart-layout.ts and every shape from
// lib/chart-shapes.ts, filled by the firmware's polygon raster into RGB565
// pixels over the screen's ground - a board's pixels exactly, as the energy
// diagram's (tasks/charts-firmware-plan.md F4); the texts are Text objects.

import type { ScreenObject } from "@/components/project-editor"
import type { ChartProperties, TimeRange } from "@/lib/chart"
import { DEFAULT_TIME_RANGE, normalizeChart } from "@/lib/chart"
import { chartLayout, type ChartLayout, type ChartText, type SeriesData } from "@/lib/chart-layout"
import { renderScreenObjects, type RenderScreenObjectsOptions } from "@/lib/render-screen"
import { chartWindow, type Zone } from "@/lib/chart-window"
import { applyColorDepth } from "@/lib/color-depth"
import { chartShapes, fadeAlpha, type Fill } from "@/lib/chart-shapes"
import { expand565, mix565, rgb565 } from "@/lib/energy-diagram"
import { fillPolygon } from "@/lib/polygon-raster"

export interface ChartRenderOptions {
  colorDepth?: string
  /** The label font's height in px; the chart's font's size where it has one. */
  fontSize?: number
  /** The date font's, for the days' names above the plot; the label font's where none. */
  dateFontSize?: number
  /** The screen's time range, and how far back it looks. */
  range?: TimeRange
  back?: number
  /** Each series' history by id; none, and the chart is drawn empty. */
  data?: Record<string, SeriesData>
  now?: number
  tz?: Zone
  /** Said in the chart's middle instead of curves: no recorder, no history yet. */
  message?: string
  decimal?: string
  /** The NowPoint's pulse, its phase 0..1 (lib/chart-shapes.ts); none, and it stands still. */
  pulse?: number
}

const HEX = /^#[0-9a-f]{6}$/i
/**
 * A chart's pixels as a board holds them: RGB565, each fill mixed over what
 * is there, a pixel no fill touched yet over the screen's ground, one never
 * touched left clear. Drawn at the canvas's resolution (`k`), so a zoomed
 * editor shows no blocks; at 1, a board's pixels exactly.
 */
class ChartPixels {
  private readonly data: Uint16Array
  private readonly touched: Uint8Array

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly ground: number,
    private readonly drawnWidth: number,
    private readonly drawnHeight: number,
  ) {
    this.data = new Uint16Array(Math.max(0, width * height))
    this.touched = new Uint8Array(Math.max(0, width * height))
  }

  fill(f: Fill, k: number): void {
    const colour = rgb565(f.colour)
    const clip = f.clip
      ? { x0: Math.floor(f.clip.x * k), y0: Math.floor(f.clip.y * k), x1: Math.ceil((f.clip.x + f.clip.w) * k), y1: Math.ceil((f.clip.y + f.clip.h) * k) }
      : { x0: 0, y0: 0, x1: this.width, y1: this.height }
    const put = (x: number, y: number, w: number) => {
      if (x < clip.x0 || y < clip.y0 || x >= clip.x1 || y >= clip.y1 || x < 0 || y < 0 || x >= this.width || y >= this.height) return
      const i = y * this.width + x
      this.data[i] = mix565(this.touched[i] ? this.data[i] : this.ground, colour, w)
      this.touched[i] = 1
    }
    const points = k === 1 ? f.points : f.points.map((p) => ({ x: Math.round(p.x * k), y: Math.round(p.y * k) }))
    // A fading fill's alpha by row, its rows scaled as the points are.
    const fade = f.fade && (k === 1 ? f.fade : { ...f.fade, y0: f.fade.y0 * k, y1: f.fade.y1 * k })
    const alphaAt = (y: number) => (fade ? fadeAlpha(fade, y) : f.alpha)
    fillPolygon(points, 0, this.height - 1, {
      fullRun: (y, x0, x1) => {
        const a = alphaAt(y)
        for (let x = x0; x <= x1; x++) put(x, y, a)
      },
      partial: (y, x, coverage) => put(x, y, Math.floor((coverage * alphaAt(y)) / 16)),
    })
  }

  drawOn(ctx: CanvasRenderingContext2D): void {
    if (this.width <= 0 || this.height <= 0 || typeof document === "undefined") return
    const off = document.createElement("canvas")
    off.width = this.width
    off.height = this.height
    const octx = off.getContext("2d")
    if (!octx) return
    const img = octx.createImageData(this.width, this.height)
    for (let i = 0; i < this.data.length; i++) {
      if (!this.touched[i]) continue
      const [r, g, b] = expand565(this.data[i])
      img.data[i * 4] = r
      img.data[i * 4 + 1] = g
      img.data[i * 4 + 2] = b
      img.data[i * 4 + 3] = 255
    }
    octx.putImageData(img, 0, 0)
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, this.drawnWidth, this.drawnHeight)
    ctx.restore()
  }
}

/** The chart's label size: its font's, else 14 px. */
export function chartFontSize(obj: ScreenObject, fonts: readonly { id: string; size?: number }[]): number {
  const id = (obj.properties as Record<string, unknown> | undefined)?.fontId
  return fonts.find((f) => f.id === id)?.size || 14
}

/** The size of the days' names above the plot: the date font's, else the label size. */
export function chartDateFontSize(obj: ScreenObject, fonts: readonly { id: string; size?: number }[]): number {
  const id = (obj.properties as Record<string, unknown> | undefined)?.dateFontId
  return fonts.find((f) => f.id === id)?.size || chartFontSize(obj, fonts)
}

/** The layout of a chart object as the canvas draws it, now: for a test to read. */
export function layoutOf(obj: ScreenObject, options: ChartRenderOptions): ChartLayout {
  const chart = normalizeChart(obj.properties ?? {}) as ChartProperties
  const now = options.now ?? Date.now() / 1000
  const tz = options.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const window = chartWindow(chart, options.range ?? DEFAULT_TIME_RANGE, now, tz, options.back ?? 0)
  return chartLayout(chart, window, options.data ?? {}, {
    width: obj.width,
    height: obj.height,
    fontSize: options.fontSize ?? 14,
    dateFontSize: options.dateFontSize,
    now,
    tz,
    decimal: options.decimal,
  })
}

/**
 * `screen`: the screen's drawing options, for the texts to be drawn in the
 * chart's font as Text objects are; without them (a test's canvas of its
 * own) the canvas's sans-serif at the font's size.
 */
export function renderChart(ctx: CanvasRenderingContext2D, obj: ScreenObject, options: ChartRenderOptions = {}, screen?: RenderScreenObjectsOptions): void {
  const p = obj.properties as Record<string, any>
  const depth = options.colorDepth ?? "24bit"
  const grey = depth !== "24bit"
  const colour = (c: unknown, fallback: string) => applyColorDepth(typeof c === "string" && HEX.test(c) ? c : fallback, depth)
  const text = colour(p.textColor, "#1d1b20")
  const muted = colour(p.mutedColor, "#49454f")
  const grid = colour(p.lineColor, "#cac4d0")
  // The line at now and a stack's NowPoint; the theme's accent (lib/themes).
  const now = colour(p.nowColor, "#e53935")
  const fontSize = options.fontSize ?? 14
  // The project's decimal separator, as a board writes its numbers with it.
  const l = layoutOf(obj, { ...options, decimal: options.decimal ?? screen?.placeholders?.separators.decimal })

  ctx.save()
  ctx.translate(obj.x, obj.y)
  ctx.beginPath()
  ctx.rect(0, 0, obj.width, obj.height)
  ctx.clip()
  const { plot } = l

  // The shapes, as a board fills them: the layout's colours taken to the
  // device's depth, a series without one in the accent.
  const coloured: ChartLayout = {
    ...l,
    zones: l.zones.map((z) => ({ ...z, color: colour(z.color, grid) })),
    series: l.series.map((s) => ({ ...s, color: colour(s.color, "#6750a4") })),
    legend: l.legend.map((r) => ({ ...r, color: colour(r.color, "#6750a4") })),
  }
  const t0 = ctx.getTransform()
  const k = Math.max(1, Math.hypot(t0.a, t0.b))
  const ground = screen?.screenBackgroundColor && screen.screenBackgroundColor !== "transparent" ? screen.screenBackgroundColor : "#ffffff"
  const px = new ChartPixels(Math.ceil(obj.width * k), Math.ceil(obj.height * k), rgb565(applyColorDepth(ground, depth)), obj.width, obj.height)
  for (const f of chartShapes(coloured, { grid, grey, now, pulse: grey ? undefined : options.pulse })) px.fill(f, k)
  px.drawOn(ctx)

  // Every text where the layout puts it - and, said in the middle, no
  // recorder, no history yet, or nothing to show at all.
  const message = options.message ?? (l.series.length === 0 ? "Chart: add a series" : undefined)
  const texts: ChartText[] = [
    ...l.texts,
    ...(message ? [{ text: message, x: plot.x, y: plot.y + plot.h / 2 - fontSize / 2, w: plot.w, h: fontSize, align: "center" as const, tone: "muted" as const }] : []),
  ]
  if (screen) {
    // In the chart's font, as a Text object draws (charts-firmware decision 3).
    const objects = texts.map(
      (t, i) =>
        ({
          id: `${obj.id}-text-${i}`,
          type: "text",
          // Whole pixels, as a board places a text box (lround).
          x: Math.round(t.x),
          y: Math.round(t.y),
          width: Math.max(1, Math.round(t.w)),
          height: t.h,
          zIndex: 1,
          properties: {
            text: t.text.replace(/\{/g, "{{").replace(/\}/g, "}}"),
            fontId: t.font === "date" ? (p.dateFontId ?? p.fontId) : p.fontId,
            textColor: t.tone === "text" ? text : muted,
            textAlign: t.align,
            backgroundColor: "transparent",
            borderColor: "transparent",
          },
        }) as ScreenObject,
    )
    renderScreenObjects(ctx, objects, { ...screen, nested: true })
  } else {
    ctx.textBaseline = "middle"
    for (const t of texts) {
      ctx.font = `${t.h}px sans-serif`
      ctx.fillStyle = t.tone === "text" ? text : muted
      ctx.textAlign = t.align
      ctx.fillText(t.text, t.align === "left" ? t.x : t.align === "right" ? t.x + t.w : t.x + t.w / 2, t.y + t.h / 2)
    }
  }
  ctx.restore()
}
