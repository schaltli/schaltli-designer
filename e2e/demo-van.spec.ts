import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import { startDemoVan, fakePekaway, vanClock } from "../integrations/vanpi/demo-van"
import { sceneSvg } from "../integrations/vanpi/demo-scene"
import JSZip from "jszip"
import fs from "fs"
import { COMBINED_TEST_PROJECT } from "./helpers"

// The van of demo.schaltli.com (docs/2026-10-09-demo-instance.md, decision
// 6): the real VanPi bridge run outside Node-RED over a fake Pekaway that has
// stage one of the conversion, light. Against the local broker like every
// MQTT spec here; everything retained it leaves there is cleared afterwards,
// so no other spec - and no designer on this machine - sees the demo's van.

const BROKER = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"

test.describe.configure({ mode: "serial" })

function listen(filters: string[]): Promise<{ client: mqtt.MqttClient; seen: Map<string, string> }> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER, { clientId: `e2e-demo-van-${Date.now()}`, reconnectPeriod: 0 })
    const seen = new Map<string, string>()
    client.on("message", (topic, payload) => seen.set(topic, payload.toString()))
    client.once("connect", () => client.subscribe(filters, () => resolve({ client, seen })))
    client.once("error", reject)
  })
}

// Clears what the van left retained: the topics it published, emptied.
async function clearRetained(client: mqtt.MqttClient, topics: string[]) {
  await Promise.all(topics.map((t) => new Promise((r) => client.publish(t, "", { retain: true, qos: 1 }, r))))
}

test("the fake Pekaway has the light and the water, answers in Pekaway's format, and its commands change it", () => {
  const pekaway = fakePekaway()
  expect(JSON.parse(pekaway.answer("dimmer")!)).toMatchObject({ dimmer1: { state: 0, name: "Innenlicht" }, dimmer3: { name: "Einstieg" } })
  expect(JSON.parse(pekaway.answer("relay")!)).toMatchObject({ Relay1: false, "Relay2 Name": "Aussenlicht" })
  expect(JSON.parse(pekaway.answer("level")!)).toEqual({ level1: { state: 80, name: "Frischwasser" }, level2: { state: 35, name: "Grauwasser" } })
  expect(JSON.parse(pekaway.answer("relay")!)).toMatchObject({ Relay3: false, "Relay3 Name": "Grauwasser ablassen" })
  // The water pump is on from the start.
  expect(JSON.parse(pekaway.answer("relay")!)).toMatchObject({ Relay4: true, "Relay4 Name": "Wasserpumpe" })
  for (const kind of ["batt", "temp", "heater", "maxxfan", "mppt", "bms"]) expect(pekaway.answer(kind), kind).toBeNull()

  expect(pekaway.command("pkw/cmnd/dimmer/2/POWER", "60")).toBe(true)
  expect(pekaway.command("pkw/cmnd/relay/1/POWER", "on")).toBe(true)
  expect(pekaway.command("pkw/cmnd/relay/7/POWER", "on")).toBe(false)
  expect(pekaway.command("pkw/cmnd/dimmer/2/POWER", "250")).toBe(true)
  expect(pekaway.state.dimmer.dimmer2.state).toBe(100)
  expect(pekaway.state.relay.Relay1).toBe(true)
  pekaway.reset()
  expect(pekaway.state.dimmer.dimmer2.state).toBe(0)
  expect(pekaway.state.relay.Relay1).toBe(false)

  // Water is used: fresh down, grey up; an open drain empties the grey tank.
  pekaway.tick(60)
  expect(pekaway.state.level.level1.state).toBe(79)
  expect(pekaway.state.level.level2.state).toBeCloseTo(35.8)
  expect(pekaway.command("pkw/cmnd/relay/3/POWER", "on")).toBe(true)
  pekaway.tick(30)
  expect(pekaway.state.level.level2.state).toBe(0)
  expect(JSON.parse(pekaway.answer("level")!).level1.state).toBe(79)
})

