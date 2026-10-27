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
      expect(readPath(template)).toMatchObject({ path })
    })
  }

  test("a value rounded by its template keeps the decimals, for its number's format", () => {
    expect(readPath("{{ value_json.tempc  | round(1)}}")).toEqual({ path: "tempc", decimals: 1 })
    expect(readPath("{{ value|float|round(2) }}")).toEqual({ path: "", decimals: 2 })
    expect(readPath("{{ value | round }}")).toEqual({ path: "", decimals: 0 })
    expect(readPath("{{ value | round(1, 'common') }}")).toEqual({ path: "", decimals: 1 })
    // Another way of rounding, or a filter after it: no format to take.
    expect(readPath("{{ value | round(1, 'floor') }}")).toEqual({ path: "" })
    expect(readPath("{{ value | round(1) | int }}")).toEqual({ path: "" })
    expect(readPath("{{ value_json.a }}")).toEqual({ path: "a" })
  })

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

  // A scene (Home Assistant's scene.py): a press like a button's.
  test("the docs' scenes: a press publishing their payload, a JSON one as it is", () => {
    const one = (name: string) => {
      const [config] = expand(name)
      return toCatalogEntry(config)
    }
    expect(one("ha-docs-scene-party")).toMatchObject({
      entry: { name: "Living Room Party Scene", label: "Party Scene", controls: [{ kind: "button", write: "home/living_room/party_scene/set", payload: "ON" }] },
    })
    expect(one("ha-docs-scene-json")).toMatchObject({
      entry: { controls: [{ kind: "button", write: "home/living_room/set", payload: '{"activate_scene": "Blue Scene"}' }] },
    })
    const [bare] = expandConfig("homeassistant/scene/s/config", JSON.stringify({ name: "Night", cmd_t: "s/set" }))
    expect(toCatalogEntry(bare)).toMatchObject({ entry: { controls: [{ kind: "button", payload: "ON" }] } })
    const [none] = expandConfig("homeassistant/scene/n/config", JSON.stringify({ name: "Night" }))
    expect(toCatalogEntry(none)).toMatchObject({ unsupported: { reason: "no command topic" } })
  })

  // An event (Home Assistant's event.py): the type of the last one.
  test("the docs' doorbell event: the type of the last event, from its JSON", () => {
    const [config] = expand("ha-docs-event-doorbell")
    expect(toCatalogEntry(config)).toMatchObject({ entry: { label: "Doorbell", controls: [{ kind: "text", read: "home/doorbell/state#event_type" }] } })
  })

  test("the docs' desk button builds its JSON in a template: not supported, and says so", () => {
    const [config] = expand("ha-docs-event-desk-button")
    expect(toCatalogEntry(config)).toMatchObject({ unsupported: { reason: "the value template" } })
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

  test("a switch whose command template builds a JSON-RPC call sends what it renders for ON and for OFF", () => {
    const entry = entryOf("shelly-rpc-switch-command-template")
    expect(entry.name).toBe("Shelly Plus 1PM Pump")
    expect(entry.controls).toEqual([
      {
        kind: "switch",
        read: "shellyplus1pm-441793a1b2c3/status/switch:0#output",
        write: "shellyplus1pm-441793a1b2c3/rpc",
        // state_on "True" is how Home Assistant writes the field's true; the device reads "true".
        on: { read: "true", write: '{"id":1,"src":"homeassistant","method":"Switch.Set","params":{"id":0,"on":true}}' },
        off: { read: "false", write: '{"id":1,"src":"homeassistant","method":"Switch.Set","params":{"id":0,"on":false}}' },
      },
    ])
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
    expect(one("button", { cmd_t: "b", cmd_tpl: "{{ value | regex_replace('a', 'b') }}" })).toMatchObject({
      unsupported: { reason: "the command template: the filter regex_replace" },
    })
    expect(one("sensor", { name: "x" })).toMatchObject({ unsupported: { reason: "no state topic" } })
    expect(one("alarm_control_panel", { cmd_t: "c" })).toMatchObject({ unsupported: { reason: "the component alarm_control_panel" } })
  })
})

