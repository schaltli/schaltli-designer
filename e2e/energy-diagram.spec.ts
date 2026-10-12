import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { getMainCanvas, devicePoint, waitForDeviceGate, chooseDevice, createProject, waitForEditorReady, loadProject } from "./helpers"
import { buildCamperProject } from "../deploy/demo/camper-project"
import { buildEditableProjectZip } from "../lib/project-zip"
import { seedWaveshare4v3bDdf } from "./ddf-seed"
import { Jimp } from "jimp"
import { ENERGY_ROLES, ROLES, THEMES, applyTheme, nearestRole, resolveRole } from "../lib/themes"
import { defaultDiagram, listedNodes, reorderedNodes, resolveEnergy, sankeyLayout, waveColour, withWatts, type EnergyNode } from "../lib/energy-diagram"

// The energy diagram in the designer (docs/2026-10-11-energy-diagram.md,
// tasks/energy-diagram-plan.md D1-D8). The core's own numbers are
// e2e/energy-diagram-layout.spec.ts; this file is the object.

type Obj = Record<string, any>

const DEVICE_ID = "e2e-energy-4v3b"
const SCREEN_43B = { width: 800, height: 480 }

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download Project" }).click(),
  ])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  await page.keyboard.press("Escape")
  return JSON.parse(await zip.file("project.json")!.async("string"))
}

async function newProject(page: Page): Promise<void> {
  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, DEVICE_ID, "auto-discovered")
  await createProject(page)
  await waitForEditorReady(page)
}

/** Draws a diagram with the tool, from one corner to the other, in device pixels. */
async function drawDiagram(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.getByRole("button", { name: "Energy diagram", exact: true }).click()
  const { box } = await getMainCanvas(page)
  const a = devicePoint(box, from.x, from.y, SCREEN_43B)
  const b = devicePoint(box, to.x, to.y, SCREEN_43B)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
  await page.mouse.move(b.x, b.y, { steps: 4 })
  await page.mouse.up()
}

function diagramsOf(project: Obj): Obj[] {
  const all: Obj[] = []
  const walk = (objects: Obj[]) => {
    for (const o of objects) {
      if (o.type === "energy-diagram") all.push(o)
      if (o.children) walk(o.children)
    }
  }
  for (const s of project.screens) walk(s.objects)
  return all
}

function diagramProject(): Obj {
  return {
    name: "energy",
    screenWidth: 800,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [],
    hardwareButtons: [],
    snapGuides: [],
    nextId: 100,
    screens: [
      { id: "master-1", name: "Master", isMaster: true, backgroundColor: "#ffffff", objects: [] },
      {
        id: "s1",
        name: "Energie",
        masterScreenId: "master-1",
        objects: [
          { id: "before", type: "text", x: 600, y: 20, width: 100, height: 20, zIndex: 1, properties: { text: "before", color: "#000000" } },
          { id: "e", type: "energy-diagram", x: 20, y: 20, width: 540, height: 400, zIndex: 2, properties: defaultDiagram({ width: 540, height: 400 }) },
        ],
      },
    ],
  }
}

test.describe("the energy diagram object", () => {
  test.beforeEach(async () => {
    test.skip(
      !(await seedWaveshare4v3bDdf(DEVICE_ID, (manifest) => {
        if (!manifest.supportedObjectTypes.includes("energy-diagram")) manifest.supportedObjectTypes.push("energy-diagram")
      })),
      "schaltli-firmware not checked out alongside this repo",
    )
  })

  test("drawn with the tool it fills the rectangle: a bus and three nodes, mode Flow", async ({ page }) => {
    await newProject(page)
    await drawDiagram(page, { x: 100, y: 60 }, { x: 640, y: 420 })
    const saved = await downloadProjectJson(page)
    const [diagram] = diagramsOf(saved)
    expect(diagram, "one energy diagram").toBeTruthy()
    expect(Math.abs(diagram.x - 100)).toBeLessThanOrEqual(2)
    expect(Math.abs(diagram.y - 60)).toBeLessThanOrEqual(2)
    expect(Math.abs(diagram.width - 540)).toBeLessThanOrEqual(3)
    expect(Math.abs(diagram.height - 360)).toBeLessThanOrEqual(3)
    const p = diagram.properties
    expect(p).toMatchObject({ mode: "flow", motion: true, fullScale: 1000 })
    expect(p.fontId).toBeTruthy()
    expect(p.nodes.map((n: Obj) => [n.role, n.name])).toEqual([
      ["bus", "12 V"],
      ["source", "Solar"],
      ["storage", "Battery"],
      ["rest", "Consumers"],
    ])
    for (const n of p.nodes) {
      expect(n.x, n.name).toBeGreaterThanOrEqual(0)
      expect(n.y, n.name).toBeGreaterThanOrEqual(0)
      expect(n.x, n.name).toBeLessThanOrEqual(diagram.width)
      expect(n.y, n.name).toBeLessThanOrEqual(diagram.height)
      if (n.role !== "bus") expect(n.lines, n.name).toEqual([{ text: "{watts} W" }])
    }
  })
})

