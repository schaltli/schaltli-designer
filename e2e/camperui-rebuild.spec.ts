import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { buildCamperUiProject } from "../deploy/demo/camperui-project"
import { mergeMasterAndScreenObjects } from "../lib/object-order"
import { applyTheme, isRole, migrateColorsToRoles, resolveColor, themeById } from "../lib/themes"

// Where CAMPERUI_PUSH and CAMPERUI_JSON put the rebuild in the designer's store.
const PUSH_NAME = "CamperUI nachgebaut"

// CamperUI rebuilt in Schaltli (deploy/demo/camperui-project.ts): every page
// drawn by the reference renderer the boards are compared against, its
// objects of types the 4" draws, every live value bound to a topic of the
// project. With CAMPERUI_SHOTS=<dir> each page is written there as a PNG;
// with CAMPERUI_PUSH=1 the project goes into the designer's store as
// «CamperUI».

const ROOT = path.join(__dirname, "..")
const DDF = path.join(ROOT, "public", "ddf", "waveshare-touch-lcd-4.ddf.zip")

const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])

test("the eight pages: types the 4\" draws, every value bound to a topic of the project", async () => {
  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(DDF)))
  expect(project.screens.filter((s: any) => !s.isMaster).map((s: any) => s.name)).toEqual(["Home", "Dimmer", "Power", "Wasser", "Klima", "Temperaturen", "MaxxFan", "Schalter"])
  const supported = new Set(project.settings.supportedObjectTypes)
  const objects = project.screens.flatMap((s: any) => deep(s.objects))
  for (const o of objects) expect(supported.has(o.type) || o.type === "free" || o.type === "table", `${o.id} ${o.type}`).toBe(true)
  const topics = new Set(project.topics.map((t: any) => t.topic))
  const known = (t: string) => topics.has(t.split("#")[0])
  for (const o of objects) {
    for (const key of ["topic", "writeTopic"]) if (o.properties?.[key]) expect(known(o.properties[key]), `${o.id} ${key} ${o.properties[key]}`).toBe(true)
    for (const lv of o.properties?.liveValues ?? []) expect(known(lv.source.path), `${o.id} ${lv.source.path}`).toBe(true)
    for (const s of o.properties?.series ?? []) expect(known(s.source.topic), `${o.id} ${s.source.topic}`).toBe(true)
    // Every {live:id} in a text has its value.
    const ids = [...String(o.properties?.text ?? "").matchAll(/\{live:([^}]+)\}/g)].map((m) => m[1])
    for (const lid of ids) expect((o.properties.liveValues ?? []).some((lv: any) => lv.id === lid), `${o.id} {live:${lid}}`).toBe(true)
  }
  // Every asset an icon or a page names is there.
  const assets = new Set(project.assets.map((a: any) => a.id))
  for (const o of objects) if (o.type === "icon") expect(assets.has(o.properties.assetId), o.id).toBe(true)
  for (const s of project.screens) if (s.iconAssetId) expect(assets.has(s.iconAssetId), s.id).toBe(true)
})

test("each page drawn as the boards are compared against", async ({ page }) => {
  test.setTimeout(120_000)
  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(DDF)))
  const out = process.env.CAMPERUI_SHOTS ? path.resolve(ROOT, process.env.CAMPERUI_SHOTS) : test.info().outputPath("pages")
  fs.mkdirSync(out, { recursive: true })
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  // Laid out first, as the designer has it: the tables place their objects.
  const laid: any = await page.evaluate((p) => (window as any).__layoutProjectForTest(p), project)
  const theme = themeById("slate")
  const depth = laid.settings.colorDepth
  for (let i = 0; i < laid.screens.length; i++) {
    const screen = laid.screens[i]
    if (screen.isMaster) continue
    // With its master's bar and navigator, as the export merges them, its
    // roles resolved as the export resolves them: dark as CamperUI, and light.
    const master = laid.screens.find((s: any) => s.id === screen.masterScreenId)
    for (const variant of ["dark", "light"] as const) {
      const drawn = {
        ...screen,
        backgroundColor: resolveColor(screen.backgroundColor, theme, variant, depth),
        objects: applyTheme(mergeMasterAndScreenObjects(master.objects, screen.objects, screen), theme, variant, depth),
      }
      const merged = { ...laid, screens: laid.screens.map((s: any) => (s === screen ? drawn : s)) }
      const png: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project: merged, screenIndex: i, topicOverrides: {} })
      expect(png, screen.name).toBeTruthy()
      const data = String(png).replace(/^data:image\/png;base64,/, "")
      fs.writeFileSync(path.join(out, `${String(i).padStart(2, "0")}-${screen.name}${variant === "light" ? "-hell" : ""}.png`), Buffer.from(data, "base64"))
    }
  }
  // The project as a file, to put into the designer outside a test run:
  // global-teardown deletes every project a run created, so CAMPERUI_PUSH
  // alone does not keep it.
  if (process.env.CAMPERUI_JSON) fs.writeFileSync(path.resolve(ROOT, process.env.CAMPERUI_JSON), JSON.stringify({ name: PUSH_NAME, project: { ...project, name: PUSH_NAME } }))
  if (process.env.CAMPERUI_PUSH) {
    // Created the first time, a new version after that - always under
    // PUSH_NAME, never the build's own name: «CamperUI» in the store is the
    // user's project, edited by hand (2026-11-06 a push landed on it).
    const pushed = { ...project, name: PUSH_NAME }
    const exists = (await page.request.get(`/api/projects/${encodeURIComponent(PUSH_NAME)}`)).ok()
    const res = exists
      ? await page.request.post(`/api/projects/${encodeURIComponent(PUSH_NAME)}/versions`, { data: pushed })
      : await page.request.post("/api/projects", { data: { name: PUSH_NAME, project: pushed } })
    expect(res.ok(), await res.text()).toBe(true)
  }
})

