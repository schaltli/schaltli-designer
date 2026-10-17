import { test, expect } from "@playwright/test"
import { backOf, canDock, mainRow, neighboursOf, pagedScreen, screensCutOff, withCutOffHidden, type GraphScreen } from "../lib/screen-graph"

// The screen graph (docs/2026-10-17-screen-graph.md; tasks/graph-model-todo.md):
// the main row is the paged screens in list order, a screen off it is docked
// on one edge of one other, and a neighbour is only a docked one.

// A project of today: a master, a popup and a hidden screen beside three pages.
const today: GraphScreen[] = [
  { id: "m", name: "Master", isMaster: true },
  { id: "a", name: "Energie" },
  { id: "p", name: "Popup", screenType: "popup" },
  { id: "b", name: "Wasser" },
  { id: "h", name: "Setup", hidden: true },
  { id: "c", name: "Licht" },
]

// A and B in the row, A' above A and B' above B (the user's case, decision 2),
// A'' below A, and R docked right of A'.
const graph: GraphScreen[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "a1", name: "A'", dock: { screenId: "a", edge: "up" } },
  { id: "b1", name: "B'", dock: { screenId: "b", edge: "up" } },
  { id: "a2", name: "A''", dock: { screenId: "a", edge: "down" } },
  { id: "r", name: "R", dock: { screenId: "a1", edge: "right" } },
  { id: "h", name: "Hidden", hidden: true },
  { id: "m", name: "Master", isMaster: true },
]

const ids = (screens: GraphScreen[]) => screens.map((s) => s.id)

test.describe("screen graph: the core", () => {
  test("a project of today is one row in its list order, masters, popups and hidden screens apart", () => {
    expect(ids(mainRow(today))).toEqual(["a", "b", "c"])
    expect(neighboursOf(today, "a")).toEqual({ right: "b" })
    expect(neighboursOf(today, "b")).toEqual({ left: "a", right: "c" })
    expect(neighboursOf(today, "c")).toEqual({ left: "b" })
    expect(neighboursOf(today, "h")).toEqual({})
    expect(neighboursOf(today, "p")).toEqual({})
    expect(backOf(today, "b")).toBeUndefined()
  })

  test("a docked screen is off the row, joined to what it is docked on, and knows the way back", () => {
    expect(ids(mainRow(graph))).toEqual(["a", "b"])
    expect(neighboursOf(graph, "a")).toEqual({ right: "b", up: "a1", down: "a2" })
    expect(neighboursOf(graph, "a1")).toEqual({ down: "a", right: "r" })
    expect(neighboursOf(graph, "a2")).toEqual({ up: "a" })
    expect(neighboursOf(graph, "r")).toEqual({ left: "a1" })
    // Swiped up to A'' (below A), the way back is up.
    expect(backOf(graph, "a2")).toBe("up")
    expect(backOf(graph, "a1")).toBe("down")
    expect(backOf(graph, "r")).toBe("left")
  })

  test("screens that only lie side by side are no neighbours: no way from A' to B'", () => {
    expect(neighboursOf(graph, "a1").right).not.toBe("b1")
    expect(neighboursOf(graph, "b1")).toEqual({ down: "b" })
  })

  test("a dock onto a screen gone, hidden or a master counts for nothing", () => {
    const broken: GraphScreen[] = [
      { id: "a", name: "A" },
      { id: "x", name: "X", dock: { screenId: "gone", edge: "down" } },
      { id: "y", name: "Y", dock: { screenId: "m", edge: "down" } },
      { id: "m", name: "M", isMaster: true },
    ]
    expect(ids(mainRow(broken))).toEqual(["a"])
    expect(neighboursOf(broken, "x")).toEqual({})
    expect(neighboursOf(broken, "m")).toEqual({})
    expect(backOf(broken, "y")).toBeUndefined()
  })

  test("what may dock where, and why not", () => {
    const reason = (id: string, onId: string, edge: any) => {
      const check = canDock(graph, id, onId, edge)
      return check.ok ? "ok" : check.reason
    }
    expect(reason("b1", "b", "down")).toBe("ok")
    expect(reason("b1", "r", "right")).toBe("ok")
    expect(reason("b1", "a1", "right")).toBe('The place right of "A\'" is taken by "R".')
    expect(reason("b1", "a", "up")).toBe('The place above "A" is taken by "A\'".')
    // Moving a screen to the edge it is already on is no conflict with itself.
    expect(reason("a1", "a", "up")).toBe("ok")
    expect(reason("a1", "a1", "down")).toBe("A screen does not dock on itself.")
    expect(reason("a1", "r", "down")).toBe('"R" is docked on "A\'" already.')
    expect(reason("b1", "a", "right")).toBe('Left and right of "A" is the main row: put "B\'" there in the list of screens.')
    expect(reason("b1", "a1", "up")).toBe('Nothing docks above or below "A\'": it is itself above or below another screen.')
    expect(reason("b", "r", "down")).toBe('"B" has a screen above or below it, so it cannot go above or below another.')
    expect(reason("h", "a", "left")).toBe('"Hidden" is hidden, a popup or a master: it does not dock.')
    expect(reason("b1", "m", "down")).toBe('"Master" is hidden, a popup or a master: nothing docks on it.')
    expect(reason("b1", "h", "down")).toBe('"Hidden" is hidden, a popup or a master: nothing docks on it.')
  })

  test("a screen leaving the graph makes those docked on it hidden, all the way out", () => {
    expect(ids(screensCutOff(graph, "a"))).toEqual(["a1", "a2", "r"])
    expect(ids(screensCutOff(graph, "a1"))).toEqual(["r"])
    expect(screensCutOff(graph, "b1")).toEqual([])
    const { screens, hidden } = withCutOffHidden(graph, "a1")
    expect(ids(hidden)).toEqual(["r"])
    expect(screens.find((s) => s.id === "r")).toMatchObject({ hidden: true, dock: undefined })
    expect(ids(mainRow(screens))).toEqual(["a", "b"])
  })

  test("next and previous walk the main row, from a docked screen as from the row screen it hangs from", () => {
    const row3: GraphScreen[] = [...graph.slice(0, 2), { id: "c", name: "C" }, ...graph.slice(2)]
    expect(pagedScreen(row3, "a", 1)?.id).toBe("b")
    expect(pagedScreen(row3, "c", 1)?.id).toBe("a")
    expect(pagedScreen(row3, "a", -1)?.id).toBe("c")
    expect(pagedScreen(row3, "r", 1)?.id).toBe("b")
    expect(pagedScreen(row3, "a2", -1)?.id).toBe("c")
    // From a hidden screen, counted from the first, as before.
    expect(pagedScreen(row3, "h", 1)?.id).toBe("b")
    expect(pagedScreen([{ id: "m", isMaster: true }], "m", 1)).toBeUndefined()
  })
})