test.describe("the energy diagram's core additions", () => {
  test("a new diagram's nodes stand round the bus, inside the box", () => {
    const d = defaultDiagram({ width: 400, height: 300 })
    const bus = d.nodes.find((n) => n.role === "bus")!
    expect(bus).toMatchObject({ x: 200, y: 135 })
    for (const n of d.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(400)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(300)
    }
    expect(d.nodes.filter((n) => n.role === "rest")).toHaveLength(1)
  })

  test("{watts} is the node's watts, whole; nothing known is a hyphen", () => {
    expect(withWatts("{watts} W", 92.4)).toBe("92 W")
    expect(withWatts("{watts} W", 92.5)).toBe("93 W")
    expect(withWatts("{watts} W · {watts}", 0)).toBe("0 W · 0")
    expect(withWatts("{watts} W", undefined)).toBe("- W")
    expect(withWatts("{live:soc} %", 5)).toBe("{live:soc} %")
  })
})

test.describe("the energy roles", () => {
  test("every theme has the six, light and dark; the colour themes the target picture's", () => {
    expect(ENERGY_ROLES.every((r) => (ROLES as readonly string[]).includes(r))).toBe(true)
    const lavender = THEMES.find((t) => t.id === "lavender")!
    expect(resolveRole(lavender, "energySun", "light", "24bit")).toBe("#c99400")
    expect(resolveRole(lavender, "energyCharge", "dark", "24bit")).toBe("#7fd492")
    for (const theme of THEMES) {
      for (const variant of ["light", "dark"] as const) {
        const values = ENERGY_ROLES.map((r) => theme[variant][r])
        for (const v of values) expect(v, `${theme.id}.${variant}`).toMatch(/^#[0-9a-f]{6}$/i)
        expect(new Set(values).size, `${theme.id}.${variant}: six different colours`).toBe(6)
      }
    }
  })

  test("a colour from before themes never becomes an energy role", () => {
    for (const theme of THEMES) {
      for (const hex of ["#c99400", "#2f9a52", "#4CAF50", "#d0453f", "#7a5bd1", "#2f7ad8"]) {
        expect(ENERGY_ROLES as readonly string[], `${theme.id} ${hex}`).not.toContain(nearestRole(hex, theme, "24bit"))
      }
    }
  })

  test("the role picker offers them", () => {
    // Listed with the others: the picker shows every role (e2e/themes.spec.ts).
    expect(ROLES.slice(-6)).toEqual([...ENERGY_ROLES])
  })
})

test.describe("the energy diagram in an export, until the device contract has it", () => {
  for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"] as const) {
    test(`${hook === "__buildDeviceZipForTest" ? "the device zip" : "the Android bundle"} leaves it out and keeps the rest`, async ({ page }) => {
      await page.goto("/test-render")
      await page.waitForFunction(() => (window as any).__testRenderReady === true)
      const zipBase64: string = await page.evaluate(({ hook, project }) => (window as any)[hook](project), { hook, project: diagramProject() })
      const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
      const project = JSON.parse(await zip.file("project.json")!.async("string"))
      expect(diagramsOf(project)).toEqual([])
      expect(JSON.stringify(project)).not.toContain("energy-diagram")
      const screen = project.screens.find((s: Obj) => s.id === "s1")
      expect(screen.objects.map((o: Obj) => o.id)).toContain("before")
    })
  }
})

// ---- D2: drawn still, through test-render (what the canvas, the preview
// and the thumbnails draw too). A diagram of 540 x 400 at (20, 20) on white.

const LAVENDER = THEMES.find((t) => t.id === "lavender")!
const role = (r: Parameters<typeof resolveRole>[1]) => resolveRole(LAVENDER, r, "light", "24bit").toLowerCase()
const ORIGIN = { x: 20, y: 20 }
const SIZE = { width: 540, height: 400 }
const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="#000"/></svg>'

