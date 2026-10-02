/**
 * Layout containers (docs/2026-10-02-layout.md): objects get their place and
 * their size from the container they are in, instead of holding x, y and
 * width themselves. Width from the container, height from the object - a
 * control's from its size step, a text's from its font, both already kept in
 * `height` by the size scale (lib/size-scale.ts) and re-applied on a device
 * change - so a layout only ever writes x, y and width, and the height of a
 * container that grows with what it holds.
 *
 * The result is written into the objects, as normalizeGroups writes a
 * group's box: everything that reads positions - the canvas, the preview,
 * baked bitmaps, deploy - reads finished coordinates and knows nothing of
 * containers. Pure: objects in, objects out.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import { controlMinWidth, textWidthIn } from "@/lib/size-scale"
import { sortChildrenByZIndex } from "@/lib/object-order"
import { TABLE_TYPE, arrangeTable, tableNaturalWidth } from "@/lib/table"

// A table (lib/table.ts, docs/2026-10-02-layout-tables.md) and a free area.
// The stacks, the grid and the spacer of layout Tasks 1-12 are gone; a file
// that has them is read as tables (lib/table.ts migrateScreenToTables).
export const CONTAINER_TYPES = ["free", "table"] as const

/** What only the designer knows: the containers. A device never declares or draws them. */
export function isLayoutOnlyType(type: string | undefined): boolean {
  return isContainerType(type)
}

export type ContainerType = (typeof CONTAINER_TYPES)[number]

export function isContainerType(type: string | undefined): type is ContainerType {
  return (CONTAINER_TYPES as readonly string[]).includes(type ?? "")
}

/**
 * Spacing in millimetres, so that it grows with a device's pixel density as
 * the size steps do. Tried on the Knob and the 4.3B at Checkpoint B
 * (2026-10-02, the user): the screen keeps 2 mm from its edge, a container
 * in it none of its own - nested, each would indent its content again, and
 * on the Knob's 32 mm square that is room it does not have. 1.5 mm between
 * objects.
 */
export const DEFAULT_PADDING_MM = 2
export const DEFAULT_CONTAINER_PADDING_MM = 0
export const DEFAULT_GAP_MM = 1.5

/**
 * What a layout needs to know of the device. Without millimetres in its
 * description (lib/device-description.ts), about a 100 dpi panel.
 */
export interface LayoutScale {
  pixelsPerMm: number
  /** The project's fonts, to measure a text's words and a control's labels. */
  fonts?: readonly ProjectFont[]
}
export const FALLBACK_SCALE: LayoutScale = { pixelsPerMm: 4 }

// What a ring is drawn with when it has no track thickness of its own.
const FALLBACK_RING_THICKNESS = 10

function px(mm: number, scale: LayoutScale): number {
  return Math.round(mm * scale.pixelsPerMm)
}

export function spacing(container: ScreenObject, scale: LayoutScale): { padding: number; gap: number } {
  const props = container.properties ?? {}
  return {
    padding: px(typeof props.paddingMm === "number" ? props.paddingMm : DEFAULT_CONTAINER_PADDING_MM, scale),
    gap: px(typeof props.gapMm === "number" ? props.gapMm : DEFAULT_GAP_MM, scale),
  }
}

/**
 * What takes all the width it is given: a bar or slider (a length has no
 * natural size), and what is structure - a container, a switcher. Everything
 * else is only as wide as it needs (decided with the user 2026-10-02):
 * placed at the start of its cell or stack, not stretched.
 */
export function fills(obj: ScreenObject): boolean {
  return obj.type === "bar" || obj.type === "slider" || obj.type === "switcher" || isContainerType(obj.type)
}

/**
 * How wide an object needs to be: a text as wide as its words, in its font
 * (decided with the user 2026-10-02, not as wide as it was drawn); a switch,
 * button group or button as wide as its labels need at its height; anything
 * else as wide as it is.
 */
export function naturalWidth(obj: ScreenObject, scale: LayoutScale = FALLBACK_SCALE): number {
  // A table as its columns need (lib/table.ts).
  if (obj.type === TABLE_TYPE) return tableNaturalWidth(obj, scale)
  const fonts = scale.fonts ?? []
  if (obj.type === "text") {
    const font = fonts.find((f) => f.id === obj.properties?.fontId)
    return Math.max(1, textWidthIn(String(obj.properties?.text ?? ""), font))
  }
  if (obj.type === "switch" || obj.type === "button-group" || obj.type === "button") {
    return Math.max(1, controlMinWidth(obj, obj.height, fonts))
  }
  return obj.width
}

/**
 * How narrow an object can be: a switch, button group or button no narrower
 * than its labels need - one too wide for its room sticks out and its
 * container says so, rather than its labels being cut (the user,
 * Checkpoint B). Anything else can be as narrow as it is given.
 */
export function minimumWidth(obj: ScreenObject, scale: LayoutScale): number {
  return obj.type === "switch" || obj.type === "button-group" || obj.type === "button" ? naturalWidth(obj, scale) : 0
}

