// The pull tab (docs/2026-10-17-screen-graph.md decision 9): a short line
// centred on every edge a swipe leads to a neighbour from, which a colour
// display nudges towards the middle now and then. There is no object for it;
// the device draws it over the screen, and the designer's preview the same.
// Its look was settled with the preview (user, 2026-10-18), so the boards
// draw it from these numbers.
//
// A swipe moves what lies beside the navigator; the navigator stays where it
// is, as on the devices (user, 2026-10-18). So the edges are those of that
// area, the content area, and the tabs stand on its edges, not on the
// navigator.

import type { ScreenEdge } from "@/lib/screen-graph"

export const PULL_TAB = {
  // Along the edge and across it, in screen pixels; round ends.
  length: 32,
  thickness: 4,
  // From the edge to the tab's outer side.
  inset: 6,
  // How far a nudge takes it towards the middle, at most.
  nudge: 6,
  // Drawn in the theme's muted text colour, at this opacity.
  opacity: 0.7,
  // A nudge every `period` ms, lasting `nudgeMs`: out and back once.
  period: 5000,
  nudgeMs: 800,
} as const

export interface Area {
  x: number
  y: number
  width: number
  height: number
}

/**
 * What a swipe moves: the screen less the navigator's strip along its edge,
 * or the whole screen where there is none.
 */
export function contentArea(
  width: number,
  height: number,
  navigator?: { x: number; y: number; width: number; height: number; properties?: { edge?: string } },
): Area {
  if (!navigator) return { x: 0, y: 0, width, height }
  switch (navigator.properties?.edge) {
    case "right":
      return { x: 0, y: 0, width: navigator.x, height }
    case "top":
      return { x: 0, y: navigator.y + navigator.height, width, height: height - navigator.y - navigator.height }
    case "bottom":
      return { x: 0, y: 0, width, height: navigator.y }
    default:
      return { x: navigator.x + navigator.width, y: 0, width: width - navigator.x - navigator.width, height }
  }
}

/** The tab on one edge of `area` as a line with round caps, `nudge` pixels towards the middle. */
export function pullTabLine(edge: ScreenEdge, area: Area, nudge = 0) {
  const half = (PULL_TAB.length - PULL_TAB.thickness) / 2
  const across = PULL_TAB.inset + PULL_TAB.thickness / 2 + nudge
  const cx = area.x + area.width / 2
  const cy = area.y + area.height / 2
  switch (edge) {
    case "up":
      return { x1: cx - half, y1: area.y + across, x2: cx + half, y2: area.y + across }
    case "down":
      return { x1: cx - half, y1: area.y + area.height - across, x2: cx + half, y2: area.y + area.height - across }
    case "left":
      return { x1: area.x + across, y1: cy - half, x2: area.x + across, y2: cy + half }
    case "right":
      return { x1: area.x + area.width - across, y1: cy - half, x2: area.x + area.width - across, y2: cy + half }
  }
}

/** How far the tabs stand nudged `ms` into the animation: a smooth bump at the start of every period. */
export function pullTabNudge(ms: number): number {
  const t = ms % PULL_TAB.period
  return t < PULL_TAB.nudgeMs ? PULL_TAB.nudge * Math.sin((Math.PI * t) / PULL_TAB.nudgeMs) : 0
}

export function drawPullTabs(ctx: CanvasRenderingContext2D, edges: readonly ScreenEdge[], area: Area, color: string, nudge = 0) {
  if (edges.length === 0) return
  ctx.save()
  ctx.globalAlpha = PULL_TAB.opacity
  ctx.strokeStyle = color
  ctx.lineWidth = PULL_TAB.thickness
  ctx.lineCap = "round"
  ctx.beginPath()
  for (const edge of edges) {
    const { x1, y1, x2, y2 } = pullTabLine(edge, area, nudge)
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
  }
  ctx.stroke()
  ctx.restore()
}
