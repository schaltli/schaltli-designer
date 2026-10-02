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

import type { ScreenObject } from "@/components/project-editor"

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
 * A child given a width by its container, with the height that follows: a
 * ring as large as fits, its diameter on the grid of its track (as the size
 * scale puts it, snapDiameter - rounded down here, so it never sticks out);
 * a container as tall as its content; a switcher as tall as its tallest
 * panel; a `free` container and everything else as tall as it is.
 */
function fit(child: ScreenObject, width: number, scale: LayoutScale): ScreenObject {
  if (child.type === "gauge" || child.type === "dial") {
    const grid = 2 * (child.properties?.thickness ?? FALLBACK_RING_THICKNESS)
    const diameter = Math.max(2 * grid, Math.floor(width / grid) * grid)
    return { ...child, width: diameter, height: diameter }
  }
  if (child.type === "switcher") return fitSwitcher({ ...child, width }, scale)
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
  return layoutOne({ ...switcher, height: height || switcher.height, children: panels }, scale)
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
  if (obj.type === "switcher") {
    // A panel fills its switcher (docs/device-contract.md): at the switcher's
    // origin, its size. Its own x and y are written as 0, so that every rule
    // that adds them up - childOrigin, getAbsolutePosition, the firmware's -
    // agrees on where its children are.
    return {
      ...obj,
      children: obj.children.map((panel) =>
        layoutOne({ ...panel, x: 0, y: 0, width: obj.width, height: obj.height }, scale),
      ),
    }
  }
  return { ...obj, children: layoutObjects(obj.children, scale) }
}

/**
 * One under another, each the stack's inner width (or its own, aligned, when
 * the stack does not stretch), separated by the gap. A stack inside a stack
 * is as tall as what it holds; the outermost keeps the height it was given.
 */
function arrangeVertical(stack: ScreenObject, scale: LayoutScale): ScreenObject {
  const { padding, gap } = spacing(stack, scale)
  const align: CrossAlign = stack.properties?.align ?? "stretch"
  const inner = Math.max(0, stack.width - 2 * padding)
  let y = padding
  const children = (stack.children ?? []).map((child) => {
    const placed = fit(child, align === "stretch" ? inner : Math.min(child.width, inner), scale)
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
  const source = stack.children ?? []
  const gaps = Math.max(0, source.length - 1) * gap
  const share = source.length > 0 ? Math.floor((inner - gaps) / source.length) : 0
  const sized = source.map((child) => fit(child, distribute === "fill" ? share : Math.min(child.width, inner), scale))
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
 */
function arrangeGrid(grid: ScreenObject, scale: LayoutScale): ScreenObject {
  const { padding, gap } = spacing(grid, scale)
  const columns: GridColumn[] = Array.isArray(grid.properties?.columns) && grid.properties.columns.length > 0
    ? grid.properties.columns
    : DEFAULT_GRID_COLUMNS
  const inner = Math.max(0, grid.width - 2 * padding)
  const cells = grid.children ?? []
  const columnOf = (i: number) => i % columns.length
  const widths = columns.map((column, c) =>
    column === "auto" ? Math.max(0, ...cells.filter((_, i) => columnOf(i) === c).map((cell) => cell.width)) : 0,
  )
  const autoTotal = widths.reduce((total, w) => total + w, 0)
  const weights = columns.reduce<number>((total, column) => total + (column === "auto" ? 0 : column), 0)
  const rest = Math.max(0, inner - autoTotal - (columns.length - 1) * gap)
  columns.forEach((column, c) => {
    if (column !== "auto") widths[c] = weights > 0 ? Math.floor((rest * column) / weights) : 0
  })
  const lefts = widths.map((_, c) => padding + widths.slice(0, c).reduce((total, w) => total + w + gap, 0))

  const sized = cells.map((cell, i) => fit(cell, widths[columnOf(i)], scale))
  const children: ScreenObject[] = []
  let y = padding
  for (let row = 0; row * columns.length < sized.length; row++) {
    const inRow = sized.slice(row * columns.length, (row + 1) * columns.length)
    const height = Math.max(0, ...inRow.map((cell) => cell.height))
    inRow.forEach((cell, c) => children.push({ ...cell, x: lefts[c], y }))
    y += height + gap
  }
  const contentHeight = sized.length > 0 ? y - gap + padding : 2 * padding
  return measured(grid, children, grid.width, contentHeight)
}

/** How tall a vertical stack is with what it holds: padding, children, gaps. */
export function contentHeight(stack: ScreenObject, scale: LayoutScale = FALLBACK_SCALE): number {
  const { padding, gap } = spacing(stack, scale)
  const children = stack.children ?? []
  const sum = children.reduce((total, child) => total + child.height, 0)
  return 2 * padding + sum + Math.max(0, children.length - 1) * gap
}
