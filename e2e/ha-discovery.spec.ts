import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { expandConfig, readPath, type DiscoveryConfig } from "../lib/ha-discovery"

// Reading Home Assistant MQTT Discovery (docs/2026-09-30-block-discovery.md,
// tasks/block-discovery-todo.md). Pure: no browser, no broker. The configs
// are real ones in e2e/fixtures/ha-discovery/, each naming its source.

interface Fixture {
  source: string
  topic: string
  prefix?: string
  payload: unknown
}

function fixture(name: string): Fixture {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "ha-discovery", `${name}.json`), "utf8"))
}

function expand(name: string): DiscoveryConfig[] {
  const f = fixture(name)
  return expandConfig(f.topic, JSON.stringify(f.payload), f.prefix)
}

// Task 1: abbreviations, `~`, `cmps`, removal.
test.describe("expanding a discovery config", () => {
  test("Tasmota's legacy relay: every abbreviation spelled out, the device's too", () => {
    const [relay, ...rest] = expand("tasmota-legacy-relay")
    expect(rest).toEqual([])
    expect(relay).toMatchObject({ component: "switch", objectId: "1A2B3C_RL_1", discoveryId: "1A2B3C_RL_1" })
    expect(relay.nodeId).toBeUndefined()
    expect(relay.config).toEqual({
      name: "Tasmota",
      state_topic: "tele/tasmota_1A2B3C/STATE",
      availability_topic: "tele/tasmota_1A2B3C/LWT",
      payload_available: "Online",
      payload_not_available: "Offline",
      command_topic: "cmnd/tasmota_1A2B3C/POWER",
      payload_off: "OFF",
      payload_on: "ON",
      value_template: "{{value_json.POWER}}",
      unique_id: "1A2B3C_RL_1",
      device: { identifiers: ["1A2B3C"] },
    })
  })

  test("`~` at the start of a topic is the base topic", () => {
    const [irrigation] = expand("ha-docs-switch-irrigation")
    expect(irrigation.config).toEqual({
      name: "garden",
      command_topic: "homeassistant/switch/irrigation/set",
      state_topic: "homeassistant/switch/irrigation/state",
    })
  })

  test("a Shelly script's config under its own prefix, with `~` and a device", () => {
    const [shelly] = expand("shelly-script-switch")
    expect(shelly).toMatchObject({ component: "switch", objectId: "shellyplus1-a8032ab12345" })
    expect(shelly.config).toMatchObject({
      command_topic: "shellyplus1-a8032ab12345/switch/cmd",
      state_topic: "shellyplus1-a8032ab12345/switch/state",
      payload_on: "on",
      payload_off: "off",
      device: { name: "VIRTUAL_SWITCH", identifiers: ["VIRTUAL_SWITCH"], model: "virtual-Shelly", manufacturer: "Allterco" },
    })
    expect(shelly.config).not.toHaveProperty("~")
    // Under the default prefix the same message is not a config.
    const f = fixture("shelly-script-switch")
    expect(expandConfig(f.topic, JSON.stringify(f.payload))).toEqual([])
  })

  test("`~` at the end, and in an availability entry, abbreviated too", () => {
    const [config] = expandConfig(
      "homeassistant/binary_sensor/door/config",
      JSON.stringify({ "~": "garage/door", stat_t: "state/~", avty: [{ t: "~/online", pl_avail: "yes" }] }),
    )
    expect(config.config).toEqual({
      state_topic: "state/garage/door",
      availability: [{ topic: "garage/door/online", payload_available: "yes" }],
    })
  })

  test("a node in the topic is part of the discovery id", () => {
    const [config] = expandConfig("homeassistant/sensor/esp32/temp/config", JSON.stringify({ stat_t: "esp32/temp" }))
    expect(config).toMatchObject({ component: "sensor", nodeId: "esp32", objectId: "temp", discoveryId: "esp32 temp" })
  })

  test("the docs' device config: one config per component, sharing device, origin, state topic and qos", () => {
    const configs = expand("ha-docs-device-kitchen")
    expect(configs.map((c) => [c.component, c.nodeId, c.objectId])).toEqual([
      ["sensor", "ea334450945afc", "some_unique_component_id1"],
      ["sensor", "ea334450945afc", "some_unique_id2"],
    ])
    const [temperature, humidity] = configs
    expect(temperature.config).toEqual({
      device_class: "temperature",
      unit_of_measurement: "°C",
      value_template: "{{ value_json.temperature}}",
      unique_id: "temp01ae_t",
      device: {
        identifiers: "ea334450945afc",
        name: "Kitchen",
        manufacturer: "Bla electronics",
        model: "xya",
        sw_version: "1.0",
        serial_number: "ea334450945afc",
        hw_version: "1.0rev2",
      },
      origin: { name: "bla2mqtt", sw_version: "2.1", support_url: "https://bla2mqtt.example.com/support" },
      state_topic: "sensorBedroom/state",
      qos: 2,
    })
    expect(humidity.config).toMatchObject({ device_class: "humidity", state_topic: "sensorBedroom/state", qos: 2 })
  })

  test("a component's own option wins over the shared one", () => {
    const [bla1, bla2] = expand("ha-docs-device-0AFFD2")
    expect(bla1).toMatchObject({ component: "device_automation", objectId: "bla1" })
    expect(bla1.config).toMatchObject({ topic: "foobar/triggers/button1", type: "button_short_press" })
    expect(bla2.config).toMatchObject({ state_topic: "foobar/sensor/sensor1", device: { identifiers: ["0AFFD2"] }, origin: { name: "foobar" } })

    const own = { ...fixture("ha-docs-device-kitchen").payload as any }
    own.cmps = { t: { p: "sensor", stat_t: "own/state" } }
    const [config] = expandConfig("homeassistant/device/k/config", JSON.stringify(own))
    expect(config.config.state_topic).toBe("own/state")
  })

  test("a component with nothing but its platform is being removed, and gives nothing", () => {
    const configs = expand("ha-docs-device-kitchen-remove-humidity")
    expect(configs.map((c) => c.objectId)).toEqual(["some_unique_component_id1"])
  })

  test("removal, migration and anything malformed give nothing, without throwing", () => {
    const topic = "homeassistant/switch/x/config"
    expect(expandConfig(topic, "")).toEqual([])
    expect(expandConfig(topic, JSON.stringify({ migrate_discovery: true }))).toEqual([])
    expect(expandConfig(topic, JSON.stringify({ migr_discvry: true }))).toEqual([])
    expect(expandConfig("homeassistant/device/x/config", JSON.stringify({ migrate_discovery: true }))).toEqual([])
    expect(expandConfig(topic, "{not json")).toEqual([])
    expect(expandConfig(topic, "[1, 2]")).toEqual([])
    expect(expandConfig(topic, "42")).toEqual([])
    expect(expandConfig(topic, "null")).toEqual([])
    // Not a config topic.
    expect(expandConfig("homeassistant/switch/x/state", "{}")).toEqual([])
    expect(expandConfig("homeassistant/switch/a.b/config", "{}")).toEqual([])
    expect(expandConfig("other/switch/x/config", "{}")).toEqual([])
    // A device config lacking what Home Assistant requires.
    expect(expandConfig("homeassistant/device/x/config", JSON.stringify({ cmps: { a: { p: "sensor", stat_t: "s" } } }))).toEqual([])
    expect(expandConfig("homeassistant/device/x/config", JSON.stringify({ dev: {}, o: {}, cmps: [1] }))).toEqual([])
    expect(expandConfig("homeassistant/device/x/config", JSON.stringify({ dev: {}, o: {}, cmps: { a: "x", b: { stat_t: "s" } } }))).toEqual([])
  })
})

