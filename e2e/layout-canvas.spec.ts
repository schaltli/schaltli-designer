import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { canDropAsChildOf } from "../lib/object-tree"
import { COMBINED_TEST_PROJECT, ROUND_FIXTURE_DEVICE_ID, chooseDevice, createProject, devicePoint, getMainCanvas, loadProject, objectTreeRow, openFrameSection, waitForDeviceGate, waitForEditorReady, tablePlusOnScreen } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// Layout containers on the canvas (docs/2026-10-02-layout.md, module
// layout-canvas): the Layout tools, a container's properties, and the frame
// of an object a container places, shown locked.

type Obj = Record<string, any>

const text = (id: string, words: string, zIndex: number): Obj => ({
  id,
  type: "text",
  x: 0,
  y: 0,
  width: 300,
  height: 23,
  zIndex,
  properties: { text: words, color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent" },
})

// A grid on the first screen of the combined project, holding two names and
// a box; and a text beside it, outside any container.
const FIXTURE: Obj[] = [
  {
    id: "the-grid",
    type: "grid",
    x: 20,
    y: 20,
    width: 300,
    height: 200,
    zIndex: 1,
    properties: { columns: ["auto", 1] },
    children: [text("name-1", "Licht", 2), { id: "a-box", type: "box", x: 0, y: 0, width: 40, height: 20, zIndex: 3, properties: { fillColor: "#000000", strokeColor: "#000000", strokeWidth: 1, cornerRadius: 0 } }, text("name-2", "Frischwasserpumpe", 4)],
  },
  { ...text("loose", "Frei", 5), x: 30, y: 250, width: 80 },
]

async function fixtureProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = FIXTURE
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `layout-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

// The project as the editor holds it, through the real download.
async function downloadedProject(page: Page): Promise<Obj> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download Project" }).click(),
  ])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}
async function screenOne(page: Page): Promise<Obj[]> {
  return (await downloadedProject(page)).screens.find((s: Obj) => s.id === "screen-1").objects
}

async function clickAt(page: Page, x: number, y: number) {
  const { box } = await getMainCanvas(page)
  const p = devicePoint(box, x, y)
  await page.mouse.move(p.x, p.y)
  await page.mouse.move(p.x + 1, p.y + 1)
  await page.mouse.click(p.x + 1, p.y + 1)
}

async function frame(page: Page): Promise<Record<"x" | "y" | "width" | "height", number>> {
  await openFrameSection(page)
  const value = async (id: string) => Number(await page.locator(`#${id}`).inputValue())
  return { x: await value("x"), y: await value("y"), width: await value("width"), height: await value("height") }
}

test.describe("layout containers on the canvas", () => {
  test("an object outside a container keeps its frame editable", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    await objectTreeRow(page, "loose").click()
    await openFrameSection(page)
    // (A text's height comes from its font, locked by the text's own panel, as ever.)
    for (const id of ["x", "y", "width"]) await expect(page.locator(`#${id}`)).not.toHaveAttribute("readonly", "")
  })
})