/**
 * A child given a width by its container, with the height that follows: a
 * ring keeps its diameter, but never more than the room (on the grid of its
 * track, as the size scale puts it - snapDiameter, rounded down here, so it
 * never sticks out); a container as tall as its content; a switcher as tall
 * as its tallest panel; a `free` container and everything else as tall as
 * it is.
 */
export function fit(child: ScreenObject, width: number, scale: LayoutScale): ScreenObject {
  if (child.type === "gauge" || child.type === "dial") {
    const grid = 2 * (child.properties?.thickness ?? FALLBACK_RING_THICKNESS)
    const diameter = Math.max(2 * grid, Math.floor(Math.min(child.width, width) / grid) * grid)
    return { ...child, width: diameter, height: diameter }
  }
  if (child.type === "switcher") return fitSwitcher({ ...child, width }, scale)
  // A group keeps the box around its pieces (normalizeGroups).
  if (child.type === "group") return layoutOne(child, scale)
  const laid = layoutOne({ ...child, width }, scale)
  if (laid.type === TABLE_TYPE) {
    // Grown to its content, it is too small only if it is too narrow.
    const { overflow: _measuredAtOldHeight, ...properties } = laid.properties ?? {}
    if ((properties.contentWidth ?? 0) > width) properties.overflow = true
    return { ...laid, height: properties.contentHeight ?? laid.height, properties }
  }
  return laid
}

// A switcher in a container: as tall as the tallest of its panels' content,
// each panel laid out at the switcher's width.
function fitSwitcher(switcher: ScreenObject, scale: LayoutScale): ScreenObject {
  const panels = (switcher.children ?? []).map((panel) => ({
    ...panel,
    children: (panel.children ?? []).map((child) =>
      isContainerType(child.type) && child.type !== "free" ? { ...fit(child, switcher.width, scale), x: 0, y: 0 } : child,
    ),
  }))
  const height = Math.max(0, ...panels.flatMap((panel) => (panel.children ?? []).map((child) => child.y + child.height)))
  return withFilledPanels({ ...switcher, height: height || switcher.height, children: panels }, scale)
}

/**
 * Writes what a container's content takes, and whether it is more than the
 * container has. A container inside another grows to its content; the
 * outermost keeps its size, and content that does not fit is drawn as it
 * falls and cut where the screen ends - marked here, never shrunk.
 */
export function measured(container: ScreenObject, children: ScreenObject[], contentWidth: number, contentHeight: number): ScreenObject {
  const overflow = contentHeight > container.height || contentWidth > container.width
  const properties: Record<string, any> = { ...container.properties, contentHeight, contentWidth }
  if (overflow) properties.overflow = true
  else delete properties.overflow
  return { ...container, children, properties }
}

/**
 * Every container in `objects` laid out, at any depth - in a group, in a
 * switcher's panel, in another container. Objects outside a container, and
 * those in `free`, keep their own geometry.
 */
export function layoutObjects(objects: ScreenObject[], scale: LayoutScale = FALLBACK_SCALE): ScreenObject[] {
  return objects.map((obj) => layoutOne(obj, scale))
}

// An object with its subtree laid out inside its own width and height.
function layoutOne(obj: ScreenObject, scale: LayoutScale): ScreenObject {
  // A table even when empty: its rows still take room.
  if (obj.type === TABLE_TYPE) return arrangeTable(obj, scale)
  if (!obj.children || obj.children.length === 0) return obj
  return { ...obj, children: layoutObjects(obj.children, scale) }
}

// A switcher a container places: each panel filling it (docs/device-
// contract.md), at its origin and its size, written as 0 and its size so
// that every rule that adds coordinates up - childOrigin,
// getAbsolutePosition, the firmware's - agrees on where the children are.
// A switcher outside a container is left as it was saved.
function withFilledPanels(switcher: ScreenObject, scale: LayoutScale): ScreenObject {
  return {
    ...switcher,
    children: (switcher.children ?? []).map((panel) =>
      layoutOne({ ...panel, x: 0, y: 0, width: switcher.width, height: switcher.height }, scale),
    ),
  }
}

/**
 * A screen's root container: the screen itself (docs/2026-10-02-layout.md).
 * Its objects are the root's children; `free` (every screen from before
 * containers) leaves them where they are.
 */
export interface ScreenLayout {
  type: ContainerType
  properties?: Record<string, any>
}
export const FREE_LAYOUT: ScreenLayout = { type: "free" }