// What the 4" unpacks (docs/2026-11-04-native-buttons.md): 2.9 MB while
// every button was two pictures - more than the 4" has - and now its
// buttons are drawn by the board from their looks.
test("the rebuild for the 4\": no pictures of buttons, under 600 KB unpacked", async ({ page }) => {
  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(DDF)))
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zip = await JSZip.loadAsync(Buffer.from(await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), project), "base64"))
  const files = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith("_source/"))
  expect(files.map((f) => f.name).filter((n) => /-button-(normal|active)/.test(n))).toEqual([])
  let unpacked = 0
  for (const f of files) unpacked += (await f.async("uint8array")).length
  expect(unpacked, `${Math.round(unpacked / 1024)} KB unpacked`).toBeLessThan(600 * 1024)
  const json = JSON.parse(await zip.file("project.json")!.async("string"))
  const buttons = json.screens.flatMap((s: any) => deep(s.objects)).filter((o: any) => o.type === "button")
  for (const b of buttons) expect(b.look?.normal, b.id).toBeTruthy()
  // The relay tiles and the roof hatch are Toggle Buttons since 2026-11-06
  // (docs/2026-11-06-toggle-button.md), each with a look per state; no
  // switcher composes a tile any more.
  const tiles = json.screens.flatMap((s: any) => deep(s.objects)).filter((o: any) => o.type === "toggle-button")
  expect(tiles.length).toBe(11)
  for (const t of tiles) expect(t.looks?.length, t.id).toBe(2)
  expect(json.screens.flatMap((s: any) => deep(s.objects)).filter((o: any) => o.type === "switcher")).toEqual([])
})

// In CamperUI's own face (the user, 2026-11-04): the 4"'s fourth typography,
// Geometric, is Montserrat, and every text, button and value is set in it.
test("every text in Montserrat, the Geometric typography", async () => {
  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(DDF)))
  expect(project.screens.find((s: any) => s.isMaster).typography).toBe("Geometric")
  const families = new Map(project.fonts.map((f: any) => [f.id, f.family]))
  const used = project.screens.flatMap((s: any) => deep(s.objects)).flatMap((o: any) => [o.properties?.fontId, o.properties?.dateFontId]).filter(Boolean)
  expect(used.length).toBeGreaterThan(50)
  expect([...new Set(used.map((id: string) => families.get(id)))]).toEqual(["Montserrat"])
})

// Every page laid out by tables (the user, 2026-11-04): a page is one table,
// laid out nothing in it is left out for want of room - a docked table even
// 2 px too tall for its card drops out whole and leaves the card empty - and
// every page's table stands between the bar (40 px) and the navigator.
test("every page a table: nothing left out, between the bar and the navigator", async ({ page }) => {
  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(DDF)))
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const laid: any = await page.evaluate((p) => (window as any).__layoutProjectForTest(p), project)
  const navigatorTop = project.screenHeight - 64
  for (const screen of laid.screens) {
    if (screen.isMaster) continue
    expect(screen.objects.map((o: any) => o.type), screen.name).toEqual(["table"])
    const grid = screen.objects[0]
    for (const o of deep(grid.children)) expect(o.properties?.dockedOut, `${screen.name}: ${o.id} left out`).toBeFalsy()
    expect(grid.x, screen.name).toBeGreaterThanOrEqual(0)
    expect(grid.y, screen.name).toBeGreaterThanOrEqual(40)
    expect(grid.x + grid.width, `${screen.name}: ${grid.width} px wide`).toBeLessThanOrEqual(project.screenWidth)
    expect(grid.y + grid.height, `${screen.name}: ${grid.height} px tall`).toBeLessThanOrEqual(navigatorTop)
  }
  // The bar's contents are a table too.
  expect(laid.screens.find((s: any) => s.isMaster).objects.some((o: any) => o.type === "table")).toBe(true)
})