function drawnProject(mode: "flow" | "sankey", topics: Record<string, string>): { project: Obj; nodes: EnergyNode[] } {
  const d = defaultDiagram(SIZE)
  const nodes = d.nodes.map((n) => ({
    ...n,
    ...(n.role === "source" ? { topic: "van/solar", iconAssetId: "sq" } : {}),
    ...(n.role === "storage" ? { topic: "van/battery", chargeTopic: "van/soc" } : {}),
  }))
  const diagram = { id: "e", type: "energy-diagram", ...ORIGIN, ...SIZE, zIndex: 1, properties: { ...d, mode, nodes } }
  const project = {
    name: "energy",
    screenWidth: 800,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [{ id: "sq", name: "sq", type: "icon", data: SQUARE }],
    topics: Object.entries(topics).map(([topic, value], i) => ({ id: `t${i}`, topic, type: "number", examples: [value] })),
    screens: [{ id: "s1", name: "Energie", backgroundColor: "#ffffff", objects: applyTheme([diagram as any], LAVENDER, "light", "24bit") }],
  }
  return { project, nodes }
}

async function render(page: Page, project: Obj, overrides: Record<string, string> = {}) {
  const dataUrl: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project, screenIndex: 0, topicOverrides: overrides })
  const img = await Jimp.read(Buffer.from(dataUrl.split(",")[1], "base64"))
  return (x: number, y: number) => "#" + (img.getPixelColor(Math.round(ORIGIN.x + x), Math.round(ORIGIN.y + y)) >>> 8).toString(16).padStart(6, "0")
}

const hexOf = (c: readonly number[]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("")
const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]

test.describe("the energy diagram, drawn", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  test("Flow: the bus in the accent, a giving node in its colour, a node without watts grey, the battery's ring", async ({ page }) => {
    const { project, nodes } = drawnProject("flow", { "van/solar": "600", "van/battery": "446", "van/soc": "50" })
    const at = await render(page, project)
    const n = (id: string) => nodes.find((x) => x.id === id)!
    expect(at(n("bus").x, n("bus").y)).toBe(role("accent"))
    // The top of a circle's 3 px stroke, r 32.
    expect(at(n("solar").x, n("solar").y - 32)).toBe(role("energySun"))
    expect(at(n("battery").x, n("battery").y - 32)).toBe(role("energyCharge"))
    // The ring (r 39, 5 px) half full: from the top clockwise, so its right is charged and its left is not.
    expect(at(n("battery").x + 39, n("battery").y)).toBe(role("energyCharge"))
    expect(at(n("battery").x - 39, n("battery").y)).toBe(role("track"))
    // The rest takes 600 - 446 = 154 W: live, in «Load».
    expect(at(n("consumers").x, n("consumers").y - 32)).toBe(role("energyLoad"))
    // The icon, tinted in the node's colour, in the circle's middle.
    expect(at(n("solar").x, n("solar").y)).toBe(role("energySun"))

    // Nothing from the sun, the battery giving 154 W: the sun grey, the battery in «Discharging».
    const night = await render(page, project, { "van/solar": "0", "van/battery": "-154" })
    expect(night(n("solar").x, n("solar").y - 32)).toBe(role("track"))
    expect(night(n("battery").x, n("battery").y - 32)).toBe(role("energyDischarge"))
    expect(night(n("consumers").x, n("consumers").y - 32)).toBe(role("energyLoad"))
  })

  test("a node whose topic has said nothing counts as 0 W", async ({ page }) => {
    const { project, nodes } = drawnProject("flow", { "van/solar": "600", "van/battery": "446", "van/soc": "50" })
    const at = await render(page, project, { "van/solar": "" })
    const solar = nodes.find((x) => x.id === "solar")!
    expect(at(solar.x, solar.y - 32)).toBe(role("track"))
  })

  test("Sankey: the bus, the bars and each band's columns as the core says, at phase 0", async ({ page }) => {
    const values = { "van/solar": "600", "van/battery": "446", "van/soc": "50" }
    const { project, nodes } = drawnProject("sankey", values)
    const at = await render(page, project)
    const layout = sankeyLayout(resolveEnergy(nodes, { solar: { watts: 600 }, battery: { watts: 446 } }), SIZE, 1000)
    expect(at(layout.bus.x + 8, layout.bus.y + layout.bus.height / 2)).toBe(role("accent"))
    const bar = (id: string) => layout.bars.find((b) => b.id === id)!
    expect(at(bar("solar").x + 6, bar("solar").y + bar("solar").height / 2)).toBe(role("energySun"))
    expect(at(bar("battery").x + 6, bar("battery").y + bar("battery").height / 2)).toBe(role("energyCharge"))
    for (const [id, colour] of [["solar", role("energySun")], ["battery", role("energyCharge")], ["consumers", role("energyLoad")]] as const) {
      const band = layout.bands.find((b) => b.id === id)!
      const top = band.polygon[12], bottom = band.polygon[band.polygon.length - 1 - 12]
      const x = Math.floor(top.x)
      expect(at(x, (top.y + bottom.y) / 2), id).toBe(hexOf(waveColour(rgbOf(colour), [255, 255, 255], x, 0)))
    }
    // Two columns half a wave apart differ: the wave is there.
    const band = layout.bands.find((b) => b.id === "solar")!
    const mid = (band.polygon[12].y + band.polygon[band.polygon.length - 13].y) / 2
    const x0 = Math.floor(band.polygon[12].x)
    expect(at(x0, mid)).not.toBe(at(x0 + 24, mid))
  })
})