test("a shower empties fresh water into the grey, a canister fills the fresh, an open drain leaves a puddle that dries", () => {
  const p = fakePekaway()
  expect(p.startShower()).toBe(true)
  for (let i = 0; i < 7; i++) p.tick(2)
  expect(p.state.level.level1.state).toBe(65)
  expect(p.state.level.level2.state).toBe(47)
  expect(p.scene.shower).toBe(0)

  expect(p.startRefill()).toBe(true)
  p.tick(2)
  expect(p.scene.refill).toBeGreaterThan(0)
  for (let i = 0; i < 5; i++) p.tick(2)
  expect(p.state.level.level1.state).toBe(100)
  expect(p.scene.refill).toBe(0)

  p.command("pkw/cmnd/relay/3/POWER", "on")
  for (let i = 0; i < 6; i++) p.tick(2)
  expect(p.scene.puddle).toBeGreaterThan(0.9)
  p.command("pkw/cmnd/relay/3/POWER", "off")
  for (let i = 0; i < 16; i++) p.tick(2)
  expect(p.scene.puddle).toBe(0)

  // No shower without the water pump: none starts, and one running stops.
  p.command("pkw/cmnd/relay/4/POWER", "off")
  expect(p.startShower()).toBe(false)
  p.command("pkw/cmnd/relay/4/POWER", "on")
  expect(p.startShower()).toBe(true)
  p.command("pkw/cmnd/relay/4/POWER", "off")
  p.tick(2)
  expect(p.scene.shower).toBe(0)
  p.reset()
  expect(p.state.relay.Relay4).toBe(true)

  // No shower without fresh water.
  p.state.level.level1.state = 0
  expect(p.startShower()).toBe(false)
})

test("the van's clock: night, dawn, noon, dusk, in a ten-minute day", () => {
  const day = 600
  const at = (fraction: number) => vanClock(fraction * day * 1000, day)
  expect(at(0)).toEqual({ daylight: 0, time: "00:00" })
  expect(at(0.25).daylight).toBe(0)
  expect(at(0.5)).toEqual({ daylight: 1, time: "12:00" })
  expect(at(0.375).daylight).toBeGreaterThan(0.6)
  expect(at(0.75).daylight).toBe(0)
  expect(at(0.9)).toMatchObject({ daylight: 0, time: "21:36" })
})

