import { isMainScreen, isPagedScreen } from "@/lib/popup"

// The screen graph (docs/2026-10-17-screen-graph.md, tasks/graph-model-plan.md).
// A comb (decision 1): the main row is the paged screens in list order, as
// «Next screen» has always walked them; a screen off the row is docked above
// or below one of them and has no further neighbour. A neighbour is a screen
// joined by a dock or by the row, never one that merely lies beside
// (decision 2) - so every place is a column and a level.

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
 * The row screen a screen hangs from: itself for one in the row, the page it
 * is docked above or below for one off it, undefined for one that is not in
 * the graph - or docked anywhere else than above or below a row screen.
 */
export function rowScreenOf<S extends GraphScreen>(screens: readonly S[], id: string): S | undefined {
  const screen = screens.find((s) => s.id === id)
  if (!screen || !canBeInGraph(screen)) return undefined
  if (!screen.dock) return screen
  if (!isVertical(screen.dock.edge)) return undefined
  const onId = screen.dock.screenId
  const page = screens.find((s) => s.id === onId)
  return page && canBeInGraph(page) && !page.dock ? page : undefined
}

/** Whether a screen is in the graph: in the row, or docked above or below a screen of it. */
export function isInGraph(screens: readonly GraphScreen[], id: string): boolean {
  return rowScreenOf(screens, id) !== undefined
}

/**
 * The screen's neighbours by edge: its row neighbours, the screen it is docked
 * on, and those docked on it. The row is a ring, as «Next screen» has always
 * walked it: right of the last screen lies the first, left of the first the
 * last (2026-10-30 - the swipe from the last page to the first jumped
 * without following the finger, and had no pull tab).
 */
