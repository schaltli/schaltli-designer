import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { readDescription, descriptionId } from "../lib/block-description"
import { expandConfig, readCatalog, toCatalogEntry } from "../lib/ha-discovery"

// Reading block descriptions (docs/2026-10-04-bridge-blocks.md,
// tasks/bridge-blocks-todo.md Task 1). Pure: no browser, no broker.

function fixture(name: string): { topic: string; payload: Record<string, any> } {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "block-descriptions", `${name}.json`), "utf8"))
}

function read(payload: unknown, topic = "schaltli/blocks/test/config") {
  return readDescription(topic, typeof payload === "string" ? payload : JSON.stringify(payload))
}

function entryOf(payload: unknown) {
  const result = read(payload)
  if (!result || !("entry" in result)) throw new Error(`no entry: ${JSON.stringify(result)}`)
  return result.entry
}

test.describe("a block description", () => {
  test("the spec's MaxxFan: five parts, its words, two conditions, what it covers", () => {
    const { topic, payload } = fixture("spec-maxxfan")
    const result = readDescription(topic, JSON.stringify(payload))
    expect(result).toBeDefined()
    if (!result || !("entry" in result)) throw new Error("not an entry")
    const entry = result.entry
    expect(entry).toMatchObject({
      id: "block maxxfan",
      component: "block",
      name: "MaxxFan",
      label: "MaxxFan",
      icon: "mdi:fan",
      device: { id: "schaltli-vanpi", name: "VanPi" },
      covers: ["schaltli-vanpi-maxxfan", "schaltli-vanpi-maxxfan_cover", "schaltli-vanpi-maxxfan_airflow"],
    })
    expect(entry.skipped).toBeUndefined()
    expect(entry.controls).toEqual([
      {
        kind: "choice",
        part: "Mode",
        read: "schaltli/state/maxxfan/hvac_mode",
        write: "schaltli/cmnd/maxxfan/mode",
        options: ["off", "fan_only", "auto"],
        labels: ["Aus", "Hand", "Auto"],
      },
      {
        kind: "level",
        part: "Temperature",
        read: "schaltli/state/maxxfan/temperature",
        write: "schaltli/cmnd/maxxfan/temperature",
        min: 0,
        max: 37,
        step: 1,
        unit: "°C",
        shownWhen: { topic: "schaltli/state/maxxfan/hvac_mode", values: ["auto"] },
      },
      {
        kind: "level",
        part: "Speed",
        read: "schaltli/state/maxxfan/speed",
        write: "schaltli/cmnd/maxxfan/speed",
        min: 10,
        max: 100,
        step: 10,
        unit: "%",
        shownWhen: { topic: "schaltli/state/maxxfan/hvac_mode", values: ["fan_only"] },
      },
      {
        kind: "switch",
        part: "Cover",
        read: "schaltli/state/maxxfan/cover",
        write: "schaltli/cmnd/maxxfan/cover",
        on: { read: "open", write: "open", label: "Offen" },
        off: { read: "closed", write: "closed", label: "Zu" },
      },
      {
        kind: "switch",
        part: "Airflow",
        read: "schaltli/state/maxxfan/airflow",
        write: "schaltli/cmnd/maxxfan/airflow",
        on: { read: "in", write: "in", label: "Rein" },
        off: { read: "out", write: "out", label: "Raus" },
      },
    ])
  })

  test("plain options and payloads read as their own words", () => {
    const entry = entryOf({
      version: 1,
      name: "Pump",
      parts: [
        { kind: "choice", command_topic: "p/mode/set", options: ["low", "high"] },
        { kind: "switch", command_topic: "p/set", payload_on: "1", payload_off: "0" },
        { kind: "value", state_topic: "p/level", unit_of_measurement: "%" },
        { kind: "button", command_topic: "p/flush" },
      ],
    })
    expect(entry.controls).toEqual([
      { kind: "choice", write: "p/mode/set", options: ["low", "high"] },
      { kind: "switch", write: "p/set", on: { read: "1", write: "1" }, off: { read: "0", write: "0" } },
      { kind: "value", read: "p/level", unit: "%", level: true },
      { kind: "button", write: "p/flush", payload: "PRESS" },
    ])
  })

  test("a word may name an icon for its button; a name that is not one is left out", () => {
    const entry = entryOf({
      version: 1,
      name: "Theme",
      parts: [
        {
          kind: "switch",
          command_topic: "theme/set",
          payload_on: { value: "dark", label: "Dunkel", icon: "mdi:weather-night" },
          payload_off: { value: "light", label: "Hell", icon: "not an icon" },
        },
        { kind: "choice", command_topic: "m/set", options: [{ value: "a", icon: "mdi:alpha-a" }, "b"] },
      ],
    })
    expect(entry.controls[0]).toMatchObject({
      on: { read: "dark", label: "Dunkel", icon: "mdi:weather-night" },
      off: { read: "light", label: "Hell" },
    })
    expect((entry.controls[0] as any).off.icon).toBeUndefined()
    expect(entry.controls[1]).toMatchObject({ options: ["a", "b"], icons: ["mdi:alpha-a", null] })
  })

  test("an unknown major is not supported, and says which it is", () => {
    const result = read({ version: 2, name: "Future", parts: [{ kind: "button", command_topic: "x" }] })
    expect(result).toEqual({
      unsupported: { id: "block test", component: "block", name: "Future", label: "Future", reason: "format version 2; this designer reads 1" },
    })
    expect(read({ name: "No version", parts: [] })).toMatchObject({ unsupported: { reason: "no format version" } })
  })

  test("a key it does not know is ignored", () => {
    const entry = entryOf({
      version: 1,
      name: "Newer",
      somethingNew: { a: 1 },
      parts: [{ kind: "level", command_topic: "l/set", max: 10, newKey: true }],
    })
    expect(entry.controls).toEqual([{ kind: "level", write: "l/set", min: 0, max: 10, step: 1 }])
  })

  test("a part that cannot be used is skipped with its reason, the others offered", () => {
    const entry = entryOf({
      version: 1,
      name: "Half",
      parts: [
        { name: "No topic", kind: "level" },
        { name: "Odd", kind: "slider-ish", command_topic: "x" },
        { name: "Bad condition", kind: "switch", command_topic: "s", shown_when: { topic: "m" } },
        { name: "Fine", kind: "switch", command_topic: "s" },
      ],
    })
    expect(entry.controls.map((c) => c.part)).toEqual(["Fine"])
    expect(entry.skipped).toEqual([
      { part: "No topic", reason: "no command_topic" },
      { part: "Odd", reason: 'unknown kind "slider-ish"' },
      { part: "Bad condition", reason: "shown_when needs a topic and values" },
    ])
    expect(read({ version: 1, name: "Empty", parts: [{ kind: "value" }] })).toMatchObject({
      unsupported: { reason: "part 1: no state_topic" },
    })
  })

  test("an empty payload removes it; another topic or a broken payload is no entry", () => {
    expect(read("")).toEqual({ removed: "block test" })
    expect(readDescription("homeassistant/switch/x/config", "{}")).toBeUndefined()
    expect(descriptionId("schaltli/blocks/a/b/config")).toBeUndefined()
    expect(read("{not json")).toMatchObject({ unsupported: { reason: "not JSON" } })
  })
})