// Its colours are the Slate theme's roles (2026-11-04): until then the
// rebuild wrote CamperUI's hex values and named no theme, and the designer
// took it for a project from before themes - every hex matched to the
// nearest role of the old Lavender, and it opened in purples.
test("colours: roles of Slate, nothing for the designer to guess", async () => {
  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(DDF)))
  const master = project.screens.find((s: any) => s.isMaster)
  expect(master.themeId).toBe("slate")
  const before = JSON.stringify(project)
  expect(migrateColorsToRoles(JSON.parse(before)), "migrateColorsToRoles changed something").toBe(false)
  // Every colour key holds a role or "transparent", never a hex.
  const colours: string[] = []
  const walk = (node: any) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!node || typeof node !== "object") return
    for (const [k, v] of Object.entries(node)) {
      if (/color$/i.test(k) && typeof v === "string") colours.push(`${k}=${v}`)
      else walk(v)
    }
  }
  walk(project.screens)
  expect(colours.length).toBeGreaterThan(50)
  expect(colours.filter((c) => { const v = c.split("=")[1]; return v !== "transparent" && !isRole(v) })).toEqual([])
})

// On the 4" itself, with CAMPERUI_DEVICE=<its address>: the project installed
// as a deploy to its own device builds it, the topics' first examples (the
// values CamperUI's demo shows) published to the broker the board listens to
// (HIL_MQTT_URL), and each page read back off the glass into CAMPERUI_SHOTS
// as device-NN-<page>.png. It leaves the rebuild on the board.
test("on the 4\": installed, the demo's values published, each page photographed", async ({ page }) => {
  const device = process.env.CAMPERUI_DEVICE
  test.skip(!device, "CAMPERUI_DEVICE not set")
  test.setTimeout(300_000)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { HIL_PASSWORD } = require("../hil/device-auth.js")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mqtt = require("mqtt")
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Jimp } = require("jimp")
  const auth = { Authorization: `Bearer ${HIL_PASSWORD}` }
  const base = `http://${device}`
  const out = process.env.CAMPERUI_SHOTS ? path.resolve(ROOT, process.env.CAMPERUI_SHOTS) : test.info().outputPath("device")
  fs.mkdirSync(out, { recursive: true })

  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(DDF)))
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  // Laid out first, as the designer always has it: a table places its
  // objects there (lib/layout.ts), and a project straight from the builder
  // put the cards on top of each other on the glass.
  const laid = await page.evaluate((p) => (window as any).__layoutProjectForTest(p), project)
  const zip = Buffer.from(await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), laid), "base64")
  const form = new FormData()
  form.append("file", new Blob([zip]), "camperui.zip")
  const installed = await fetch(`${base}/api/project`, { method: "POST", body: form, headers: auth, signal: AbortSignal.timeout(120_000) })
  expect(installed.ok, await installed.text()).toBe(true)

  const show = async (index: number) =>
    fetch(`${base}/api/screen`, { method: "POST", headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" }, body: `index=${index}`, signal: AbortSignal.timeout(5000) })
  // Back from its restart: it takes a screen switch again.
  await expect(async () => expect((await show(0)).ok).toBe(true)).toPass({ timeout: 120_000, intervals: [2000] })

  const client = mqtt.connect(process.env.HIL_MQTT_URL || "mqtt://localhost:1883")
  await new Promise((resolve, reject) => {
    client.on("connect", resolve)
    client.on("error", reject)
  })
  const publishAll = () => Promise.all(project.topics.map((t: any) => new Promise((r) => client.publish(t.topic, t.examples[0], { qos: 1 }, r))))
  const shown = project.screens.filter((s: any) => !s.isMaster)
  try {
    for (let i = 0; i < shown.length; i++) {
      expect((await show(i)).ok).toBe(true)
      await publishAll()
      await new Promise((r) => setTimeout(r, 2500))
      const bmp = await fetch(`${base}/snapshot.bmp`, { headers: auth, signal: AbortSignal.timeout(30_000) })
      expect(bmp.ok).toBe(true)
      const image = await Jimp.read(Buffer.from(await bmp.arrayBuffer()))
      await image.write(path.join(out, `device-${String(i + 1).padStart(2, "0")}-${shown[i].name}.png`))
    }
  } finally {
    client.end(true)
  }
})
