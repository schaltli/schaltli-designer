import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, getSelectedHeader, loadProject, objectTreeRow } from "./helpers"

// Groups (lib/object-groups.ts, 2026-09-29): objects kept together in the
// designer - a Text and the Slider it names - without either owning the
// other. Ctrl+G makes one, Ctrl+U (or Ctrl+Shift+G) dissolves it; a click takes the whole
// group, a double click goes inside it. No device ever sees one: every export
// dissolves it into the objects it holds, at their place on the screen.

type Obj = Record<string, any>

const flatten = (list: Obj[]): Obj[] => (list || []).flatMap((o) => [o, ...flatten(o.children)])

// Four objects on the combined project's first screen, instead of its twelve
// overlapping labels: two boxes to group, a text beside them, and nothing
// else in the way of a click.
const FIXTURE: Obj[] = [
  { id: "a-box", type: "box", x: 40, y: 40, width: 60, height: 30, zIndex: 1, properties: { fillColor: "#000000", strokeColor: "#000000", strokeWidth: 1, cornerRadius: 0 } },
  { id: "b-box", type: "box", x: 140, y: 60, width: 50, height: 40, zIndex: 2, properties: { fillColor: "#000000", strokeColor: "#000000", strokeWidth: 1, cornerRadius: 0 } },
  {
    id: "c-text",
    type: "text",
    x: 40,
    y: 180,
    width: 120,
    height: 23,
    zIndex: 3,
    properties: { text: "Label", color: "#000000", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent" },
  },
]

// Points on the canvas, in device pixels, inside each fixture object.
const ON_A = { x: 50, y: 50 }
const ON_B = { x: 160, y: 80 }
const ON_C = { x: 60, y: 190 }
const NOWHERE = { x: 300, y: 250 }

async function fixtureProject(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens.find((s: Obj) => s.id === "screen-1").objects = FIXTURE
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `group-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
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

async function screenObjects(page: Page, screenId = "screen-1"): Promise<Obj[]> {
  const project = await downloadedProject(page)
  return project.screens.find((s: Obj) => s.id === screenId).objects
}

async function at(page: Page, point: { x: number; y: number }) {
  const { box } = await getMainCanvas(page)
  return devicePoint(box, point.x, point.y)
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await at(page, from)
  const b = await at(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
  // The history closes a gesture shortly after the release.
  await page.waitForTimeout(200)
}

async function expectHeader(page: Page, text: string) {
  await expect.poll(() => getSelectedHeader(page), { timeout: 10000 }).toContain(text)
}

// Selects a and b in the tree and presses Ctrl+G. The group gets the next
// object id, which the combined project puts at obj-29.
async function groupAB(page: Page): Promise<string> {
  await objectTreeRow(page, "a-box").click()
  await objectTreeRow(page, "b-box").click({ modifiers: ["Control"] })
  await expectHeader(page, "Multiple")
  await page.keyboard.press("Control+g")
  await expectHeader(page, "Group")
  const header = await getSelectedHeader(page)
  return header.replace("Group", "").trim()
}

test.describe("groups", () => {
  test.beforeEach(async ({ page }) => {
    await loadProject(page, await fixtureProject())
  })

  test("Ctrl+G makes one group: children relative to it, its box theirs, one undo step", async ({ page }) => {
    const groupId = await groupAB(page)

    const objects = await screenObjects(page)
    const group = objects.find((o) => o.id === groupId)!
    expect(group.type).toBe("group")
    // The bounding box of both: a at 40,40 (60x30), b at 140,60 (50x40).
    expect([group.x, group.y, group.width, group.height]).toEqual([40, 40, 150, 60])
    // In the place of the frontmost of the two.
    expect(group.zIndex).toBe(2)
    const children = Object.fromEntries(group.children.map((c: Obj) => [c.id, [c.x, c.y, c.width, c.height]]))
    expect(children).toEqual({ "a-box": [0, 0, 60, 30], "b-box": [100, 20, 50, 40] })
    expect(objects.map((o) => o.id).sort()).toEqual([groupId, "c-text"].sort())

    // The tree shows it with its two objects inside.
    await expect(objectTreeRow(page, groupId)).toHaveAttribute("title", `group · ${groupId}`)
    await expect(objectTreeRow(page, "a-box")).toHaveAttribute("style", /padding-left:\s*20px/)

    // One Ctrl+Z takes the whole thing back.
    await page.keyboard.press("Control+z")
    await expect(objectTreeRow(page, groupId)).toHaveCount(0)
    const undone = await screenObjects(page)
    expect(undone.find((o) => o.id === "a-box")).toMatchObject({ x: 40, y: 40 })
    expect(undone.find((o) => o.id === "b-box")).toMatchObject({ x: 140, y: 60 })
  })

  test("a click on any of its objects takes the group, and a drag or an arrow key moves it whole", async ({ page }) => {
    const groupId = await groupAB(page)
    // Something else first, so the click has something to change.
    await objectTreeRow(page, "c-text").click()
    await expectHeader(page, "Text")

    const onB = await at(page, ON_B)
    await page.mouse.click(onB.x, onB.y)
    await expectHeader(page, `Group ${groupId}`)
    // No resize handles on a group: its size is its objects'. A drag from
    // its bottom-right corner, where a handle would sit, moves it instead.
    await drag(page, { x: 188, y: 98 }, { x: 208, y: 128 })
    let group = (await screenObjects(page)).find((o) => o.id === groupId)!
    expect([group.x, group.y, group.width, group.height]).toEqual([60, 70, 150, 60])
    expect(group.children.map((c: Obj) => [c.id, c.x, c.y])).toEqual([
      ["a-box", 0, 0],
      ["b-box", 100, 20],
    ])

    // The keyboard nudges it: a pixel, ten with Shift. The canvas has the
    // keys once it has been clicked - the download took them away.
    const moved = await at(page, { x: ON_B.x + 20, y: ON_B.y + 30 })
    await page.mouse.click(moved.x, moved.y)
    await expectHeader(page, `Group ${groupId}`)
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("Shift+ArrowDown")
    group = (await screenObjects(page)).find((o) => o.id === groupId)!
    expect([group.x, group.y]).toEqual([61, 80])
  })

  test("a double click goes inside: one object moves alone and the group's box follows; Escape comes out", async ({ page }) => {
    const groupId = await groupAB(page)

    const onA = await at(page, ON_A)
    await page.mouse.dblclick(onA.x, onA.y)
    // Inside, the object under the pointer is selected at once.
    await expectHeader(page, "Box a-box")

    // a up by 20: the group now starts 20 higher, and b - which did not
    // move on the screen - sits 20 further down inside it.
    await drag(page, ON_A, { x: ON_A.x, y: ON_A.y - 20 })
    let objects = await screenObjects(page)
    let group = objects.find((o) => o.id === groupId)!
    expect([group.x, group.y, group.width, group.height]).toEqual([40, 20, 150, 80])
    expect(group.children.map((c: Obj) => [c.id, c.x, c.y])).toEqual([
      ["a-box", 0, 0],
      ["b-box", 100, 40],
    ])

    // Still inside: a click on b takes b, not the group.
    const onB = await at(page, ON_B)
    await page.mouse.click(onB.x, onB.y)
    await expectHeader(page, "Box b-box")

    // Escape: out, with the group selected.
    await page.keyboard.press("Escape")
    await expectHeader(page, `Group ${groupId}`)
    await page.mouse.click(onB.x, onB.y)
    await expectHeader(page, `Group ${groupId}`)

    // In again, and out by a click beside the group - which takes what it
    // lands on.
    await page.mouse.dblclick(onB.x, onB.y)
    await expectHeader(page, "Box b-box")
    const onC = await at(page, ON_C)
    await page.mouse.click(onC.x, onC.y)
    await expectHeader(page, "Text c-text")
    await page.mouse.click(onB.x, onB.y)
    await expectHeader(page, `Group ${groupId}`)

    // A group that loses its last object is gone. Here: inside, a selected,
    // Delete, then b.
    await page.mouse.dblclick(onB.x, onB.y)
    await page.keyboard.press("Delete")
    objects = await screenObjects(page)
    group = objects.find((o) => o.id === groupId)!
    expect(group.children.map((c: Obj) => c.id)).toEqual(["a-box"])
    expect([group.x, group.y, group.width, group.height]).toEqual([40, 20, 60, 30])
  })

  test("inside a group, a drag on empty space draws a rectangle over the group's own objects (#25)", async ({ page }) => {
    const groupId = await groupAB(page)
    const onA = await at(page, ON_A)
    await page.mouse.dblclick(onA.x, onA.y)
    await expectHeader(page, "Box a-box")

    // From beside the group to below c: the rectangle covers a, b and c, but
    // only the group's own objects are there to be caught, and the group
    // stays open.
    await drag(page, { x: 30, y: 30 }, { x: 200, y: 210 })
    await expectHeader(page, "Multiple")
    await page.keyboard.press("Delete")
    const objects = await screenObjects(page)
    expect(objects.map((o) => o.id)).toEqual(["c-text"])
    expect(flatten(objects).some((o) => o.id === groupId)).toBe(false)
  })

  test("inside a group, a rectangle that catches nothing leaves it open and selects nothing", async ({ page }) => {
    const groupId = await groupAB(page)
    const onA = await at(page, ON_A)
    await page.mouse.dblclick(onA.x, onA.y)
    await expectHeader(page, "Box a-box")

    await drag(page, NOWHERE, { x: NOWHERE.x + 30, y: NOWHERE.y + 20 })
    await expect.poll(() => getSelectedHeader(page)).not.toContain("a-box")
    // Still inside: a click on b takes b alone.
    const onB = await at(page, ON_B)
    await page.mouse.click(onB.x, onB.y)
    await expectHeader(page, "Box b-box")
    await page.keyboard.press("Escape")
    await expectHeader(page, `Group ${groupId}`)
  })

  test("picking an object of the group in the object list goes inside the group", async ({ page }) => {
    const groupId = await groupAB(page)
    await objectTreeRow(page, "a-box").click()
    await expectHeader(page, "Box a-box")
    // Inside: the canvas hands out the group's objects one by one.
    const onB = await at(page, ON_B)
    await page.mouse.click(onB.x, onB.y)
    await expectHeader(page, "Box b-box")
    // And Escape comes out from there too, although the list had the keys.
    await objectTreeRow(page, "a-box").click()
    await page.keyboard.press("Escape")
    await expectHeader(page, `Group ${groupId}`)
  })

  test("Ctrl+U dissolves it: its objects stay where they are, selected", async ({ page }) => {
    const groupId = await groupAB(page)
    await drag(page, ON_B, { x: ON_B.x + 10, y: ON_B.y + 10 })
    await page.keyboard.press("Control+u")
    await expectHeader(page, "Multiple Objects Selected (2 items)")

    const objects = await screenObjects(page)
    expect(objects.find((o) => o.id === groupId)).toBeUndefined()
    expect(objects.find((o) => o.id === "a-box")).toMatchObject({ x: 50, y: 50, width: 60, height: 30 })
    expect(objects.find((o) => o.id === "b-box")).toMatchObject({ x: 150, y: 70, width: 50, height: 40 })
    // The stacking order they had inside it: a behind b.
    const z = (id: string) => objects.find((o) => o.id === id)!.zIndex
    expect(z("a-box")).toBeLessThan(z("b-box"))
  })

  test("Ctrl+Shift+G dissolves it as well, the shortcut other drawing programs use", async ({ page }) => {
    const groupId = await groupAB(page)
    await page.keyboard.press("Control+Shift+g")
    await expectHeader(page, "Multiple Objects Selected (2 items)")
    const objects = await screenObjects(page)
    expect(objects.find((o) => o.id === groupId)).toBeUndefined()
    expect(objects.find((o) => o.id === "a-box")).toMatchObject({ x: 40, y: 40 })
    expect(objects.find((o) => o.id === "b-box")).toMatchObject({ x: 140, y: 60 })
  })

  test("Group and Ungroup are in the canvas's context menu", async ({ page }) => {
    await objectTreeRow(page, "a-box").click()
    await objectTreeRow(page, "c-text").click({ modifiers: ["Control"] })
    const onC = await at(page, ON_C)
    await page.mouse.click(onC.x, onC.y, { button: "right" })
    await expect(page.getByRole("button", { name: "Ungroup Ctrl+U" })).toBeDisabled()
    await page.getByRole("button", { name: "Group Ctrl+G" }).click()
    await expectHeader(page, "Group")
    await page.mouse.click(onC.x, onC.y, { button: "right" })
    await page.getByRole("button", { name: "Ungroup Ctrl+U" }).click()
    await expectHeader(page, "Multiple Objects Selected (2 items)")
  })

  test("copy and paste give the group and everything in it new ids", async ({ page }) => {
    const groupId = await groupAB(page)
    await page.keyboard.press("Control+c")
    await page.keyboard.press("Control+v")
    await expectHeader(page, "Group")
    const pastedId = (await getSelectedHeader(page)).replace("Group", "").trim()
    expect(pastedId).not.toBe(groupId)

    const objects = await screenObjects(page)
    const ids = flatten(objects).map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    const pasted = objects.find((o) => o.id === pastedId)!
    expect(pasted.children).toHaveLength(2)
    for (const child of pasted.children) expect(["a-box", "b-box"]).not.toContain(child.id)
    // 20 right and down of the original; inside, the same layout.
    expect([pasted.x, pasted.y]).toEqual([60, 60])
    expect(pasted.children.map((c: Obj) => [c.x, c.y])).toEqual([
      [0, 0],
      [100, 20],
    ])
  })

  test("a pasted switcher's panels and their objects get new ids too", async ({ page }) => {
    await page.getByText("tab-control-tests", { exact: true }).click()
    await objectTreeRow(page, "fan-mode-control").click()
    await expectHeader(page, "Switcher")
    await page.keyboard.press("Control+c")
    await page.keyboard.press("Control+v")
    await expectHeader(page, "Switcher")
    const pastedId = (await getSelectedHeader(page)).replace("Switcher", "").trim()
    expect(pastedId).not.toBe("fan-mode-control")

    const objects = await screenObjects(page, "screen-tab-control-tests")
    const original = flatten(objects.filter((o) => o.id === "fan-mode-control")).map((o) => o.id)
    const copy = flatten(objects.filter((o) => o.id === pastedId)).map((o) => o.id)
    expect(copy.length).toBe(original.length)
    expect(copy.length).toBeGreaterThan(3)
    for (const id of copy) expect(original).not.toContain(id)
    const all = flatten(objects).map((o) => o.id)
    expect(new Set(all).size).toBe(all.length)
  })
})

// ---------------------------------------------------------------- export

const ICON_SVG =
  "data:image/svg+xml;base64," +
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#000"/></svg>`).toString("base64")

// A red box, a text and a group in a group holding a blue box, all inside one
// group at 20,30 - and a text and a box outside it, before and after it in
// the stacking order.
function groupedProject(): Obj {
  const box = (id: string, x: number, y: number, w: number, h: number, colour: string, zIndex: number): Obj => ({
    id,
    type: "box",
    x,
    y,
    width: w,
    height: h,
    zIndex,
    properties: { fillColor: colour, strokeColor: colour, strokeWidth: 1, cornerRadius: 0 },
  })
  return {
    name: "grouped",
    screenWidth: 360,
    screenHeight: 360,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [{ id: "asset-sq", name: "sq", type: "icon", data: ICON_SVG }],
    topics: [],
    hardwareButtons: [],
    snapGuides: [],
    nextId: 100,
    screens: [
      { id: "master-1", name: "Master", isMaster: true, backgroundColor: "#ffffff", objects: [] },
      {
        id: "s1",
        name: "Grouped",
        masterScreenId: "master-1",
        objects: [
          { id: "before", type: "text", x: 200, y: 200, width: 100, height: 20, zIndex: 1, properties: { text: "before", color: "#000000" } },
          {
            id: "g",
            type: "group",
            x: 20,
            y: 30,
            width: 100,
            height: 70,
            zIndex: 2,
            properties: {},
            children: [
              box("g-red", 0, 0, 60, 40, "#ff0000", 0),
              { id: "g-text", type: "text", x: 0, y: 50, width: 100, height: 20, zIndex: 1, properties: { text: "in", color: "#000000" } },
              {
                id: "g-inner",
                type: "group",
                x: 70,
                y: 0,
                width: 20,
                height: 20,
                zIndex: 2,
                properties: {},
                children: [box("g-blue", 0, 0, 20, 20, "#0000ff", 0)],
              },
              { id: "g-icon", type: "icon", x: 70, y: 30, width: 24, height: 24, zIndex: 3, properties: { assetId: "asset-sq", backgroundColor: "transparent" } },
            ],
          },
          box("after", 300, 300, 20, 20, "#00ff00", 3),
        ],
      },
    ],
  }
}

async function buildZip(page: Page, hook: "__buildDeviceZipForTest" | "__buildAndroidZipForTest"): Promise<JSZip> {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zipBase64: string = await page.evaluate(({ hook, project }) => (window as any)[hook](project), {
    hook,
    project: groupedProject(),
  })
  return JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
}

function expectDissolved(screen: Obj) {
  const all = flatten(screen.objects)
  expect(all.map((o) => o.type)).not.toContain("group")
  const pos = (id: string) => {
    const o = all.find((x) => x.id === id)
    return o ? [o.x, o.y] : null
  }
  expect(pos("g-red")).toEqual([20, 30])
  expect(pos("g-text")).toEqual([20, 80])
  expect(pos("g-blue")).toEqual([90, 30])
  expect(pos("g-icon")).toEqual([90, 60])
  // Where the group stood in the stacking order, in its own order.
  const order = [...screen.objects].sort((a, b) => a.zIndex - b.zIndex).map((o) => o.id)
  expect(order.filter((id) => all.some((o) => o.id === id && ["before", "g-red", "g-text", "g-blue", "g-icon", "after"].includes(id)))).toEqual(
    ["before", "g-red", "g-text", "g-blue", "g-icon", "after"],
  )
}

test.describe("groups in an export", () => {
  test("a device gets the objects, at their place on the screen, and no group", async ({ page }) => {
    const zip = await buildZip(page, "__buildDeviceZipForTest")
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const screen = project.screens.find((s: Obj) => s.id === "s1")
    expectDissolved(screen)
    // The icon inside the group was baked and pointed at like any other.
    const icon = flatten(screen.objects).find((o) => o.id === "g-icon")!
    expect(icon.path).toMatch(/^assets\//)
    expect(zip.file(icon.path)).not.toBeNull()
    // The copy kept for recovery is the project as authored, group and all.
    const source = await JSZip.loadAsync(await zip.file("_source/project.zip")!.async("uint8array"))
    const authored = JSON.parse(await source.file("project.json")!.async("string"))
    expect(flatten(authored.screens.find((s: Obj) => s.id === "s1").objects).map((o: Obj) => o.type)).toContain("group")
  })

  test("the Android app gets the objects too, and a box in a group is in the background picture", async ({ page }) => {
    const zip = await buildZip(page, "__buildAndroidZipForTest")
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const screen = project.screens.find((s: Obj) => s.id === "s1")
    expectDissolved(screen)

    // A box at the top level goes into the baked background - and one in a
    // group at the top level is a top-level box once dissolved.
    const png = await zip.file(screen.backgroundImage)!.async("base64")
    const pixel = (x: number, y: number) =>
      page.evaluate(
        async ({ png, x, y }) => {
          const img = new Image()
          img.src = `data:image/png;base64,${png}`
          await img.decode()
          const canvas = document.createElement("canvas")
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext("2d")!
          ctx.drawImage(img, 0, 0)
          return Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
        },
        { png, x, y },
      )
    expect(await pixel(50, 50)).toEqual([255, 0, 0])
    expect(await pixel(100, 40)).toEqual([0, 0, 255])
    expect(await pixel(200, 150)).toEqual([255, 255, 255])
  })
})