// ---- D3: motion in the preview. The demo's project with one screen: a
// diagram of 540 x 400 at (20, 20) and a text beside it.

const DDF_43B = path.join(__dirname, "..", "public", "ddf", "waveshare-touch-lcd-4v3b.ddf.zip")

async function previewProject(mode: "flow" | "sankey", motion: boolean, withPopup = false): Promise<string> {
  const camper: any = await buildCamperProject(new Uint8Array(fs.readFileSync(DDF_43B)))
  const d = defaultDiagram(SIZE)
  const nodes = d.nodes.map((n) => ({
    ...n,
    ...(n.role === "source" ? { topic: "van/solar", ...(withPopup ? { action: { type: "open-popup", targetScreenId: "pop" } } : {}) } : {}),
    ...(n.role === "storage" ? { topic: "van/battery", chargeTopic: "van/soc" } : {}),
  }))
  const font = camper.fonts.find((f: any) => f.id === "font-helvR12")?.id ?? camper.fonts[0].id
  const master = camper.screens.find((s: any) => s.isMaster)
  const project = {
    ...camper,
    nextId: 1000,
    topics: [
      { id: "t1", topic: "van/solar", type: "number", examples: ["600"] },
      { id: "t2", topic: "van/battery", type: "number", examples: ["446"] },
      { id: "t3", topic: "van/soc", type: "number", examples: ["50"] },
    ],
    combinedTopics: [],
    screens: [
      { ...master, objects: [] },
      {
        id: "energy",
        name: "Energy",
        masterScreenId: master.id,
        objects: [
          { id: "e", type: "energy-diagram", ...ORIGIN, ...SIZE, zIndex: 1, properties: { ...d, mode, motion, nodes, fontId: font } },
          { id: "label", type: "text", x: 600, y: 40, width: 160, height: 30, zIndex: 2, properties: { text: "Still", fontId: font, textColor: "text" } },
        ],
      },
      ...(withPopup ? [{ id: "pop", name: "Popup P", screenType: "popup", objects: [] }] : []),
    ],
  }
  const out = path.join(os.tmpdir(), `energy-preview-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, Buffer.from(await (await buildEditableProjectZip(project)).arrayBuffer()))
  return out
}

/** The main canvas's pixels now, as screen coordinates (zoom 1, the screen centred). */
async function canvasPixels(page: Page): Promise<{ left: number; top: number; width: number; height: number; data: number[] }> {
  return page.evaluate(({ sw, sh }) => {
    const canvas = [...document.querySelectorAll("canvas")].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const ctx = canvas.getContext("2d")!
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    // The screen's top left on the canvas: centred, as the canvas draws it.
    return { left: Math.round((canvas.width - sw) / 2), top: Math.round((canvas.height - sh) / 2), width: canvas.width, height: canvas.height, data: Array.from(data) }
  }, { sw: SCREEN_43B.width, sh: SCREEN_43B.height })
}

/** Where the screen's pixels on the canvas changed over `ms`, in screen coordinates. */
async function changesOver(page: Page, ms: number): Promise<{ x: number; y: number }[]> {
  const a = await canvasPixels(page)
  await page.waitForTimeout(ms)
  const b = await canvasPixels(page)
  const out: { x: number; y: number }[] = []
  for (let y = 0; y < a.height; y += 2) {
    for (let x = 0; x < a.width; x += 2) {
      const i = (y * a.width + x) * 4
      if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) out.push({ x: x - a.left, y: y - a.top })
    }
  }
  return out
}

const inside = (p: { x: number; y: number }) => p.x >= ORIGIN.x && p.x < ORIGIN.x + SIZE.width && p.y >= ORIGIN.y && p.y < ORIGIN.y + SIZE.height

test.describe("the energy diagram moving in the preview", () => {
  for (const mode of ["sankey", "flow"] as const) {
    test(`${mode}: frames a moment apart differ inside the diagram and nowhere else; the editor stays still`, async ({ page }) => {
      await loadProject(page, await previewProject(mode, true))
      await page.getByRole("button", { name: /^Energy/ }).first().click()
      expect(await changesOver(page, 700), "the editor draws it still").toEqual([])
      await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.getByRole("button", { name: "Simulation", exact: true }).click()
      await page.waitForTimeout(500)
      const changed = await changesOver(page, 700)
      expect(changed.length, "something moved").toBeGreaterThan(20)
      expect(changed.filter((p) => !inside(p)), "only inside the diagram").toEqual([])
    })
  }

  test("Motion off: nothing moves in the preview", async ({ page }) => {
    await loadProject(page, await previewProject("sankey", false))
    await page.getByRole("button", { name: /^Energy/ }).first().click()
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.getByRole("button", { name: "Simulation", exact: true }).click()
    await page.waitForTimeout(500)
    expect(await changesOver(page, 700)).toEqual([])
  })

  test("held at a phase it stands still, and another phase is another picture", async ({ page }) => {
    await loadProject(page, await previewProject("sankey", true))
    await page.getByRole("button", { name: /^Energy/ }).first().click()
    await page.evaluate(() => ((window as any).__energyFrozenPhase = 0.25))
    await page.getByRole("button", { name: "Preview", exact: true }).click()
    await page.getByRole("button", { name: "Simulation", exact: true }).click()
    await page.waitForTimeout(400)
    expect(await changesOver(page, 500)).toEqual([])
    const quarter = (await canvasPixels(page)).data
    await page.evaluate(() => ((window as any).__energyFrozenPhase = 0.75))
    await page.waitForTimeout(300)
    const threeQuarters = (await canvasPixels(page)).data
    expect(threeQuarters.some((v, i) => v !== quarter[i])).toBe(true)
  })
})

// ---- D4: the property panel. A diagram drawn with the tool, its panel open.

test.describe("the energy diagram's panel", () => {
  test.beforeEach(async () => {
    test.skip(
      !(await seedWaveshare4v3bDdf(DEVICE_ID, (manifest) => {
        if (!manifest.supportedObjectTypes.includes("energy-diagram")) manifest.supportedObjectTypes.push("energy-diagram")
      })),
      "schaltli-firmware not checked out alongside this repo",
    )
  })

  const diagramOf = async (page: Page) => diagramsOf(await downloadProjectJson(page))[0]

  test("Mode, Motion and Full scale; switching mode keeps every node", async ({ page }) => {
    await newProject(page)
    await drawDiagram(page, { x: 100, y: 60 }, { x: 640, y: 420 })
    await expect(page.locator("#energyFullScale")).toHaveCount(0)
    const before = await diagramOf(page)
    await page.locator("#energyMode").selectOption("sankey")
    await page.locator("#energyFullScale").fill("2500")
    await page.locator("#energyFullScale").press("Enter")
    await page.getByText("Dots and waves move").click()
    const after = await diagramOf(page)
    expect(after.properties).toMatchObject({ mode: "sankey", fullScale: 2500, motion: false })
    expect(after.properties.nodes).toEqual(before.properties.nodes)
  })

  test("nodes: added by role, one rest at most, the bus stays, a node's fields change it", async ({ page }) => {
    await newProject(page)
    await drawDiagram(page, { x: 100, y: 60 }, { x: 640, y: 420 })
    const add = page.locator("#energyAddNode")
    await expect(add.locator("option", { hasText: "Rest" })).toHaveCount(0)
    await add.selectOption("sink")
    await expect(page.getByRole("button", { name: "Remove 12 V" })).toHaveCount(0)
    await page.getByRole("button", { name: "Remove Battery" }).click()
    let d = await diagramOf(page)
    expect(d.properties.nodes.map((n: Obj) => n.role)).toEqual(["bus", "source", "rest", "sink"])

    // The new sink's fields: its name and its topic's reverse sign.
    await page.getByRole("button", { name: /^Sink/ }).first().click()
    const sink = d.properties.nodes.find((n: Obj) => n.role === "sink")
    await page.locator(`#energy-${sink.id}-name`).fill("Fridge")
    await page.locator(`#energy-${sink.id}-name`).press("Tab")
    await page.getByText("The topic counts the other way").click()
    // A second line, then the tap opens nothing.
    await page.getByRole("button", { name: "Add line" }).click()
    d = await diagramOf(page)
    const fridge = d.properties.nodes.find((n: Obj) => n.id === sink.id)
    expect(fridge).toMatchObject({ name: "Fridge", reverseSign: true })
    expect(fridge.lines).toHaveLength(2)
    expect(fridge.action).toBeUndefined()

    // The rest gone, it may be added again.
    await page.getByRole("button", { name: "Remove Consumers" }).click()
    await expect(add.locator("option", { hasText: "Rest" })).toHaveCount(1)
  })

  test("in the Sankey the rows are its order: dragging one changes which comes first", async ({ page }) => {
    const nodes: EnergyNode[] = [
      { id: "bus", role: "bus", name: "12 V", x: 270, y: 200 },
      { id: "a", role: "source", name: "Alpha", x: 80, y: 60 },
      { id: "b", role: "source", name: "Beta", x: 80, y: 200 },
      { id: "c", role: "source", name: "Gamma", x: 80, y: 340 },
    ]
    expect(listedNodes(nodes, "sankey").map((n) => n.id)).toEqual(["bus", "a", "b", "c"])
    expect(listedNodes(nodes, "flow").map((n) => n.id)).toEqual(["bus", "a", "b", "c"])
    const moved = reorderedNodes(nodes, 3, 1)
    expect(listedNodes(moved, "sankey").map((n) => n.id)).toEqual(["bus", "c", "a", "b"])
    // Nothing but the nodes' y changed, the bus not at all.
    expect(moved.map((n) => n.x)).toEqual(nodes.map((n) => n.x))
    expect(moved.find((n) => n.id === "bus")).toEqual(nodes[0])
    expect(moved.map((n) => n.y)).toEqual([200, 200, 340, 60])
    void page
  })
})

