// A chart on a canvas, for now (tasks/charts-model-plan.md decision 6): its
// frame, its axes and its series' names, each in its colour - so a chart
// loaded from a file is there to select, move and resize. The curves come
// with charts-designer.

import type { ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"

const PAD = 8
const LINE = 16

export function renderChart(ctx: CanvasRenderingContext2D, obj: ScreenObject, colorDepth?: string): void {
  const p = obj.properties as Record<string, any>
  const colour = (c: unknown, fallback: string) => applyColorDepth(typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c : fallback, colorDepth)
  const grid = colour(p.lineColor, "#cac4d0")
  const text = colour(p.textColor, "#1d1b20")
  const { x, y, width: w, height: h } = obj

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.strokeStyle = grid
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  // The axes: left and bottom.
  ctx.beginPath()
  ctx.moveTo(x + PAD + 0.5, y + PAD)
  ctx.lineTo(x + PAD + 0.5, y + h - PAD - 0.5)
  ctx.lineTo(x + w - PAD, y + h - PAD - 0.5)
  ctx.stroke()

  ctx.font = "13px sans-serif"
  ctx.textBaseline = "top"
  const series: { name?: string; color?: string }[] = Array.isArray(p.series) ? p.series : []
  const names = series.length > 0 ? series : [{ name: "Chart", color: text }]
  names.forEach((s, i) => {
    const top = y + PAD * 2 + i * LINE
    if (top + LINE > y + h - PAD) return
    ctx.fillStyle = colour(s.color, text)
    ctx.fillRect(x + PAD * 3, top + 4, 10, 3)
    ctx.fillStyle = text
    ctx.fillText(s.name || "Series", x + PAD * 3 + 16, top)
  })
  ctx.restore()
}
