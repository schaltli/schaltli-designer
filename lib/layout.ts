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

/**
 * The order a container places its children in: their stacking numbers,
 * ascending. Children of a container never overlap, so the number says
 * nothing else there - and the object tree's moves (moveObjectToParent),
 * which renumber, and the insertion line, which numbers in its order, both
 * already speak it.
 */
export function layoutOrder(children: ScreenObject[] | undefined): ScreenObject[] {
  return sortChildrenByZIndex(children ?? [])
}

export const CONTAINER_TYPES = ["vertical-stack", "horizontal-stack", "grid", "free"] as const
export type ContainerType = (typeof CONTAINER_TYPES)[number]

export function isContainerType(type: string | undefined): type is ContainerType {
  return (CONTAINER_TYPES as readonly string[]).includes(type ?? "")
}

/**
 * Spacing in millimetres, so that it grows with a device's pixel density as
 * the size steps do. Until tried on devices (tasks/layout-todo.md,
 * Checkpoint B), these are a first guess.
 */
export const DEFAULT_PADDING_MM = 2
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

/** How a stack places a child narrower than it, or stretches it. */
export type CrossAlign = "stretch" | "start" | "centre" | "end"
/** How a horizontal stack places its children along its length. */
export type Distribute = "start" | "centre" | "end" | "space-between" | "fill"
/** A grid column: as wide as its widest cell, or a share of what is left. */
export type GridColumn = "auto" | number
export const DEFAULT_GRID_COLUMNS: GridColumn[] = ["auto", 1]

// What a ring is drawn with when it has no track thickness of its own.
const FALLBACK_RING_THICKNESS = 10

function px(mm: number, scale: LayoutScale): number {
  return Math.round(mm * scale.pixelsPerMm)
}

function spacing(container: ScreenObject, scale: LayoutScale): { padding: number; gap: number } {
  const props = container.properties ?? {}
  return {
    padding: px(typeof props.paddingMm === "number" ? props.paddingMm : DEFAULT_PADDING_MM, scale),
    gap: px(typeof props.gapMm === "number" ? props.gapMm : DEFAULT_GAP_MM, scale),
  }
}

function offset(align: CrossAlign, room: number, size: number): number {
  if (align === "centre") return Math.round((room - size) / 2)
  if (align === "end") return room - size
  return 0
}

/**
 * What takes all the width it is given: a bar or slider (a length has no
 * natural size), and what is structure - a container, a switcher. Everything
 * else is only as wide as it needs (decided with the user 2026-10-02):
 * placed at the start of its cell or stack, not stretched.
 */
function fills(obj: ScreenObject): boolean {
  return obj.type === "bar" || obj.type === "slider" || obj.type === "switcher" || isContainerType(obj.type)
}

/**
 * How wide an object needs to be: a text as wide as its words, in its font
 * (decided with the user 2026-10-02, not as wide as it was drawn); a switch,
 * button group or button as wide as its labels need at its height; anything
 * else as wide as it is.
 */
