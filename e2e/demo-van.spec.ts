import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import { startDemoVan, fakePekaway, vanClock } from "../integrations/vanpi/demo-van"
import { sceneSvg } from "../integrations/vanpi/demo-scene"
import JSZip from "jszip"
import fs from "fs"
import { COMBINED_TEST_PROJECT } from "./helpers"
import net from "node:net"
import { Aedes } from "aedes"

// The van of demo.schaltli.com (docs/2026-10-09-demo-instance.md, decision
// 6): the real VanPi bridge run outside Node-RED over a fake Pekaway that has
// stage one of the conversion, light. Against the local broker like every
// MQTT spec here; everything retained it leaves there is cleared afterwards,
// so no other spec - and no designer on this machine - sees the demo's van.

const BROKER = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"

test.describe.configure({ mode: "serial" })

function listen(filters: string[], broker = BROKER): Promise<{ client: mqtt.MqttClient; seen: Map<string, string> }> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(broker, { clientId: `e2e-demo-van-${Date.now()}`, reconnectPeriod: 0 })
    const seen = new Map<string, string>()
    client.on("message", (topic, payload) => seen.set(topic, payload.toString()))
    client.once("connect", () => client.subscribe(filters, () => resolve({ client, seen })))
    client.once("error", reject)
  })
}

// A broker of this test's own. The bridge answers schaltli/cmnd/theme on
// schaltli/state/theme, one topic for every display on a broker: on the
// shared one another spec's demo van reset it between this test's command
// and its answer, and in test:all's last steps (where it ran @alone) it
// switched the bench's boards dark under the navigator check (2026-10-14).
async function privateBroker(): Promise<{ url: string; close: () => Promise<void> }> {
  const broker = await Aedes.createBroker()
  const server = net.createServer(broker.handle as any)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const url = `mqtt://127.0.0.1:${(server.address() as net.AddressInfo).port}`
  return {
    url,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await new Promise<void>((resolve) => broker.close(() => resolve()))
    },
  }
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
  for (const kind of ["temp", "heater", "maxxfan", "bms"]) expect(pekaway.answer(kind), kind).toBeNull()
  // The shunt in Pekaway's strings, the solar charger in numbers.
  expect(JSON.parse(pekaway.answer("batt")!)).toEqual({ AMPS: "0.00", SoC: "78", Voltage: "13.12" })
  expect(JSON.parse(pekaway.answer("mppt")!)).toEqual({ mppt_pv_amps: 0, mppt_pv_volts: 0, mppt_pv_watts: 0 })

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

// What the van publishes beside Pekaway, by topic: the chargers as the
// author's BLE bridge does ({"value": ...}), his Node-RED tab's sun and
// consumers as numbers.
function energyOf(p: ReturnType<typeof fakePekaway>): Record<string, unknown> {
  return Object.fromEntries(p.energy().map(([t, v]) => [t, v.startsWith("{") ? JSON.parse(v).value : Number(v)]))
}