test("through the real bridge: the lights are announced and published, switched on command, and reset", async () => {
  test.setTimeout(60_000)
  const { client, seen } = await listen(["homeassistant/+/schaltli-vanpi/#", "schaltli/state/#", "schaltli/demo/#"])
  const van = startDemoVan({ broker: BROKER, daySeconds: 60, pollSeconds: 1 })
  // What the van itself publishes retained, to clear exactly that afterwards
  // and nothing the broker held before.
  const published = new Set<string>()
  const publish = van.client.publish.bind(van.client)
  ;(van.client as any).publish = (topic: string, ...rest: any[]) => {
    if ((rest[1] ?? rest[0])?.retain) published.add(topic)
    return (publish as any)(topic, ...rest)
  }
  try {
    // Announced as blocks: three lights, two tanks, four switches, and the
    // bridge's own theme switch - nothing of what the van has not got.
    await expect.poll(() => [...seen.keys()].filter((t) => t.startsWith("homeassistant/")).sort(), { timeout: 15_000 }).toEqual([
      "homeassistant/light/schaltli-vanpi/dimmer_1/config",
      "homeassistant/light/schaltli-vanpi/dimmer_2/config",
      "homeassistant/light/schaltli-vanpi/dimmer_3/config",
      "homeassistant/sensor/schaltli-vanpi/tank_1/config",
      "homeassistant/sensor/schaltli-vanpi/tank_2/config",
      "homeassistant/switch/schaltli-vanpi/relay_1/config",
      "homeassistant/switch/schaltli-vanpi/relay_2/config",
      "homeassistant/switch/schaltli-vanpi/relay_3/config",
      "homeassistant/switch/schaltli-vanpi/relay_4/config",
      "homeassistant/switch/schaltli-vanpi/theme/config",
    ])
    await expect.poll(() => seen.get("schaltli/state/dimmer/1/name")).toBe("Innenlicht")
    await expect.poll(() => seen.get("schaltli/state/relay/2/name")).toBe("Aussenlicht")
    await expect.poll(() => seen.get("schaltli/state/tank/1/name")).toBe("Frischwasser")
    await expect.poll(() => seen.get("schaltli/state/tank/2/level")).toMatch(/^\d+$/)
    await expect.poll(() => seen.get("schaltli/state/relay/4/power")).toBe("on")
    // The van starts light.
    await expect.poll(() => seen.get("schaltli/state/theme")).toBe("light")
    // (Nothing more to check for kinds it has not got: the announcements above
    // are exact, and the broker may hold retained states of other runs.)

    // A command from a screen: the bridge sends it to Pekaway, which switches.
    client.publish("schaltli/cmnd/dimmer/2", "60")
    client.publish("schaltli/cmnd/relay/1", "on")
    client.publish("schaltli/cmnd/theme", "dark")
    await expect.poll(() => seen.get("schaltli/state/theme")).toBe("dark")
    await expect.poll(() => seen.get("schaltli/state/dimmer/2/level")).toBe("60")
    await expect.poll(() => seen.get("schaltli/state/dimmer/2/power")).toBe("on")
    await expect.poll(() => seen.get("schaltli/state/relay/1/power")).toBe("on")
    expect(van.pekaway.state.dimmer.dimmer2.state).toBe(60)

    // The clock runs.
    await expect.poll(() => seen.get("schaltli/demo/time")).toMatch(/^\d\d:\d\d$/)
    expect(Number(seen.get("schaltli/demo/daylight"))).toBeGreaterThanOrEqual(0)

    // A reset puts every light off and the van back to light, and the bridge
    // reports it.
    van.reset()
    await expect.poll(() => seen.get("schaltli/state/theme")).toBe("light")
    await expect.poll(() => seen.get("schaltli/state/dimmer/2/power"), { timeout: 10_000 }).toBe("off")
    await expect.poll(() => seen.get("schaltli/state/relay/1/power")).toBe("off")
  } finally {
    await van.stop()
    await clearRetained(client, [...published])
    client.end(true)
  }
})

// «Your van» (decision 8): the drawing from the values, and in the demo's
// designer, following the van over the broker.
const hexSum = (hex: string | null) => (hex ? [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) : -1)
const red = (hex: string | null) => (hex ? parseInt(hex.slice(1, 3), 16) : -1)

test("the scene: a dark sky at night, a bright one at noon; a window lit by its level, a lamp by its switch", () => {
  const part = (svg: string, name: string, attr: string) => new RegExp(`data-part="${name}"[^>]*?${attr}="([^"]+)"`).exec(svg)?.[1] ?? null
  const night = sceneSvg({ "schaltli/demo/daylight": "0", "schaltli/demo/time": "23:00" })
  const noon = sceneSvg({ "schaltli/demo/daylight": "1", "schaltli/demo/time": "12:00" })
  expect(hexSum(part(night, "sky-top", "stop-color"))).toBeLessThan(150)
  expect(hexSum(part(noon, "sky-top", "stop-color"))).toBeGreaterThan(300)

  const off = sceneSvg({ "schaltli/demo/daylight": "0" })
  const on = sceneSvg({ "schaltli/demo/daylight": "0", "schaltli/state/dimmer/1/level": "80", "schaltli/state/relay/2/power": "on" })
  expect(red(part(off, "light-1", "fill"))).toBeLessThan(80)
  expect(red(part(on, "light-1", "fill"))).toBeGreaterThan(200)
  expect(part(on, "lamp-2", "fill")).toBe("#fff3c4")
  expect(part(off, "lamp-2", "fill")).not.toBe("#fff3c4")
  // What goes on around the van: the shower, the canister, the drain.
  const has = (svg: string, name: string) => svg.includes(`data-part="${name}"`)
  const quiet = sceneSvg({ "schaltli/state/tank/2/level": "50" })
  for (const name of ["shower", "steam", "canister", "drain", "puddle"]) expect(has(quiet, name), name).toBe(false)
  const busy = sceneSvg({
    "schaltli/demo/shower": "on",
    "schaltli/demo/refill": "on",
    "schaltli/state/relay/3/power": "on",
    "schaltli/state/tank/2/level": "50",
    "schaltli/demo/puddle": "0.5",
  })
  for (const name of ["shower", "steam", "canister", "drain", "puddle"]) expect(has(busy, name), name).toBe(true)
  // An empty grey tank runs no water, open or not; its puddle still dries.
  expect(has(sceneSvg({ "schaltli/state/relay/3/power": "on", "schaltli/state/tank/2/level": "0", "schaltli/demo/puddle": "0.3" }), "drain")).toBe(false)
  expect(quiet).toContain('data-action="shower"')
  expect(quiet).toContain('data-action="refill"')
  expect(quiet).toContain("Grauwasser: 50 %")
  // The names Pekaway gives, in the legend.
  expect(sceneSvg({ "schaltli/state/dimmer/2/name": "Galley" })).toContain("Galley: off")
})

