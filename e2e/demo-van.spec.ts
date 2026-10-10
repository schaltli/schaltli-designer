import { test, expect } from "@playwright/test"
import mqtt from "mqtt"
import { startDemoVan, fakePekaway, vanClock } from "../integrations/vanpi/demo-van"

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

test("the fake Pekaway has only the light, answers in Pekaway's format, and its commands change it", () => {
  const pekaway = fakePekaway()
  expect(JSON.parse(pekaway.answer("dimmer")!)).toMatchObject({ dimmer1: { state: 0, name: "Innenlicht" }, dimmer3: { name: "Vorzelt" } })
  expect(JSON.parse(pekaway.answer("relay")!)).toMatchObject({ Relay1: false, "Relay2 Name": "Aussenlicht" })
  for (const kind of ["batt", "level", "temp", "heater", "maxxfan", "mppt", "bms"]) expect(pekaway.answer(kind), kind).toBeNull()

  expect(pekaway.command("pkw/cmnd/dimmer/2/POWER", "60")).toBe(true)
  expect(pekaway.command("pkw/cmnd/relay/1/POWER", "on")).toBe(true)
  expect(pekaway.command("pkw/cmnd/relay/7/POWER", "on")).toBe(false)
  expect(pekaway.command("pkw/cmnd/dimmer/2/POWER", "250")).toBe(true)
  expect(pekaway.state.dimmer.dimmer2.state).toBe(100)
  expect(pekaway.state.relay.Relay1).toBe(true)
  pekaway.reset()
  expect(pekaway.state.dimmer.dimmer2.state).toBe(0)
  expect(pekaway.state.relay.Relay1).toBe(false)
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
    return publish(topic, ...rest)
  }
  try {
    // Announced as blocks: three lights, two switches, and the bridge's own
    // theme switch - nothing of what the van has not got.
    await expect.poll(() => [...seen.keys()].filter((t) => t.startsWith("homeassistant/")).sort(), { timeout: 15_000 }).toEqual([
      "homeassistant/light/schaltli-vanpi/dimmer_1/config",
      "homeassistant/light/schaltli-vanpi/dimmer_2/config",
      "homeassistant/light/schaltli-vanpi/dimmer_3/config",
      "homeassistant/switch/schaltli-vanpi/relay_1/config",
      "homeassistant/switch/schaltli-vanpi/relay_2/config",
      "homeassistant/switch/schaltli-vanpi/theme/config",
    ])
    await expect.poll(() => seen.get("schaltli/state/dimmer/1/name")).toBe("Innenlicht")
    await expect.poll(() => seen.get("schaltli/state/relay/2/name")).toBe("Aussenlicht")
    // (Nothing more to check for kinds it has not got: the announcements above
    // are exact, and the broker may hold retained states of other runs.)

    // A command from a screen: the bridge sends it to Pekaway, which switches.
    client.publish("schaltli/cmnd/dimmer/2", "60")
    client.publish("schaltli/cmnd/relay/1", "on")
    await expect.poll(() => seen.get("schaltli/state/dimmer/2/level")).toBe("60")
    await expect.poll(() => seen.get("schaltli/state/dimmer/2/power")).toBe("on")
    await expect.poll(() => seen.get("schaltli/state/relay/1/power")).toBe("on")
    expect(van.pekaway.state.dimmer.dimmer2.state).toBe(60)

    // The clock runs.
    await expect.poll(() => seen.get("schaltli/demo/time")).toMatch(/^\d\d:\d\d$/)
    expect(Number(seen.get("schaltli/demo/daylight"))).toBeGreaterThanOrEqual(0)

    // A reset puts every light off, and the bridge reports it.
    van.reset()
    await expect.poll(() => seen.get("schaltli/state/dimmer/2/power"), { timeout: 10_000 }).toBe("off")
    await expect.poll(() => seen.get("schaltli/state/relay/1/power")).toBe("off")
  } finally {
    await van.stop()
    await clearRetained(client, [...published])
    client.end(true)
  }
})