/** Where a screen's root container lays out its objects, on the screen. */
export interface Area {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Where a master's screens may draw when it does not say: the whole screen,
 * or on a round screen the largest square in the circle (side = diameter /
 * √2, centred) - docs/2026-10-02-layout.md.
 */
export function defaultContentArea(screenWidth: number, screenHeight: number, shape?: "rect" | "round"): Area {
  if (shape !== "round") return { x: 0, y: 0, width: screenWidth, height: screenHeight }
  const side = Math.floor(Math.min(screenWidth, screenHeight) / Math.SQRT2)
  return { x: Math.round((screenWidth - side) / 2), y: Math.round((screenHeight - side) / 2), width: side, height: side }
}

/**
 * A master's content area: its own, kept within the screen (another device
 * can be smaller), else the default. Undefined until someone moves it, so
 * the default follows a change of device.
 */
export function contentAreaOf(
  master: { contentArea?: Area } | undefined,
  screenWidth: number,
  screenHeight: number,
  shape?: "rect" | "round",
): Area {
  const own = master?.contentArea
  if (!own) return defaultContentArea(screenWidth, screenHeight, shape)
  const x = Math.max(0, Math.min(own.x, screenWidth - 1))
  const y = Math.max(0, Math.min(own.y, screenHeight - 1))
  return { x, y, width: Math.max(1, Math.min(own.width, screenWidth - x)), height: Math.max(1, Math.min(own.height, screenHeight - y)) }
}

/**
 * A screen's objects laid out: by its root container in `area`, and every
 * container among them. The root's own properties (padding, gap, columns)
 * are the layout's.
 */
export function layoutScreenObjects(
  objects: ScreenObject[],
  layout: ScreenLayout | undefined,
  area: Area,
  scale: LayoutScale = FALLBACK_SCALE,
): ScreenObject[] {
  if (!layout || layout.type === "free") return layoutObjects(objects, scale)
  const root: ScreenObject = {
    id: "screen-root",
    type: layout.type,
    ...area,
    // The screen keeps its distance from its edge; a container in it does not.
    properties: { paddingMm: DEFAULT_PADDING_MM, ...layout.properties },
    zIndex: 0,
    children: objects,
  }
  const laid = layoutOne(root, scale).children ?? []
  return laid.map((obj) => ({ ...obj, x: obj.x + area.x, y: obj.y + area.y }))
}

/**
 * `next`, but every part of it equal to the same part of `prev` replaced by
 * `prev`'s - so a layout that moved nothing changes no reference, costs no
 * render and makes no undo step, as normalizeGroups promises.
 */
export function keepUnchanged<T>(prev: T, next: T): T {
  if (prev === next) return prev
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) return next
    let same = true
    const out = next.map((item, i) => {
      const kept = keepUnchanged(prev[i], item)
      if (kept !== prev[i]) same = false
      return kept
    })
    return (same ? prev : out) as T
  }
  if (prev && next && typeof prev === "object" && typeof next === "object" && !Array.isArray(prev) && !Array.isArray(next)) {
    const p = prev as Record<string, unknown>
    const n = next as Record<string, unknown>
    const keys = Object.keys(n)
    if (keys.length !== Object.keys(p).length) return next
    let same = true
    const out: Record<string, unknown> = {}
    for (const key of keys) {
      if (!(key in p)) return next
      out[key] = keepUnchanged(p[key], n[key])
      if (out[key] !== p[key]) same = false
    }
    return (same ? prev : out) as T
  }
  return next
}

/**
 * Every screen of a project laid out - the pass after every change. The
 * same reference where nothing moved.
 */
export function layoutProject<P extends {
  screens?: Array<LaidOutScreen>
  fonts?: readonly ProjectFont[]
  screenWidth?: number
  screenHeight?: number
  settings?: { pixelsPerMm?: number; screenShape?: "rect" | "round" }
}>(project: P): P {
  if (!project?.screens) return project
  const scale: LayoutScale = {
    pixelsPerMm: project.settings?.pixelsPerMm ?? FALLBACK_SCALE.pixelsPerMm,
    fonts: project.fonts,
  }
  let changed = false
  const allScreens = project.screens
  const screens = project.screens.map((screen) => {
    const objects = screen.objects ?? []
    const area = layoutAreaOf(screen, allScreens, project.screenWidth ?? 0, project.screenHeight ?? 0, project.settings?.screenShape)
    const laid = keepUnchanged(objects, layoutScreenObjects(objects, screen.layout, area, scale))
    if (laid === objects) return screen
    changed = true
    return { ...screen, objects: laid }
  })
  return changed ? { ...project, screens } : project
}

/** What layoutProject needs of a screen. */
export interface LaidOutScreen {
  id?: string
  objects?: ScreenObject[]
  layout?: ScreenLayout
  isMaster?: boolean
  masterScreenId?: string
  showMaster?: boolean
  contentArea?: Area
}

/**
 * Where a screen's root container lays out: its master's content area - the
 * master as lib/master-screen.ts resolveMasterScreen finds it (assigned, a
 * master, shown) - else the whole screen. A master's own objects use the
 * whole screen.
 */
export function layoutAreaOf(
  screen: LaidOutScreen,
  allScreens: readonly LaidOutScreen[],
  screenWidth: number,
  screenHeight: number,
  shape?: "rect" | "round",
): Area {
  const master =
    !screen.isMaster && screen.masterScreenId && screen.showMaster !== false
      ? allScreens.find((s) => s.id === screen.masterScreenId && s.isMaster)
      : undefined
  return master ? contentAreaOf(master, screenWidth, screenHeight, shape) : { x: 0, y: 0, width: screenWidth, height: screenHeight }
}
