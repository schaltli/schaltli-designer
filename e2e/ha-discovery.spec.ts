import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { expandConfig, readPath, toCatalogEntry, type DiscoveryConfig } from "../lib/ha-discovery"

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

// Task 3: what an entity becomes - a catalog entry with its controls, or
// the reason it cannot be one. Real configs again (the fixtures name their
// sources).
test.describe("an entity as a catalog entry", () => {
  function entryOf(name: string) {
    const [config] = expand(name)
    const result = toCatalogEntry(config)
    if (!("entry" in result)) throw new Error(`${name}: ${result.unsupported.reason}`)
    return result.entry
  }

  test("a Zigbee2MQTT plug: a switch named after its device, reading the state field", () => {
    expect(entryOf("z2m-switch-plug")).toEqual({
      id: "switch 0xa4c138d2c1e0e5f1 switch",
      component: "switch",
      // `name: null` is the device's name alone, and so is its label.
      name: "Kitchen plug",
      label: "Kitchen plug",
      device: { id: "zigbee2mqtt_0xa4c138d2c1e0e5f1", name: "Kitchen plug" },
      // What a block description's `covers` names (docs/2026-10-04-bridge-blocks.md).
      uniqueId: "0xa4c138d2c1e0e5f1_switch_zigbee2mqtt",
      controls: [
        {
          kind: "switch",
          read: "zigbee2mqtt/Kitchen plug#state",
          write: "zigbee2mqtt/Kitchen plug/set",
          on: { read: "ON", write: "ON" },
          off: { read: "OFF", write: "OFF" },
        },
      ],
    })
  })

  test("an ESPHome temperature: a value with its unit, named after device and entity", () => {
    const entry = entryOf("esphome-sensor-temperature")
    expect(entry.name).toBe("van-sensors Cabin temperature")
    // Under its device, in the menu and on a block: the entity's own name.
    expect(entry.label).toBe("Cabin temperature")
    expect(entry.device).toEqual({ id: "a8032ab4c5d6", name: "van-sensors" })
    expect(entry.controls).toEqual([{ kind: "value", read: "van-sensors/sensor/cabin_temperature/state", unit: "°C", level: false }])
  })

  test("a Zigbee2MQTT number: a level with min, max, step and unit, and its icon", () => {
    const entry = entryOf("z2m-number-calibration")
    expect(entry.name).toBe("Living room TRV Local temperature calibration")
    expect(entry.label).toBe("Local temperature calibration")
    expect(entry.icon).toBe("mdi:math-compass")
    expect(entry.controls).toEqual([
      {
        kind: "level",
        read: "zigbee2mqtt/Living room TRV#local_temperature_calibration",
        write: "zigbee2mqtt/Living room TRV/set/local_temperature_calibration",
        min: -9,
        max: 9,
        step: 0.1,
        unit: "°C",
      },
    ])
  })

  test("an ESPHome select with three options: a choice", () => {
    expect(entryOf("esphome-select-mode").controls).toEqual([
      {
        kind: "choice",
        read: "van-sensors/select/fan_mode/state",
        write: "van-sensors/select/fan_mode/command",
        options: ["Off", "Low", "High"],
      },
    ])
  })

  test("an ESPHome button: a press publishing PRESS", () => {
    const entry = entryOf("esphome-button-restart")
    expect(entry.name).toBe("van-sensors Restart")
    expect(entry.controls).toEqual([{ kind: "button", write: "van-sensors/button/restart/command", payload: "PRESS" }])
  })

  test("a select with five options is a choice with five, no limit", () => {
    const entry = entryOf("esphome-select-five")
    expect(entry.name).toBe("van-sensors Light scene")
    expect(entry.controls).toEqual([
      {
        kind: "choice",
        read: "van-sensors/select/light_scene/state",
        write: "van-sensors/select/light_scene/command",
        options: ["Off", "Read", "Relax", "Night", "Party"],
      },
    ])
  })

  test("a switch whose command is a JSON-building template is offered to read only", () => {
    const entry = entryOf("shelly-rpc-switch-command-template")
    expect(entry.name).toBe("Shelly Plus 1PM Pump")
    expect(entry.controls).toEqual([{ kind: "state", read: "shellyplus1pm-441793a1b2c3/status/switch:0#output", on: "True", off: "False" }])
  })

  test("defaults, device-class names, battery and percentage levels, and what cannot be read", () => {
    const one = (component: string, config: Record<string, unknown>) =>
      toCatalogEntry(expandConfig(`homeassistant/${component}/x/config`, JSON.stringify(config))[0])
    // No name, no device: the platform's default.
    expect(one("switch", { cmd_t: "r/set" })).toMatchObject({
      entry: { name: "MQTT Switch", controls: [{ kind: "switch", write: "r/set", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" } }] },
    })
    // No name, a device class: named after it, on the device.
    expect(one("sensor", { stat_t: "b", dev_cla: "battery", dev: { ids: "d", name: "Van" } })).toMatchObject({
      entry: { name: "Van Battery", controls: [{ kind: "value", read: "b", level: true }] },
    })
    expect(one("sensor", { stat_t: "t", unit_of_meas: "%", name: "Tank" })).toMatchObject({ entry: { controls: [{ level: true, unit: "%" }] } })
    expect(one("binary_sensor", { stat_t: "door", pl_on: "open", pl_off: "closed", name: "Door" })).toMatchObject({
      entry: { controls: [{ kind: "state", read: "door", on: "open", off: "closed" }] },
    })
    // A number without its own min, max and step: Home Assistant's 1, 100, 1.
    expect(one("number", { cmd_t: "n/set" })).toMatchObject({ entry: { controls: [{ kind: "level", min: 1, max: 100, step: 1 }] } })
    // What cannot be read or written at all.
    expect(one("sensor", { stat_t: "s", val_tpl: "{{ value_json.a / 10 }}" })).toMatchObject({
      unsupported: { reason: "the value template: arithmetic (/ 10)" },
    })
    expect(one("button", { cmd_t: "b", cmd_tpl: "{{ value }}" })).toMatchObject({ unsupported: { reason: "a command template" } })
    expect(one("sensor", { name: "x" })).toMatchObject({ unsupported: { reason: "no state topic" } })
    expect(one("cover", { cmd_t: "c" })).toMatchObject({ unsupported: { reason: "the component cover" } })
  })
})

// Task 4: light, fan and climate - entities with several parts, each a
// control with its part's name; a part that cannot be used is skipped with
// its reason, the rest offered.
test.describe("an entity with several parts", () => {
  function entryOf(name: string) {
    const [config] = expand(name)
    const result = toCatalogEntry(config)
    if (!("entry" in result)) throw new Error(`${name}: ${result.unsupported.reason}`)
    return result.entry
  }

  test("the docs' fan: power, presets, speed in its range, direction and oscillation", () => {
    const entry = entryOf("ha-docs-fan-bedroom")
    expect(entry.name).toBe("Bedroom Fan")
    expect(entry.controls).toEqual([
      { part: "Power", kind: "switch", read: "bedroom_fan/on/state", write: "bedroom_fan/on/set", on: { read: "true", write: "true" }, off: { read: "false", write: "false" } },
      {
        part: "Preset",
        kind: "choice",
        read: "bedroom_fan/preset/preset_mode_state",
        write: "bedroom_fan/preset/preset_mode",
        options: ["auto", "smart", "whoosh", "eco", "breeze"],
      },
      { part: "Speed", kind: "level", read: "bedroom_fan/speed/percentage_state", write: "bedroom_fan/speed/percentage", min: 1, max: 10, step: 1 },
      {
        part: "Direction",
        kind: "switch",
        read: "bedroom_fan/direction/state",
        write: "bedroom_fan/direction/set",
        on: { read: "forward", write: "forward" },
        off: { read: "reverse", write: "reverse" },
      },
      {
        part: "Oscillation",
        kind: "switch",
        read: "bedroom_fan/oscillation/state",
        write: "bedroom_fan/oscillation/set",
        on: { read: "true", write: "true" },
        off: { read: "false", write: "false" },
      },
    ])
    expect(entry.skipped).toBeUndefined()
  })

  test("the docs' climate: every part it describes, the mode skipped for its command template", () => {
    const entry = entryOf("ha-docs-climate-study")
    expect(entry.controls).toEqual([
      { part: "Target temperature", kind: "level", write: "study/ac/temperature/set", min: 7, max: 35, step: 1 },
      { part: "Power", kind: "switch", write: "study/ac/power/set", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" } },
      { part: "Preset", kind: "choice", write: "study/ac/preset_mode/set", options: ["eco", "sleep", "activity"] },
      { part: "Fan mode", kind: "choice", write: "study/ac/fan/set", options: ["high", "medium", "low"] },
      { part: "Swing", kind: "choice", write: "study/ac/swing/set", options: ["on", "off"] },
      { part: "Swing horizontal", kind: "choice", write: "study/ac/swingH/set", options: ["on", "off"] },
    ])
    expect(entry.skipped).toEqual([{ part: "Mode", reason: "a command template" }])
  })

  test("a climate's current temperature, its unit and its default modes", () => {
    const [config] = expandConfig(
      "homeassistant/climate/heater/config",
      JSON.stringify({ name: "Heater", curr_temp_t: "heater/state", curr_temp_tpl: "{{ value_json.temp }}", mode_cmd_t: "heater/mode", temp_unit: "C" }),
    )
    const result = toCatalogEntry(config)
    expect(result).toMatchObject({
      entry: {
        controls: [
          { part: "Mode", kind: "choice", write: "heater/mode", options: ["auto", "off", "cool", "heat", "dry", "fan_only"] },
          { part: "Current temperature", kind: "value", read: "heater/state#temp", unit: "°C", level: false },
        ],
      },
    })
  })

  test("the docs' basic light: power and brightness on its default scale of 255", () => {
    expect(entryOf("ha-docs-light-office").controls).toEqual([
      { part: "Power", kind: "switch", read: "office/light/status", write: "office/light/switch", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" } },
      { part: "Brightness", kind: "level", read: "office/light/brightness", write: "office/light/brightness/set", min: 0, max: 255, step: 1 },
    ])
  })

  test("Tasmota's dimmer: power and brightness read from its JSON, on a scale of 100", () => {
    expect(entryOf("tasmota-legacy-dimmer").controls).toEqual([
      {
        part: "Power",
        kind: "switch",
        read: "tele/tasmota_4D5E6F/STATE#POWER",
        write: "cmnd/tasmota_4D5E6F/POWER",
        on: { read: "ON", write: "ON" },
        off: { read: "OFF", write: "OFF" },
      },
      { part: "Brightness", kind: "level", read: "tele/tasmota_4D5E6F/STATE#Dimmer", write: "cmnd/tasmota_4D5E6F/Dimmer", min: 0, max: 100, step: 1 },
    ])
  })

  test("a JSON-schema and a template-schema light are not supported, and say why", () => {
    for (const [name, schema] of [["esphome-light-json", "json"], ["template-light", "template"]]) {
      const [config] = expand(name)
      expect(toCatalogEntry(config)).toMatchObject({ unsupported: { reason: `the light schema ${schema}` } })
    }
  })

  test("an entity none of whose parts can be used is not supported, naming each part's reason", () => {
    const [config] = expandConfig(
      "homeassistant/fan/f/config",
      JSON.stringify({ cmd_t: "f/set", cmd_tpl: "{{ value }}", pct_cmd_t: "f/pct", pct_cmd_tpl: "{{ value }}" }),
    )
    expect(toCatalogEntry(config)).toMatchObject({ unsupported: { reason: "Power: a command template; Speed: a command template" } })
  })
})
