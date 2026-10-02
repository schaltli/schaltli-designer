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
    const width = align === "stretch" ? inner : Math.min(child.width, inner)
    let placed = layoutOne({ ...child, width }, scale)
    if (placed.type === "vertical-stack") placed = { ...placed, height: contentHeight(placed, scale) }
    placed = { ...placed, x: padding + offset(align, inner, width), y }
    y += placed.height + gap
    return placed
  })
  return { ...stack, children }
}

/** How tall a vertical stack is with what it holds: padding, children, gaps. */
export function contentHeight(stack: ScreenObject, scale: LayoutScale = FALLBACK_SCALE): number {
  const { padding, gap } = spacing(stack, scale)
  const children = stack.children ?? []
  const sum = children.reduce((total, child) => total + child.height, 0)
  return 2 * padding + sum + Math.max(0, children.length - 1) * gap
}
