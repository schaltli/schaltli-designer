/**
 * Placing by dragging (docs/2026-10-09-snap-tables.md, module
 * place-by-dragging): a tool makes its object at a default size, held at its
 * middle under the pointer and carried like a dragged object, instead of a
 * rectangle being drawn. Most objects have no free size anyway - a
 * control's height is its size step, a text's width its words - and one
 * still carried can snap into a table as a moved one does.
 *
 * The sizes here are only where an object starts: the creation code sets
 * what follows from the type (a control at step M, a ring square, a text as
 * tall as its font), and a box, a free area, a bar or a slider are made
 * larger or smaller afterwards at their handles. Pure.
 */

import { stepPx } from "@/lib/size-scale"

// Proposed in the spec (2026-10-10), in millimetres.
const BOX_MM = { width: 20, height: 10 }
const FREE_MM = { width: 30, height: 20 }
const SWITCHER_MM = { width: 40, height: 25 }
const LEVEL_LENGTH_MM = 30
const RING_MM = 20
const CONTROL_WIDTH_MM = 25
const TEXT_WIDTH_MM = 20

/**
 * The size a tool's object starts at, in pixels; null for a tool that still
 * draws (a line, a polyline) or places otherwise (the old table's tool, a
 * block until module snap-table-blocks).
 */
export function placedSize(tool: string, pixelsPerMm: number): { width: number; height: number } | null {
  const mm = (v: number) => Math.round(v * pixelsPerMm)
  const control = stepPx("control", "m", pixelsPerMm)
  const icon = stepPx("icon", "m", pixelsPerMm)
  switch (tool) {
    case "text":
      return { width: mm(TEXT_WIDTH_MM), height: control }
    case "icon":
    case "live-icon":
      return { width: icon, height: icon }
    case "gauge":
    case "dial":
      return { width: mm(RING_MM), height: mm(RING_MM) }
    case "bar":
    case "slider":
      return { width: mm(LEVEL_LENGTH_MM), height: control }
    case "switch":
    case "button":
    case "button-group":
      return { width: mm(CONTROL_WIDTH_MM), height: control }
    case "box":
      return { width: mm(BOX_MM.width), height: mm(BOX_MM.height) }
    case "free":
      return { width: mm(FREE_MM.width), height: mm(FREE_MM.height) }
    case "switcher":
      return { width: mm(SWITCHER_MM.width), height: mm(SWITCHER_MM.height) }
    // Goes onto its edge wherever it is let go (lib/navigator.ts).
    case "navigator":
      return { width: mm(10), height: mm(10) }
    default:
      return null
  }
}

/** The rectangle of an object of `size` held at its middle under `point`. */
export function heldAt(point: { x: number; y: number }, size: { width: number; height: number }): { x: number; y: number; width: number; height: number } {
  return { x: Math.round(point.x - size.width / 2), y: Math.round(point.y - size.height / 2), width: size.width, height: size.height }
}