test.describe("placing into a container at the insertion line", () => {
  // A stack holding two names, under the grid of the fixture's screen.
  async function withStack(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens.find((s: Obj) => s.id === "screen-1").objects = [
      ...FIXTURE,
      { id: "the-stack", type: "vertical-stack", x: 200, y: 20, width: 180, height: 200, zIndex: 9, properties: {}, children: [text("top", "Oben", 10), text("bottom", "Unten", 11)] },
    ]
    zip.file("project.json", JSON.stringify(project))
    const out = path.join(os.tmpdir(), `layout-stack-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }
  test("a box clicked into a grid lands in reading order", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    const grid = (await screenOne(page)).find((o: Obj) => o.id === "the-grid")!
    const last = grid.children[2] // «Frischwasserpumpe», row 2, column 1
    await page.getByRole("button", { name: "Box", exact: true }).first().click()
    // Right of it, in row 2: after it, at the end.
    await clickAt(page, 20 + last.x + last.width + 10, 20 + last.y + 5)
    const after = (await screenOne(page)).find((o: Obj) => o.id === "the-grid")!
    expect(after.children.map((c: Obj) => c.id).slice(0, 3)).toEqual(["name-1", "a-box", "name-2"])
    expect(after.children[3].type).toBe("box")
  })

  test("outside any stack, row or grid a rectangle is drawn, as before", async ({ page }) => {
    await loadProject(page, await fixtureProject())
    await page.getByRole("button", { name: "Box", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 340, 240)
    const to = devicePoint(box, 390, 290)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await page.mouse.up()
    const drawn = (await screenOne(page)).filter((o: Obj) => o.type === "box")
    expect(drawn).toHaveLength(1)
    expect(drawn[0]).toMatchObject({ x: 340, y: 240, width: 50, height: 50 })
  })
})

test.describe("moving within and between containers", () => {
  async function withStack(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens.find((s: Obj) => s.id === "screen-1").objects = [
      { ...FIXTURE[0], width: 160 },
      FIXTURE[1],
      { id: "the-stack", type: "vertical-stack", x: 200, y: 20, width: 180, height: 200, zIndex: 9, properties: {}, children: [text("top", "Oben", 10), text("bottom", "Unten", 11)] },
    ]
    zip.file("project.json", JSON.stringify(project))
    const out = path.join(os.tmpdir(), `layout-move-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }
  async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    const { box } = await getMainCanvas(page)
    const a = devicePoint(box, from.x, from.y)
    const b = devicePoint(box, to.x, to.y)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 10 })
    await page.mouse.up()
  }
  const order = (objects: Obj[], id: string) => objects.find((o) => o.id === id)!.children.map((c: Obj) => c.id)

  test("an object dragged within a stack changes its place in it", async ({ page }) => {
    await loadProject(page, await withStack())
    const stack = (await screenOne(page)).find((o) => o.id === "the-stack")!
    const [top, bottom] = stack.children
    // Into the stack (as a click in the tree does), then «Oben» dragged below «Unten».
    await objectTreeRow(page, "top").click()
    // Let go on the «+» below it: a new row at its end (no free row since Checkpoint C).
    await drag(page, { x: 200 + top.x + 5, y: 20 + top.y + 5 }, await tablePlusOnScreen(page, "the-stack"))
    expect(order(await screenOne(page), "the-stack")).toEqual(["bottom", "top"])
  })

  test("an object on the screen dragged into a grid lands at the line", async ({ page }) => {
    await loadProject(page, await withStack())
    const grid = (await screenOne(page)).find((o) => o.id === "the-grid")!
    const lastName = grid.children.find((c: Obj) => c.id === "name-2")
    // «Frei» from the bottom of the screen onto the «+» below the grid: after everything.
    expect(lastName).toBeTruthy()
    await drag(page, { x: 35, y: 255 }, await tablePlusOnScreen(page, "the-grid"))
    const after = await screenOne(page)
    expect(after.find((o) => o.id === "loose")).toBeUndefined()
    expect(order(after, "the-grid")).toEqual(["name-1", "a-box", "name-2", "loose"])
  })

  test("the object tree moves an object into a container", async ({ page }) => {
    await loadProject(page, await withStack())
    const target = objectTreeRow(page, "the-stack")
    const height = (await target.boundingBox())!.height
    await objectTreeRow(page, "loose").dragTo(target, { targetPosition: { x: 40, y: height / 2 } })
    const after = await screenOne(page)
    expect(after.find((o) => o.id === "loose")).toBeUndefined()
    expect(order(after, "the-stack")).toContain("loose")
  })

  // Reported 2026-10-02: with two labels selected, only one went into the
  // stack - on the canvas none at all.
  async function stackAndTwoLabels(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens.find((s: Obj) => s.id === "screen-1").objects = [
      { id: "the-stack", type: "vertical-stack", x: 200, y: 20, width: 180, height: 200, zIndex: 1, properties: {}, children: [text("inside", "Drin", 2)] },
      { ...text("label-a", "Erstes", 3), x: 20, y: 40, width: 100 },
      { ...text("label-b", "Zweites", 4), x: 20, y: 120, width: 100 },
    ]
    zip.file("project.json", JSON.stringify(project))
    const out = path.join(os.tmpdir(), `layout-multi-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }
  async function selectBoth(page: Page) {
    await objectTreeRow(page, "label-a").click()
    await objectTreeRow(page, "label-b").click({ modifiers: ["Control"] })
  }

  test("two selected labels dragged on the canvas both go into the stack, in their order", async ({ page }) => {
    await loadProject(page, await stackAndTwoLabels())
    await selectBoth(page)
    const inside = (await screenOne(page)).find((o) => o.id === "the-stack")!.children[0]
    // «Erstes» taken, let go on the «+» below «Drin».
    expect(inside).toBeTruthy()
    await drag(page, { x: 25, y: 45 }, await tablePlusOnScreen(page, "the-stack"))
    const after = await screenOne(page)
    expect(after.map((o) => o.id)).toEqual(["the-stack"])
    expect(order(after, "the-stack")).toEqual(["inside", "label-a", "label-b"])
  })

  test("two selected labels dragged in the object tree both go into the stack", async ({ page }) => {
    await loadProject(page, await stackAndTwoLabels())
    await selectBoth(page)
    const target = objectTreeRow(page, "the-stack")
    const height = (await target.boundingBox())!.height
    await objectTreeRow(page, "label-b").dragTo(target, { targetPosition: { x: 40, y: height / 2 } })
    const after = await screenOne(page)
    expect(after.map((o) => o.id)).toEqual(["the-stack"])
    expect(order(after, "the-stack")).toEqual(["inside", "label-a", "label-b"])
  })

  // Reported 2026-10-02: a double click selected only the stack.
  test("a double click into a stack selects what is under the pointer; a click beside leaves it", async ({ page }) => {
    await loadProject(page, await stackAndTwoLabels())
    const inside = (await screenOne(page)).find((o) => o.id === "the-stack")!.children[0]
    const { box } = await getMainCanvas(page)
    const on = devicePoint(box, 200 + inside.x + 4, 20 + inside.y + Math.round(inside.height / 2))
    await page.mouse.dblclick(on.x, on.y)
    await expect(page.locator("h3").first()).toContainText("inside")
    // Beside it, on a loose label: out of the stack, that label selected.
    await clickAt(page, 25, 45)
    await expect(page.locator("h3").first()).toContainText("label-a")
  })

  test("a container shows how it arranges only while it is active", async ({ page }) => {
    await loadProject(page, await stackAndTwoLabels())
    const { canvas, box } = await getMainCanvas(page)
    const at = devicePoint(box, 200, 20)
    const clip = { x: at.x - 2, y: at.y - 2, width: 184, height: 60 }
    const picture = () => page.screenshot({ clip })
    // A loose label selected: the stack is not active, nothing drawn on it.
    await objectTreeRow(page, "label-a").click()
    const quiet = await picture()
    // The stack selected - and the label inside it: its edge and its places show.
    await objectTreeRow(page, "the-stack").click()
    const active = await picture()
    expect(active.equals(quiet)).toBe(false)
    await objectTreeRow(page, "inside").click()
    expect((await picture()).equals(quiet)).toBe(false)
    expect(canvas).toBeTruthy()
  })
  test("a container takes anything a screen takes, a panel not (lib/object-tree.ts)", () => {
    const panel = { id: "p", type: "panel", x: 0, y: 0, width: 1, height: 1, zIndex: 0, properties: {}, children: [] }
    const objects = [
      { id: "sw", type: "switcher", x: 0, y: 0, width: 10, height: 10, zIndex: 0, properties: {}, children: [panel] },
      { id: "st", type: "table", x: 0, y: 0, width: 10, height: 10, zIndex: 1, properties: {}, children: [] },
      { id: "t", type: "text", x: 0, y: 0, width: 10, height: 10, zIndex: 2, properties: {} },
    ] as never
    expect(canDropAsChildOf(objects, "t", "st")).toBe(true)
    expect(canDropAsChildOf(objects, "sw", "st")).toBe(true)
    expect(canDropAsChildOf(objects, "p", "st")).toBe(false)
  })
})

// Task 9: the master's content area, a frame moved and resized on the master;
// the screens using it lay their root out in it.
test.describe("the master's content area", () => {
  async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, screen?: { width: number; height: number }) {
    const { box } = await getMainCanvas(page)
    const a = devicePoint(box, from.x, from.y, screen)
    const b = devicePoint(box, to.x, to.y, screen)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 10 })
    await page.mouse.up()
  }

  // A master with an area of its own, and the first screen a stack in it.
  async function withMaster(): Promise<string> {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.screens.unshift({ id: "the-master", name: "The Master", isMaster: true, objects: [], contentArea: { x: 100, y: 50, width: 200, height: 200 } })
    const one = project.screens.find((s: Obj) => s.id === "screen-1")
    one.masterScreenId = "the-master"
    one.layout = { type: "vertical-stack" }
    one.objects = [text("stacked", "Licht", 1)]
    zip.file("project.json", JSON.stringify(project))
    const out = path.join(os.tmpdir(), `layout-master-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
    fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
    return out
  }

  test("resizing the frame on the master lays out every screen using it anew", async ({ page }) => {
    await loadProject(page, await withMaster())
    const stacked = () => screenOne(page).then((objects) => objects.find((o) => o.id === "stacked")!)
    // Padding 2 mm at the fallback 4 px/mm, inside the master's area.
    expect(await stacked()).toMatchObject({ x: 108, y: 58 })

    await page.getByText("The Master", { exact: true }).first().click()
    await drag(page, { x: 100, y: 50 }, { x: 130, y: 80 })
    const project = await downloadedProject(page)
    expect(project.screens.find((s: Obj) => s.id === "the-master").contentArea).toEqual({ x: 130, y: 80, width: 170, height: 170 })
    expect(await stacked()).toMatchObject({ x: 138, y: 88 })

    // Its edge moves it, whole.
    await drag(page, { x: 200, y: 80 }, { x: 190, y: 70 })
    expect((await downloadedProject(page)).screens.find((s: Obj) => s.id === "the-master").contentArea).toEqual({ x: 120, y: 70, width: 170, height: 170 })
  })

  test("on the Knob a new master's area is the square inside the circle", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
    const knob = { width: 360, height: 360 }
    await page.getByText("Master 1", { exact: true }).first().click()
    // Its corner is where the inscribed square's is: 360 / √2 = 254, centred.
    await drag(page, { x: 53, y: 53 }, { x: 63, y: 63 }, knob)
    const master = (await downloadedProject(page)).screens.find((s: Obj) => s.isMaster)
    expect(master.contentArea).toEqual({ x: 63, y: 63, width: 244, height: 244 })
  })
})
