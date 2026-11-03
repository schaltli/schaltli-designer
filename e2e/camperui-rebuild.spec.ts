import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { buildCamperUiProject } from "../deploy/demo/camperui-project"
import { mergeMasterAndScreenObjects } from "../lib/object-order"

// CamperUI rebuilt in Schaltli (deploy/demo/camperui-project.ts): every page
// drawn by the reference renderer the boards are compared against, its
// objects of types the 4" draws, every live value bound to a topic of the
// project. With CAMPERUI_SHOTS=<dir> each page is written there as a PNG;
// with CAMPERUI_PUSH=1 the project goes into the designer's store as
// «CamperUI nachgebaut».

const ROOT = path.join(__dirname, "..")
const DDF = path.join(ROOT, "public", "ddf", "waveshare-touch-lcd-4.ddf.zip")

const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])

test("the eight pages: types the 4\" draws, every value bound to a topic of the project", async () => {
  const project: any = await buildCamperUiProject(new Uint8Array(fs.readFileSync(DDF)))
  expect(project.screens.filter((s: any) => !s.isMaster).map((s: any) => s.name)).toEqual(["Home", "Dimmer", "Power", "Wasser", "Klima", "Temperaturen", "MaxxFan", "Schalter"])
  const supported = new Set(project.settings.supportedObjectTypes)
  const objects = project.screens.flatMap((s: any) => deep(s.objects))
  for (const o of objects) expect(supported.has(o.type) || o.type === "free", `${o.id} ${o.type}`).toBe(true)
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
  for (let i = 0; i < project.screens.length; i++) {
    const screen = project.screens[i]
    if (screen.isMaster) continue
    // With its master's bar and navigator, as the export merges them.
    const master = project.screens.find((s: any) => s.id === screen.masterScreenId)
    const merged = { ...project, screens: project.screens.map((s: any) => (s === screen ? { ...s, objects: mergeMasterAndScreenObjects(master.objects, s.objects, s) } : s)) }
    const png: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project: merged, screenIndex: i, topicOverrides: {} })
    expect(png, screen.name).toBeTruthy()
    const data = String(png).replace(/^data:image\/png;base64,/, "")
    fs.writeFileSync(path.join(out, `${String(i).padStart(2, "0")}-${screen.name}.png`), Buffer.from(data, "base64"))
  }
  // The project as a file, to put into the designer outside a test run:
  // global-teardown deletes every project a run created, so CAMPERUI_PUSH
  // alone does not keep it.
  if (process.env.CAMPERUI_JSON) fs.writeFileSync(path.resolve(ROOT, process.env.CAMPERUI_JSON), JSON.stringify({ name: project.name, project }))
  if (process.env.CAMPERUI_PUSH) {
    // Created the first time, a new version after that.
    const exists = (await page.request.get(`/api/projects/${encodeURIComponent(project.name)}`)).ok()
    const res = exists
      ? await page.request.post(`/api/projects/${encodeURIComponent(project.name)}/versions`, { data: project })
      : await page.request.post("/api/projects", { data: { name: project.name, project } })
    expect(res.ok(), await res.text()).toBe(true)
  }
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
  const zip = Buffer.from(await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), project), "base64")
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