test("in the catalog a description stands in place of the entries it covers", () => {
  const pump = (dir: string, name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", dir, `${name}.json`), "utf8"))
  const power = pump("ha-discovery", "node-red-garden-pump-power")
  const described = pump("block-descriptions", "garden-pump")
  const plug = pump("ha-discovery", "z2m-switch-plug")
  const messages = {
    [power.topic]: JSON.stringify(power.payload),
    [described.topic]: JSON.stringify(described.payload),
    [plug.topic]: JSON.stringify(plug.payload),
  }
  expect(readCatalog(messages).entries.map((e) => e.id)).toEqual(["block garden-pump", "switch 0xa4c138d2c1e0e5f1 switch"])
  // Without the description, the switch is there as before.
  const { [described.topic]: _gone, ...without } = messages
  expect(readCatalog(without).entries.map((e) => e.label)).toEqual(["Power", "Kitchen plug"])
})

test("a Home Assistant entry carries its unique_id, which a description's covers names", () => {
  const [config] = expandConfig(
    "homeassistant/switch/schaltli-vanpi/maxxfan_cover/config",
    JSON.stringify({ name: "Deckel", unique_id: "schaltli-vanpi-maxxfan_cover", command_topic: "c/set", state_topic: "c" }),
  )
  const result = toCatalogEntry(config)
  if (!("entry" in result)) throw new Error("not an entry")
  expect(result.entry.uniqueId).toBe("schaltli-vanpi-maxxfan_cover")
})
