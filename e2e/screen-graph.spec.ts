import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import { clickButton0, COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { cutOffSides, resolveSwipeAction } from "../lib/hardware-button-actions"
import { backOf, canDock, graphLayout, mainRow, neighboursOf, pagedScreen, withGraphMended, withScreenApart, withScreenDocked, withScreenInRow, type GraphScreen } from "../lib/screen-graph"

// The screen graph (docs/2026-10-17-screen-graph.md; tasks/graph-model-todo.md):
// a comb - the main row is the paged screens in list order, a screen off it
// is docked above or below a page and has no further neighbour, and a
// neighbour is only a docked one.

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
// A'' below A.
const graph: GraphScreen[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
  { id: "a1", name: "A'", dock: { screenId: "a", edge: "up" } },
  { id: "b1", name: "B'", dock: { screenId: "b", edge: "up" } },
  { id: "a2", name: "A''", dock: { screenId: "a", edge: "down" } },
  { id: "h", name: "Hidden", hidden: true },
  { id: "m", name: "Master", isMaster: true },
]

const ids = (screens: GraphScreen[]) => screens.map((s) => s.id)

test.describe("screen graph: the core", () => {
  test("a project of today is one row in its list order, masters, popups and hidden screens apart", () => {
    expect(ids(mainRow(today))).toEqual(["a", "b", "c"])
    expect(neighboursOf(today, "a")).toEqual({ left: "c", right: "b" })
    expect(neighboursOf(today, "b")).toEqual({ left: "a", right: "c" })
    expect(neighboursOf(today, "c")).toEqual({ left: "b", right: "a" })
    expect(neighboursOf(today, "h")).toEqual({})
    expect(neighboursOf(today, "p")).toEqual({})
    expect(backOf(today, "b")).toBeUndefined()
  })

  test("a docked screen is off the row, joined to its page only, and knows the way back", () => {
    expect(ids(mainRow(graph))).toEqual(["a", "b"])
    expect(neighboursOf(graph, "a")).toEqual({ left: "b", right: "b", up: "a1", down: "a2" })
    expect(neighboursOf(graph, "a1")).toEqual({ down: "a" })
    expect(neighboursOf(graph, "a2")).toEqual({ up: "a" })
    // Swiped up to A'' (below A), the way back is up.
    expect(backOf(graph, "a2")).toBe("up")
    expect(backOf(graph, "a1")).toBe("down")
  })

  // The row is a ring, as «Next screen» walks it (2026-10-30): the swipe
  // from the last page to the first follows the finger and has a pull tab.
  test("the main row is a ring: right of the last screen lies the first, left of the first the last", () => {
    expect(neighboursOf(today, "c").right).toBe("a")
    expect(neighboursOf(today, "a").left).toBe("c")
    // One screen alone has no neighbour beside it.
    expect(neighboursOf([{ id: "only", name: "Only" }], "only")).toEqual({})
  })

  test("screens that only lie side by side are no neighbours: no way from A' to B'", () => {
    expect(neighboursOf(graph, "a1").right).toBeUndefined()
    expect(neighboursOf(graph, "b1")).toEqual({ down: "b" })
  })

  test("a dock that is no place of the comb counts for nothing", () => {
    const broken: GraphScreen[] = [
      { id: "a", name: "A" },
      { id: "a1", name: "A'", dock: { screenId: "a", edge: "up" } },
      { id: "x", name: "X", dock: { screenId: "gone", edge: "down" } },
      { id: "y", name: "Y", dock: { screenId: "m", edge: "down" } },
      // Beside a page, and on a screen that is itself docked.
      { id: "s", name: "S", dock: { screenId: "a", edge: "right" } },
      { id: "r", name: "R", dock: { screenId: "a1", edge: "up" } },
      { id: "m", name: "M", isMaster: true },
    ]
    expect(ids(mainRow(broken))).toEqual(["a"])
    expect(neighboursOf(broken, "a")).toEqual({ up: "a1" })
    expect(neighboursOf(broken, "a1")).toEqual({ down: "a" })
    for (const id of ["x", "y", "s", "r"]) expect(neighboursOf(broken, id)).toEqual({})
    expect(backOf(broken, "r")).toBeUndefined()
  })

  test("what may dock where, and why not", () => {
    const reason = (id: string, onId: string, edge: any) => {
      const check = canDock(graph, id, onId, edge)
      return check.ok ? "ok" : check.reason
    }
    expect(reason("b1", "b", "down")).toBe("ok")
    expect(reason("b1", "a", "up")).toBe(`The place above "A" is taken by "A'".`)
    // Moving a screen to the edge it is already on is no conflict with itself.
    expect(reason("a1", "a", "up")).toBe("ok")
    expect(reason("a1", "a1", "down")).toBe("A screen does not dock on itself.")
    expect(reason("b1", "a", "right")).toBe(`Left and right of "A" is the main row: put "B'" there in the list of screens.`)
    expect(reason("b1", "a1", "up")).toBe(`Nothing docks on "A'": it is itself above or below a screen of the main row.`)
    expect(reason("b1", "a1", "right")).toBe(`Nothing docks on "A'": it is itself above or below a screen of the main row.`)
    expect(reason("a", "b", "down")).toBe(`"A" has a screen above or below it: it stays in the main row.`)
    expect(reason("h", "a", "left")).toBe(`"Hidden" is hidden, a popup or a master: it does not dock.`)
    expect(reason("b1", "m", "down")).toBe(`"Master" is hidden, a popup or a master: nothing docks on it.`)
    expect(reason("b1", "h", "down")).toBe(`"Hidden" is hidden, a popup or a master: nothing docks on it.`)
  })

  test("a broken dock is mended: deleted or made a master, the screens on it become hidden; one itself made a master just loses its dock", () => {
    const deleted = withGraphMended(graph.filter((s) => s.id !== "a"))
    expect(ids(deleted.hidden)).toEqual(["a1", "a2"])
    expect(deleted.screens.find((s) => s.id === "a2")).toMatchObject({ hidden: true, dock: undefined })
    expect(ids(mainRow(deleted.screens))).toEqual(["b"])
    const mastered = withGraphMended(graph.map((s) => (s.id === "a1" ? { ...s, isMaster: true } : s)))
    expect(mastered.hidden).toEqual([])
    expect(mastered.screens.find((s) => s.id === "a1")).toMatchObject({ isMaster: true, dock: undefined })
    expect(mastered.screens.find((s) => s.id === "a1")!.hidden).toBeUndefined()
    // A dock beside a page, from a project of the first draft, is mended too.
    const beside = withGraphMended([...graph, { id: "s", name: "S", dock: { screenId: "a", edge: "right" } }])
    expect(ids(beside.hidden)).toEqual(["s"])
    const same = [...graph]
    expect(withGraphMended(same).screens).toBe(same)
  })

  test("next and previous walk the main row, from a docked screen as from its page", () => {
    const row3: GraphScreen[] = [...graph.slice(0, 2), { id: "c", name: "C" }, ...graph.slice(2)]
    expect(pagedScreen(row3, "a", 1)?.id).toBe("b")
    expect(pagedScreen(row3, "c", 1)?.id).toBe("a")
    expect(pagedScreen(row3, "a", -1)?.id).toBe("c")
    expect(pagedScreen(row3, "a1", 1)?.id).toBe("b")
    expect(pagedScreen(row3, "a2", -1)?.id).toBe("c")
    // From a hidden screen, counted from the first, as before.
    expect(pagedScreen(row3, "h", 1)?.id).toBe("b")
    expect(pagedScreen([{ id: "m", isMaster: true }], "m", 1)).toBeUndefined()
  })
})

test.describe("screen graph: what a swipe does", () => {
  // A' below A, a master that swipes up to a popup and left to the next screen.
  const master = { id: "m", name: "M", isMaster: true, objects: [], buttonActions: {
    "swipe-up": { type: "open-popup", targetScreenId: "p" },
    "swipe-left": { type: "next-screen" },
  } } as any
  const a = { id: "a", name: "A", objects: [], masterScreenId: "m" } as any
  const b = { id: "b", name: "B", objects: [], masterScreenId: "m" } as any
  const a1 = { id: "a1", name: "A'", objects: [], masterScreenId: "m", dock: { screenId: "a", edge: "down" } } as any
  const screens = [master, a, b, a1]

  test("the screen's own action first, an explicit «Nothing» among them", () => {
    const own = { ...a, buttonActions: { "swipe-up": { type: "send-mqtt", mqttTopic: "t", mqttMessage: "m" } } }
    expect(resolveSwipeAction(own, master, "swipe-up", [master, own, b, a1])).toEqual({ type: "send-mqtt", mqttTopic: "t", mqttMessage: "m" })
    const nothing = { ...a, buttonActions: { "swipe-up": { type: "none" } } }
    expect(resolveSwipeAction(nothing, master, "swipe-up", [master, nothing, b, a1])).toBeUndefined()
  })

  test("then the neighbour it pulls in: swiping up shows the screen below, left the one on the right", () => {
    expect(resolveSwipeAction(a, master, "swipe-up", screens)).toEqual({ type: "goto-neighbour", side: "down" })
    expect(resolveSwipeAction(a, master, "swipe-left", screens)).toEqual({ type: "goto-neighbour", side: "right" })
    expect(resolveSwipeAction(a1, master, "swipe-down", screens)).toEqual({ type: "goto-neighbour", side: "up" })
  })

  test("then the master's, where no neighbour is", () => {
    expect(resolveSwipeAction(b, master, "swipe-up", screens)).toEqual({ type: "open-popup", targetScreenId: "p" })
    // Beside B lies A on both sides now: the row is a ring.
    expect(resolveSwipeAction(b, master, "swipe-left", screens)).toEqual({ type: "goto-neighbour", side: "right" })
    expect(resolveSwipeAction(a, master, "swipe-down", screens)).toBeUndefined()
  })

  test("a button that is no swipe is resolved as before", () => {
    const withButton = { ...a, buttonActions: { "button-0": { type: "goto-neighbour", side: "down" } } }
    expect(resolveSwipeAction(withButton, master, "button-0", [master, withButton, b, a1])).toEqual({ type: "goto-neighbour", side: "down" })
    expect(resolveSwipeAction(a, master, "button-0", screens)).toBeUndefined()
  })
})

test.describe("screen graph: «Go to the screen beside»", () => {
  test("a button picks the side, says when nothing is docked there, and in the preview goes to the neighbour", async ({ page }, testInfo) => {
    // The combined project with its second screen docked below the first;
    // until the designer docks by itself (G4), the zip does.
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens.find((s: any) => s.id === "screen-3").dock = { screenId: "screen-1", edge: "down" }
    zip.file("project.json", JSON.stringify(project))
    const docked = testInfo.outputPath("docked.zip")
    fs.writeFileSync(docked, await zip.generateAsync({ type: "nodebuffer" }))
    await loadProject(page, docked)

    await clickButton0(page)
    const actionType = page.locator("#button-10-actionType")
    await expect(actionType).toBeFocused()
    await actionType.selectOption("goto-neighbour")
    const side = page.locator("#button-10-neighbourSide")
    // A button that is no swipe suggests the next screen.
    await expect(side).toHaveValue("right")
    await side.selectOption("up")
    await expect(page.getByText("No screen is docked there: here it does nothing.")).toBeVisible()
    await side.selectOption("down")
    await expect(page.getByText("No screen is docked there: here it does nothing.")).toHaveCount(0)

    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.waitForTimeout(300)
    await clickButton0(page)
    await expect(page.getByText("→ Go to the screen below").first()).toBeVisible()
    await expect(page.getByText("label-tests-black-background").first()).toBeVisible()
  })
})

test.describe("screen graph: «Position»", () => {
  // The screen's own panel: nothing selected on the canvas.
  async function openScreen(page: import("@playwright/test").Page, name: string) {
    // A hidden screen's row also says «Hidden».
    await page.getByRole("button", { name: new RegExp(`^${name}( Hidden)?$`) }).click()
    await page.keyboard.press("Escape")
  }

  test("docks a screen where it may, hides the screens docked on one that leaves the graph, and says so", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await openScreen(page, "label-tests-black-background")
    const position = page.locator("#screen-position-screen-3")
    await expect(position).toHaveValue("row")
    const offered = async (locator: import("@playwright/test").Locator) =>
      locator.locator("option").evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value))
    // Above and below a row screen, never beside it: that is the row.
    expect(await offered(position)).toContain("screen-1:down")
    expect(await offered(position)).not.toContain("screen-1:right")

    await position.selectOption("screen-1:down")
    await expect(position).toHaveValue("screen-1:down")
    // A docked screen is out of the paging already: no «Hide screen».
    await expect(page.getByText("Hide screen", { exact: true })).toHaveCount(0)

    // The place below is taken now, and a screen does not dock on what is docked on it.
    await openScreen(page, "label-tests-white-background")
    const first = page.locator("#screen-position-screen-1")
    expect(await offered(first)).not.toContain("screen-3:up")
    await openScreen(page, "mqtt-field-tests-white-background")
    const other = page.locator("#screen-position-screen-mqtt-white")
    expect(await offered(other)).not.toContain("screen-1:down")
    // Nothing docks on a docked screen: it has no neighbour but its page.
    expect(await offered(other)).not.toContain("screen-3:right")
    expect(await offered(other)).toContain("screen-1:up")

    // The page leaves the graph: its history becomes a hidden screen, said once.
    await openScreen(page, "label-tests-white-background")
    await page.getByText("Hide screen", { exact: true }).click()
    await expect(page.getByText("A screen is hidden now").first()).toBeVisible()
    await openScreen(page, "label-tests-black-background")
    await expect(page.locator("#screen-position-screen-3")).toHaveCount(0)
    await expect(page.getByText("Hide screen", { exact: true }).locator("input")).toBeChecked()
  })
})

