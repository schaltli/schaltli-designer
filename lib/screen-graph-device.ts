// The screen graph as a device sees it (device contract §2.10): only what the
// export carries - `mainRow`, each screen's `neighbours`, `back` and its
// swipes' actions, already decided. The firmware's src/project/ScreenGraph
// and the app do the same; lib/screen-graph/vectors.json holds the cases
// all of them run. The designer's own rules (lib/screen-graph.ts,
// lib/hardware-button-actions.ts) work on the project; e2e checks the two
// agree.

import type { ScreenEdge } from "@/lib/screen-graph"

export interface DeviceAction {
  type: string
  side?: string
  targetScreenId?: string
}

export interface DeviceGraphScreen {
  id: string
  neighbours?: Partial<Record<ScreenEdge, string>>
  back?: ScreenEdge
  buttonActions?: Record<string, DeviceAction>
}

// The swipe that pulls in the neighbour on an edge: swiping up shows the screen below.
const SWIPE_FOR: Record<ScreenEdge, string> = { down: "swipe-up", up: "swipe-down", right: "swipe-left", left: "swipe-right" }
const EDGES: ScreenEdge[] = ["up", "down", "left", "right"]

/**
 * Whether the swipe towards `side` leads to the neighbour there: its action
 * is `goto-neighbour` that way, `goto-screen` naming it, or - both screens in
 * the main row - `next-screen` towards the right, `previous-screen` towards
 * the left.
 */
export function swipeLeadsTo(screen: DeviceGraphScreen, side: ScreenEdge, mainRow: readonly string[]): boolean {
  const neighbour = screen.neighbours?.[side]
  if (!neighbour) return false
  const action = screen.buttonActions?.[SWIPE_FOR[side]]
  if (!action) return false
  if (action.type === "goto-neighbour") return action.side === side
  if (action.type === "goto-screen") return action.targetScreenId === neighbour
  const inRow = mainRow.includes(screen.id) && mainRow.includes(neighbour)
  return inRow && action.type === (side === "right" ? "next-screen" : side === "left" ? "previous-screen" : "")
}

/** The edges with a pull tab, in the order up, down, left, right. */
export function tabSidesOf(screen: DeviceGraphScreen, mainRow: readonly string[]): ScreenEdge[] {
  return EDGES.filter((side) => swipeLeadsTo(screen, side, mainRow))
}

/**
 * Next (`delta` 1) or previous (-1) over the main row, wrapping: from the
 * screen itself when it is in the row, else from `pageId`, the screen it is
 * docked on (`neighbours[back]`). Undefined for an empty row.
 */
export function rowStep(mainRow: readonly string[], currentId: string, pageId: string | undefined, delta: 1 | -1): string | undefined {
  if (mainRow.length === 0) return undefined
  const from = mainRow.includes(currentId) ? currentId : pageId
  const index = Math.max(0, from === undefined ? -1 : mainRow.indexOf(from))
  return mainRow[(((index + delta) % mainRow.length) + mainRow.length) % mainRow.length]
}