// ---- D5: dragging a node in the Flow.

test.describe("the energy diagram's nodes dragged in the Flow", () => {
  test.beforeEach(async () => {
    test.skip(
      !(await seedWaveshare4v3bDdf(DEVICE_ID, (manifest) => {
        if (!manifest.supportedObjectTypes.includes("energy-diagram")) manifest.supportedObjectTypes.push("energy-diagram")
      })),
      "schaltli-firmware not checked out alongside this repo",
    )
  })

  const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const { box } = await getMainCanvas(page)
    const a = devicePoint(box, from.x, from.y, SCREEN_43B)
    const b = devicePoint(box, to.x, to.y, SCREEN_43B)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
    await page.mouse.move(b.x, b.y, { steps: 4 })
    await page.mouse.up()
  }

  test("a node follows the pointer, the others stay; undo puts it back; beside the circles the diagram moves", async ({ page }) => {
    await newProject(page)
    await drawDiagram(page, { x: 100, y: 60 }, { x: 640, y: 420 })
    const first = diagramsOf(await downloadProjectJson(page))[0]
    const solar = first.properties.nodes.find((n: Obj) => n.id === "solar")
    const at = { x: first.x + solar.x, y: first.y + solar.y }

    await drag(page, at, { x: at.x + 60, y: at.y + 40 })
    const moved = diagramsOf(await downloadProjectJson(page))[0]
    expect({ x: moved.x, y: moved.y }).toEqual({ x: first.x, y: first.y })
    const solarNow = moved.properties.nodes.find((n: Obj) => n.id === "solar")
    expect(Math.abs(solarNow.x - (solar.x + 60))).toBeLessThanOrEqual(1)
    expect(Math.abs(solarNow.y - (solar.y + 40))).toBeLessThanOrEqual(1)
    for (const n of moved.properties.nodes.filter((n: Obj) => n.id !== "solar")) {
      expect(n, n.id).toEqual(first.properties.nodes.find((m: Obj) => m.id === n.id))
    }

    await page.keyboard.press("Control+z")
    const undone = diagramsOf(await downloadProjectJson(page))[0]
    expect(undone.properties.nodes.find((n: Obj) => n.id === "solar")).toEqual(solar)

    // Pressed where no circle is, the diagram itself moves.
    await drag(page, { x: first.x + first.width / 2, y: first.y + first.height - 20 }, { x: first.x + first.width / 2 + 30, y: first.y + first.height - 20 })
    const shifted = diagramsOf(await downloadProjectJson(page))[0]
    expect(Math.abs(shifted.x - (first.x + 30))).toBeLessThanOrEqual(1)
    expect(shifted.properties.nodes).toEqual(undone.properties.nodes)
  })
})

