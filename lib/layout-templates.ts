/**
 * A screen's «Layout» option (docs/2026-10-02-layout.md, module
 * layout-templates): built-in templates for the screen's root container,
 * as PowerPoint's slide layouts. Choosing one is a copy - the containers it
 * brings are the screen's to change afterwards, and a template never
 * changes a screen that has it. Changing the layout of a screen with
 * content loses nothing: what the containers that go held is put, in
 * order, into the container that stays.
 */

import type { ScreenObject } from "@/components/project-editor"
import { FREE_LAYOUT, layoutOrder, type ScreenLayout } from "@/lib/layout"

export type LayoutTemplateId = "one-column" | "name-and-control" | "two-columns" | "free"

export const LAYOUT_TEMPLATES: ReadonlyArray<{ id: LayoutTemplateId; label: string }> = [
  { id: "one-column", label: "One column" },
  { id: "name-and-control", label: "Name and control" },
  { id: "two-columns", label: "Two columns" },
  { id: "free", label: "Free" },
]

/** What a new screen starts with (the spec: «Name and control»). */
export const DEFAULT_LAYOUT_TEMPLATE: LayoutTemplateId = "name-and-control"

// A container a template brought as one of its places - a column of «Two
// columns» - rather than one put there by hand: its content moves when the
// layout changes, a hand-made container moves as a whole.
const SLOT = "layoutSlot"

function rootOf(id: LayoutTemplateId): ScreenLayout {
  switch (id) {
    case "one-column":
      return { type: "vertical-stack" }
    case "name-and-control":
      return { type: "grid", properties: { columns: ["auto", 1] } }
    case "two-columns":
      return { type: "horizontal-stack", properties: { distribute: "fill" } }
    case "free":
      return FREE_LAYOUT
  }
}

/** The root a new screen starts with. */
export function newScreenLayout(): ScreenLayout {
  return rootOf(DEFAULT_LAYOUT_TEMPLATE)
}

const isSlot = (obj: ScreenObject) => obj.properties?.[SLOT] === true

/** Which template a screen's root is, as far as it can tell. */
export function templateOf(screen: { layout?: ScreenLayout; objects: ScreenObject[] }): LayoutTemplateId {
  switch (screen.layout?.type) {
    case "vertical-stack":
      return "one-column"
    case "grid":
      return "name-and-control"
    case "horizontal-stack":
      return screen.objects.some(isSlot) ? "two-columns" : "one-column"
    default:
      return "free"
  }
}

/**
 * Everything on the screen that is content, in order, at its place on the
 * screen: what the template's columns hold, column by column, then what
 * stands beside them. On a free screen, as it reads - top to bottom, left
 * to right - since there the stacking order says nothing about an order.
 */
function contentOf(screen: { layout?: ScreenLayout; objects: ScreenObject[] }): ScreenObject[] {
  if (!screen.layout || screen.layout.type === "free") {
    return [...screen.objects].sort((a, b) => a.y - b.y || a.x - b.x)
  }
  return layoutOrder(screen.objects).flatMap((obj) =>
    isSlot(obj)
      ? layoutOrder(obj.children).map((child) => ({ ...child, x: child.x + obj.x, y: child.y + obj.y }))
      : [obj],
  )
}

/**
 * The screen with the template's root, and its content put into the place
 * that stays - the first column, or the root itself. Ids for the containers
 * the template brings are taken from `nextId`, which comes back advanced.
 */
export function withTemplate<S extends { layout?: ScreenLayout; objects: ScreenObject[] }>(
  screen: S,
  id: LayoutTemplateId,
  nextId: number,
): { screen: S; nextId: number } {
  const content = contentOf(screen).map((obj, i) => ({ ...obj, zIndex: i }))
  const layout = rootOf(id)
  if (id !== "two-columns") return { screen: { ...screen, layout, objects: content }, nextId }
  const column = (n: number, children: ScreenObject[]): ScreenObject => ({
    id: `obj-${nextId + n}`,
    type: "vertical-stack",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    zIndex: n,
    properties: { [SLOT]: true },
    // Relative to the column; the layout pass places them.
    children,
  })
  return {
    screen: { ...screen, layout, objects: [column(0, content), column(1, [])] },
    nextId: nextId + 2,
  }
}
