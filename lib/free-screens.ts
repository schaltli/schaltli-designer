/**
 * Screens are always free (docs/2026-10-03-free-screens.md): what a project
 * saved before that keeps of a screen's own layout, made objects.
 *
 * A screen whose root laid out its objects - a table, a stack, a row, a
 * grid - gets one old table object instead, where the root laid them out -
 * in its master's content area, the root's padding in - which the load
 * then dissolves (lib/table.ts dissolveOldTables), so nothing moves. Then a
 * screen's `layout` and a master's `contentArea` go: they no longer place
 * anything. Run on load (lib/object-types.ts migrateProject); idempotent.
 */

import type { ScreenObject } from "@/components/project-editor"
import { isOldRoot } from "@/lib/table"

interface Area {
  x: number
  y: number
  width: number
  height: number
}

interface SavedScreen {
  id?: string
  objects?: ScreenObject[]
  layout?: { type: string; properties?: Record<string, any> }
  isMaster?: boolean
  masterScreenId?: string
  showMaster?: boolean
  contentArea?: Area
}

// What the root kept from its area's edge, and the scale a project without
// millimetres was laid out at (lib/layout.ts FALLBACK_SCALE).
const ROOT_PADDING_MM = 2
const FALLBACK_PIXELS_PER_MM = 4

// Where a master's screens drew when it did not say: the whole screen, on a
// round one the largest square in the circle.
function defaultContentArea(width: number, height: number, shape?: "rect" | "round"): Area {
  if (shape !== "round") return { x: 0, y: 0, width, height }
  const side = Math.floor(Math.min(width, height) / Math.SQRT2)
  return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), width: side, height: side }
}

// A master's content area, kept within the screen.
function contentAreaOf(master: SavedScreen, width: number, height: number, shape?: "rect" | "round"): Area {
  const own = master.contentArea
  if (!own) return defaultContentArea(width, height, shape)
  const x = Math.max(0, Math.min(own.x, width - 1))
  const y = Math.max(0, Math.min(own.y, height - 1))
  return { x, y, width: Math.max(1, Math.min(own.width, width - x)), height: Math.max(1, Math.min(own.height, height - y)) }
}

// Where a screen's root laid out: its master's content area, else the screen.
function rootArea(screen: SavedScreen, screens: readonly SavedScreen[], width: number, height: number, shape?: "rect" | "round"): Area {
  const master =
    !screen.isMaster && screen.masterScreenId && screen.showMaster !== false
      ? screens.find((s) => s.id === screen.masterScreenId && s.isMaster)
      : undefined
  return master ? contentAreaOf(master, width, height, shape) : { x: 0, y: 0, width, height }
}

export function migrateToFreeScreens(project: {
  screens?: unknown[]
  screenWidth?: number
  screenHeight?: number
  settings?: { pixelsPerMm?: number; screenShape?: "rect" | "round" } | object
}): void {
  const screens = (project.screens ?? []) as SavedScreen[]
  const settings = (project.settings ?? {}) as { pixelsPerMm?: number; screenShape?: "rect" | "round" }
  const pixelsPerMm = settings.pixelsPerMm ?? FALLBACK_PIXELS_PER_MM
  for (const screen of screens) {
    if (!screen.layout || !isOldRoot(screen.layout.type)) continue
    const area = rootArea(screen, screens, project.screenWidth ?? 0, project.screenHeight ?? 0, settings.screenShape)
    const { paddingMm, ...properties } = screen.layout.properties ?? {}
    const pad = Math.round((typeof paddingMm === "number" ? paddingMm : ROOT_PADDING_MM) * pixelsPerMm)
    screen.objects = [
      {
        id: `table-${screen.id ?? "screen"}`,
        type: "table",
        x: area.x + pad,
        y: area.y + pad,
        width: Math.max(1, area.width - 2 * pad),
        height: Math.max(1, area.height - 2 * pad),
        zIndex: 0,
        properties,
        children: screen.objects ?? [],
      } as ScreenObject,
    ]
  }
  for (const screen of screens) {
    delete screen.layout
    delete screen.contentArea
  }
}