export function neighboursOf(screens: readonly GraphScreen[], id: string): ScreenNeighbours {
  const neighbours: ScreenNeighbours = {}
  const screen = screens.find((s) => s.id === id)
  if (!screen || !isInGraph(screens, id)) return neighbours
  if (!screen.dock) {
    const row = mainRow(screens)
    const i = row.findIndex((s) => s.id === id)
    if (row.length > 1) {
      neighbours.left = row[(i - 1 + row.length) % row.length].id
      neighbours.right = row[(i + 1) % row.length].id
    }
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
  if (on.dock) return { ok: false, reason: `Nothing docks on ${name(on)}: it is itself above or below a screen of the main row.` }
  if (!isVertical(edge))
    return { ok: false, reason: `Left and right of ${name(on)} is the main row: put ${name(screen)} there in the list of screens.` }
  if (screens.some((s) => s.dock?.screenId === id && isInGraph(screens, s.id)))
    return { ok: false, reason: `${name(screen)} has a screen above or below it: it stays in the main row.` }
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

/** The swipe that pulls in the neighbour on that side: swiping up shows the screen below (decision 4). */
export const SWIPE_TO_SIDE: Record<string, ScreenEdge> = {
  "swipe-up": "down",
  "swipe-down": "up",
  "swipe-left": "right",
  "swipe-right": "left",
}

/** «Go to the screen above» and so on (decision 16). */
export function describeNeighbourSide(side: ScreenEdge | undefined): string {
  if (side === "up") return "Go to the screen above"
  if (side === "down") return "Go to the screen below"
  if (side === "left") return "Go to the screen on the left"
  if (side === "right") return "Go to the screen on the right"
  return "Go to the screen beside"
}

/**
 * The screens with every broken dock mended (plan decision 3): a screen that
 * is no longer in the graph itself - hidden, a popup or a master - just loses
 * its dock; one whose chain no longer reaches the main row - the screen it was
 * docked on deleted, hidden or made a popup or master - becomes a hidden
 * screen, still a «Go to Screen» target, rather than dropping into the row
 * unasked. The same array when there was nothing to mend.
 */
export function withGraphMended<S extends GraphScreen>(screens: S[]): { screens: S[]; hidden: S[] } {
  let current = screens
  const hidden: S[] = []
  for (;;) {
    const broken = current.find((s) => s.dock && !isInGraph(current, s.id))
    if (!broken) return { screens: current, hidden }
    const mended = canBeInGraph(broken) ? { ...broken, dock: undefined, hidden: true } : { ...broken, dock: undefined }
    if (canBeInGraph(broken)) hidden.push(mended)
    current = current.map((s) => (s === broken ? mended : s))
  }
}

// --- «Manage Screens» (tasks/graph-surface-plan.md) ---------------------------

export interface GraphColumn<S> {
  page: S
  up?: S
  down?: S
}

/**
 * The comb as «Manage Screens» lays it out: one column per screen of the main
 * row, with what lies above and below it, and apart from them the hidden
 * screens, the popups and the masters (decision 8).
 */
export function graphLayout<S extends GraphScreen>(
  screens: readonly S[],
): { columns: GraphColumn<S>[]; hidden: S[]; popups: S[]; masters: S[] } {
  const docked = (page: S, edge: ScreenEdge) =>
    screens.find((s) => s.dock?.screenId === page.id && s.dock.edge === edge && isInGraph(screens, s.id))
  return {
    columns: mainRow(screens).map((page) => ({ page, up: docked(page, "up"), down: docked(page, "down") })),
    hidden: screens.filter((s) => isMainScreen(s) && !isInGraph(screens, s.id)),
    popups: screens.filter((s) => s.screenType === "popup"),
    masters: screens.filter((s) => s.isMaster),
  }
}

/**
 * The screen put into the main row before `beforeId`, or at its end when that
 * is null: its dock and «Hidden» gone, and moved in the list, which is the
 * row's order. A page moved takes what is docked on it along.
 */
export function withScreenInRow<S extends GraphScreen>(screens: readonly S[], id: string, beforeId: string | null): S[] {
  const screen = screens.find((s) => s.id === id)
  if (!screen || !isMainScreen(screen) || id === beforeId) return [...screens]
  const moved = { ...screen, dock: undefined, hidden: undefined }
  const rest = screens.filter((s) => s.id !== id)
  const row = mainRow(rest)
  const at =
    beforeId !== null && row.some((s) => s.id === beforeId)
      ? rest.findIndex((s) => s.id === beforeId)
      : row.length > 0
        ? rest.indexOf(row[row.length - 1]) + 1
        : rest.length
  return [...rest.slice(0, at), moved, ...rest.slice(at)]
}

/** The screen docked above or below a page - shown first if it was hidden - or why it may not. */
export function withScreenDocked<S extends GraphScreen>(
  screens: readonly S[],
  id: string,
  pageId: string,
  edge: ScreenEdge,
): { ok: true; screens: S[] } | { ok: false; reason: string } {
  const shown = screens.map((s) => (s.id === id ? { ...s, hidden: undefined } : s))
  const check = canDock(shown, id, pageId, edge)
  if (!check.ok) return check
  return { ok: true, screens: shown.map((s) => (s.id === id ? { ...s, dock: { screenId: pageId, edge } } : s)) }
}

/** The screen made a hidden one, out of the graph; what was docked on it follows when the graph is mended. */
export function withScreenApart<S extends GraphScreen>(screens: readonly S[], id: string): S[] {
  return screens.map((s) => (s.id === id ? { ...s, dock: undefined, hidden: true } : s))
}

// The feature a device declares once it knows the screen graph (device
// contract §2.10). Deploy asks it only of a project with a screen off the
// main row; one row runs on any device as it is (decision 14).
export const SCREEN_GRAPH_FEATURE = "screen-graph"

/** What Deploy asks of a device for these screens, naming those off the main row; nothing for a single row. */
export function screenGraphFeature(screens: readonly (GraphScreen & { name: string })[]): { feature: string; label: string } | null {
  const off = screens.filter((s) => s.dock && isInGraph(screens, s.id))
  return off.length > 0 ? { feature: SCREEN_GRAPH_FEATURE, label: `screens off the main row (${off.map((s) => s.name).join(", ")})` } : null
}