test("the sun charges the battery, the lights and the pump draw from it, a full one takes only what is drawn", () => {
  const p = fakePekaway()
  const batt = () => JSON.parse(p.answer("batt")!)

  // Night, everything off: Pekaway and the router alone, a little out.
  p.tick(2, 0)
  expect(Number(batt().AMPS)).toBeCloseTo(-6 / 13.12, 1)
  expect(JSON.parse(p.answer("mppt")!)).toEqual({ mppt_pv_amps: 0, mppt_pv_volts: 0, mppt_pv_watts: 0 })
  expect(energyOf(p)).toMatchObject({ "van/energy/solar_watts": 0, "van/energy/consumers_watts": 6 })

  // Lights on: more out, and more drawn.
  p.command("pkw/cmnd/dimmer/1/POWER", "100")
  p.command("pkw/cmnd/relay/2/POWER", "on")
  p.tick(2, 0)
  expect(Number(batt().AMPS)).toBeCloseTo(-28 / 13.1, 1)
  expect(energyOf(p)["van/energy/consumers_watts"]).toBe(28)

  // Noon: the sun's 150 W at most, through Pekaway's charger and the tab alike.
  p.tick(2, 1)
  expect(JSON.parse(p.answer("mppt")!)).toEqual({ mppt_pv_amps: 8.1, mppt_pv_volts: 18.6, mppt_pv_watts: 150 })
  expect(energyOf(p)["van/energy/solar_watts"]).toBe(150)
  const before = Number(batt().SoC)
  for (let i = 0; i < 30; i++) p.tick(2, 1)
  expect(Number(batt().SoC)).toBeGreaterThan(before)

  // Full: the sun gives only what the van draws, nothing goes in.
  for (let i = 0; i < 600; i++) p.tick(2, 1)
  expect(batt().SoC).toBe("100")
  expect(Number(batt().AMPS)).toBeCloseTo(0, 0)
  expect(JSON.parse(p.answer("mppt")!).mppt_pv_watts).toBeLessThanOrEqual(30)

  // A shower runs the pump.
  p.tick(2, 0)
  const lit = Number(batt().AMPS)
  p.startShower()
  p.tick(2, 0)
  expect(Number(batt().AMPS)).toBeLessThan(lit - 3)

  p.reset()
  expect(batt().SoC).toBe("78")
})

test("the mains charger: 30 A into an empty battery, less as it fills, only what is drawn when full; not_available unplugged", () => {
  const unplugged = energyOf(fakePekaway())
  expect(unplugged).toMatchObject({ "ble/charger/state": "not_available", "ble/charger/charging": "off", "ble/charger/watts": 0, "ble/charger/out_amps": 0 })

  const amps = (soc: number) => {
    const p = fakePekaway({ soc })
    expect(p.toggleShore()).toBe(true)
    expect(p.scene.shore).toBe(true)
    p.tick(2, 0)
    return energyOf(p)
  }
  const empty = amps(20)
  expect(empty["ble/charger/state"]).toBe("bulk")
  expect(empty["ble/charger/charging"]).toBe("on")
  expect(empty["ble/charger/out_amps"]).toBeGreaterThan(28)
  expect(empty["ble/charger/out_amps"]).toBeLessThanOrEqual(30.5)
  const fuller = amps(90)
  expect(fuller["ble/charger/state"]).toBe("absorption")
  expect(fuller["ble/charger/out_amps"]).toBeLessThan(empty["ble/charger/out_amps"] as number)
  expect(fuller["ble/charger/out_amps"]).toBeGreaterThan(5)
  const full = amps(100)
  expect(full["ble/charger/state"]).toBe("float")
  // Only Pekaway and the router: 6 W.
  expect(full["ble/charger/watts"]).toBe(6)

  // Out again: not available.
  const p = fakePekaway({ soc: 50 })
  p.toggleShore()
  p.toggleShore()
  p.tick(2, 0)
  expect(energyOf(p)["ble/charger/state"]).toBe("not_available")
})

