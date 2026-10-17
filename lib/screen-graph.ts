import { isMainScreen, isPagedScreen } from "@/lib/popup"

// The screen graph (docs/2026-10-17-screen-graph.md, tasks/graph-model-plan.md).
// Screens lie next to, above and under each other. The main row is the paged
// screens in list order, as «Next screen» has always walked them; a screen
// off the row is docked on one edge of exactly one other, so the screens form
// a tree, and a neighbour is a screen joined by a branch of it, never one that
// merely lies beside (decision 2).

export type ScreenEdge = "up" | "down" | "left" | "right"

export const SCREEN_EDGES: ScreenEdge[] = ["up", "down", "left", "right"]

/** Where a screen off the main row sits: on `edge` of the screen `screenId`. */
export interface ScreenDock {
  screenId: string
  edge: ScreenEdge
}

export interface GraphScreen {
  id: string
  name?: string
  isMaster?: boolean
  screenType?: "popup"
  hidden?: boolean
  dock?: ScreenDock
}

export type ScreenNeighbours = Partial<Record<ScreenEdge, string>>

export function oppositeEdge(edge: ScreenEdge): ScreenEdge {
  return edge === "up" ? "down" : edge === "down" ? "up" : edge === "left" ? "right" : "left"
}

const isVertical = (edge: ScreenEdge) => edge === "up" || edge === "down"

/** A screen that can be in the graph: a main screen, not hidden. Masters, popups and hidden screens stand apart (decision 8). */
function canBeInGraph(screen: GraphScreen | undefined): boolean {
  return isMainScreen(screen) && !screen!.hidden
}

/** The main row: the paged screens without a dock, in list order. */
export function mainRow<S extends GraphScreen>(screens: readonly S[]): S[] {
  return screens.filter(isPagedScreen)
}

/**
 * The row screen a screen hangs from, following its docks: itself for one in
 * the row, undefined for one that is not in the graph or whose chain is broken
 * or loops.
 */
export function rowScreenOf<S extends GraphScreen>(screens: readonly S[], id: string): S | undefined {
  const seen = new Set<string>()
  let screen = screens.find((s) => s.id === id)
  while (screen && canBeInGraph(screen)) {
    if (!screen.dock) return screen
    if (seen.has(screen.id)) return undefined
    seen.add(screen.id)
    const onId: string = screen.dock.screenId
    screen = screens.find((s) => s.id === onId)
  }
  return undefined
}

/** Whether a screen is in the graph: in the row, or docked by an unbroken chain onto it. */
export function isInGraph(screens: readonly GraphScreen[], id: string): boolean {
  return rowScreenOf(screens, id) !== undefined
}

/** The screen's neighbours by edge: its row neighbours, the screen it is docked on, and those docked on it. */
export function neighboursOf(screens: readonly GraphScreen[], id: string): ScreenNeighbours {
  const neighbours: ScreenNeighbours = {}
  const screen = screens.find((s) => s.id === id)
  if (!screen || !isInGraph(screens, id)) return neighbours
  if (!screen.dock) {
    const row = mainRow(screens)
    const i = row.findIndex((s) => s.id === id)
    if (i > 0) neighbours.left = row[i - 1].id
    if (i < row.length - 1) neighbours.right = row[i + 1].id
  } else {
    neighbours[oppositeEdge(screen.dock.edge)] = screen.dock.screenId
  }
  for (const s of screens) {
    if (s.dock?.screenId !== id || !isInGraph(screens, s.id)) continue
    if (neighbours[s.dock.edge] === undefined) neighbours[s.dock.edge] = s.id
  }
  return neighbours
}

/** For a docked screen, the edge the screen it is docked on lies at: the way back (decision 7). */
export function backOf(screens: readonly GraphScreen[], id: string): ScreenEdge | undefined {
  const screen = screens.find((s) => s.id === id)
  if (!screen?.dock || !isInGraph(screens, id)) return undefined
  return oppositeEdge(screen.dock.edge)
}