test("in the demo's designer «Your van» follows the van: a light switched on the broker lights its window", async ({ page, request }) => {
  test.setTimeout(90_000)
  const START = process.env.SCHALTLI_DEMO_START?.trim() || "Demo"
  if (!(await request.get(`/api/projects/${START}`)).ok()) {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    expect((await request.post("/api/projects", { data: { name: START, project: { ...project, name: START } } })).status()).toBe(201)
  }
  const { client } = await listen(["schaltli/demo/#"])
  const van = startDemoVan({ broker: BROKER, daySeconds: 60, pollSeconds: 1 })
  const published = new Set<string>()
  const publish = van.client.publish.bind(van.client)
  ;(van.client as any).publish = (topic: string, ...rest: any[]) => {
    if ((rest[1] ?? rest[0])?.retain) published.add(topic)
    return (publish as any)(topic, ...rest)
  }
  try {
    await page.setExtraHTTPHeaders({ "x-schaltli-demo": "1" })
    await page.goto("/")
    const scene = page.getByTestId("demo-scene")
    await expect(page.getByRole("complementary", { name: "Your van" })).toBeVisible()
    const fill = (part: string) => scene.locator(`[data-part="${part}"]`).first().getAttribute("fill")

    // The van's names arrive through the bridge.
    await expect(scene).toContainText("Innenlicht", { timeout: 20_000 })
    client.publish("schaltli/cmnd/dimmer/1", "80")
    await expect.poll(async () => red(await fill("light-1")), { timeout: 15_000 }).toBeGreaterThan(200)
    await expect(scene).toContainText("Innenlicht: 80 %")
    client.publish("schaltli/cmnd/relay/2", "on")
    await expect.poll(() => fill("lamp-2"), { timeout: 15_000 }).toBe("#fff3c4")

    // A click on the shower behind the door: the van showers, the scene shows it.
    await scene.locator('[data-action="shower"] rect[fill="transparent"]').click()
    await expect.poll(() => van.pekaway.scene.shower, { timeout: 5_000 }).toBeGreaterThan(0)
    await expect(scene.locator('[data-part="steam"]')).toHaveCount(1, { timeout: 10_000 })
    // And on the filler: the canister.
    await scene.locator('[data-action="refill"] circle[fill="transparent"]').click()
    await expect.poll(() => van.pekaway.scene.refill, { timeout: 5_000 }).toBeGreaterThan(0)
    await expect(scene.locator('[data-part="canister"]')).toHaveCount(1, { timeout: 10_000 })

    // Collapsible, as the project list is.
    await page.getByRole("button", { name: "Hide your van" }).click()
    await expect(page.getByRole("complementary", { name: "Your van" })).toHaveCount(0)
    await page.getByRole("button", { name: "Show your van" }).click()
    await expect(page.getByRole("complementary", { name: "Your van" })).toBeVisible()
  } finally {
    await van.stop()
    await clearRetained(client, [...published])
    client.end(true)
  }
})