test("the engine: the DC-DC charger up to 50 A, less as the battery fills, nothing when full; it stops by itself after 5 minutes", () => {
  const p = fakePekaway({ soc: 20 })
  expect(energyOf(p)).toMatchObject({ "ble/orion/state": "off", "ble/orion/off_reason": "engine_shutdown", "ble/orion/watts": 0 })
  p.toggleEngine()
  p.tick(2, 0)
  let e = energyOf(p)
  expect(e).toMatchObject({ "ble/orion/state": "bulk", "ble/orion/charging": "on", "ble/orion/off_reason": "none", "ble/orion/in_volts": 14.2 })
  expect(e["ble/orion/out_amps"]).toBeGreaterThan(45)
  expect(e["ble/orion/out_amps"]).toBeLessThanOrEqual(50.5)

  const fuller = fakePekaway({ soc: 90 })
  fuller.toggleEngine()
  fuller.tick(2, 0)
  expect(energyOf(fuller)["ble/orion/out_amps"]).toBeLessThan(e["ble/orion/out_amps"] as number)

  // Full: on, but idle - nothing, not even what the van draws.
  const full = fakePekaway({ soc: 100 })
  full.toggleEngine()
  full.tick(2, 0)
  expect(energyOf(full)).toMatchObject({ "ble/orion/state": "float", "ble/orion/charging": "off", "ble/orion/watts": 0 })

  // Both chargers at once share what is left by their size.
  const both = fakePekaway({ soc: 40 })
  both.toggleEngine()
  both.toggleShore()
  both.tick(2, 0)
  e = energyOf(both)
  expect(e["ble/orion/out_amps"]).toBeGreaterThan(e["ble/charger/out_amps"] as number)
  expect((e["ble/charger/out_amps"] as number) / (e["ble/orion/out_amps"] as number)).toBeCloseTo(30 / 50, 1)

  // Five minutes on, the engine stops.
  for (let i = 0; i < 150; i++) p.tick(2, 0)
  expect(p.scene.engine).toBe(0)
  expect(energyOf(p)["ble/orion/state"]).toBe("off")
  p.toggleEngine()
  p.toggleEngine()
  expect(p.scene.engine).toBe(0)
  p.reset()
  expect(p.scene).toMatchObject({ shore: false, engine: 0 })
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
  const own = await privateBroker()
  const { client, seen } = await listen(["homeassistant/+/schaltli-vanpi/#", "schaltli/state/#", "schaltli/demo/#"], own.url)
  const van = startDemoVan({ broker: own.url, daySeconds: 60, pollSeconds: 1 })
  // What the van itself publishes retained, to clear exactly that afterwards
  // and nothing the broker held before.
  const published = new Set<string>()
  const publish = van.client.publish.bind(van.client)
  ;(van.client as any).publish = (topic: string, ...rest: any[]) => {
    if ((rest[1] ?? rest[0])?.retain) published.add(topic)
    return (publish as any)(topic, ...rest)
  }
  try {
    // Announced as blocks: three lights, the battery, two tanks, four
    // switches, and the bridge's own theme switch - nothing of what the van
    // has not got (the solar charger the bridge does not announce).
    await expect.poll(() => [...seen.keys()].filter((t) => t.startsWith("homeassistant/")).sort(), { timeout: 15_000 }).toEqual([
      "homeassistant/light/schaltli-vanpi/dimmer_1/config",
      "homeassistant/light/schaltli-vanpi/dimmer_2/config",
      "homeassistant/light/schaltli-vanpi/dimmer_3/config",
      "homeassistant/sensor/schaltli-vanpi/battery/config",
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
    // The battery and the sun, with the watts the bridge works out.
    await expect.poll(() => seen.get("schaltli/state/battery/soc")).toMatch(/^\d+$/)
    await expect.poll(() => seen.get("schaltli/state/battery/power")).toMatch(/^-?\d+$/)
    await expect.poll(() => seen.get("schaltli/state/mppt/pv_watts")).toMatch(/^\d+$/)
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
    await own.close()
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
  // The blue socket and the cab: a click plugs the cable in, starts the engine.
  expect(quiet).toContain('data-action="shore"')
  expect(quiet).toContain('data-action="engine"')
  for (const name of ["shore-cable", "exhaust"]) expect(has(quiet, name), name).toBe(false)
  const charging = sceneSvg({ "schaltli/demo/shore": "on", "schaltli/demo/engine": "on", "schaltli/state/battery/soc": "64" })
  for (const name of ["shore-cable", "exhaust"]) expect(has(charging, name), name).toBe(true)
  expect(charging).toContain("Batterie: 64 %")
  expect(charging).toContain("Landstrom: on")
  expect(charging).toContain("Motor: on")
  expect(charging).toContain("Stop the engine")
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