export function naturalWidth(obj: ScreenObject, scale: LayoutScale = FALLBACK_SCALE): number {
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

/** The width a child takes in `room`: all of it when it fills, else what it needs. */
function widthIn(child: ScreenObject, room: number, stretch: boolean, scale: LayoutScale): number {
  return fills(child) || stretch ? room : Math.min(naturalWidth(child, scale), room)
}

/**
 * A child given a width by its container, with the height that follows: a
 * ring keeps its diameter, but never more than the room (on the grid of its
 * track, as the size scale puts it - snapDiameter, rounded down here, so it
 * never sticks out); a container as tall as its content; a switcher as tall
 * as its tallest panel; a `free` container and everything else as tall as
 * it is.
 */
function fit(child: ScreenObject, width: number, scale: LayoutScale): ScreenObject {
  if (child.type === "gauge" || child.type === "dial") {
    const grid = 2 * (child.properties?.thickness ?? FALLBACK_RING_THICKNESS)
    const diameter = Math.max(2 * grid, Math.floor(Math.min(child.width, width) / grid) * grid)
    return { ...child, width: diameter, height: diameter }
  }
  if (child.type === "switcher") return fitSwitcher({ ...child, width }, scale)
  // A group outside a grid keeps the box around its pieces (normalizeGroups);
  // only a grid takes it apart into its cells.
  if (child.type === "group") return layoutOne(child, scale)
  const laid = layoutOne({ ...child, width }, scale)
  if (laid.type === "vertical-stack" || laid.type === "horizontal-stack" || laid.type === "grid") {
    return { ...laid, height: laid.properties?.contentHeight ?? laid.height }
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
function measured(container: ScreenObject, children: ScreenObject[], contentWidth: number, contentHeight: number): ScreenObject {
  const overflow = contentHeight > container.height || contentWidth > container.width
  const properties: Record<string, any> = { ...container.properties, contentHeight }
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
  if (!obj.children || obj.children.length === 0) return obj
  if (obj.type === "vertical-stack") return arrangeVertical(obj, scale)
  if (obj.type === "horizontal-stack") return arrangeHorizontal(obj, scale)
  if (obj.type === "grid") return arrangeGrid(obj, scale)
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
 * One under another, each the stack's inner width (or its own, aligned, when
 * the stack does not stretch), separated by the gap. A stack inside a stack
 * is as tall as what it holds; the outermost keeps the height it was given.
 */
function arrangeVertical(stack: ScreenObject, scale: LayoutScale): ScreenObject {
  const { padding, gap } = spacing(stack, scale)
  const align: CrossAlign = stack.properties?.align ?? "start"
  const inner = Math.max(0, stack.width - 2 * padding)
  let y = padding
  const children = layoutOrder(stack.children).map((child) => {
    const placed = fit(child, widthIn(child, inner, align === "stretch", scale), scale)
    const at = { ...placed, x: padding + offset(align, inner, placed.width), y }
    y += placed.height + gap
    return at
  })
  return measured(stack, children, stack.width, contentHeight({ ...stack, children }, scale))
}

/**
 * Side by side, each its own width and height, aligned across the stack
 * (start, centre, end) and spread along it as `distribute` says; `fill`
 * gives each the same share of the stack's width. As tall as its tallest.
 */
function arrangeHorizontal(stack: ScreenObject, scale: LayoutScale): ScreenObject {
  const { padding, gap } = spacing(stack, scale)
  const align: CrossAlign = stack.properties?.align ?? "start"
  const distribute: Distribute = stack.properties?.distribute ?? "start"
  const inner = Math.max(0, stack.width - 2 * padding)
  const source = layoutOrder(stack.children)
  const gaps = Math.max(0, source.length - 1) * gap
  const share = source.length > 0 ? Math.floor((inner - gaps) / source.length) : 0
  const sized = source.map((child) => fit(child, distribute === "fill" ? share : Math.min(naturalWidth(child, scale), inner), scale))
  const used = sized.reduce((total, child) => total + child.width, 0) + gaps
  const tallest = Math.max(0, ...sized.map((child) => child.height))
  const free = Math.max(0, inner - used)
  let x =
    padding + (distribute === "centre" ? Math.round(free / 2) : distribute === "end" ? free : 0)
  const between = distribute === "space-between" && sized.length > 1 ? gap + free / (sized.length - 1) : gap
  const children = sized.map((child) => {
    const at = { ...child, x: Math.round(x), y: padding + offset(align === "stretch" ? "start" : align, tallest, child.height) }
    x += child.width + between
    return at
  })
  return measured(stack, children, 2 * padding + used, 2 * padding + tallest)
}

/**
 * Row by row into its columns: an `auto` column as wide as its widest cell,
 * the weighted columns sharing what is left in proportion; every cell its
 * column's width, every row as tall as its tallest cell.
 *
 * A group in a grid has no columns of its own: its pieces, left to right,
 * take consecutive cells of the grid and count when the grid measures its
 * columns - a column is as wide as its widest cell, whichever group the
 * cell is in. So the names of all blocks in a grid line up, and so do their
 * controls (CSS calls this a subgrid). A group with more pieces than the
 * row has cells left starts a new row.
 */
function arrangeGrid(grid: ScreenObject, scale: LayoutScale): ScreenObject {
  const { padding, gap } = spacing(grid, scale)
  const columns: GridColumn[] = Array.isArray(grid.properties?.columns) && grid.properties.columns.length > 0
    ? grid.properties.columns
    : DEFAULT_GRID_COLUMNS
  const inner = Math.max(0, grid.width - 2 * padding)
  const cells = layoutOrder(grid.children)

  // Every cell of the grid: a child, or a piece of a group child.
  interface Slot { cell: ScreenObject; owner: number; piece: number; row: number; column: number }
  const slots: Slot[] = []
  let row = 0
  let column = 0
  const next = () => {
    column++
    if (column === columns.length) {
      row++
      column = 0
    }
  }
  cells.forEach((cell, owner) => {
    const pieces = cell.type === "group" ? piecesInOrder(cell) : null
    if (pieces && pieces.length > 0) {
      if (column !== 0 && pieces.length > columns.length - column) {
        row++
        column = 0
      }
      for (const { child, index } of pieces) {
        slots.push({ cell: child, owner, piece: index, row, column })
        next()
      }
    } else {
      slots.push({ cell, owner, piece: -1, row, column })
      next()
    }
  })

  const widths = columns.map((spec, c) =>
    spec === "auto" ? Math.max(0, ...slots.filter((slot) => slot.column === c).map((slot) => naturalWidth(slot.cell, scale))) : 0,
  )
  const autoTotal = widths.reduce((total, w) => total + w, 0)
  const weights = columns.reduce<number>((total, spec) => total + (spec === "auto" ? 0 : spec), 0)
  const rest = Math.max(0, inner - autoTotal - (columns.length - 1) * gap)
  columns.forEach((spec, c) => {
    if (spec !== "auto") widths[c] = weights > 0 ? Math.floor((rest * spec) / weights) : 0
  })
  const lefts = widths.map((_, c) => padding + widths.slice(0, c).reduce((total, w) => total + w + gap, 0))

  const sized = slots.map((slot) => ({ ...slot, cell: fit(slot.cell, widthIn(slot.cell, widths[slot.column], false, scale), scale) }))
  const rows = sized.length > 0 ? Math.max(...sized.map((slot) => slot.row)) + 1 : 0
  const tops: number[] = []
  let y = padding
  for (let r = 0; r < rows; r++) {
    tops.push(y)
    y += Math.max(0, ...sized.filter((slot) => slot.row === r).map((slot) => slot.cell.height)) + gap
  }
  const placed = sized.map((slot) => ({ ...slot, cell: { ...slot.cell, x: lefts[slot.column], y: tops[slot.row] } }))

  const children = cells.map((cell, owner) => {
    const mine = placed.filter((slot) => slot.owner === owner)
    if (mine.length === 1 && mine[0].piece === -1) return mine[0].cell
    // A group: its box around its pieces, the pieces relative to it.
    const left = Math.min(...mine.map((slot) => slot.cell.x))
    const top = Math.min(...mine.map((slot) => slot.cell.y))
    const right = Math.max(...mine.map((slot) => slot.cell.x + slot.cell.width))
    const bottom = Math.max(...mine.map((slot) => slot.cell.y + slot.cell.height))
    const byIndex = new Map(mine.map((slot) => [slot.piece, slot.cell]))
    return {
      ...cell,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
      children: (cell.children ?? []).map((piece, index) => {
        const at = byIndex.get(index)
        return at ? { ...at, x: at.x - left, y: at.y - top } : piece
      }),
    }
  })
  const contentHeight = rows > 0 ? y - gap + padding : 2 * padding
  return measured(grid, children, grid.width, contentHeight)
}

// A group's pieces as they read, left to right (then top to bottom), with
// where each stands among the group's children.
function piecesInOrder(group: ScreenObject): { child: ScreenObject; index: number }[] {
  return (group.children ?? [])
    .map((child, index) => ({ child, index }))
    .sort((a, b) => a.child.x - b.child.x || a.child.y - b.child.y)
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
    properties: layout.properties ?? {},
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

/** How tall a vertical stack is with what it holds: padding, children, gaps. */
export function contentHeight(stack: ScreenObject, scale: LayoutScale = FALLBACK_SCALE): number {
  const { padding, gap } = spacing(stack, scale)
  const children = stack.children ?? []
  const sum = children.reduce((total, child) => total + child.height, 0)
  return 2 * padding + sum + Math.max(0, children.length - 1) * gap
}

/** Where a click puts a new object: into which container, before which child. */
export interface Insertion {
  /** The container's id; null for the screen itself, when its root lays out. */
  parentId: string | null
  /** The place among the container's children (their order is the layout's). */
  index: number
  /** The line that shows it, on the screen. */
  line: { x1: number; y1: number; x2: number; y2: number }
}

/**
 * The insertion a point on the screen means: the deepest container under it
 * that places what it holds - a stack, a row or a grid, or the screen when
 * its root is one - and the place in it the point is nearest. A `free`
 * container, and a screen whose root is `free`, have none: there an object
 * is drawn as a rectangle, where it is wanted. `objects` are laid out.
 */
export function insertionAt(
  objects: ScreenObject[],
  layout: ScreenLayout | undefined,
  area: Area,
  point: { x: number; y: number },
  scale: LayoutScale = FALLBACK_SCALE,
): Insertion | null {
  let found: { container: ScreenObject; parentId: string | null; origin: { x: number; y: number } } | null = null
  if (layout && layout.type !== "free" && inside(point, area)) {
    found = {
      container: { id: "", type: layout.type, ...area, properties: layout.properties ?? {}, zIndex: 0, children: objects },
      parentId: null,
      origin: { x: 0, y: 0 },
    }
  }
  // Deeper wins: a container inside the found one, at any depth - inside
  // groups and a switcher's panels too (a panel adds no offset of its own).
  const walk = (list: ScreenObject[], ox: number, oy: number) => {
    for (const obj of list) {
      const box = { x: ox + obj.x, y: oy + obj.y, width: obj.width, height: obj.height }
      if (isContainerType(obj.type) && obj.type !== "free" && inside(point, box)) {
        found = { container: { ...obj, x: box.x, y: box.y }, parentId: obj.id, origin: { x: box.x, y: box.y } }
      }
      if (obj.children?.length) {
        const nx = obj.type === "panel" ? ox : ox + obj.x
        const ny = obj.type === "panel" ? oy : oy + obj.y
        walk(obj.children, nx, ny)
      }
    }
  }
  walk(objects, 0, 0)
  if (!found) return null
  const { container, parentId, origin } = found as { container: ScreenObject; parentId: string | null; origin: { x: number; y: number } }

  const { padding, gap } = spacing(container, scale)
  // The root's children are on the screen already; a container's, relative to it.
  const children = layoutOrder(container.children).map((child) =>
    parentId === null ? child : { ...child, x: child.x + origin.x, y: child.y + origin.y },
  )
  const left = container.x + padding
  const right = container.x + container.width - padding
  const top = container.y + padding
  const bottom = container.y + container.height - padding

  if (container.type === "vertical-stack") {
    const index = children.filter((c) => c.y + c.height / 2 < point.y).length
    const y = index < children.length ? children[index].y - gap / 2 : children.length ? lastBottom(children) + gap / 2 : top
    return { parentId, index, line: { x1: left, y1: Math.round(y), x2: right, y2: Math.round(y) } }
  }
  if (container.type === "horizontal-stack") {
    const index = children.filter((c) => c.x + c.width / 2 < point.x).length
    const x = index < children.length ? children[index].x - gap / 2 : children.length ? lastRight(children) + gap / 2 : left
    return { parentId, index, line: { x1: Math.round(x), y1: top, x2: Math.round(x), y2: bottom } }
  }
  // A grid: in reading order, a child is before the point when its row is
  // above it, or it is in the point's row and left of it.
  const before = (c: ScreenObject) => c.y + c.height <= point.y || (c.y <= point.y && c.x + c.width / 2 < point.x)
  const index = children.filter(before).length
  const at = children[index] ?? children[children.length - 1]
  if (!at) return { parentId, index: 0, line: { x1: left, y1: top, x2: left, y2: Math.min(bottom, top + 20) } }
  const x = index < children.length ? at.x - gap / 2 : at.x + at.width + gap / 2
  return { parentId, index, line: { x1: Math.round(x), y1: at.y, x2: Math.round(x), y2: at.y + at.height } }
}

function inside(point: { x: number; y: number }, box: Area): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height
}
function lastBottom(children: ScreenObject[]): number {
  return Math.max(...children.map((c) => c.y + c.height))
}
function lastRight(children: ScreenObject[]): number {
  return Math.max(...children.map((c) => c.x + c.width))
}