// Task 2: the templates real publishers use to pull out one value become a
// path; anything that computes gets a reason. The spellings are the ones in
// the publishers' own sources (2026-09-30): Tasmota's
// xdrv_12_home_assistant.ino, Zigbee2MQTT's lib/extension/homeassistant.ts,
// OpenMQTTGateway's main/config_mqttDiscovery.h and mqttDiscovery.cpp.
test.describe("reading a template", () => {
  test("none, or {{ value }}, is the raw payload", () => {
    expect(readPath(undefined)).toEqual({ path: "" })
    expect(readPath("")).toEqual({ path: "" })
    expect(readPath("{{ value }}")).toEqual({ path: "" })
    expect(readPath("{{value | float}}")).toEqual({ path: "" })
  })

  const read: [string, string, string][] = [
    ["Tasmota relay", "{{value_json.POWER}}", "POWER"],
    ["Tasmota sensor", "{{value_json['ENERGY']['Power']}}", "ENERGY.Power"],
    ["Tasmota nested sensor", "{{value_json['ENERGY']['Speed']['Act']}}", "ENERGY.Speed.Act"],
    ["Tasmota array sensor", "{{value_json['ENERGY']['ExportTariff'][1]}}", "ENERGY.ExportTariff[1]"],
    ["Zigbee2MQTT", '{{ value_json["state_l1"] }}', "state_l1"],
    ["Zigbee2MQTT bridge", "{{ value_json.coordinator.meta.revision }}", "coordinator.meta.revision"],
    ["Zigbee2MQTT bridge", "{{ value_json.permit_join | lower }}", "permit_join"],
    ["Zigbee2MQTT fan", `{{ value_json["fan_speed"] | default('None') }}`, "fan_speed"],
    ["OpenMQTTGateway", "{{ value_json.tempc | is_defined }}", "tempc"],
    ["OpenMQTTGateway", "{{ value_json.tempc  | round(1)}}", "tempc"],
    ["OpenMQTTGateway", "{{value_json.volt}}", "volt"],
    ["filters in a row", "{{ value_json.a | int | default(0) }}", "a"],
    ["a key a dot cannot name", '{{ value_json["a b"]["c.d"] }}', "['a b']['c.d']"],
  ]
  for (const [from, template, path] of read) {
    test(`${from}: ${template}`, () => {
      expect(readPath(template)).toEqual({ path })
    })
  }

  const refused: [string, string, RegExp][] = [
    ["Zigbee2MQTT boolean switch", `{% if value_json["state"] %}true{% else %}false{% endif %}`, /\{% if %\}/],
    ["OpenMQTTGateway", "{{ value_json.interval/1000 }}", /arithmetic \(\/1000\)/],
    ["OpenMQTTGateway", "{{ value_json.powermode | bool }}", /filter bool/],
    ["Tasmota light", "{{value_json.HSBColor.split(',')[0:2]|join(',')}}", /method split\(\)/],
    ["Zigbee2MQTT bridge", "{{ now().strftime('%Y-%m-%d %H:%M:%S') }}", /function now\(\)/],
    ["Zigbee2MQTT text", `{{ value_json["x"] | default('',True) | string | truncate(254, True, '', 0) }}`, /filter string/],
    ["a replace", "{{ value_json.x | replace('a', 'b') }}", /filter replace/],
    ["Zigbee2MQTT fan preset", `{{ value_json["mode"] if value_json["mode"] in ["low"] else None }}`, /expression \(if/],
    ["text around the value", "state: {{ value_json.x }}", /text outside/],
    ["two values", "{{ value_json.a }}{{ value_json.b }}", /more than one/],
  ]
  for (const [from, template, reason] of refused) {
    test(`${from} is not read, and says why: ${template}`, () => {
      const result = readPath(template)
      expect(result).toHaveProperty("unsupported")
      expect((result as { unsupported: string }).unsupported).toMatch(reason)
    })
  }
})
