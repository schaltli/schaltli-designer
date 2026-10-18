// The pull tab (docs/2026-10-17-screen-graph.md decision 9): a short bar
// centred on every edge a swipe leads to a neighbour from, which a display
// with motion nudges towards the middle now and then. There is no object for
// it in the project; the device draws it over the screen, and the designer's
// preview and reference renderer the same. Its look was settled with the
// preview (user, 2026-10-18), and the boards draw it from these numbers
// (device contract §2.10, lib/screen-graph/vectors.json).
//
// It is a box with round ends - a shape every renderer already draws pixel
// for pixel alike - in one solid colour the designer works out: the theme's
// muted text mixed into the screen's background.
//
// A swipe moves what lies beside the navigator; the navigator stays where it
// is, as on the devices (user, 2026-10-18). So the edges are those of that
// area, the content area, and the tabs stand on its edges, not on the
// navigator.

import type { ScreenObject } from "@/components/project-editor"
import { applyColorDepth } from "@/lib/color-depth"
import type { ScreenEdge } from "@/lib/screen-graph"

export const PULL_TAB = {
  // Along the edge and across it, in screen pixels; ends round by `radius`.
  length: 32,
  thickness: 4,
  radius: 2,
  // From the edge to the tab's outer side.
  inset: 6,
  // How far a nudge takes it towards the middle, at most.
  nudge: 6,
  // How much of the muted text colour is in its colour, the rest the background's.
  mix: 0.7,
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

/** The content area beside a navigator's strip along `edge`, `thickness` deep - or the whole screen. */
export function contentAreaOfStrip(width: number, height: number, edge?: string, thickness = 0): Area {
  switch (edge) {
    case "left":
      return { x: thickness, y: 0, width: width - thickness, height }
    case "right":
      return { x: 0, y: 0, width: width - thickness, height }
    case "top":
      return { x: 0, y: thickness, width, height: height - thickness }
    case "bottom":
      return { x: 0, y: 0, width, height: height - thickness }
    default:
      return { x: 0, y: 0, width, height }
  }
}

/** What a swipe moves, for a navigator object as the designer has it (it fills its edge). */
export function contentArea(
  width: number,
  height: number,
  navigator?: { x: number; y: number; width: number; height: number; properties?: { edge?: string } },
): Area {
  if (!navigator) return contentAreaOfStrip(width, height)
  const edge = navigator.properties?.edge ?? "left"
  return contentAreaOfStrip(width, height, edge, edge === "top" || edge === "bottom" ? navigator.height : navigator.width)
}

/** The tab on one edge of `area`, `nudge` pixels towards the middle: whole pixels, centred (rounded down). */
export function pullTabRect(edge: ScreenEdge, area: Area, nudge = 0): Area {
  const along = PULL_TAB.length
  const across = PULL_TAB.thickness
  const cx = area.x + Math.floor((area.width - along) / 2)
  const cy = area.y + Math.floor((area.height - along) / 2)
  const near = PULL_TAB.inset + nudge
  switch (edge) {
    case "up":
      return { x: cx, y: area.y + near, width: along, height: across }
    case "down":
      return { x: cx, y: area.y + area.height - near - across, width: along, height: across }
    case "left":
      return { x: area.x + near, y: cy, width: across, height: along }
    case "right":
      return { x: area.x + area.width - near - across, y: cy, width: across, height: along }
  }
}

/** How far the tabs stand nudged `ms` into the animation, in whole pixels: a bump at the start of every period. */
export function pullTabNudge(ms: number): number {
  const t = ((ms % PULL_TAB.period) + PULL_TAB.period) % PULL_TAB.period
  return t < PULL_TAB.nudgeMs ? Math.round(PULL_TAB.nudge * Math.sin((Math.PI * t) / PULL_TAB.nudgeMs)) : 0
}

/** The tab's colour: the muted text mixed into the background, then brought to the device's colour depth. */
export function pullTabColor(muted: string, background: string, colorDepth?: string): string {
  const rgb = (hex: string) => {
    const h = hex.replace("#", "")
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6)
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  }
  const a = rgb(muted)
  const b = rgb(background)
  const mixed = a.map((v, i) => Math.round(v * PULL_TAB.mix + b[i] * (1 - PULL_TAB.mix)))
  return applyColorDepth(`#${mixed.map((v) => v.toString(16).padStart(2, "0")).join("")}`, colorDepth)
}

/** The tabs as the boxes every renderer draws. */
export function pullTabObjects(edges: readonly ScreenEdge[], area: Area, color: string, nudge = 0): ScreenObject[] {
  return edges.map(
    (edge) =>
      ({
        id: `pull-tab-${edge}`,
        type: "box",
        ...pullTabRect(edge, area, nudge),
        zIndex: 0,
        properties: { fillColor: color, strokeColor: color, strokeWidth: 0, cornerRadius: PULL_TAB.radius },
      }) as ScreenObject,
  )
}