test.describe("screen graph: what «Manage Screens» lays out and moves", () => {
  // The row A B C with A' above A, A'' below A and B' above B; a hidden
  // screen, a popup and a master apart.
  const project: GraphScreen[] = [
    { id: "m", name: "Master", isMaster: true },
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "a1", name: "A'", dock: { screenId: "a", edge: "up" } },
    { id: "c", name: "C" },
    { id: "a2", name: "A''", dock: { screenId: "a", edge: "down" } },
    { id: "b1", name: "B'", dock: { screenId: "b", edge: "up" } },
    { id: "h", name: "Setup", hidden: true },
    { id: "p", name: "Popup", screenType: "popup" },
  ]
  const column = (c: { page: GraphScreen; up?: GraphScreen; down?: GraphScreen }) => [c.up?.id, c.page.id, c.down?.id]

  test("the comb in columns, and apart from it the hidden screens, the popups and the masters", () => {
    const layout = graphLayout(project)
    expect(layout.columns.map(column)).toEqual([
      ["a1", "a", "a2"],
      ["b1", "b", undefined],
      [undefined, "c", undefined],
    ])
    expect(ids(layout.hidden)).toEqual(["h"])
    expect(ids(layout.popups)).toEqual(["p"])
    expect(ids(layout.masters)).toEqual(["m"])
    // A project of today is one row with nothing above or below.
    expect(graphLayout(today).columns.map(column)).toEqual([
      [undefined, "a", undefined],
      [undefined, "b", undefined],
      [undefined, "c", undefined],
    ])
  })

  test("into the row: before a page or at the end, from a dock or from hidden; a page takes what is docked on it", () => {
    expect(ids(mainRow(withScreenInRow(project, "c", "a")))).toEqual(["c", "a", "b"])
    expect(ids(mainRow(withScreenInRow(project, "a", null)))).toEqual(["b", "c", "a"])
    const moved = withScreenInRow(project, "a", null)
    expect(graphLayout(moved).columns.map(column)[2]).toEqual(["a1", "a", "a2"])
    const fromDock = withScreenInRow(project, "b1", "c")
    expect(ids(mainRow(fromDock))).toEqual(["a", "b", "b1", "c"])
    expect(fromDock.find((s) => s.id === "b1")!.dock).toBeUndefined()
    const fromHidden = withScreenInRow(project, "h", "b")
    expect(ids(mainRow(fromHidden))).toEqual(["a", "h", "b", "c"])
    expect(fromHidden.find((s) => s.id === "h")!.hidden).toBeUndefined()
    // A popup or a master is not put into the row.
    expect(ids(mainRow(withScreenInRow(project, "p", "a")))).toEqual(["a", "b", "c"])
  })

  test("docked on a free place, a hidden screen shown on the way; a refused dock says why", () => {
    const docked = withScreenDocked(project, "h", "c", "down")
    expect(docked.ok).toBe(true)
    if (!docked.ok) return
    expect(graphLayout(docked.screens).columns.map(column)[2]).toEqual([undefined, "c", "h"])
    expect(docked.screens.find((s) => s.id === "h")!.hidden).toBeUndefined()
    expect(withScreenDocked(project, "c", "a", "up")).toEqual({ ok: false, reason: `The place above "A" is taken by "A'".` })
    expect(withScreenDocked(project, "c", "a1", "up")).toEqual({
      ok: false,
      reason: `Nothing docks on "A'": it is itself above or below a screen of the main row.`,
    })
  })

  test("put apart, a screen is hidden; what was docked on it follows when the graph is mended", () => {
    const apart = withGraphMended(withScreenApart(project, "a"))
    expect(ids(mainRow(apart.screens))).toEqual(["b", "c"])
    expect(ids(apart.hidden)).toEqual(["a1", "a2"])
    expect(ids(graphLayout(apart.screens).hidden)).toEqual(["a", "a1", "a2", "h"])
  })

  test("a swipe of the screen's own that takes a neighbour's direction cuts it off", () => {
    const master = { id: "m", name: "M", isMaster: true, objects: [], buttonActions: { "swipe-up": { type: "open-popup", targetScreenId: "p" } } } as any
    const a = { id: "a", name: "A", objects: [], masterScreenId: "m" } as any
    const b = { id: "b", name: "B", objects: [], masterScreenId: "m" } as any
    const a1 = { id: "a1", name: "A'", objects: [], masterScreenId: "m", dock: { screenId: "a", edge: "down" } } as any
    // The master's swipe up does not cut A' off: the neighbour comes first.
    expect(cutOffSides(a, master, [master, a, b, a1])).toEqual([])
    const own = { ...a, buttonActions: { "swipe-up": { type: "send-mqtt", mqttTopic: "t", mqttMessage: "m" }, "swipe-left": { type: "none" } } }
    expect(cutOffSides(own, master, [master, own, b, a1])).toEqual([
      { swipeId: "swipe-up", side: "down", neighbourId: "a1" },
      { swipeId: "swipe-left", side: "right", neighbourId: "b" },
    ])
    // An own action that goes there all the same cuts nothing off.
    const there = {
      ...a,
      buttonActions: { "swipe-up": { type: "goto-screen", targetScreenId: "a1" }, "swipe-left": { type: "next-screen" } },
    }
    expect(cutOffSides(there, master, [master, there, b, a1])).toEqual([])
  })
})