// ---- D6: a tap on a node runs its action.

test.describe("a tap on an energy diagram's node", () => {
  /** Whether the screen outside the diagram looks as it did: a popup over it dims it. */
  const outside = async (page: Page) => {
    const px = await canvasPixels(page)
    const at = (x: number, y: number) => {
      const i = ((px.top + y) * px.width + px.left + x) * 4
      return px.data.slice(i, i + 3).join(",")
    }
    return [at(600, 460), at(10, 470), at(700, 300)].join(" ")
  }

  for (const mode of ["flow", "sankey"] as const) {
    test(`${mode}: on a node with «Open a popup» it opens; on one without, nothing`, async ({ page }) => {
      await loadProject(page, await previewProject(mode, false, true))
      await page.getByRole("button", { name: /^Energy/ }).first().click()
      await page.getByRole("button", { name: "Preview", exact: true }).click()
      await page.getByRole("button", { name: "Simulation", exact: true }).click()
      await page.waitForTimeout(400)
      const { box } = await getMainCanvas(page)
      const d = defaultDiagram(SIZE)
      const nodeAt = (id: string) => {
        if (mode === "flow") {
          const n = d.nodes.find((m) => m.id === id)!
          return { x: ORIGIN.x + n.x, y: ORIGIN.y + n.y }
        }
        const nodes = d.nodes
        const layout = sankeyLayout(resolveEnergy(nodes.map((n) => ({ ...n, ...(n.role === "source" ? { topic: "x" } : {}) })), { solar: { watts: 600 }, battery: { watts: 446 } }), SIZE, 1000)
        const bar = layout.bars.find((b) => b.id === id)!
        return { x: ORIGIN.x + bar.x + bar.width / 2, y: ORIGIN.y + bar.y + bar.height / 2 }
      }
      const before = await outside(page)
      const consumers = devicePoint(box, nodeAt("consumers").x, nodeAt("consumers").y, SCREEN_43B)
      await page.mouse.click(consumers.x, consumers.y)
      await page.waitForTimeout(300)
      expect(await outside(page), "no action, nothing opens").toBe(before)
      const solar = devicePoint(box, nodeAt("solar").x, nodeAt("solar").y, SCREEN_43B)
      await page.mouse.click(solar.x, solar.y)
      await expect.poll(() => outside(page)).not.toBe(before)
    })
  }
})

test.describe("a node's popup in the export", () => {
  test("an «Open a popup» to no popup is dropped from a node; one to a popup stays and is named for the deploy's warning", async () => {
    const { withoutDeadPopupActions, popupOpeners } = await import("../lib/popup")
    const project = {
      screens: [
        {
          id: "s1",
          name: "Energie",
          objects: [
            {
              id: "e",
              type: "energy-diagram",
              properties: {
                nodes: [
                  { id: "a", name: "Solar", action: { type: "open-popup", targetScreenId: "gone" } },
                  { id: "b", name: "Batterie", action: { type: "open-popup", targetScreenId: "pop" } },
                ],
              },
            },
          ],
        },
        { id: "pop", name: "Popup P", screenType: "popup" as const, objects: [] },
      ],
    }
    const nodes = (withoutDeadPopupActions(project as any).screens[0].objects[0] as any).properties.nodes
    expect(nodes[0]).toEqual({ id: "a", name: "Solar" })
    expect(nodes[1].action).toEqual({ type: "open-popup", targetScreenId: "pop" })
    expect(popupOpeners(project as any)).toEqual(['"Batterie" in an energy diagram on Energie'])
  })
})