/** The screens docked on this one, and on those, all the way out: what goes with it when it leaves the graph. */
export function screensCutOff<S extends GraphScreen>(screens: readonly S[], id: string): S[] {
  const cut: S[] = []
  const reached = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const s of screens) {
      if (s.dock && reached.has(s.dock.screenId) && !reached.has(s.id)) {
        reached.add(s.id)
        cut.push(s)
        grew = true
      }
    }
  }
  return screens.filter((s) => cut.includes(s))
}

/**
 * The screens with those docked on `id` made hidden screens, their docks gone
 * (plan decision 3), for when `id` leaves the graph - deleted, made a popup or
 * a master, or hidden. Without it they would drop into the main row unasked.
 */
export function withCutOffHidden<S extends GraphScreen>(screens: readonly S[], id: string): { screens: S[]; hidden: S[] } {
  const hidden = screensCutOff(screens, id)
  const ids = new Set(hidden.map((s) => s.id))
  return {
    screens: screens.map((s) => (ids.has(s.id) ? { ...s, dock: undefined, hidden: true } : s)),
    hidden,
  }
}

const EDGE_PLACE: Record<ScreenEdge, string> = { up: "above", down: "below", left: "left of", right: "right of" }

export type DockCheck = { ok: true } | { ok: false; reason: string }

/** Whether `id` may dock on `edge` of `onId` (plan decision 2), and if not, why. */
export function canDock(screens: readonly GraphScreen[], id: string, onId: string, edge: ScreenEdge): DockCheck {
  const screen = screens.find((s) => s.id === id)
  const on = screens.find((s) => s.id === onId)
  const name = (s: GraphScreen) => `"${s.name ?? s.id}"`
  if (!screen || !on) return { ok: false, reason: "That screen does not exist." }
  if (!canBeInGraph(screen)) return { ok: false, reason: `${name(screen)} is hidden, a popup or a master: it does not dock.` }
  if (!canBeInGraph(on) || !isInGraph(screens, onId))
    return { ok: false, reason: `${name(on)} is hidden, a popup or a master: nothing docks on it.` }
  if (id === onId) return { ok: false, reason: "A screen does not dock on itself." }
  if (screensCutOff(screens, id).some((s) => s.id === onId))
    return { ok: false, reason: `${name(on)} is docked on ${name(screen)} already.` }
  if (!on.dock && !isVertical(edge))
    return { ok: false, reason: `Left and right of ${name(on)} is the main row: put ${name(screen)} there in the list of screens.` }
  if (isVertical(edge) && on.dock && isVertical(on.dock.edge))
    return { ok: false, reason: `Nothing docks above or below ${name(on)}: it is itself above or below another screen.` }
  if (isVertical(edge) && screens.some((s) => s.dock?.screenId === id && isVertical(s.dock.edge)))
    return { ok: false, reason: `${name(screen)} has a screen above or below it, so it cannot go above or below another.` }
  // The edge as it is once the screen has left its present place.
  const without = screens.map((s) => (s.id === id ? { ...s, hidden: true } : s))
  const taken = neighboursOf(without, onId)[edge]
  if (taken) {
    const other = screens.find((s) => s.id === taken)!
    return { ok: false, reason: `The place ${EDGE_PLACE[edge]} ${name(on)} is taken by ${name(other)}.` }
  }
  return { ok: true }
}

/**
 * The screen «Next screen» (delta 1) or «Previous screen» (-1) goes to: the
 * main row, wrapping at its ends. From a docked screen it counts from the row
 * screen it hangs from; from one not in the graph, from the first.
 */
export function pagedScreen<S extends GraphScreen>(screens: readonly S[], currentId: string | undefined, delta: 1 | -1): S | undefined {
  const row = mainRow(screens)
  if (row.length === 0) return undefined
  const from = currentId === undefined ? undefined : rowScreenOf(screens, currentId)
  const index = Math.max(0, row.findIndex((s) => s.id === from?.id))
  return row[(((index + delta) % row.length) + row.length) % row.length]
}