// Home Assistant takes a sensor for a number only when its config says so
// (docs/2026-10-14-topic-discovery.md, module ha-sensor-type; #71): a unit,
// a state class, or a device class that measures. Rajiva's «Service ID»
// has none of them and reports `CamperVan_BiberTest`; it was placed as a
// number showing «60».
test.describe("a sensor's type, as Home Assistant reads it", () => {
  const sensor = (config: Record<string, unknown>) =>
    toCatalogEntry(expandConfig("homeassistant/sensor/x/config", JSON.stringify({ stat_t: "s", name: "S", ...config }))[0])

  test("Rajiva's «Service ID»: no unit, no state class, no device class - a text", () => {
    const f = fixture("rajiva-service-id")
    const result = toCatalogEntry(expandConfig(f.topic, JSON.stringify(f.payload))[0])
    expect(result).toMatchObject({ entry: { label: "Service ID", controls: [{ kind: "text", read: "CamperServiceID/state" }] } })
  })

  test("a unit, a state class or a measuring device class each make it a number", () => {
    expect(sensor({ unit_of_meas: "V" })).toMatchObject({ entry: { controls: [{ kind: "value", read: "s", unit: "V" }] } })
    expect(sensor({ stat_cla: "measurement" })).toMatchObject({ entry: { controls: [{ kind: "value", read: "s" }] } })
    expect(sensor({ dev_cla: "temperature" })).toMatchObject({ entry: { controls: [{ kind: "value", read: "s" }] } })
  })

  test("a device class that is not a number - timestamp, date, enum - is a text", () => {
    for (const dev_cla of ["timestamp", "date", "enum"]) {
      expect(sensor({ dev_cla })).toMatchObject({ entry: { controls: [{ kind: "text", read: "s" }] } })
    }
  })

  test("a text sensor still says what it cannot read", () => {
    expect(sensor({ val_tpl: "{{ value_json.a / 10 }}" })).toMatchObject({ unsupported: { reason: "the value template: arithmetic (/ 10)" } })
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

  test("the docs' climate: every part it describes, each mode sending what its command template renders", () => {
    const entry = entryOf("ha-docs-climate-study")
    expect(entry.controls).toEqual([
      // {{ value if value=="off" else "on" }}
      { part: "Mode", kind: "choice", write: "study/ac/mode/set", options: ["off", "cool", "fan_only"], writes: ["off", "on", "on"] },
      { part: "Target temperature", kind: "level", write: "study/ac/temperature/set", min: 7, max: 35, step: 1 },
      { part: "Power", kind: "switch", write: "study/ac/power/set", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" } },
      { part: "Preset", kind: "choice", write: "study/ac/preset_mode/set", options: ["eco", "sleep", "activity"] },
      { part: "Fan mode", kind: "choice", write: "study/ac/fan/set", options: ["high", "medium", "low"] },
      { part: "Swing", kind: "choice", write: "study/ac/swing/set", options: ["on", "off"] },
      { part: "Swing horizontal", kind: "choice", write: "study/ac/swingH/set", options: ["on", "off"] },
    ])
    expect(entry.skipped).toBeUndefined()
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
      { part: "Brightness", kind: "level", read: "office/light/brightness", write: "office/light/brightness/set", min: 0, max: 255, step: 1, percent: true },
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
      { part: "Brightness", kind: "level", read: "tele/tasmota_4D5E6F/STATE#Dimmer", write: "cmnd/tasmota_4D5E6F/Dimmer", min: 0, max: 100, step: 1, percent: true },
    ])
  })

  test("a JSON-schema and a template-schema light are not supported, and say why", () => {
    for (const [name, schema] of [["esphome-light-json", "json"], ["template-light", "template"]]) {
      const [config] = expand(name)
      expect(toCatalogEntry(config)).toMatchObject({ unsupported: { reason: `the light schema ${schema}` } })
    }
  })

  // tasks/ha-cover-plan.md: the state, each action on its own, position and tilt.
  test("an awning: its state, Open, Stop and Close each a button, the position a level in percent", () => {
    const entry = entryOf("schaltli-awning")
    expect(entry.label).toBe("Markise")
    expect(entry.controls).toEqual([
      { part: "State", kind: "text", read: "van/markise/state" },
      { part: "Open", kind: "button", write: "van/markise/set", payload: "OPEN" },
      { part: "Stop", kind: "button", write: "van/markise/set", payload: "STOP" },
      { part: "Close", kind: "button", write: "van/markise/set", payload: "CLOSE" },
      { part: "Position", kind: "level", read: "van/markise/pos", write: "van/markise/pos/set", min: 0, max: 100, step: 1, percent: true },
    ])
    expect(entry.skipped).toBeUndefined()
  })

  test("the docs' cover with tilt: tilt in its range read from JSON; state and position skipped for their templates", () => {
    const entry = entryOf("ha-docs-cover-tilt")
    expect(entry.controls).toEqual([
      { part: "Open", kind: "button", write: "living-room-cover/set", payload: "OPEN" },
      { part: "Stop", kind: "button", write: "living-room-cover/set", payload: "STOP" },
      { part: "Close", kind: "button", write: "living-room-cover/set", payload: "CLOSE" },
      { part: "Tilt", kind: "level", read: "living-room-cover/tilt-state#PWM.PWM1", write: "living-room-cover/tilt", min: 0, max: 180, step: 1, percent: true },
    ])
    expect(entry.skipped).toEqual([
      { part: "State", reason: "the value template: `.x`" },
      { part: "Position", reason: "the value template: `.y`" },
    ])
  })

  test("the docs' cover without close: a null payload leaves its button out", () => {
    expect(entryOf("ha-docs-cover-no-close").controls).toEqual([
      { part: "Open", kind: "button", write: "gate/set", payload: "on" },
      { part: "Stop", kind: "button", write: "gate/set", payload: "on" },
    ])
  })

  test("a cover's defaults, a position only read as a fill, and one it cannot set", () => {
    const cover = (config: object) => {
      const [c] = expandConfig("homeassistant/cover/c/config", JSON.stringify(config))
      return toCatalogEntry(c)
    }
    expect(cover({ cmd_t: "c/set", pos_t: "c/pos", pos_open: 255, pos_clsd: 5, set_pos_t: "c/pos/set" })).toMatchObject({
      entry: {
        controls: [
          { part: "Open", payload: "OPEN" },
          { part: "Stop", payload: "STOP" },
          { part: "Close", payload: "CLOSE" },
          { part: "Position", kind: "level", min: 5, max: 255, percent: true },
        ],
      },
    })
    expect(cover({ pos_t: "c/pos" })).toMatchObject({ entry: { controls: [{ part: "Position", kind: "value", read: "c/pos", unit: "%", level: true }] } })
    // {{ position }}: the number as it is, so no write format (stage 2).
    expect(cover({ pos_t: "c/pos", set_pos_t: "c/pos/set", set_pos_tpl: "{{ position }}" })).toEqual({
      entry: expect.objectContaining({ controls: [{ part: "Position", kind: "level", read: "c/pos", write: "c/pos/set", min: 0, max: 100, step: 1, percent: true }] }),
    })
    // One a device cannot fill in stays read, as a fill.
    expect(cover({ pos_t: "c/pos", set_pos_t: "c/pos/set", set_pos_tpl: "{{ (position / 3) | int }}" })).toMatchObject({
      entry: { controls: [{ part: "Position", kind: "value", read: "c/pos", level: true }] },
    })
    expect(cover({ name: "x" })).toMatchObject({ unsupported: { reason: "no part it can show" } })
  })

  // A valve: as a cover, one topic each way (Home Assistant's valve.py).
  test("a grey water valve: its state, Open and Close; no Stop without its payload", () => {
    const entry = entryOf("schaltli-grauwasser")
    expect(entry.controls).toEqual([
      { part: "State", kind: "text", read: "van/grau/state" },
      { part: "Open", kind: "button", write: "van/grau/set", payload: "OPEN" },
      { part: "Close", kind: "button", write: "van/grau/set", payload: "CLOSE" },
    ])
    expect(entry.skipped).toBeUndefined()
  })

  test("the docs' valve: its state read from JSON, each button sending what the command template renders", () => {
    const entry = entryOf("ha-docs-valve-state")
    // {"x": {{ value }} } - as the docs write it, the payload goes in unquoted.
    expect(entry.controls).toEqual([
      { part: "State", kind: "text", read: "heater/valve/state#x" },
      { part: "Open", kind: "button", write: "heater/valve/set", payload: '{"x": OPEN }' },
      { part: "Stop", kind: "button", write: "heater/valve/set", payload: '{"x": STOP }' },
      { part: "Close", kind: "button", write: "heater/valve/set", payload: '{"x": CLOSE }' },
    ])
    expect(entry.skipped).toBeUndefined()
  })

  test("the docs' valve reporting a position: Open and Close render the positions; the position a level writing through the template's text", () => {
    const entry = entryOf("ha-docs-valve-position")
    expect(entry.controls).toEqual([
      { part: "Open", kind: "button", write: "heater/valve/set", payload: '{"x": 100 }' },
      { part: "Close", kind: "button", write: "heater/valve/set", payload: '{"x": 0 }' },
      // The number put into the template's text by the device (stage 2).
      { part: "Position", kind: "level", read: "heater/valve/state#x", write: "heater/valve/set", min: 0, max: 100, step: 1, percent: true, writeFormat: { text: '{"x": {value} }' } },
    ])
  })

  test("the docs' valve without close: a null payload leaves its button out", () => {
    expect(entryOf("ha-docs-valve-no-close").controls).toEqual([
      { part: "Open", kind: "button", write: "tap/set", payload: "on" },
      { part: "Stop", kind: "button", write: "tap/set", payload: "on" },
    ])
  })

  test("a valve reporting its position: Open and Close send the open and closed position, the position a level on the same topics", () => {
    const [config] = expandConfig(
      "homeassistant/valve/v/config",
      JSON.stringify({ cmd_t: "v/set", stat_t: "v/state", pos: true, pos_open: 255, pos_clsd: 5, pl_stop: "STOP" }),
    )
    expect(toCatalogEntry(config)).toMatchObject({
      entry: {
        controls: [
          { part: "Open", kind: "button", write: "v/set", payload: "255" },
          { part: "Stop", kind: "button", write: "v/set", payload: "STOP" },
          { part: "Close", kind: "button", write: "v/set", payload: "5" },
          { part: "Position", kind: "level", read: "v/state", write: "v/set", min: 5, max: 255, step: 1, percent: true },
        ],
      },
    })
  })

  // A water heater: climate's keys, fewer of them (Home Assistant's water_heater.py).
  test("a boiler: its modes, the target temperature in its range and steps, the current temperature", () => {
    const entry = entryOf("schaltli-boiler")
    expect(entry.controls).toEqual([
      { part: "Mode", kind: "choice", read: "van/boiler/mode", write: "van/boiler/mode/set", options: ["off", "eco", "electric", "gas"] },
      { part: "Target temperature", kind: "level", read: "van/boiler/soll", write: "van/boiler/soll/set", min: 40, max: 60, step: 1, unit: "°C" },
      { part: "Current temperature", kind: "value", read: "van/boiler/ist", unit: "°C", level: false },
    ])
    expect(entry.skipped).toBeUndefined()
  })

  test("the docs' boiler: each mode sending what its command template renders, the temperature on the default range, a step of its precision", () => {
    const entry = entryOf("ha-docs-water-heater-boiler")
    expect(entry.controls).toEqual([
      { part: "Mode", kind: "choice", read: "basement/boiler/mode", write: "basement/boiler/mode/set", options: ["off", "eco", "performance"], writes: ["off", "on", "on"] },
      { part: "Target temperature", kind: "level", read: "basement/boiler/temperature", write: "basement/boiler/temperature/set", min: 43.3, max: 60, step: 1 },
      { part: "Current temperature", kind: "value", read: "basement/boiler/current_temperature", level: false },
    ])
    expect(entry.skipped).toBeUndefined()
  })

  test("a water heater's default modes, its range in °F, its power", () => {
    const [config] = expandConfig(
      "homeassistant/water_heater/w/config",
      JSON.stringify({ mode_cmd_t: "w/mode", temp_cmd_t: "w/temp", temp_unit: "F", pow_cmd_t: "w/power" }),
    )
    expect(toCatalogEntry(config)).toMatchObject({
      entry: {
        controls: [
          { part: "Mode", kind: "choice", write: "w/mode", options: ["eco", "electric", "gas", "heat_pump", "high_demand", "performance", "off"] },
          { part: "Target temperature", kind: "level", write: "w/temp", min: 110, max: 140, step: 1, unit: "°F" },
          { part: "Power", kind: "switch", write: "w/power", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" } },
        ],
      },
    })
  })

  test("`value_template` stands in for each read template not set, of a climate and a water heater", () => {
    for (const component of ["climate", "water_heater"]) {
      const [config] = expandConfig(
        `homeassistant/${component}/t/config`,
        JSON.stringify({ val_tpl: "{{ value_json.v }}", mode_stat_t: "t/mode", mode_cmd_t: "t/mode/set", modes: ["off", "heat"], curr_temp_t: "t/now", curr_temp_tpl: "{{ value_json.now }}" }),
      )
      expect(toCatalogEntry(config)).toMatchObject({
        entry: {
          controls: [
            { part: "Mode", read: "t/mode#v" },
            { part: "Current temperature", read: "t/now#now" },
          ],
        },
      })
    }
  })

  // A lock (Home Assistant's lock.py): its state on its own, Lock and Unlock a switch.
  test("a central locking: its state, Lock and Unlock a switch with those words", () => {
    const entry = entryOf("schaltli-zentralverriegelung")
    expect(entry.controls).toEqual([
      { part: "State", kind: "text", read: "van/zv/state" },
      {
        part: "Lock",
        kind: "switch",
        read: "van/zv/state",
        write: "van/zv/set",
        on: { read: "LOCKED", write: "LOCK", label: "Lock" },
        off: { read: "UNLOCKED", write: "UNLOCK", label: "Unlock" },
      },
    ])
  })

  test("the docs' front door asks for a code: nothing written; its state template not readable either, so not supported", () => {
    const [config] = expand("ha-docs-lock-frontdoor")
    expect(toCatalogEntry(config)).toMatchObject({ unsupported: { reason: "State: the value template: `.x`; Lock: a code" } })
  })

  test("a lock's defaults, Open where its payload is set, a code leaving only the state", () => {
    const lock = (config: object) => {
      const [c] = expandConfig("homeassistant/lock/l/config", JSON.stringify(config))
      return toCatalogEntry(c)
    }
    expect(lock({ cmd_t: "l/set", stat_t: "l/state", pl_open: "OPEN" })).toMatchObject({
      entry: {
        controls: [
          { part: "State", kind: "text", read: "l/state" },
          { part: "Lock", kind: "switch", on: { read: "LOCKED", write: "LOCK" }, off: { read: "UNLOCKED", write: "UNLOCK" } },
          { part: "Open", kind: "button", write: "l/set", payload: "OPEN" },
        ],
      },
    })
    // Only read: the state alone, no second reading of it as a switch.
    expect(lock({ stat_t: "l/state" })).toMatchObject({ entry: { controls: [{ part: "State", kind: "text" }] } })
    const coded = lock({ cmd_t: "l/set", stat_t: "l/state", code_format: "^\d{4}$", pl_open: "OPEN" })
    expect(coded).toMatchObject({ entry: { controls: [{ part: "State", kind: "text", read: "l/state" }] } })
    expect((coded as { entry: { skipped: unknown } }).entry.skipped).toEqual([
      { part: "Lock", reason: "a code" },
      { part: "Open", reason: "a code" },
    ])
  })

  // A text (Home Assistant's text.py): typed on the device and sent as it is
  // (tasks/ha-text-plan.md, decision 8).
  test("the docs' remote LCD screen: a text field with its bounds", () => {
    const entry = entryOf("ha-docs-text-lcd")
    expect(entry.controls).toEqual([{ kind: "text-field", read: "txt/state", write: "txt/cmd", minLength: 2, maxLength: 20 }])
  })

  test("a text's defaults, a password hidden, and what leaves it only read", () => {
    const text = (config: object) => {
      const [c] = expandConfig("homeassistant/text/t/config", JSON.stringify(config))
      return toCatalogEntry(c)
    }
    // Home Assistant's own bounds; no state topic: nothing read back.
    expect(text({ cmd_t: "t/set" })).toMatchObject({ entry: { controls: [{ kind: "text-field", write: "t/set", minLength: 0, maxLength: 255 }] } })
    expect(text({ cmd_t: "t/set", stat_t: "t/state", mode: "password" })).toMatchObject({
      entry: { controls: [{ kind: "text-field", read: "t/state", write: "t/set", hidden: true }] },
    })
    // Out of range: kept within 0-255, min never above max.
    expect(text({ cmd_t: "t/set", min: 300, max: 999 })).toMatchObject({ entry: { controls: [{ minLength: 255, maxLength: 255 }] } })
    // A template around the value, a pattern: read as a text where there is a state topic ...
    for (const extra of [{ cmd_tpl: '{"text":"{{ value }}"}' }, { pattern: "^[a-z]+$" }]) {
      expect(text({ cmd_t: "t/set", stat_t: "t/state", ...extra })).toMatchObject({ entry: { controls: [{ kind: "text", read: "t/state" }] } })
    }
    // ... and not offered without one, saying why.
    expect(text({ cmd_t: "t/set", pattern: "^[a-z]+$" })).toMatchObject({ unsupported: { reason: "a pattern" } })
    expect(text({ cmd_t: "t/set", cmd_tpl: '{"text":"{{ value }}"}' })).toMatchObject({ unsupported: { reason: "the command template" } })
    expect(text({ stat_t: "t/state" })).toMatchObject({ entry: { controls: [{ kind: "text", read: "t/state" }] } })
  })

  // A humidifier (Home Assistant's humidifier.py): as a fan, its humidity in percent.
  test("the docs' humidifier: power, modes, the target humidity in its range, the current one as a fill", () => {
    const entry = entryOf("ha-docs-humidifier-bedroom")
    expect(entry.controls).toEqual([
      {
        part: "Power",
        kind: "switch",
        read: "bedroom_humidifier/on/state",
        write: "bedroom_humidifier/on/set",
        on: { read: "true", write: "true" },
        off: { read: "false", write: "false" },
      },
      {
        part: "Mode",
        kind: "choice",
        read: "bedroom_humidifier/mode/state",
        write: "bedroom_humidifier/preset/preset_mode",
        options: ["normal", "eco", "away", "boost", "comfort", "home", "sleep", "auto", "baby"],
      },
      { part: "Target humidity", kind: "level", read: "bedroom_humidifier/humidity/state", write: "bedroom_humidifier/humidity/set", min: 30, max: 80, step: 1, unit: "%" },
      { part: "Current humidity", kind: "value", read: "bedroom_humidifier/humidity/current", unit: "%", level: true },
    ])
    expect(entry.skipped).toBeUndefined()
  })

  test("a humidifier's defaults: ON and OFF, 0 to 100 %, no modes without a list", () => {
    const [config] = expandConfig("homeassistant/humidifier/h/config", JSON.stringify({ cmd_t: "h/set", hum_cmd_t: "h/target" }))
    expect(toCatalogEntry(config)).toMatchObject({
      entry: {
        controls: [
          { part: "Power", kind: "switch", write: "h/set", on: { write: "ON" }, off: { write: "OFF" } },
          { part: "Target humidity", kind: "level", write: "h/target", min: 0, max: 100, step: 1, unit: "%" },
        ],
      },
    })
  })

  // A siren (Home Assistant's siren.py): sent JSON unless a template says otherwise.
  test("the docs' intrusion siren: power sends JSON with the state, a button per tone turns it on with that tone", () => {
    expect(entryOf("ha-docs-siren-intrusion").controls).toEqual([
      {
        part: "Power",
        kind: "switch",
        read: "home/alarm/siren1",
        write: "home/alarm/siren1/set",
        on: { read: "ON", write: '{"state":"ON"}' },
        off: { read: "OFF", write: '{"state":"OFF"}' },
      },
      {
        part: "Tone",
        kind: "choice",
        write: "home/alarm/siren1/set",
        options: ['{"state":"ON","tone":"ping"}', '{"state":"ON","tone":"siren"}'],
        labels: ["ping", "siren"],
      },
    ])
  })

  test("the docs' Tasmota siren: `{{ value }}` as its command template sends the payload itself", () => {
    expect(entryOf("ha-docs-siren-tasmota").controls).toEqual([
      { part: "Power", kind: "switch", read: "stat/SIREN/RESULT#POWER", write: "cmnd/SIREN/POWER", on: { read: "ON", write: "ON" }, off: { read: "OFF", write: "OFF" } },
    ])
  })

  test("a siren's command template rendered for on, off and each tone; one leaving the tone out has no tones", () => {
    const siren = (config: Record<string, unknown>) => toCatalogEntry(expandConfig("homeassistant/siren/s/config", JSON.stringify(config))[0])
    // Zigbee2MQTT's warning: the tone where one is asked for, its own default otherwise.
    const warning = '{"warning": {"mode": "{{ tone | default(\'emergency\') if value == \'ON\' else \'stop\' }}", "duration": {{ duration | default(10) }}}}'
    expect(siren({ stat_t: "s/state", cmd_t: "s/set", cmd_tpl: warning, available_tones: ["burglar", "fire"] })).toMatchObject({
      entry: {
        controls: [
          {
            part: "Power",
            kind: "switch",
            on: { write: '{"warning": {"mode": "emergency", "duration": 10}}' },
            off: { write: '{"warning": {"mode": "stop", "duration": 10}}' },
          },
          {
            part: "Tone",
            kind: "choice",
            options: ['{"warning": {"mode": "burglar", "duration": 10}}', '{"warning": {"mode": "fire", "duration": 10}}'],
            labels: ["burglar", "fire"],
          },
        ],
      },
    })
    expect(siren({ stat_t: "s/state", cmd_t: "s/set", cmd_tpl: '{"on": "{{ value }}"}', available_tones: ["a", "b"] })).toMatchObject({
      entry: { controls: [{ part: "Power", kind: "switch", on: { write: '{"on": "ON"}' } }], skipped: [{ part: "Tone", reason: "the command template leaves out the tone" }] },
    })
    // A template it cannot follow: only read, or nothing.
    expect(siren({ stat_t: "s/state", cmd_t: "s/set", cmd_tpl: "{{ value | regex_replace('O', 'o') }}", available_tones: ["a"] })).toMatchObject({
      entry: {
        controls: [{ part: "Power", kind: "state", read: "s/state", on: "ON", off: "OFF" }],
        skipped: [{ part: "Tone", reason: "the command template: the filter regex_replace" }],
      },
    })
    expect(siren({ cmd_t: "b/set", cmd_tpl: "{{ value | regex_replace('O', 'o') }}" })).toMatchObject({
      unsupported: { reason: "Power: the command template: the filter regex_replace" },
    })
  })

  // An update (Home Assistant's update.py): the installed and the latest version, Install where set.
  test("an update with JSON state: both versions read from it, Install sending its payload", () => {
    expect(entryOf("schaltli-display-firmware").controls).toEqual([
      { part: "Installed version", kind: "text", read: "van/display/fw#installed_version" },
      { part: "Latest version", kind: "text", read: "van/display/fw#latest_version" },
      { part: "Install", kind: "button", write: "van/display/fw/install", payload: "install" },
    ])
  })

  test("the docs' Shelly update: the installed version by its template, the latest skipped for its {% if %}", () => {
    const entry = entryOf("ha-docs-update-shelly")
    expect(entry.controls).toEqual([
      { part: "Installed version", kind: "text", read: "shellies/shellyplug-s-112233/info#update.old_version" },
      { part: "Install", kind: "button", write: "shellies/shellyplug-s-112233/command", payload: "update_fw" },
    ])
    expect(entry.skipped).toEqual([{ part: "Latest version", reason: "the value template: a {% if %} block" }])
  })

  test("an update with a topic of its own for the latest version reads each as it comes; no Install without its payload", () => {
    const [config] = expandConfig("homeassistant/update/u/config", JSON.stringify({ stat_t: "u/installed", l_ver_t: "u/latest", cmd_t: "u/cmd" }))
    expect(toCatalogEntry(config)).toMatchObject({
      entry: {
        controls: [
          { part: "Installed version", kind: "text", read: "u/installed" },
          { part: "Latest version", kind: "text", read: "u/latest" },
        ],
      },
    })
  })

  test("an entity none of whose parts can be used is not supported, naming each part's reason", () => {
    const [config] = expandConfig(
      "homeassistant/fan/f/config",
      JSON.stringify({ cmd_t: "f/set", cmd_tpl: "{{ states('fan.x') }}", pct_cmd_t: "f/pct", pct_cmd_tpl: "{{ (value / 3) | int }}" }),
    )
    expect(toCatalogEntry(config)).toMatchObject({ unsupported: { reason: "Power: the command template: states(); Speed: a command template" } })
  })

  test("Shelly gen2's relay as a fan: the state template run backwards to the output field, the RPC call rendered for ON and OFF", () => {
    const entry = entryOf("shellies-gen2-relay-fan")
    expect(entry.controls).toEqual([
      {
        part: "Power",
        kind: "switch",
        // {%if value_json.output%}ON{%else%}OFF{%endif%}: true is ON, false OFF.
        read: "shellyplus1pm-441793a1b2c3/status/switch:0#output",
        write: "shellyplus1pm-441793a1b2c3/rpc",
        on: { read: "true", write: '{"id":1,"src":"homeassistant","method":"Switch.Set","params":{"id":0,"on":true}}' },
        off: { read: "false", write: '{"id":1,"src":"homeassistant","method":"Switch.Set","params":{"id":0,"on":false}}' },
      },
    ])
  })

  test("Shelly gen2's thermostat: its modes read from enable and sent as RPC calls, the target a level the device puts into the RPC call", () => {
    const entry = entryOf("shellies-gen2-thermostat")
    expect(entry.controls).toEqual([
      {
        part: "Mode",
        kind: "choice",
        read: "shelly-blu-gateway/status/thermostat:0#enable",
        write: "shelly-blu-gateway/rpc",
        options: ["off", "heat"],
        writes: [
          '{"id": 1, "method": "Thermostat.SetConfig", "params": {"config": {"enable": false, "id": 0}}, "src": "homeassistant"}',
          '{"id": 1, "method": "Thermostat.SetConfig", "params": {"config": {"enable": true, "id": 0}}, "src": "homeassistant"}',
        ],
        reads: ["false", "true"],
      },
      {
        part: "Target temperature",
        kind: "level",
        read: "shelly-blu-gateway/status/thermostat:0#target_C",
        write: "shelly-blu-gateway/rpc",
        min: 5,
        max: 35,
        step: 0.5,
        // The dict through tojson, the value in its place: what Home
        // Assistant renders for 21.5, the device writes too.
        writeFormat: { text: '{"id": 1, "method": "Thermostat.SetConfig", "params": {"config": {"id": 0, "target_C": {value}}}, "src": "homeassistant"}' },
      },
      { part: "Current temperature", kind: "value", read: "shelly-blu-gateway/status/thermostat:0#current_C", level: false },
    ])
  })

  test("a choice's state template run backwards: an option passed through stands for itself, one no value gives is never lit", () => {
    const one = (config: Record<string, unknown>) => toCatalogEntry(expandConfig("homeassistant/select/x/config", JSON.stringify(config))[0])
    // Shelly's TPL_HVAC_MODE: ventilation is reported for fan_only, the rest as they are.
    expect(
      one({ stat_t: "m/state", cmd_t: "m/set", ops: ["off", "heat", "fan_only"], val_tpl: '{{"fan_only" if value_json.value == "ventilation" else value_json.value}}' }),
    ).toMatchObject({ entry: { controls: [{ kind: "choice", read: "m/state#value", reads: ["off", "heat", "ventilation"] }] } })
    // auto is in the list but nothing reads as it: its button never lights.
    expect(one({ stat_t: "m/state", cmd_t: "m/set", ops: ["off", "heat", "auto"], val_tpl: "{%if value_json.enable%}heat{%else%}off{%endif%}" })).toMatchObject({
      entry: { controls: [{ kind: "choice", read: "m/state#enable", reads: ["false", "true", ""] }] },
    })
    // A template that passes everything through needs nothing run backwards.
    expect(one({ stat_t: "m/state", cmd_t: "m/set", ops: ["a", "b"], val_tpl: "{{ value_json.mode }}" })).toEqual(
      expect.objectContaining({ entry: expect.objectContaining({ controls: [{ kind: "choice", read: "m/state#mode", write: "m/set", options: ["a", "b"] }] }) }),
    )
  })

  test("a state template run backwards: each state from exactly one value, or why not", () => {
    const one = (component: string, config: Record<string, unknown>) =>
      toCatalogEntry(expandConfig(`homeassistant/${component}/x/config`, JSON.stringify(config))[0])
    // Compared with constants: those are what the device reads.
    expect(one("binary_sensor", { stat_t: "d/state", val_tpl: "{{ 'ON' if value_json.contact == 'open' else 'OFF' if value_json.contact == 'closed' }}" })).toMatchObject({
      entry: { controls: [{ kind: "state", read: "d/state#contact", on: "open", off: "closed" }] },
    })
    expect(one("switch", { stat_t: "r/state", cmd_t: "r/set", val_tpl: "{% if value == '1' %}ON{% elif value == '0' %}OFF{% endif %}" })).toMatchObject({
      entry: { controls: [{ kind: "switch", read: "r/state", on: { read: "1", write: "ON" }, off: { read: "0", write: "OFF" } }] },
    })
    // Z-Wave JS: OFF for 0 and for false, ON for anything else - no one value each.
    expect(one("binary_sensor", { stat_t: "z/state", val_tpl: '{{ "OFF" if value_json.value == 0 else "ON" }}' })).toMatchObject({
      unsupported: { reason: "the value template: more than one value gives OFF" },
    })
    // Reading what only Home Assistant knows.
    expect(one("binary_sensor", { stat_t: "z/state", val_tpl: "{{ 'ON' if is_state('sun.sun', 'above_horizon') else 'OFF' }}" })).toMatchObject({
      unsupported: { reason: "the value template: is_state()" },
    })
  })

  test("a command template reading what the designer cannot know is refused, naming it", () => {
    const one = (component: string, config: Record<string, unknown>) =>
      toCatalogEntry(expandConfig(`homeassistant/${component}/x/config`, JSON.stringify(config))[0])
    // A lock's code comes from whoever presses: only its state is shown.
    expect(one("lock", { stat_t: "l/state", cmd_t: "l/set", cmd_tpl: '{"action": "{{ value }}", "code": "{{ code }}"}' })).toMatchObject({
      entry: { controls: [{ part: "State", kind: "text", read: "l/state" }] },
    })
    const lock = one("lock", { cmd_t: "l/set", cmd_tpl: '{"action": "{{ value }}", "code": "{{ code }}"}', pl_open: "OPEN" })
    expect(lock).toMatchObject({ unsupported: { reason: "Lock: the command template: `code`; Open: the command template: `code`" } })
    expect(one("switch", { cmd_t: "s/set", cmd_tpl: '{"entity": "{{ entity_id }}", "state": "{{ value }}"}' })).toMatchObject({
      unsupported: { reason: "the command template: `entity_id`" },
    })
    // A select's options each rendered; one that fails for an option is refused whole.
    expect(one("select", { cmd_t: "m/set", cmd_tpl: '{"mode": "{{ value | lower }}"}', ops: ["Eco", "Boost"] })).toMatchObject({
      entry: { controls: [{ kind: "choice", options: ["Eco", "Boost"], writes: ['{"mode": "eco"}', '{"mode": "boost"}'] }] },
    })
    expect(one("select", { cmd_t: "m/set", cmd_tpl: "{{ value | float }}", ops: ["1", "x"] })).toMatchObject({
      unsupported: { reason: "the command template: float(x)" },
    })
  })

  test("`{{ value }}` as a command template sends the payload as it is, the same as none", () => {
    const one = (component: string, config: Record<string, unknown>) =>
      toCatalogEntry(expandConfig(`homeassistant/${component}/x/config`, JSON.stringify(config))[0])
    // Spaces inside the braces or around them change nothing.
    for (const template of ["{{ value }}", "{{value}}", " {{  value  }} "]) {
      expect(one("switch", { stat_t: "s", cmd_t: "s/set", cmd_tpl: template })).toMatchObject({
        entry: { controls: [{ kind: "switch", read: "s", write: "s/set", on: { write: "ON" }, off: { write: "OFF" } }] },
      })
    }
    expect(one("button", { cmd_t: "b", cmd_tpl: "{{ value }}" })).toMatchObject({ entry: { controls: [{ kind: "button", write: "b", payload: "PRESS" }] } })
    expect(one("number", { stat_t: "n", cmd_t: "n/set", cmd_tpl: "{{ value }}", min: 0, max: 10 })).toMatchObject({
      entry: { controls: [{ kind: "level", read: "n", write: "n/set", min: 0, max: 10 }] },
    })
    // A part of several: the fan's speed written as it is beside its power's rendered JSON.
    const fan = one("fan", { cmd_t: "f/set", cmd_tpl: '{"on": "{{ value }}"}', pct_cmd_t: "f/pct", pct_cmd_tpl: "{{ value }}" })
    expect(fan).toMatchObject({
      entry: { controls: [{ part: "Power", kind: "switch", on: { write: '{"on": "ON"}' } }, { part: "Speed", kind: "level", write: "f/pct" }] },
    })
    // A cover's position, a climate's target temperature.
    expect(one("cover", { set_pos_t: "c/pos", set_pos_tpl: "{{ value }}" })).toMatchObject({
      entry: { controls: [{ part: "Position", kind: "level", write: "c/pos", percent: true }] },
    })
    expect(one("climate", { temp_cmd_t: "k/temp", temp_cmd_tpl: "{{ value }}" })).toMatchObject({
      entry: { controls: [{ part: "Target temperature", kind: "level", write: "k/temp" }] },
    })
  })
})

// Stage 2 (tasks/ha-templates-stage2-plan.md, S6): a template that scales a
// number - read or written - becomes a scaled topic or a write format the
// device computes, from the survey's projects.
test.describe("templates that scale a number", () => {
  function entryOf(name: string) {
    const [config] = expand(name)
    const result = toCatalogEntry(config)
    if (!("entry" in result)) throw new Error(`${name}: ${result.unsupported.reason}`)
    return result.entry
  }

  test("rtl_433's wind in km/h: m/s read through a scale, rounded to its two decimals", () => {
    expect(entryOf("rtl433-wind-average").controls).toEqual([
      {
        kind: "value",
        read: "rtl_433/9b13b3f4-rtl433/devices/Fineoffset-WH24/147/wind_avg_m_s",
        unit: "km/h",
        level: false,
        decimals: 2,
        scale: { numerator: 18, denominator: 5, decimals: 2 },
      },
    ])
  })

  test("OpenMQTTGateway's scan interval: ms read as s, s written as ms inside its JSON", () => {
    expect(entryOf("omg-bt-scan-interval").controls).toEqual([
      {
        kind: "level",
        read: "home/OMG_ESP32_BLE/SYStoMQTT#interval",
        write: "home/OMG_ESP32_BLE/commands/MQTTtoBT/config",
        min: 1,
        max: 100,
        step: 1,
        unit: "s",
        scale: { numerator: 1, denominator: 1000, decimals: 2 },
        writeFormat: { text: '{"interval":{value},"save":true}', numerator: 1000, denominator: 1, decimals: 0 },
      },
    ])
  })

  test("Zigbee2MQTT's cover: the position written as the cover's own variable into its JSON", () => {
    expect(entryOf("z2m-cover-position").controls).toContainEqual({
      part: "Position",
      kind: "level",
      read: "zigbee2mqtt/Markise#position",
      write: "zigbee2mqtt/Markise/set",
      min: 0,
      max: 100,
      step: 1,
      percent: true,
      writeFormat: { text: '{ "position": {value} }' },
    })
  })

  test("a template that is not linear stays as it was", () => {
    const one = (config: Record<string, unknown>) => toCatalogEntry(expandConfig("homeassistant/sensor/x/config", JSON.stringify(config))[0])
    expect(one({ stat_t: "s", unit_of_meas: "W", val_tpl: "{{ value_json.a * value_json.a }}" })).toMatchObject({
      unsupported: { reason: "the value template: arithmetic (* value_json.a)" },
    })
    expect(one({ stat_t: "s", unit_of_meas: "W", val_tpl: "{{ (value_json.a | int) * 2 }}" })).toMatchObject({ unsupported: {} })
    // A number scaled is not a state: a switch keeps its reason.
    expect(
      toCatalogEntry(expandConfig("homeassistant/switch/x/config", JSON.stringify({ stat_t: "s", cmd_t: "c", val_tpl: "{{ value_json.a * 2 }}" }))[0]),
    ).toMatchObject({ unsupported: {} })
  })
})
