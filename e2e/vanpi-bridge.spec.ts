import { test, expect } from "@playwright/test"
import { spawn } from "node:child_process"
import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"

// The Schaltli VanPi bridge (docs/2026-09-15-live-data.md, decisions 1-4),
// without a van: the logic its Node-RED tab runs, and the tab itself run the
// way Node-RED runs a function node.
//
// The payloads are Pekaway's own answers, recorded off the reference van on
// 2026-09-15 (VanPi_Ctrl v2.0.10). What the bridge publishes becomes the
// contract every shared Schaltli design for a VanPi binds to, so a topic
// that silently changes shape here breaks other people's screens.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createBridgeLogic } = require("../integrations/vanpi/bridge-logic")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildBridgeFlow, TAB_ID, BROKER_ID } = require("../integrations/vanpi/build-flow")
import { expandConfig, readCatalog, toCatalogEntry } from "../lib/ha-discovery"
import { readDescription } from "../lib/block-description"
import { blockTable, buildEntry, catalogLooks } from "../lib/bausteine"
import { controlPalette } from "../lib/control-palette"
import { layoutObjects } from "../lib/layout"
import { asPlaceholders } from "./helpers"

const RECORDED = {
  batt: '{"AMPS":"-0.75","SoC":"100","Voltage":"13.95"}',
  level: '{"level1":{"state":0,"name":"Frischwasser"},"level2":{"state":2,"name":"Abwasser"},"level3":{"state":0,"name":"Level 3"},"level4":{"state":0,"name":"Level 4"}}',
  temp: '{"temp1":{"state":"0","name":"Innen","type":"ds18b20"},"temp2":{"state":"29.6","name":"Boiler","type":"ds18b20"},"temp3":{"state":"0","name":"Temp3","type":"ds18b20"},"temp4":{"state":"0","name":"Temp4","type":"ds18b20"}}',
  relay: '{"Relay1":false,"Relay1 Name":"Boiler 12V","Relay2":false,"Relay2 Name":"Boiler 220V","Relay3":false,"Relay3 Name":"Frischwasserpumpe","Relay4":false,"Relay4 Name":"Abwasserventil","Relay5":false,"Relay5 Name":"Kuehlschrank","Relay6":true,"Relay6 Name":"Abwasserpumpe","Relay7":false,"Relay7 Name":"Relay 7","Relay8":false,"Relay8 Name":"Relay 8","WifiRelay1":false,"WifiRelay1 Name":"WifiRelay 1","FirmwareWR1":"tasmota","WifiRelay2":true,"WifiRelay2 Name":"WifiRelay 2","FirmwareWR2":"tasmota","WifiRelaySettings":false}',
  dimmer: '{"Dimmer Settings":true,"Dimmer Debug Mode":false,"Dimmer Debug Watchdog Target IP":"","dimmer1":{"state":0,"name":"Dimmer 1","autooff":0,"offtime":null},"dimmer8":{"state":40,"name":"DimmyPro 1","autooff":0,"offtime":null}}',
  heater: '{"heatertoggle":false,"heatstatus":"wait","heattemp":"wait","heatvolt":0,"heatfan":"wait","heatglow":0,"heatwpump":0,"heaterror":"no","targettemp_vanpi":25,"runtime_m":0,"tempsensor":1,"tempsensor_name":"Innen","heater_name":"","ventilation":{}}',
  bms: '{"BMSamps":"wait","BMScap":"wait","BMScell1":"NaN","BMScell2":"3.31","BMSsoc":"wait","BMSvolt":"wait"}',
  mppt: '{"mppt_pv_amps":0,"mppt_pv_volts":0,"mppt_pv_watts":0,"mppt_pv_total":0}',
  maxxfan: '{"maxxfan":{"fan_power":false,"fan_direction":"out","fan_temp":26,"fan_auto":false,"fan_speed":3,"fan_vent":"close"}}',
}

// The MaxxFan as the user's BLE flow in vanpi-custom reports it (shape B,
// retained), and the same fan state in Pekaway's own shape A.
const BLE = '{"mode":"MANUAL","speed":90,"temperature":22,"cover":"OPEN","airflow":"IN"}'
const PEKAWAY_SAME =
  '{"maxxfan":{"fan_power":true,"fan_direction":"in","fan_temp":22,"fan_auto":false,"fan_speed":9,"fan_vent":"open"}}'

const asMap = (updates: { topic: string; value: string }[]) => Object.fromEntries(updates.map((u) => [u.topic, u.value]))

/** The configs the bridge announces for every recorded answer, and the theme. */
function announceAll(logic: ReturnType<typeof createBridgeLogic>) {
  let announced = {}
  const configs: { topic: string; payload: string }[] = []
  for (const [kind, payload] of [...Object.entries(RECORDED), ["theme", null]]) {
    const a = logic.announce(kind, payload, announced)
    announced = a.announced
    configs.push(...a.publish)
  }
  return { configs, announced }
}

test.describe("VanPi bridge logic", () => {
  const logic = createBridgeLogic()

  test("Pekaway's answers become single schaltli/state values", () => {
    expect(asMap(logic.flatten("batt", RECORDED.batt))).toEqual({
      "schaltli/state/battery/voltage": "13.95",
      "schaltli/state/battery/current": "-0.75",
      "schaltli/state/battery/soc": "100",
    })
    const tanks = asMap(logic.flatten("level", RECORDED.level))
    expect(tanks["schaltli/state/tank/2/level"]).toBe("2")
    expect(tanks["schaltli/state/tank/1/name"]).toBe("Frischwasser")
    expect(asMap(logic.flatten("temp", RECORDED.temp))["schaltli/state/temp/2/value"]).toBe("29.6")

    const relays = asMap(logic.flatten("relay", RECORDED.relay))
    expect(relays["schaltli/state/relay/6/power"]).toBe("on")
    expect(relays["schaltli/state/relay/1/power"]).toBe("off")
    expect(relays["schaltli/state/relay/3/name"]).toBe("Frischwasserpumpe")
    expect(relays["schaltli/state/wifirelay/2/power"]).toBe("on")
    // Only relays the answer names - not a guess at eight of each.
    expect(relays["schaltli/state/wifirelay/3/power"]).toBeUndefined()

    const dimmers = asMap(logic.flatten("dimmer", RECORDED.dimmer))
    expect(dimmers["schaltli/state/dimmer/8/level"]).toBe("40")
    expect(dimmers["schaltli/state/dimmer/8/name"]).toBe("DimmyPro 1")
    // On or off, from the level, and the level "on" goes back to.
    expect(dimmers["schaltli/state/dimmer/8/power"]).toBe("on")
    expect(dimmers["schaltli/state/dimmer/8/on_level"]).toBe("40")
    expect(dimmers["schaltli/state/dimmer/1/power"]).toBe("off")
    expect(dimmers["schaltli/state/dimmer/1/on_level"]).toBeUndefined()

    expect(asMap(logic.flatten("maxxfan", RECORDED.maxxfan))).toMatchObject({
      "schaltli/state/maxxfan/mode": "off",
      "schaltli/state/maxxfan/speed": "30",
      "schaltli/state/maxxfan/cover": "closed",
    })
    expect(asMap(logic.flatten("mppt", RECORDED.mppt))["schaltli/state/mppt/pv_watts"]).toBe("0")
  })

  test("a value Pekaway does not know yet is not published at all", () => {
    const heater = asMap(logic.flatten("heater", RECORDED.heater))
    expect(heater["schaltli/state/heater/power"]).toBe("off")
    expect(heater["schaltli/state/heater/target"]).toBe("25")
    expect(heater["schaltli/state/heater/status"]).toBeUndefined()
    expect(heater["schaltli/state/heater/temp"]).toBeUndefined()

    const bms = asMap(logic.flatten("bms", RECORDED.bms))
    expect(bms).toEqual({ "schaltli/state/bms/cell/2": "3.31" })
  })

  test("odd messages give nothing instead of stopping the bridge", () => {
    expect(logic.flatten("batt", "not json")).toEqual([])
    expect(logic.flatten("doorman", '{"locked":true}')).toEqual([])
    expect(logic.flatten("maxxfan", '{"rpm":1200}')).toEqual([])
  })

  test("only values that changed go out again", () => {
    const first = logic.changed({}, logic.flatten("batt", RECORDED.batt))
    expect(first.changed).toHaveLength(3)
    const same = logic.changed(first.last, logic.flatten("batt", RECORDED.batt))
    expect(same.changed).toEqual([])
    const moved = logic.changed(first.last, logic.flatten("batt", '{"AMPS":"-0.75","SoC":"99","Voltage":"13.95"}'))
    expect(moved.changed).toEqual([{ topic: "schaltli/state/battery/soc", value: "99" }])
  })

  test("Schaltli commands become Pekaway's, and nothing else does", () => {
    const state = asMap([
      ...logic.flatten("relay", RECORDED.relay),
      ...logic.flatten("dimmer", RECORDED.dimmer),
      ...logic.flatten("heater", '{"heatertoggle":true,"targettemp_vanpi":22}'),
    ])
    expect(logic.command("schaltli/cmnd/relay/3", "on", state)).toEqual({
      publish: [{ topic: "pkw/cmnd/relay/3/POWER", payload: "on" }],
      refresh: "relay",
    })
    expect(logic.command("schaltli/cmnd/relay/6", "toggle", state).publish[0].payload).toBe("off")
    expect(logic.command("schaltli/cmnd/relay/1", "TOGGLE", state).publish[0].payload).toBe("on")
    expect(logic.command("schaltli/cmnd/wifirelay/2", "off", state).publish[0].topic).toBe("pkw/cmnd/wrelay/2/POWER")
    expect(logic.command("schaltli/cmnd/dimmer/8", "75", state).publish[0]).toEqual({ topic: "pkw/cmnd/dimmer/8/POWER", payload: "75" })
    // As levels, since Pekaway's own "on" is 100: off is 0, on the level it
    // last had, else 100.
    expect(logic.command("schaltli/cmnd/dimmer/8", "toggle", state).publish[0].payload).toBe("0")
    expect(logic.command("schaltli/cmnd/dimmer/8", "off", state).publish[0].payload).toBe("0")
    // Never on before: 70, bright but not glaring.
    expect(logic.command("schaltli/cmnd/dimmer/1", "toggle", state).publish[0].payload).toBe("70")
    expect(logic.command("schaltli/cmnd/dimmer/1", "on", state).publish[0].payload).toBe("70")
    // On while it is on: nothing for Pekaway (Home Assistant sends it before every level).
    expect(logic.command("schaltli/cmnd/dimmer/8", "on", state)).toEqual({ state: [] })
    const dimmedEarlier = { ...state, "schaltli/state/dimmer/1/on_level": "35" }
    expect(logic.command("schaltli/cmnd/dimmer/1", "on", dimmedEarlier)).toEqual({
      publish: [{ topic: "pkw/cmnd/dimmer/1/POWER", payload: "35" }],
      refresh: "dimmer",
      state: [
        { topic: "schaltli/state/dimmer/1/level", value: "35" },
        { topic: "schaltli/state/dimmer/1/power", value: "on" },
        { topic: "schaltli/state/dimmer/1/on_level", value: "35" },
      ],
      hold: true,
    })
    expect(logic.command("schaltli/cmnd/dimmer/1", "dim", state)).toBeNull()
    expect(logic.command("schaltli/cmnd/heater", "off", state).publish[0]).toEqual({ topic: "pkw/cmnd/heater/POWER", payload: "off" })
    // A new target keeps the heater as it is - here on.
    expect(logic.command("schaltli/cmnd/heater/target", "24", state).publish[0]).toEqual({
      topic: "pkw/cmnd/heater/POWER/24",
      payload: "on",
    })
    expect(logic.command("schaltli/cmnd/switchall", "off", state).publish[0].topic).toBe("pkw/cmnd/switchall/POWER")

    for (const [topic, payload] of [
      ["schaltli/cmnd/relay/9", "on"],
      ["schaltli/cmnd/relay/3", "maybe"],
      ["schaltli/cmnd/dimmer/2", "150"],
      ["schaltli/cmnd/heater/target", "40"],
      ["schaltli/cmnd/switchall", "on"],
      ["schaltli/cmnd/unknown/1", "on"],
      ["schaltli/state/relay/3/power", "on"],
      ["schaltli/cmnd/theme", "blue"],
      ["schaltli/cmnd/theme/1", "dark"],
    ]) {
      expect(logic.command(topic, payload, state), `${topic} = ${payload}`).toBeNull()
    }
  })

  // Block plan Task 9: what the bridge publishes, announced in Home
  // Assistant's discovery format under one device «VanPi» - and read back by
  // the designer's own code, so every thing must be one it can place.
  test("every thing of the recorded answers is announced, and the designer can place each, by the van's name", () => {
    const { configs: all } = announceAll(createBridgeLogic())
    // Home Assistant's; the block descriptions beside them have a test of their own.
    const configs = all.filter((c) => c.topic.startsWith("homeassistant/"))
    const entries = configs.map(({ topic, payload }) => {
      const discovered = expandConfig(topic, payload, "homeassistant")
      expect(discovered, topic).toHaveLength(1)
      const result = toCatalogEntry(discovered[0])
      if (!("entry" in result)) throw new Error(`${topic}: ${result.unsupported.reason}`)
      return result.entry
    })
    expect(new Set(entries.map((e) => e.device?.name))).toEqual(new Set(["VanPi"]))
    expect(entries.map((e) => [e.component, e.label])).toEqual([
      ["sensor", "Batterie"],
      ["sensor", "Frischwasser"],
      ["sensor", "Abwasser"],
      ["sensor", "Level 3"],
      ["sensor", "Level 4"],
      ["switch", "Boiler 12V"],
      ["switch", "WifiRelay 1"],
      ["switch", "Boiler 220V"],
      ["switch", "WifiRelay 2"],
      ["switch", "Frischwasserpumpe"],
      ["switch", "Abwasserventil"],
      ["switch", "Kuehlschrank"],
      ["switch", "Abwasserpumpe"],
      ["switch", "Relay 7"],
      ["switch", "Relay 8"],
      ["light", "Dimmer 1"],
      ["light", "DimmyPro 1"],
      ["climate", "Heizung"],
      ["number", "Heizung Timer"],
      ["climate", "MaxxFan"],
      ["switch", "MaxxFan Deckel"],
      ["switch", "MaxxFan Luftrichtung"],
      ["switch", "Theme"],
    ])
    const byLabel = Object.fromEntries(entries.map((e) => [e.label, e]))
    expect(byLabel["Frischwasser"].controls).toEqual([{ kind: "value", read: "schaltli/state/tank/1/level", unit: "%", level: true }])
    expect(byLabel["Batterie"].controls).toEqual([{ kind: "value", read: "schaltli/state/battery/soc", unit: "%", level: true }])
    expect(byLabel["Abwasserpumpe"].controls).toEqual([
      {
        kind: "switch",
        read: "schaltli/state/relay/6/power",
        write: "schaltli/cmnd/relay/6",
        on: { read: "on", write: "on" },
        off: { read: "off", write: "off" },
      },
    ])
    expect(byLabel["WifiRelay 2"].controls[0]).toMatchObject({ read: "schaltli/state/wifirelay/2/power", write: "schaltli/cmnd/wifirelay/2" })
    // A dimmer: on and off, read from the bridge's own state, and its level
    // 0 to 100, both to its one command.
    expect(byLabel["DimmyPro 1"].controls).toEqual([
      {
        kind: "switch",
        read: "schaltli/state/dimmer/8/power",
        write: "schaltli/cmnd/dimmer/8",
        on: { read: "on", write: "on" },
        off: { read: "off", write: "off" },
        part: "Power",
      },
      { kind: "level", read: "schaltli/state/dimmer/8/level", write: "schaltli/cmnd/dimmer/8", min: 0, max: 100, step: 1, part: "Brightness" },
    ])
    expect(byLabel["Theme"].controls).toEqual([
      {
        kind: "switch",
        read: "schaltli/state/theme",
        write: "schaltli/cmnd/theme",
        on: { read: "dark", write: "dark" },
        off: { read: "light", write: "light" },
      },
    ])
    expect(byLabel["Theme"].icon).toBe("mdi:weather-night")
    // Each its own id, for Home Assistant.
    const ids = configs.map((c) => JSON.parse(c.payload).unique_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // Block plan Task 10 (block-options Task 7): the heater as a climate, its
  // timer and - on a van with Autoterm - its power level.
  test("the heater: a climate with mode, target and the room's temperature, and a timer", () => {
    const logic = createBridgeLogic()
    const entriesOf = (payload: string) =>
      Object.entries(logic.things("heater", payload) as Record<string, object>)
        .filter(([topic]) => topic.startsWith("homeassistant/"))
        .map(([topic, config]) => {
        const result = toCatalogEntry(expandConfig(topic, JSON.stringify(config), "homeassistant")[0])
        if (!("entry" in result)) throw new Error(`${topic}: ${result.unsupported.reason}`)
        return result.entry
      })
    const [climate, timer, ...rest] = entriesOf(RECORDED.heater)
    expect(rest).toEqual([])
    expect(climate.label).toBe("Heizung")
    expect(climate.controls).toEqual([
      { kind: "choice", read: "schaltli/state/heater/mode", write: "schaltli/cmnd/heater", options: ["off", "heat"], part: "Mode" },
      { kind: "level", read: "schaltli/state/heater/target", write: "schaltli/cmnd/heater/target", min: 12, max: 35, step: 1, unit: "°C", part: "Target temperature" },
      // The room, as Pekaway's tempsensor 1 («Innen») measures it.
      { kind: "value", read: "schaltli/state/temp/1/value", unit: "°C", level: false, part: "Current temperature" },
    ])
    expect(timer.label).toBe("Heizung Timer")
    expect(timer.controls).toEqual([
      { kind: "level", read: "schaltli/state/heater/timer", write: "schaltli/cmnd/heater/timer", min: 0, max: 600, step: 1, unit: "min" },
    ])

    expect(asMap(logic.flatten("heater", RECORDED.heater))["schaltli/state/heater/power_level"]).toBeUndefined()
    expect(asMap(logic.flatten("heater", RECORDED.heater))["schaltli/state/heater/preset"]).toBeUndefined()
  })

  // An Autoterm, as Pekaway's "get heater stats" reports it (VanPi Core OS,
  // populateAutotermPayload): its own object beside the generic heater's.
  const autotermAnswer = (autoterm1: Record<string, unknown>) =>
    JSON.stringify({ ...JSON.parse(RECORDED.heater), heater_name: "Autoterm", autoterm1: {
      heatertoggle: false, heatstatus: "standby", heattemp: "18", heaterror: "no", targettemp_vanpi: 21,
      mode: "off", fanspeed: 0, powerlevel: 0, runtime_m: 0, runtime_remaining_s: 0, ...autoterm1,
    } })

  test("an Autoterm: its own state, its mode as off, heat or fan only with temperature or power, its levels", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/heater/"
    const values = (autoterm1: Record<string, unknown>, last?: Record<string, string>) => asMap(logic.flatten("heater", autotermAnswer(autoterm1), last))
    expect(values({ mode: "temp mode", heatertoggle: true })).toMatchObject({
      [`${S}mode`]: "heat",
      [`${S}preset`]: "temperature",
      [`${S}power`]: "on",
      // Its own target, not the generic heater's 25.
      [`${S}target`]: "21",
      [`${S}name`]: "Autoterm",
    })
    expect(values({ mode: "power mode", heatertoggle: true, powerlevel: 7 })).toMatchObject({
      [`${S}mode`]: "heat",
      [`${S}preset`]: "power",
      [`${S}power_level`]: "7",
    })
    expect(values({ mode: "fan only", fanspeed: 3 })).toMatchObject({ [`${S}mode`]: "fan_only", [`${S}fan_level`]: "3", [`${S}power`]: "on" })
    // Off: no level of 0, and the preset it had stays; temperature before any.
    const off = values({ mode: "off" })
    expect(off[`${S}mode`]).toBe("off")
    expect(off[`${S}power_level`]).toBeUndefined()
    expect(off[`${S}preset`]).toBe("temperature")
    expect(values({ mode: "" }, { [`${S}preset`]: "power" })[`${S}preset`]).toBeUndefined()
    // Its timer from its own object.
    expect(values({ mode: "temp mode", runtime_remaining_s: 1800 })[`${S}timer`]).toBe("30")

    // Announced: off, heat and fan only, the two presets, and its two levels.
    const entries = Object.entries(logic.things("heater", autotermAnswer({})) as Record<string, object>)
      .filter(([topic]) => topic.startsWith("homeassistant/"))
      .map(([topic, config]) => {
      const result = toCatalogEntry(expandConfig(topic, JSON.stringify(config), "homeassistant")[0])
      if (!("entry" in result)) throw new Error(`${topic}: ${result.unsupported.reason}`)
      return result.entry
    })
    expect(entries.map((e) => e.label)).toEqual(["Autoterm", "Autoterm Timer", "Autoterm Leistung", "Autoterm Lüftung"])
    expect(entries[0].controls.map((c) => c.part)).toEqual(["Mode", "Target temperature", "Current temperature", "Preset"])
    expect(entries[0].controls[0]).toMatchObject({ options: ["off", "heat", "fan_only"], write: "schaltli/cmnd/heater" })
    expect(entries[0].controls[3]).toMatchObject({
      kind: "choice",
      read: "schaltli/state/heater/preset",
      write: "schaltli/cmnd/heater/preset",
      options: ["temperature", "power"],
    })
    expect(entries[2].controls).toEqual([
      { kind: "level", read: "schaltli/state/heater/power_level", write: "schaltli/cmnd/heater/power_level", min: 1, max: 10, step: 1 },
    ])
    expect(entries[3].controls[0]).toMatchObject({ read: "schaltli/state/heater/fan_level", write: "schaltli/cmnd/heater/fan_level", min: 1, max: 10 })
  })

  // Through Pekaway's HTTP API: its MQTT API's generic heater command does not
  // reach an Autoterm, tried in the van on 2026-10-05 - POWER/25 on left it in
  // standby, PUT /autoterm/temp/25 started it.
  test("Autoterm commands: each mode started through Pekaway's HTTP API, a preset switched while it heats, a level switching to its mode", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/heater/"
    const http = (path: string) => ({ method: "PUT", url: `http://127.0.0.1:1880/autoterm/${path}` })
    const at = (extra: Record<string, string>) => ({ [`${S}preset`]: "temperature", [`${S}mode`]: "off", [`${S}target`]: "21", ...extra })
    const send = (part: string, value: string, state: Record<string, string>) =>
      logic.command(part ? `schaltli/cmnd/heater/${part}` : "schaltli/cmnd/heater", value, state)

    expect(send("", "heat", at({}))).toEqual({ request: [http("temp/21")], refresh: "heater" })
    expect(send("", "heat", at({ [`${S}preset`]: "power", [`${S}power_level`]: "7" })).request).toEqual([http("power/7")])
    // Never a level seen: 5.
    expect(send("", "heat", at({ [`${S}preset`]: "power" })).request).toEqual([http("power/5")])
    expect(send("", "fan_only", at({ [`${S}fan_level`]: "3" })).request).toEqual([http("vent/3")])
    expect(send("", "off", at({ [`${S}mode`]: "heat" }))).toEqual({ request: [http("stop/0")], refresh: "heater" })
    expect(send("", "toggle", at({ [`${S}mode`]: "fan_only" })).request).toEqual([http("stop/0")])
    expect(send("", "toggle", at({})).request).toEqual([http("temp/21")])
    // Pekaway takes at most 30 °C for an Autoterm.
    expect(send("", "heat", at({ [`${S}target`]: "33" })).request).toEqual([http("temp/30")])
    // No target to heat to: nothing.
    expect(send("", "heat", { [`${S}preset`]: "temperature", [`${S}mode`]: "off" })).toBeNull()
    expect(send("", "cool", at({}))).toBeNull()
    // Nothing of it goes to Pekaway's generic heater.
    for (const value of ["heat", "off", "fan_only"]) expect(send("", value, at({})).publish, value).toBeUndefined()

    // A preset while off is the bridge's to remember; while heating it switches.
    expect(send("preset", "power", at({}))).toEqual({
      state: [
        { topic: `${S}preset`, value: "power" },
        { topic: `${S}view`, value: "off" },
      ],
    })
    expect(send("preset", "power", at({ [`${S}mode`]: "heat", [`${S}power_level`]: "4" }))).toEqual({
      state: [
        { topic: `${S}preset`, value: "power" },
        // What the heater's block shows follows at once.
        { topic: `${S}view`, value: "power" },
      ],
      request: [http("power/4")],
      refresh: "heater",
    })
    expect(send("preset", "eco", at({}))).toBeNull()

    expect(send("power_level", "8", at({}))).toEqual({ request: [http("power/8")], refresh: "heater" })
    expect(send("fan_level", "2", at({})).request).toEqual([http("vent/2")])

    // A timer: its preset for that long, Pekaway counting down; 0 stops it.
    expect(send("timer", "90", at({}))).toEqual({
      request: [http("temp/21?runtime=90")],
      refresh: "heater",
      state: [{ topic: `${S}timer`, value: "90" }],
      hold: true,
    })
    expect(send("timer", "45", at({ [`${S}preset`]: "power", [`${S}power_level`]: "6" })).request).toEqual([http("power/6?runtime=45")])
    expect(send("timer", "0", at({ [`${S}mode`]: "heat" })).request).toEqual([http("stop/0")])

    // A target: heating to one, it is started again at the new one; else the
    // bridge keeps it, since Pekaway cannot set it without starting the heater.
    expect(send("target", "23", at({ [`${S}mode`]: "heat", [`${S}view`]: "target" }))).toEqual({
      request: [http("temp/23")],
      refresh: "heater",
      state: [{ topic: `${S}target`, value: "23" }],
      keep: [{ topic: `${S}target`, value: "23" }],
    })
    expect(send("target", "23", at({ [`${S}view`]: "off" }))).toEqual({
      state: [{ topic: `${S}target`, value: "23" }],
      keep: [{ topic: `${S}target`, value: "23" }],
    })
    expect(send("target", "23", at({ [`${S}mode`]: "heat", [`${S}view`]: "power" })).request).toBeUndefined()
    expect(send("target", "31", at({}))).toBeNull()
    expect(send("target", "11", at({}))).toBeNull()
    for (const [part, value] of [["power_level", "0"], ["power_level", "11"], ["fan_level", "x"]]) {
      expect(send(part, value, at({})), `${part} = ${value}`).toBeNull()
    }

    // Without an Autoterm none of it: fan only, presets and levels are not there.
    const plain = { [`${S}target`]: "25", [`${S}power`]: "off" }
    expect(send("", "fan_only", plain)).toBeNull()
    expect(send("preset", "power", plain)).toBeNull()
    expect(send("power_level", "5", plain)).toBeNull()
    // ...and its target still goes the generic way, up to 35 °C.
    expect(send("target", "33", plain)).toEqual({ publish: [{ topic: "pkw/cmnd/heater/POWER/33", payload: "off" }], refresh: "heater" })
  })

  // docs/2026-10-05-autoterm-block.md: its state in plain words, a fault
  // always (empty without one), its own measurements, and its runtime.
  test("an Autoterm's state in words, its fault, voltage, fan, pump and runtime", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/heater/"
    const values = (autoterm1: Record<string, unknown>) => asMap(logic.flatten("heater", autotermAnswer(autoterm1)))
    // As read in the van on 2026-10-05, glowing before the ignition.
    expect(values({ heatstatus: "heating glow plug2", heatvolt: 13.3, heatfan: "660", heatglow: 0, mode: "temp mode", heatertoggle: true })).toMatchObject({
      [`${S}state_text`]: "Startet",
      [`${S}fault`]: "",
      [`${S}voltage`]: "13.3",
      [`${S}fan_rpm`]: "660",
      [`${S}pump_hz`]: "0",
    })
    for (const [status, words] of [
      ["standby", "Bereit"],
      ["ignition 2", "Startet"],
      ["heating", "Heizt"],
      ["only fan", "Lüftet"],
      ["cooling down", "Kühlt ab"],
      ["Shutting Down", "Kühlt ab"],
      ["Running", "Heizt"],
    ]) expect(values({ heatstatus: status })[`${S}state_text`], status).toBe(words)
    // Pekaway's own fault texts.
    expect(values({ heatstatus: "no ignition error" })).toMatchObject({ [`${S}state_text`]: "Störung", [`${S}fault`]: "Störung: Keine Zündung" })
    expect(values({ heatstatus: "unknown status" })[`${S}fault`]).toBe("Störung: Unbekannter Zustand der Heizung")
    // The heater's code, once Pekaway passes it on: the manual's words, or the number.
    expect(values({ heatstatus: "standby", heaterror: "13" })[`${S}fault`]).toBe("Störung 13: Startet nicht, zwei Versuche fehlgeschlagen")
    expect(values({ heaterror: 42 })[`${S}fault`]).toBe("Störung 42: unbekannter Code")
    expect(values({ heaterror: "no" })[`${S}fault`]).toBe("")
    // Not known yet: nothing.
    expect(values({ heatstatus: "wait", heatfan: "wait" })[`${S}state_text`]).toBeUndefined()
    // The runtime set and left, and whether its timer runs.
    expect(values({ runtime_m: 90, runtime_remaining_s: 4320 })).toMatchObject({ [`${S}runtime`]: "90", [`${S}runtime_left`]: "72", [`${S}timer_on`]: "on" })
    expect(values({ runtime_m: 0, runtime_remaining_s: 0 })).toMatchObject({ [`${S}runtime`]: "0", [`${S}runtime_left`]: "0", [`${S}timer_on`]: "off" })
  })

  test("an Autoterm's mode in one word, and its timer: on for an hour, a runtime set while it runs or kept while it is off", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/heater/"
    const http = (path: string) => ({ method: "PUT", url: `http://127.0.0.1:1880/autoterm/${path}` })
    const at = (extra: Record<string, string>) => ({ [`${S}preset`]: "temperature", [`${S}view`]: "off", [`${S}mode`]: "off", [`${S}target`]: "21", ...extra })
    const send = (part: string, value: string, state: Record<string, string>) => logic.command(`schaltli/cmnd/heater/${part}`, value, state)

    // The block's four buttons.
    expect(send("view", "target", at({}))).toEqual({ request: [http("temp/21")], refresh: "heater" })
    expect(send("view", "power", at({ [`${S}power_level`]: "4" })).request).toEqual([http("power/4")])
    expect(send("view", "fan", at({})).request).toEqual([http("vent/5")])
    expect(send("view", "off", at({ [`${S}view`]: "target" })).request).toEqual([http("stop/0")])
    expect(send("view", "eco", at({}))).toBeNull()

    // Off: the timer switched on is kept at an hour, and taken along by the next start.
    const kept = [
      { topic: `${S}runtime`, value: "60" },
      { topic: `${S}timer_on`, value: "on" },
    ]
    expect(send("timer_on", "on", at({}))).toEqual({ state: kept, keep: kept })
    const timerOn = at({ [`${S}runtime`]: "60", [`${S}timer_on`]: "on" })
    expect(send("view", "target", timerOn).request).toEqual([http("temp/21?runtime=60")])
    expect(logic.command("schaltli/cmnd/heater", "heat", timerOn).request).toEqual([http("temp/21?runtime=60")])
    // On already: nothing to do.
    expect(send("timer_on", "on", timerOn)).toBeNull()
    // Running: its mode started again with the new runtime; off runs on without end.
    const running = at({ [`${S}view`]: "power", [`${S}mode`]: "heat", [`${S}power_level`]: "6", [`${S}timer_on`]: "on", [`${S}runtime`]: "60" })
    expect(send("runtime", "120", running)).toEqual({
      request: [http("power/6?runtime=120")],
      refresh: "heater",
      state: [
        { topic: `${S}runtime`, value: "120" },
        { topic: `${S}timer_on`, value: "on" },
      ],
      hold: true,
      holdMs: 3000,
      settle: true,
    })
    // Pekaway takes 15-minute steps and makes 5 a 0, which ends its
    // countdown (seen in the van, 2026-10-05): rounded here, at least 15.
    for (const [asked, sent] of [["5", "15"], ["20", "15"], ["23", "30"], ["595", "600"], ["0", "0"]]) {
      const url = send("runtime", asked, running).request[0].url
      expect(url, asked).toBe(`http://127.0.0.1:1880/autoterm/power/6?runtime=${sent}`)
    }
    expect(send("timer_on", "off", running).request).toEqual([http("power/6?runtime=0")])
    // A mode changed while it runs leaves the countdown alone.
    expect(send("view", "target", running).request).toEqual([http("temp/21")])
    expect(send("runtime", "601", running)).toBeNull()
  })

  // Decision 4: no silent failure.
  test("faults the bridge sees itself: a command refused or unanswered, a start not followed - the heater's own first", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/heater/"
    // Pekaway answers a value it does not take with 200 and a sentence.
    expect(logic.commandAnswer(200, "autotermRes: autoterm stop command received")).toBe("")
    expect(logic.commandAnswer(200, "autoterm temp with target temperature 25°C, runtime: not set")).toBe("")
    expect(logic.commandAnswer(200, "autotermRes: temperature value must be within 2 and 30 Celsius")).toBe(
      "Störung: Befehl nicht angenommen (temperature value must be within 2 and 30 Celsius)",
    )
    expect(logic.commandAnswer(404, "Cannot PUT /autoterm/temp/25")).toBe("Störung: Befehl nicht angenommen (Pekaway antwortet 404)")
    expect(logic.commandAnswer("ECONNREFUSED", "Error: connect ECONNREFUSED")).toBe("Störung: Befehl nicht angenommen (keine Antwort von Pekaway)")

    const answer = (state: string, fault = "") => [
      { topic: `${S}state_text`, value: state },
      { topic: `${S}fault`, value: fault },
    ]
    const faultOf = (r: { updates: { topic: string; value: string }[] }) => asMap(r.updates)[`${S}fault`]
    const t0 = 1_000_000
    const start = { method: "PUT", url: "http://127.0.0.1:1880/autoterm/temp/22" }
    let faults = logic.commandSent(null, start, t0)
    expect(faults).toEqual({ command: "", startAt: t0 })
    // Still «Bereit» after 60 s: not yet; after 91 s: a fault.
    expect(faultOf(logic.bridgeFaults(answer("Bereit"), faults, t0 + 60000))).toBe("")
    expect(faultOf(logic.bridgeFaults(answer("Bereit"), faults, t0 + 91000))).toBe("Störung: Heizung folgt dem Start nicht")
    // It follows: the watch ends.
    const followed = logic.bridgeFaults(answer("Startet"), faults, t0 + 20000)
    expect(followed.faults).toEqual({ command: "", startAt: null })
    expect(faultOf(logic.bridgeFaults(answer("Bereit"), followed.faults, t0 + 200000))).toBe("")
    // A stop ends it too.
    expect(logic.commandSent(faults, { method: "PUT", url: "http://127.0.0.1:1880/autoterm/stop/0" }, t0 + 5000).startAt).toBeNull()
    // A refused command shows; the heater's own fault comes first.
    faults = { command: "Störung: Befehl nicht angenommen (keine Antwort von Pekaway)", startAt: null }
    expect(faultOf(logic.bridgeFaults(answer("Heizt"), faults, t0))).toBe(faults.command)
    expect(faultOf(logic.bridgeFaults(answer("Störung", "Störung: Keine Zündung"), faults, t0))).toBe("Störung: Keine Zündung")
    // No Autoterm, no fault topic: nothing added.
    expect(logic.bridgeFaults([{ topic: `${S}power`, value: "on" }], faults, t0).updates).toEqual([{ topic: `${S}power`, value: "on" }])
  })

  // Decision 6: pump TH11, 4.4 ml per 100 strokes.
  test("an Autoterm's fuel: the pump's frequency over time, a gap not counted, a reset, read back after a restart", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/heater/"
    const pump = (hz: number) => [{ topic: `${S}pump_hz`, value: String(hz) }]
    const since = new Date(2024, 11, 5, 18, 0).getTime()
    // An hour at 1.6 Hz, answers 2 s apart: 5760 strokes, 253.44 ml.
    let fuel = logic.seenFuel(logic.seenFuel(null, `${S}fuel`, "2.100"), `${S}fuel_since`, new Date(since).toISOString())
    expect(fuel).toMatchObject({ ml: 2100, since, at: null })
    let t = since + 1000
    let last: { topic: string; value: string }[] = []
    for (let i = 0; i <= 1800; i++, t += 2000) {
      const r = logic.fuelCount(pump(1.6), fuel, t)
      fuel = r.fuel
      last = r.updates
    }
    expect(fuel.ml).toBeCloseTo(2100 + 253.44, 6)
    expect(asMap(last)).toMatchObject({
      [`${S}fuel`]: "2.353",
      [`${S}fuel_since`]: new Date(since).toISOString(),
      [`${S}fuel_text`]: "2.353 l seit 05.12.2024 18:00h",
    })
    // Once counting, its own publications coming back change nothing.
    expect(logic.seenFuel(fuel, `${S}fuel`, "0.000")).toBe(fuel)
    // A gap of a minute is not counted as pumping all along.
    const before = fuel.ml
    fuel = logic.fuelCount(pump(1.6), fuel, t + 60000).fuel
    expect(fuel.ml).toBe(before)
    // An answer without a pump (no Autoterm): nothing.
    expect(logic.fuelCount([{ topic: `${S}status`, value: "wait" }], fuel, t + 62000)).toEqual({ updates: [{ topic: `${S}status`, value: "wait" }], fuel })
    // Reset: zero from now.
    const now = new Date(2026, 9, 5, 14, 7).getTime()
    const reset = logic.fuelReset(fuel, now)
    expect(asMap(reset.updates)[`${S}fuel_text`]).toBe("0.000 l seit 05.10.2026 14:07h")
    expect(reset.fuel).toMatchObject({ ml: 0, since: now })
    expect(logic.command("schaltli/cmnd/heater/fuel", "reset", {})).toEqual({ fuelReset: true })
    expect(logic.command("schaltli/cmnd/heater/fuel", "zero", {})).toBeNull()
    // Nothing retained yet: counted from the first answer.
    expect(logic.fuelCount(pump(0), null, now).fuel).toMatchObject({ ml: 0, since: now, at: now })
  })

  test("an Autoterm's kept values stand in for Pekaway's until Pekaway reports them, or ones of its own", () => {
    const logic = createBridgeLogic()
    const T = "schaltli/state/heater/target"
    const R = "schaltli/state/heater/runtime"
    const answer = (target: string, runtime = "0") => [
      { topic: "schaltli/state/heater/status", value: "standby" },
      { topic: T, value: target },
      { topic: R, value: runtime },
    ]
    const kept = logic.keepValues(null, [{ topic: T, value: "23" }], { [T]: "25" })
    expect(kept).toEqual({ [T]: { value: "23", from: "25" } })
    // Pekaway still says 25: 23 is shown, and kept.
    const behind = logic.keptValues(answer("25"), kept)
    expect(asMap(behind.updates)[T]).toBe("23")
    expect(behind.kept).toEqual(kept)
    // A second change keeps what Pekaway said first; a runtime is kept beside it.
    const both = logic.keepValues(kept, [{ topic: T, value: "24" }, { topic: R, value: "90" }], { [T]: "23", [R]: "0" })
    expect(both).toEqual({ [T]: { value: "24", from: "25" }, [R]: { value: "90", from: "0" } })
    // Started with them: Pekaway says 24 and 90, nothing kept any more.
    const caught = logic.keptValues(answer("24", "90"), both)
    expect(asMap(caught.updates)).toMatchObject({ [T]: "24", [R]: "90" })
    expect(caught.kept).toBeNull()
    // The target set in Pekaway's dashboard meanwhile: Pekaway's wins, the runtime stays kept.
    const theirs = logic.keptValues(answer("19"), both)
    expect(asMap(theirs.updates)).toMatchObject({ [T]: "19", [R]: "90" })
    expect(theirs.kept).toEqual({ [R]: { value: "90", from: "0" } })
    // An answer without them leaves them be.
    expect(logic.keptValues([], kept).kept).toEqual(kept)
    expect(logic.keptValues(answer("25"), null)).toEqual({ updates: answer("25"), kept: null })
  })

  test("heater commands: a timer runs it at its target, 0 switches it off, heat is on", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/"
    const state = { [`${S}heater/target`]: "25", [`${S}heater/power`]: "off" }
    expect(logic.command("schaltli/cmnd/heater/timer", "90", state)).toEqual({
      publish: [{ topic: "pkw/cmnd/heater/POWER/25/90", payload: "on" }],
      refresh: "heater",
      state: [{ topic: `${S}heater/timer`, value: "90" }],
      timer: { minutes: 90 },
    })
    expect(logic.command("schaltli/cmnd/heater/timer", "0", state).publish).toEqual([{ topic: "pkw/cmnd/heater/POWER", payload: "off" }])
    expect(logic.command("schaltli/cmnd/heater/timer", "601", state)).toBeNull()
    expect(logic.command("schaltli/cmnd/heater/timer", "30", {})).toBeNull()
    // Home Assistant's climate says heat and off.
    expect(logic.command("schaltli/cmnd/heater", "heat", state).publish[0]).toEqual({ topic: "pkw/cmnd/heater/POWER", payload: "on" })
  })

  test("a timer counts down where the van does not say, and is 0 once the heater is off", () => {
    const logic = createBridgeLogic()
    const answer = (on: boolean, extra = {}) => logic.flatten("heater", JSON.stringify({ ...JSON.parse(RECORDED.heater), heatertoggle: on, ...extra }))
    const timerOf = (r: { updates: { topic: string; value: string }[] }) => asMap(r.updates)["schaltli/state/heater/timer"]
    const t0 = 1_000_000
    const timer = logic.startTimer({ minutes: 90 }, t0)

    // Pekaway's first answer may still say off: not taken as the end.
    expect(timerOf(logic.heaterTimer(answer(false), timer, t0 + 300))).toBe("90")
    expect(timerOf(logic.heaterTimer(answer(true), timer, t0 + 30 * 60000))).toBe("60")
    expect(timerOf(logic.heaterTimer(answer(true), timer, t0 + 30 * 60000 + 1))).toBe("60")
    // Off later on: 0, and the timer is done.
    const off = logic.heaterTimer(answer(false), timer, t0 + 40 * 60000)
    expect(timerOf(off)).toBe("0")
    expect(off.timer).toBeNull()
    // Run out.
    const out = logic.heaterTimer(answer(true), timer, t0 + 91 * 60000)
    expect(timerOf(out)).toBe("0")
    expect(out.timer).toBeNull()
    // No timer at all: 0.
    expect(timerOf(logic.heaterTimer(answer(true), null, t0))).toBe("0")
    // The van says it itself (2.1.0): its minutes, rounded up, and no count of our own.
    const told = logic.heaterTimer(answer(true, { runtime_remaining_s: 3541 }), timer, t0)
    expect(timerOf(told)).toBe("60")
    expect(told.timer).toBeNull()
    // 0 minutes is no timer.
    expect(logic.startTimer({ minutes: 0 }, t0)).toBeNull()
  })

  // Block plan Task 11 (block-options Task 8): the MaxxFan's two shapes on
  // pkw/tele/maxxfan - A, Pekaway's own; B, the user's BLE flow - as one set
  // of values, and A's commands.

  test("the MaxxFan: shape A and shape B give the same values for the same fan, and A after B is ignored", () => {
    const logic = createBridgeLogic()
    const fromA = asMap(logic.flatten("maxxfan", PEKAWAY_SAME))
    const fromB = asMap(logic.flatten("maxxfan", BLE))
    const S = "schaltli/state/maxxfan/"
    const fan = {
      [`${S}mode`]: "manual",
      [`${S}power`]: "on",
      [`${S}hvac_mode`]: "fan_only",
      [`${S}speed`]: "90",
      [`${S}temperature`]: "22",
      [`${S}cover`]: "open",
      [`${S}airflow`]: "in",
    }
    expect(fromA).toEqual({ ...fan, [`${S}source`]: "pekaway" })
    expect(fromB).toEqual({ ...fan, [`${S}source`]: "ble" })
    // Auto, and off.
    expect(asMap(logic.flatten("maxxfan", '{"maxxfan":{"fan_power":true,"fan_auto":true}}'))[`${S}mode`]).toBe("auto")
    expect(asMap(logic.flatten("maxxfan", '{"mode":"AUTO"}'))[`${S}mode`]).toBe("auto")
    expect(asMap(logic.flatten("maxxfan", '{"mode":"OFF"}'))[`${S}power`]).toBe("off")
    // In Home Assistant's climate words.
    expect(asMap(logic.flatten("maxxfan", '{"mode":"OFF"}'))[`${S}hvac_mode`]).toBe("off")
    expect(asMap(logic.flatten("maxxfan", '{"maxxfan":{"fan_power":true,"fan_auto":true}}'))[`${S}hvac_mode`]).toBe("auto")
    expect(asMap(logic.flatten("maxxfan", '{"cover":"CLOSED"}'))[`${S}cover`]).toBe("closed")

    // Once B was heard, A gives nothing; B still does.
    const afterB = logic.changed({}, logic.flatten("maxxfan", BLE)).last
    expect(logic.flatten("maxxfan", RECORDED.maxxfan, afterB)).toEqual([])
    expect(asMap(logic.flatten("maxxfan", '{"mode":"OFF"}', afterB))[`${S}mode`]).toBe("off")
  })

  test("MaxxFan commands: absolute values for A become Pekaway's toggles and its own stepping; with B they are the BLE flow's", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/maxxfan/"
    const pkw = (cmd: string, payload = "toggle") => ({ topic: `pkw/cmnd/maxxfan/${cmd}`, payload })
    const fanIn = (mode: string, extra = {}) => ({ [`${S}mode`]: mode, [`${S}source`]: "pekaway", ...extra })
    const send = (part: string, value: string, state: Record<string, string>) => logic.command(`schaltli/cmnd/maxxfan/${part}`, value, state)

    expect(send("mode", "auto", fanIn("off"))).toEqual({ publish: [pkw("power"), pkw("auto")], refresh: "maxxfan" })
    // fan_only, Home Assistant's climate word, is by hand.
    expect(send("mode", "fan_only", fanIn("off")).publish).toEqual([pkw("power")])
    expect(send("mode", "fan_only", fanIn("auto")).publish).toEqual([pkw("auto")])
    expect(send("mode", "manual", fanIn("off")).publish).toEqual([pkw("power")])
    expect(send("mode", "auto", fanIn("manual")).publish).toEqual([pkw("auto")])
    expect(send("mode", "manual", fanIn("auto")).publish).toEqual([pkw("auto")])
    expect(send("mode", "off", fanIn("manual")).publish).toEqual([pkw("power")])
    // Out of auto the flag goes first, so the fan does not come back in auto.
    expect(send("mode", "off", fanIn("auto")).publish).toEqual([pkw("auto"), pkw("power")])
    expect(send("mode", "manual", fanIn("manual")).publish).toEqual([])
    // Power, as Home Assistant's fan switches it.
    expect(send("power", "on", fanIn("off")).publish).toEqual([pkw("power")])
    expect(send("power", "on", fanIn("auto")).publish).toEqual([])
    expect(send("power", "off", fanIn("auto")).publish).toEqual([pkw("auto"), pkw("power")])
    // Speed in percent, as Pekaway's 1 to 10, which it steps to itself.
    expect(send("speed", "50", fanIn("manual")).publish).toEqual([pkw("speed", "5")])
    expect(send("speed", "4", fanIn("manual")).publish).toEqual([pkw("speed", "1")])
    expect(send("temperature", "22", fanIn("auto")).publish).toEqual([pkw("temp", "22")])
    expect(send("cover", "open", fanIn("manual", { [`${S}cover`]: "closed" })).publish).toEqual([pkw("vent")])
    expect(send("cover", "closed", fanIn("manual", { [`${S}cover`]: "closed" })).publish).toEqual([])
    expect(send("airflow", "in", fanIn("manual", { [`${S}airflow`]: "out" })).publish).toEqual([pkw("direction")])
    for (const [part, value] of [["mode", "turbo"], ["speed", "0"], ["speed", "101"], ["temperature", "40"], ["cover", "ajar"], ["vent", "open"]]) {
      expect(send(part, value, fanIn("manual")), `${part} = ${value}`).toBeNull()
    }

    // With the BLE flow heard, nothing goes to Pekaway.
    expect(send("speed", "50", { [`${S}source`]: "ble" })).toEqual({ elsewhere: "the MaxxFan's BLE flow" })
  })

  test("the MaxxFan announced: a climate with off, by hand or auto, its target temperature and its ten speeds; cover and airflow as switches", () => {
    const logic = createBridgeLogic()
    for (const answer of [RECORDED.maxxfan, BLE]) {
      const entries = Object.entries(logic.things("maxxfan", answer) as Record<string, object>)
        .filter(([topic]) => topic.startsWith("homeassistant/"))
        .map(([topic, config]) => {
        const result = toCatalogEntry(expandConfig(topic, JSON.stringify(config), "homeassistant")[0])
        if (!("entry" in result)) throw new Error(`${topic}: ${result.unsupported.reason}`)
        return result.entry
      })
      const [fan, cover, airflow, ...rest] = entries
      expect(rest).toEqual([])
      expect(fan.component).toBe("climate")
      expect(fan.controls).toEqual([
        { kind: "choice", read: "schaltli/state/maxxfan/hvac_mode", write: "schaltli/cmnd/maxxfan/mode", options: ["off", "fan_only", "auto"], part: "Mode" },
        { kind: "level", read: "schaltli/state/maxxfan/temperature", write: "schaltli/cmnd/maxxfan/temperature", min: 0, max: 37, step: 1, unit: "°C", part: "Target temperature" },
        {
          kind: "choice",
          read: "schaltli/state/maxxfan/speed",
          write: "schaltli/cmnd/maxxfan/speed",
          options: ["10", "20", "30", "40", "50", "60", "70", "80", "90", "100"],
          part: "Fan mode",
        },
      ])
      expect(cover.controls[0]).toMatchObject({ kind: "switch", on: { read: "open" }, off: { read: "closed" } })
      expect(airflow.controls[0]).toMatchObject({ kind: "switch", on: { read: "out" }, off: { read: "in" } })
    }
    expect(logic.things("maxxfan", '{"rpm":1200}')).toBeNull()
  })

  // bridge-blocks Task 5: which of the heater's controls matters, in one
  // word a block can show its parts by.
  test("the heater's view: off, target, power or fan, from mode and preset", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/heater/"
    const view = (autoterm1: Record<string, unknown>, last?: Record<string, string>) =>
      asMap(logic.flatten("heater", autotermAnswer(autoterm1), last))[`${S}view`]
    expect(view({ mode: "off" })).toBe("off")
    expect(view({ mode: "fan only", fanspeed: 3 })).toBe("fan")
    expect(view({ mode: "temp mode", heatertoggle: true })).toBe("target")
    expect(view({ mode: "power mode", heatertoggle: true, powerlevel: 7 })).toBe("power")
    // Off and on again: the preset it had decides, as the heater remembers it.
    expect(view({ mode: "off" }, { [`${S}preset`]: "power" })).toBe("off")
    // Without an Autoterm: heat or off.
    expect(asMap(logic.flatten("heater", RECORDED.heater))[`${S}view`]).toMatch(/^(target|off)$/)
  })

  test("the heater described: its state or fault, its mode, then side by side the dial for the mode and the timer, the fuel beside «Nullen»", () => {
    const logic = createBridgeLogic()
    const describe = (answer: string) => {
      const out = logic.things("heater", answer) as Record<string, object>
      const d = readDescription("schaltli/blocks/heater/config", JSON.stringify(out["schaltli/blocks/heater/config"]))
      if (!d || !("entry" in d)) throw new Error(`not an entry: ${JSON.stringify(d)}`)
      const messages = Object.fromEntries(Object.entries(out).map(([topic, config]) => [topic, JSON.stringify(config)]))
      return { entry: d.entry, listed: readCatalog(messages).entries.map((e) => e.label) }
    }
    const auto = describe(autotermAnswer({}))
    expect(auto.entry.skipped).toBeUndefined()
    // docs/2026-10-05-autoterm-block.md, decision 10 (asked 2026-10-05: the
    // block was still too big): small at the top the state or the fault, the
    // mode across, then a row of the mode's dial beside the timer, and a row
    // of the fuel beside «Nullen».
    const S = "schaltli/state/heater/"
    expect(auto.entry.controls.map((c) => [c.part, c.kind, c.section, c.column, c.row, c.shownWhen?.values ?? []])).toEqual([
      [undefined, "text", undefined, undefined, undefined, []],
      ["Betrieb", "choice", undefined, undefined, undefined, []],
      ["Zieltemperatur", "level", undefined, 1, "controls", ["target"]],
      ["Leistung", "level", undefined, 1, "controls", ["power"]],
      ["Lüftung", "level", undefined, 1, "controls", ["fan"]],
      ["Timer", "switch", "Laufzeit", 2, "controls", []],
      ["Laufzeit", "level", "Laufzeit", 2, "controls", ["on"]],
      [undefined, "text", "Verbrauch", 1, "fuel", []],
      ["Nullen", "button", "Verbrauch", 2, "fuel", []],
    ])
    const [status, mode, target, , , timer, runtime] = auto.entry.controls
    expect(status).toMatchObject({ read: `${S}status_line`, small: true })
    // Power as a mode of its own: four buttons on the view.
    expect(mode).toMatchObject({
      read: `${S}view`,
      write: "schaltli/cmnd/heater/view",
      options: ["off", "target", "power", "fan"],
      labels: ["Aus", "Temperatur", "Leistung", "Lüften"],
    })
    // The handle is the target, the fill the room; up to 30 °C.
    expect(target).toMatchObject({ read: `${S}target`, current: "schaltli/state/temp/1/value", min: 12, max: 30, unit: "°C" })
    // The egg timer: switched on, a dial whose handle is the runtime set and whose fill is what is left.
    expect(timer).toMatchObject({ read: `${S}timer_on`, write: "schaltli/cmnd/heater/timer_on", look: "switch" })
    expect(runtime).toMatchObject({
      read: `${S}runtime`,
      current: `${S}runtime_left`,
      write: "schaltli/cmnd/heater/runtime",
      min: 0,
      max: 600,
      step: 15,
      shownWhen: { topic: `${S}timer_on`, values: ["on"] },
    })
    expect(auto.entry.controls.at(-1)).toMatchObject({ kind: "button", write: "schaltli/cmnd/heater/fuel", payload: "reset", size: "xs" })
    // The timer stays a block of its own.
    expect(auto.listed).toEqual(["Autoterm", "Autoterm Timer"])

    const plain = describe(RECORDED.heater)
    expect(plain.entry.controls.map((c) => c.part)).toEqual(["Betrieb", "Zieltemperatur", "Raumtemperatur"])
    expect(plain.entry.controls[0]).toMatchObject({ options: ["off", "heat"] })
    expect(plain.listed).toEqual(["Heizung", "Heizung Timer"])
  })

  test("the status line: the state, or the fault while there is one - the heater's own or one the bridge sees", () => {
    const logic = createBridgeLogic()
    const S = "schaltli/state/heater/"
    const line = (autoterm1: Record<string, unknown>) => asMap(logic.flatten("heater", autotermAnswer(autoterm1)))[`${S}status_line`]
    expect(line({ heatstatus: "heating" })).toBe("Heizt")
    expect(line({ heatstatus: "no ignition error" })).toBe("Störung: Keine Zündung")
    const refused = { command: "Störung: Befehl nicht angenommen (keine Antwort von Pekaway)", startAt: null }
    const updates = logic.bridgeFaults(logic.flatten("heater", autotermAnswer({ heatstatus: "heating" })), refused, 0).updates
    expect(asMap(updates)[`${S}status_line`]).toBe(refused.command)
    // The heater's own fault comes first.
    const own = logic.bridgeFaults(logic.flatten("heater", autotermAnswer({ heatstatus: "flame-out" })), refused, 0).updates
    expect(asMap(own)[`${S}status_line`]).toBe("Störung: Flammabriss")
  })

  // The plan's risk: two switchers in one block, on the mode and on the
  // timer. Asked 2026-10-05: the whole block on the 4.3B, 800 x 480. Placed
  // as the designer places it, in the 4.3B's font (24), and laid out.
  for (const pixelsPerMm of [4, 8.66]) {
    test(`the Autoterm block placed at ${pixelsPerMm} px/mm: state, mode, the two dials side by side, the fuel beside «Nullen»`, () => {
      const logic = createBridgeLogic()
      const out = logic.things("heater", autotermAnswer({ heatstatus: "heating" })) as Record<string, object>
      const d = readDescription("schaltli/blocks/heater/config", JSON.stringify(out["schaltli/blocks/heater/config"]))
      if (!d || !("entry" in d)) throw new Error("not an entry")
      const entry = d.entry
      const parts = entry.controls.map((control, i) => ({ control: i, look: control.kind === "level" ? "dial" : catalogLooks(control)[0].id }))
      const font = { id: "f24", size: 24 }
      const built = buildEntry({ entry, rect: { x: 10, y: 10, width: 780, height: 460 }, palette: controlPalette("24bit"), font, options: { label: entry.label, look: "", icon: null, parts } })
      // The state is set small, in the Caption style the editor resolves.
      expect(built.objects.find((o) => asPlaceholders(o) === "{topic:schaltli/state/heater/status_line}")?.properties.blockTextStyle).toBe("caption")
      let next = 0
      const withIds = (o: any): any => ({ ...o, id: o.id || `o${next++}`, zIndex: o.zIndex ?? 0, children: o.children?.map(withIds) })
      const [laid] = layoutObjects([withIds(blockTable(built))], { pixelsPerMm })
      const cell: any = (laid.children ?? []).find((c: any) => c.properties.cell.column === 1)
      const rowsOf = (side: any) => [...side.children].sort((a: any, b: any) => a.properties.cell.row - b.properties.cell.row)
      const [statusRow, modeRow, controls, fuel] = rowsOf(cell)
      expect([statusRow.type, modeRow.type, controls.type, fuel.type]).toEqual(["text", "button-group", "table", "table"])
      expect(statusRow.width).toBe(cell.width)
      // The mode's dial beside the timer, half the width each.
      const [left, right] = [...controls.children].sort((a: any, b: any) => a.properties.cell.column - b.properties.cell.column)
      expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1)
      const switcherOf = (side: any) => rowsOf(side).find((r: any) => r.type === "switcher")
      expect(switcherOf(left).properties.topic).toBe("schaltli/state/heater/view")
      expect(switcherOf(left).children.map((p: any) => p.properties.comparisonValue)).toEqual(["target", "power", "fan"])
      // The timer is a switch, as the description asks (asked 2026-10-05).
      expect(rowsOf(right).map((r: any) => r.type)).toEqual(["switch", "switcher"])
      expect(switcherOf(right).properties.topic).toBe("schaltli/state/heater/timer_on")
      // The target dial: fill the room, handle the target, no longer 64 px.
      const dial = switcherOf(left).children[0].children[0].children[0]
      expect(dial).toMatchObject({ type: "dial", properties: { topic: "schaltli/state/temp/1/value", setpointTopic: "schaltli/state/heater/target" } })
      expect(dial.width).toBeGreaterThanOrEqual(100)
      // The two dials the same size, on one line: the sides stand at the
      // bottom of their row, so the timer's switch sits above its dial.
      const timerDial = switcherOf(right).children[0].children[0].children[0]
      expect(timerDial.width).toBe(dial.width)
      expect(left.y + left.height).toBe(right.y + right.height)
      expect(left.y + switcherOf(left).y + switcherOf(left).height).toBe(right.y + switcherOf(right).y + switcherOf(right).height)
      // «Nullen» in XS, which the editor applies when it places the block.
      expect(built.objects.find((o) => o.properties.text === "Nullen")?.properties.blockSizeStep).toBe("xs")
      // The fuel's line takes the width, «Nullen» what it needs beside it.
      const [line, button] = [...fuel.children].sort((a: any, b: any) => a.properties.cell.column - b.properties.cell.column)
      expect(asPlaceholders(line.children[0])).toBe("{topic:schaltli/state/heater/fuel_text}")
      expect(button.children[0]).toMatchObject({ type: "button", properties: { text: "Nullen" } })
      expect(line.width).toBeGreaterThan(button.width)
      for (const rows of [rowsOf(cell), rowsOf(left), rowsOf(right)]) {
        for (let i = 0; i + 1 < rows.length; i++) expect(rows[i].y + rows[i].height, `row ${i}`).toBeLessThanOrEqual(rows[i + 1].y)
      }
      expect(cell.properties.overflow).toBeUndefined()
      // On the 4.3B the whole block fits its 480 px with room to spare.
      if (pixelsPerMm === 8.66) expect(laid.properties.contentHeight ?? laid.height).toBeLessThanOrEqual(400)
    })
  }

  // bridge-blocks Task 4 (docs/2026-10-04-bridge-blocks.md): the MaxxFan as
  // one finished block, described beside its Home Assistant entities.
  test("the MaxxFan described: its mode, the temperature in auto, the speed by hand, cover and airflow - in place of its three entities", () => {
    const logic = createBridgeLogic()
    for (const answer of [RECORDED.maxxfan, BLE]) {
      const out = logic.things("maxxfan", answer) as Record<string, object>
      const described = readDescription("schaltli/blocks/maxxfan/config", JSON.stringify(out["schaltli/blocks/maxxfan/config"]))
      if (!described || !("entry" in described)) throw new Error(`not an entry: ${JSON.stringify(described)}`)
      const fan = described.entry
      expect(fan.skipped).toBeUndefined()
      expect(fan).toMatchObject({ name: "MaxxFan", icon: "mdi:fan", device: { id: "schaltli-vanpi", name: "VanPi" } })
      // Mode and cover, then what the mode shows: the slider, and the
      // airflow by hand and in auto (asked 2026-10-04).
      expect(fan.controls.map((c) => [c.part, c.kind, c.shownWhen?.values ?? []])).toEqual([
        ["Betrieb", "choice", []],
        ["Deckel", "switch", []],
        ["Temperatur", "level", ["auto"]],
        ["Geschwindigkeit", "level", ["fan_only"]],
        ["Luftrichtung", "switch", ["fan_only", "auto"]],
      ])
      expect(fan.controls[0]).toMatchObject({ options: ["off", "fan_only", "auto"], labels: ["Aus", "Hand", "Auto"] })
      expect(fan.controls[3]).toMatchObject({ min: 10, max: 100, step: 10, write: "schaltli/cmnd/maxxfan/speed" })

      // In the Block menu it stands in place of exactly the three it covers.
      const messages = Object.fromEntries(Object.entries(out).map(([topic, config]) => [topic, JSON.stringify(config)]))
      expect(readCatalog(messages).entries.map((e) => e.label)).toEqual(["MaxxFan"])
      expect(readCatalog(messages).entries[0].id).toBe("block maxxfan")
    }
  })

  test("the theme described: Hell with the sun, Dunkel with the moon - in place of its switch", () => {
    const out = createBridgeLogic().things("theme", null) as Record<string, object>
    const d = readDescription("schaltli/blocks/theme/config", JSON.stringify(out["schaltli/blocks/theme/config"]))
    if (!d || !("entry" in d)) throw new Error(`not an entry: ${JSON.stringify(d)}`)
    expect(d.entry.controls).toEqual([
      {
        kind: "switch",
        part: "Theme",
        read: "schaltli/state/theme",
        write: "schaltli/cmnd/theme",
        on: { read: "dark", write: "dark", label: "Dunkel", icon: "mdi:weather-night" },
        off: { read: "light", write: "light", label: "Hell", icon: "mdi:weather-sunny" },
      },
    ])
    const messages = Object.fromEntries(Object.entries(out).map(([topic, config]) => [topic, JSON.stringify(config)]))
    expect(readCatalog(messages).entries.map((e) => e.id)).toEqual(["block theme"])
  })

  test("a description is announced with the rest, and only again when it changes", () => {
    const logic = createBridgeLogic()
    const first = logic.announce("maxxfan", RECORDED.maxxfan, {})
    expect(first.publish.map((p: { topic: string }) => p.topic)).toContain("schaltli/blocks/maxxfan/config")
    const again = logic.announce("maxxfan", RECORDED.maxxfan, first.announced)
    expect(again.publish).toEqual([])
  })

  test("a renamed relay is announced again, a tank gone is cleared, an unreadable answer changes nothing", () => {
    const logic = createBridgeLogic()
    const { announced } = announceAll(logic)
    // The same answers again: nothing to say.
    for (const [kind, payload] of Object.entries(RECORDED)) expect(logic.announce(kind, payload, announced).publish, kind).toEqual([])
    expect(logic.announce("theme", null, announced).publish).toEqual([])

    const renamed = logic.announce("relay", RECORDED.relay.replace('"Relay3 Name":"Frischwasserpumpe"', '"Relay3 Name":"Pumpe"'), announced)
    expect(renamed.publish).toHaveLength(1)
    expect(renamed.publish[0].topic).toBe("homeassistant/switch/schaltli-vanpi/relay_3/config")
    expect(JSON.parse(renamed.publish[0].payload).name).toBe("Pumpe")

    const level = JSON.parse(RECORDED.level)
    delete level.level4
    const gone = logic.announce("level", JSON.stringify(level), announced)
    expect(gone.publish).toEqual([{ topic: "homeassistant/sensor/schaltli-vanpi/tank_4/config", payload: "" }])
    // A relay answer never clears a tank.
    expect(logic.announce("relay", RECORDED.relay, gone.announced).publish).toEqual([])

    expect(logic.announce("level", "not json", announced)).toEqual({ publish: [], announced })
    // Answers the bridge announces nothing for yet clear nothing either.
    expect(logic.announce("mppt", RECORDED.mppt, announced).publish).toEqual([])
  })

  // theme-topic (docs/2026-09-25-theme-topic.md): light or dark is kept by
  // the bridge itself, retained, and never goes to Pekaway.
  test("a theme command becomes the retained theme state, and nothing for Pekaway", () => {
    const logic = createBridgeLogic()
    const THEME = "schaltli/state/theme"
    const theme = (payload: string, now?: string) =>
      logic.command("schaltli/cmnd/theme", payload, now ? { [THEME]: now } : {})
    expect(theme("dark")).toEqual({ state: [{ topic: THEME, value: "dark" }] })
    expect(theme(" LIGHT ")).toEqual({ state: [{ topic: THEME, value: "light" }] })
    expect(theme("toggle", "dark")!.state[0].value).toBe("light")
    expect(theme("toggle", "light")!.state[0].value).toBe("dark")
    // Never switched is light, so the first toggle is dark.
    expect(theme("toggle")!.state[0].value).toBe("dark")
    expect(theme("dark")).not.toHaveProperty("publish")

    // After a restart the bridge learns the retained value from the broker.
    expect(logic.seen({}, THEME, "dark")).toEqual({ [THEME]: "dark" })
    expect(logic.seen({}, THEME, "purple")).toEqual({})
    expect(logic.seen({}, "schaltli/state/relay/1/power", "on")).toEqual({})
  })
})

test.describe("VanPi bridge flow", () => {
  const flow = buildBridgeFlow({ intervalSeconds: 2 })

  test("is one self-contained tab: every wire, broker and node inside it", () => {
    expect(flow.id).toBe(TAB_ID)
    const ids = new Set([...flow.nodes, ...flow.configs].map((n: { id: string }) => n.id))
    expect(ids.size).toBe(flow.nodes.length + flow.configs.length)
    for (const node of [...flow.nodes, ...flow.configs]) {
      expect(node.z, node.id).toBe(TAB_ID)
      for (const output of node.wires || []) for (const target of output) expect(ids.has(target), `${node.id} -> ${target}`).toBe(true)
      // The config node's own "broker" field is its address; every other
      // node's names the config node.
      if (node.broker && node.type !== "mqtt-broker") expect(node.broker).toBe(BROKER_ID)
    }
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    expect(byId["sbb-state-out"].retain).toBe("true")
    expect(byId["sbb-cmnd-out"].retain).toBe("false")
    expect(byId["sbb-tele-in"].topic).toBe("pkw/tele/+")
    expect(byId["sbb-cmnd-in"].topic).toBe("schaltli/cmnd/#")
    expect(byId["sbb-poll"].repeat).toBe("2")
  })

  // Runs a function node's On Start and body the way Node-RED does: code
  // with msg, node, context and flow in scope.
  function nodeRedFunction(node: { initialize: string; func: string }, flowContext: Map<string, unknown>) {
    const own = new Map<string, unknown>()
    const context = { get: (k: string) => own.get(k), set: (k: string, v: unknown) => own.set(k, v) }
    const flowApi = { get: (k: string) => flowContext.get(k), set: (k: string, v: unknown) => flowContext.set(k, v) }
    const status: unknown[] = []
    // What the node sends later, from a timer, rather than returns.
    const sent: unknown[] = []
    const nodeApi = { status: (s: unknown) => status.push(s), send: (m: unknown) => sent.push(m), warn: () => {}, error: () => {} }
    new Function("context", "flow", "node", node.initialize)(context, flowApi, nodeApi)
    const body = new Function("msg", "context", "flow", "node", node.func)
    return { run: (msg: unknown) => body(msg, context, flowApi, nodeApi), status, sent }
  }

  test("its function nodes do on Node-RED's terms what the logic promises", () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    const flowContext = new Map<string, unknown>()

    const requests = nodeRedFunction(byId["sbb-requests"], flowContext).run({})
    expect(requests[0].map((m: { topic: string }) => m.topic)).toContain("pkw/stat/relay")

    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const published = values.run({ topic: "pkw/tele/relay", payload: RECORDED.relay })
    expect(published[0]).toContainEqual({ topic: "schaltli/state/relay/6/power", payload: "on", retain: true })
    // Its relays announced, and the theme with the first answer, retained.
    const announced = published[0].filter((m: { topic: string }) => m.topic.startsWith("homeassistant/"))
    expect(announced.map((m: { topic: string }) => m.topic)).toContain("homeassistant/switch/schaltli-vanpi/relay_6/config")
    expect(announced.map((m: { topic: string }) => m.topic)).toContain("homeassistant/switch/schaltli-vanpi/theme/config")
    expect(announced.every((m: { retain: boolean }) => m.retain)).toBe(true)
    // The same answer again publishes nothing.
    expect(values.run({ topic: "pkw/tele/relay", payload: RECORDED.relay })).toBeNull()

    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    const [toPekaway, refresh] = commands.run({ topic: "schaltli/cmnd/relay/6", payload: "toggle" })
    expect(toPekaway).toEqual([{ topic: "pkw/cmnd/relay/6/POWER", payload: "off", retain: false }])
    expect(refresh).toEqual({ topic: "pkw/stat/relay", payload: "" })
    expect(commands.run({ topic: "schaltli/cmnd/relay/6", payload: "maybe" })).toBeNull()

    // The theme: third output, the retained state node, and only on a change.
    expect(byId["sbb-commands"].wires[2]).toEqual(["sbb-state-out"])
    const dark = commands.run({ topic: "schaltli/cmnd/theme", payload: "dark" })
    expect(dark).toEqual([null, null, [{ topic: "schaltli/state/theme", payload: "dark", retain: true }], null])
    expect(commands.run({ topic: "schaltli/cmnd/theme", payload: "dark" })).toBeNull()
    expect(commands.run({ topic: "schaltli/cmnd/theme", payload: "toggle" })![2][0].payload).toBe("light")
  })

  test("a heater timer through the nodes: started by its command, counted down by the answers", () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    const flowContext = new Map<string, unknown>()
    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const heater = (on: boolean) => ({ topic: "pkw/tele/heater", payload: JSON.stringify({ ...JSON.parse(RECORDED.heater), heatertoggle: on }) })
    const timerIn = (out: { topic: string; payload: string }[][] | null) =>
      out?.[0]?.find((m) => m.topic === "schaltli/state/heater/timer")?.payload

    // The heater off, no timer: 0.
    expect(timerIn(values.run(heater(false)))).toBe("0")
    const [toPekaway, , shown] = commands.run({ topic: "schaltli/cmnd/heater/timer", payload: "90" })
    expect(toPekaway).toEqual([{ topic: "pkw/cmnd/heater/POWER/25/90", payload: "on", retain: false }])
    expect(shown).toEqual([{ topic: "schaltli/state/heater/timer", payload: "90", retain: true }])
    // Pekaway answers it is on; 90 is already shown.
    expect(timerIn(values.run(heater(true)))).toBeUndefined()
    // Half an hour later.
    const timer = flowContext.get("schaltliTimer") as { until: number; since: number }
    timer.until -= 30 * 60000
    timer.since -= 30 * 60000
    expect(timerIn(values.run(heater(true)))).toBe("60")
    // Switched off: 0.
    expect(timerIn(values.run(heater(false)))).toBe("0")
    expect(flowContext.get("schaltliTimer")).toBeNull()
  })

  test("an Autoterm through the nodes: its commands go to Pekaway's HTTP API, a target set while off stays shown", () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    expect(byId["sbb-commands"].wires[3]).toEqual(["sbb-http-out"])
    expect(byId["sbb-http-out"]).toMatchObject({ type: "http request", method: "use", url: "" })
    const flowContext = new Map<string, unknown>()
    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const autoterm = (autoterm1: Record<string, unknown>) => ({
      topic: "pkw/tele/heater",
      payload: JSON.stringify({ ...JSON.parse(RECORDED.heater), autoterm1: {
        heatertoggle: false, heatstatus: "standby", heattemp: "29", heaterror: "no", targettemp_vanpi: 25,
        mode: "off", fanspeed: 0, powerlevel: 0, runtime_m: 0, runtime_remaining_s: 0, ...autoterm1,
      } }),
    })
    const targetIn = (out: { topic: string; payload: string }[][] | null) =>
      out?.[0]?.find((m) => m.topic === "schaltli/state/heater/target")?.payload

    // The answer recorded in the van on 2026-10-05, the Autoterm in standby.
    expect(targetIn(values.run(autoterm({})))).toBe("25")
    const [toMqtt, ask, , toHttp] = commands.run({ topic: "schaltli/cmnd/heater", payload: "heat" })
    expect(toMqtt).toBeNull()
    expect(toHttp).toEqual([{ method: "PUT", url: "http://127.0.0.1:1880/autoterm/temp/25", payload: "" }])
    expect(ask).toEqual({ topic: "pkw/stat/heater", payload: "" })

    // Off again, a new target: shown at once, and still while Pekaway says 25.
    values.run(autoterm({ mode: "off" }))
    const [, , shown, none] = commands.run({ topic: "schaltli/cmnd/heater/target", payload: "22" })
    expect(shown).toEqual([{ topic: "schaltli/state/heater/target", payload: "22", retain: true }])
    expect(none).toBeNull()
    expect(targetIn(values.run(autoterm({})))).toBeUndefined()
    // Switched on, it starts at 22; Pekaway then reports 22 and the bridge lets go.
    expect(commands.run({ topic: "schaltli/cmnd/heater", payload: "heat" })[3][0].url).toBe("http://127.0.0.1:1880/autoterm/temp/22")
    values.run(autoterm({ mode: "temp mode", heatertoggle: true, targettemp_vanpi: 22 }))
    expect(flowContext.get("schaltliKept")).toBeNull()
    // Then set in Pekaway's own dashboard: shown as it is.
    expect(targetIn(values.run(autoterm({ mode: "temp mode", heatertoggle: true, targettemp_vanpi: 24 })))).toBe("24")
  })

  test("a refused command through the nodes: the HTTP answer becomes the heater's fault, the next taken one clears it", () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    expect(byId["sbb-http-out"].wires).toEqual([["sbb-http-answer"]])
    const flowContext = new Map<string, unknown>()
    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    const answered = nodeRedFunction(byId["sbb-http-answer"], flowContext)
    const heater = {
      topic: "pkw/tele/heater",
      payload: JSON.stringify({ ...JSON.parse(RECORDED.heater), autoterm1: { heatstatus: "standby", mode: "off", targettemp_vanpi: 22 } }),
    }
    const faultIn = (out: { topic: string; payload: string }[][] | null) => out?.[0]?.find((m) => m.topic === "schaltli/state/heater/fault")?.payload
    expect(faultIn(values.run(heater))).toBe("")
    commands.run({ topic: "schaltli/cmnd/heater", payload: "heat" })
    answered.run({ statusCode: "ECONNREFUSED", payload: "Error: connect ECONNREFUSED 127.0.0.1:1880" })
    expect(faultIn(values.run(heater))).toBe("Störung: Befehl nicht angenommen (keine Antwort von Pekaway)")
    expect(answered.status.at(-1)).toMatchObject({ fill: "red" })
    answered.run({ statusCode: 200, payload: "autotermRes: autoterm stop command received" })
    expect(faultIn(values.run(heater))).toBe("")
  })

  test("a runtime dial dragged through the nodes: shown at once, only the last value to Pekaway once it rests", async () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    const flowContext = new Map<string, unknown>()
    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    values.run({
      topic: "pkw/tele/heater",
      payload: JSON.stringify({ ...JSON.parse(RECORDED.heater), autoterm1: { heatstatus: "only fan", mode: "fan only", fanspeed: 8, runtime_m: 60, runtime_remaining_s: 3500 } }),
    })
    // Nine values in a drag, as in the van: each shown, none sent yet.
    for (const minutes of ["55", "50", "35", "25", "20", "15", "10", "5", "5"]) {
      const out = commands.run({ topic: "schaltli/cmnd/heater/runtime", payload: minutes })
      expect(out === null || out[3] === null).toBe(true)
    }
    expect(commands.sent).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 700))
    // Once it rests: one request, at the last value rounded to Pekaway's 15.
    expect(commands.sent).toHaveLength(1)
    const [, ask, , requests] = commands.sent[0] as any[]
    expect(requests).toEqual([{ method: "PUT", url: "http://127.0.0.1:1880/autoterm/vent/8?runtime=15", payload: "" }])
    expect(ask).toEqual({ topic: "pkw/stat/heater", payload: "" })
    // And an answer still counting from the old runtime does not throw it back.
    const behind = values.run({
      topic: "pkw/tele/heater",
      payload: JSON.stringify({ ...JSON.parse(RECORDED.heater), autoterm1: { heatstatus: "only fan", mode: "fan only", fanspeed: 8, runtime_m: 60, runtime_remaining_s: 3400 } }),
    })
    expect(behind?.[0]?.find((m: { topic: string }) => m.topic === "schaltli/state/heater/runtime")).toBeUndefined()
  })

  test("an Autoterm's fuel through the nodes: read back after a restart, counted, set to zero", () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    for (const id of ["sbb-fuel-in", "sbb-fuel-since-in"]) expect(byId[id].wires).toEqual([["sbb-theme-seen"]])
    const flowContext = new Map<string, unknown>()
    const remember = nodeRedFunction(byId["sbb-theme-seen"], flowContext)
    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    const S = "schaltli/state/heater/"
    // What the broker kept from before the restart.
    remember.run({ topic: `${S}fuel`, payload: "2.100" })
    remember.run({ topic: `${S}fuel_since`, payload: "2024-12-05T17:00:00.000Z" })
    const answer = {
      topic: "pkw/tele/heater",
      payload: JSON.stringify({ ...JSON.parse(RECORDED.heater), autoterm1: { heatstatus: "heating", mode: "temp mode", heatertoggle: true, heatglow: 1.6, targettemp_vanpi: 22 } }),
    }
    const fuelIn = (out: { topic: string; payload: string }[][] | null) => out?.[0]?.find((m) => m.topic === `${S}fuel`)?.payload
    expect(fuelIn(values.run(answer))).toBe("2.100")
    const [, , zero] = commands.run({ topic: "schaltli/cmnd/heater/fuel", payload: "reset" })
    expect(zero.find((m: { topic: string }) => m.topic === `${S}fuel`)).toEqual({ topic: `${S}fuel`, payload: "0.000", retain: true })
    expect(zero.find((m: { topic: string }) => m.topic === `${S}fuel_text`).payload).toMatch(/^0\.000 l seit \d\d\.\d\d\.\d{4} \d\d:\d\dh$/)
    // Its own publication coming back does not undo the reset.
    remember.run({ topic: `${S}fuel`, payload: "0.000" })
    expect((flowContext.get("schaltliFuel") as { ml: number }).ml).toBe(0)
  })

  test("a MaxxFan command with the BLE flow heard goes nowhere, and says why", () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    const flowContext = new Map<string, unknown>()
    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    values.run({ topic: "pkw/tele/maxxfan", payload: RECORDED.maxxfan })
    expect(commands.run({ topic: "schaltli/cmnd/maxxfan/speed", payload: "50" })[0]).toEqual([
      { topic: "pkw/cmnd/maxxfan/speed", payload: "5", retain: false },
    ])
    values.run({ topic: "pkw/tele/maxxfan", payload: BLE })
    // Pekaway's shape after B: nothing.
    expect(values.run({ topic: "pkw/tele/maxxfan", payload: RECORDED.maxxfan })).toBeNull()
    expect(commands.run({ topic: "schaltli/cmnd/maxxfan/speed", payload: "50" })).toBeNull()
    expect(commands.status.at(-1)).toEqual({ text: "schaltli/cmnd/maxxfan/speed = 50, for the MaxxFan's BLE flow" })
  })

  // Pekaway files a dimmer level only 200 ms after the last command, so while
  // a slider is dragged its answers are a step behind. The level is shown the
  // moment it is commanded, as Pekaway's own dashboard shows it, and an answer
  // saying otherwise is set aside for HOLD_MS - then Pekaway's word wins again.
  test("a dimmer level is shown when commanded, and an answer behind it is set aside for a while", async () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    const flowContext = new Map<string, unknown>()
    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const answer = (level: number) =>
      JSON.stringify({ dimmer1: { state: level, name: "Dimmer 1", autooff: 0, offtime: null } })

    // Where the lamp was before.
    values.run({ topic: "pkw/tele/dimmer", payload: answer(20) })

    // A drag: three levels in quick succession. Each goes to Pekaway and is
    // shown at once; Pekaway is asked for its state once, after the last -
    // not after each, which jammed Node-RED on the van.
    for (const level of ["30", "45"]) commands.run({ topic: "schaltli/cmnd/dimmer/1", payload: level })
    const [toPekaway, refresh, shown] = commands.run({ topic: "schaltli/cmnd/dimmer/1", payload: "55" })
    expect(toPekaway).toEqual([{ topic: "pkw/cmnd/dimmer/1/POWER", payload: "55", retain: false }])
    expect(refresh).toBeNull()
    // The level, and the level "on" goes back to; on was already shown.
    expect(shown).toEqual([
      { topic: "schaltli/state/dimmer/1/level", payload: "55", retain: true },
      { topic: "schaltli/state/dimmer/1/on_level", payload: "55", retain: true },
    ])
    expect(commands.sent).toEqual([])
    await new Promise((r) => setTimeout(r, 250))
    expect(commands.sent).toEqual([[null, { topic: "pkw/stat/dimmer", payload: "" }, null]])

    // Pekaway still answers the old level: nothing goes out, the 55 stays.
    expect(values.run({ topic: "pkw/tele/dimmer", payload: answer(20) })).toBeNull()
    // It answers the new one: nothing to say either, it is already shown.
    expect(values.run({ topic: "pkw/tele/dimmer", payload: answer(55) })).toBeNull()

    // Once the hold has run out, a level Pekaway did not take comes back.
    const holds = flowContext.get("schaltliHolds") as Record<string, { until: number }>
    for (const hold of Object.values(holds)) hold.until = Date.now() - 1
    const corrected = values.run({ topic: "pkw/tele/dimmer", payload: answer(40) })
    expect(corrected[0]).toContainEqual({ topic: "schaltli/state/dimmer/1/level", payload: "40", retain: true })

    // Off is a level too, shown at once; the level "on" goes back to stays.
    expect(commands.run({ topic: "schaltli/cmnd/dimmer/1", payload: "off" })[2]).toEqual([
      { topic: "schaltli/state/dimmer/1/level", payload: "0", retain: true },
      { topic: "schaltli/state/dimmer/1/power", payload: "off", retain: true },
    ])
    expect(commands.run({ topic: "schaltli/cmnd/dimmer/1", payload: "on" })[0]).toEqual([
      { topic: "pkw/cmnd/dimmer/1/POWER", payload: "40", retain: false },
    ])
  })

  test("the hold lets through what agrees, and forgets itself", () => {
    const logic = createBridgeLogic()
    const now = 1_000_000
    const holds = logic.hold({}, [{ topic: "t/a", value: "55" }], now)
    const answer = [{ topic: "t/a", value: "20" }, { topic: "t/b", value: "7" }]
    expect(logic.held(answer, holds, now + 100)).toEqual([{ topic: "t/b", value: "7" }])
    expect(logic.held([{ topic: "t/a", value: "55" }], holds, now + 100)).toEqual([{ topic: "t/a", value: "55" }])
    expect(logic.held(answer, holds, now + logic.HOLD_MS)).toEqual(answer)
    // A later hold drops the ones that have run out.
    expect(Object.keys(logic.hold(holds, [{ topic: "t/c", value: "1" }], now + logic.HOLD_MS + 1))).toEqual(["t/c"])
  })

  test("after a restart, a toggle starts from the theme the broker still holds", () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    const flowContext = new Map<string, unknown>()
    expect(byId["sbb-theme-in"].topic).toBe("schaltli/state/theme")
    expect(byId["sbb-theme-in"].wires).toEqual([["sbb-theme-seen"]])
    // The retained value arrives on subscribing ...
    nodeRedFunction(byId["sbb-theme-seen"], flowContext).run({ topic: "schaltli/state/theme", payload: "dark" })
    // ... so a toggle gives light, not a second dark.
    const commands = nodeRedFunction(byId["sbb-commands"], flowContext)
    expect(commands.run({ topic: "schaltli/cmnd/theme", payload: "toggle" })![2][0].payload).toBe("light")
  })
})

// scripts/install-vanpi-bridge.js against a stand-in for Node-RED's admin API
// that behaves the way the real one did on the reference van: POST /flow
// ignores the tab id it is sent and assigns its own, keeps the ids of the
// nodes inside, and refuses a flow whose node ids already exist. The first
// version of the installer looked for its tab by the id it had sent, found
// nothing on the second install, and was refused with "duplicate id".
test.describe("installing the VanPi bridge", () => {
  type FlowNode = { id: string; type: string; z?: string; topic?: string; label?: string }
  let server: Server
  let base = ""
  let flows: FlowNode[] = []

  const readBody = (req: IncomingMessage) =>
    new Promise<any>((resolve) => {
      let text = ""
      req.on("data", (c) => (text += c))
      req.on("end", () => resolve(text ? JSON.parse(text) : null))
    })

  test.beforeAll(async () => {
    server = createServer(async (req, res) => {
      const send = (status: number, body?: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" })
        res.end(body === undefined ? "" : JSON.stringify(body))
      }
      const url = req.url || ""
      if (req.method === "GET" && url === "/flows") return send(200, { flows, rev: "1" })
      if (req.method === "POST" && url === "/flow") {
        const flow = await readBody(req)
        const inside = [...flow.nodes, ...(flow.configs || [])]
        if (inside.some((n: FlowNode) => flows.some((f) => f.id === n.id))) {
          return send(400, { code: "unexpected_error", message: "duplicate id" })
        }
        const id = `nr-${Math.random().toString(16).slice(2, 10)}`
        flows.push({ id, type: "tab", label: flow.label })
        for (const n of inside) flows.push({ ...n, z: id })
        return send(200, { id })
      }
      const match = url.match(/^\/flow\/([^/]+)$/)
      if (match && req.method === "PUT") {
        const flow = await readBody(req)
        if (flow.id !== match[1]) return send(400, { code: "invalid_request", message: "id mismatch" })
        if (!flows.some((f) => f.id === match[1] && f.type === "tab")) return send(404)
        flows = flows.filter((f) => f.z !== match[1])
        for (const n of [...flow.nodes, ...(flow.configs || [])]) flows.push({ ...n, z: match[1] })
        return send(204)
      }
      if (match && req.method === "DELETE") {
        flows = flows.filter((f) => f.id !== match[1] && f.z !== match[1])
        return send(204)
      }
      send(404)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  test.afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  const install = (...args: string[]) =>
    new Promise<{ code: number; output: string }>((resolve) => {
      const child = spawn(process.execPath, [path.join(__dirname, "..", "scripts", "install-vanpi-bridge.js"), "--node-red", base, ...args], {
        env: { ...process.env, HOME: path.join(__dirname, "..", ".data", "no-home"), USERPROFILE: path.join(__dirname, "..", ".data", "no-home") },
      })
      let output = ""
      child.stdout.on("data", (c) => (output += c))
      child.stderr.on("data", (c) => (output += c))
      child.on("close", (code) => resolve({ code: code ?? 1, output }))
    })

  const installWithHome = (home: string) =>
    new Promise<{ code: number; output: string }>((resolve) => {
      const child = spawn(process.execPath, [path.join(__dirname, "..", "scripts", "install-vanpi-bridge.js"), "--node-red", base], {
        env: { ...process.env, HOME: home, USERPROFILE: home },
      })
      let output = ""
      child.stdout.on("data", (c) => (output += c))
      child.stderr.on("data", (c) => (output += c))
      child.on("close", (code) => resolve({ code: code ?? 1, output }))
    })

  const bridgeTabs = () => flows.filter((f) => f.id === BROKER_ID).map((b) => b.z)

  test("adds the tab once, updates it in place, and removes it, leaving Pekaway's flows alone", async () => {
    flows = [
      { id: "pekaway-tab", type: "tab", label: "MQTT API" },
      { id: "pekaway-batt", type: "mqtt in", z: "pekaway-tab", topic: "pkw/stat/batt" },
    ]

    const first = await install()
    expect(first.code, first.output).toBe(0)
    expect(first.output).toContain("added the Schaltli VanPi Bridge tab")
    expect(bridgeTabs()).toHaveLength(1)
    const tab = bridgeTabs()[0]
    expect(tab).not.toBe(TAB_ID)

    const second = await install("--interval", "3")
    expect(second.code, second.output).toBe(0)
    expect(second.output).toContain("updated the Schaltli VanPi Bridge tab (asks every 3 s)")
    expect(bridgeTabs()).toEqual([tab])
    expect(flows.find((f) => f.id === "sbb-poll")).toMatchObject({ z: tab, repeat: "3" })

    const removed = await install("--uninstall")
    expect(removed.code, removed.output).toBe(0)
    expect(bridgeTabs()).toEqual([])
    expect(flows.filter((f) => f.z === tab || f.id === tab)).toEqual([])
    expect(flows.map((f) => f.id)).toEqual(["pekaway-tab", "pekaway-batt"])
  })

  test("keeps a copy of the flows from before each install, the newest three", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-home-"))
    const nodeRedDir = path.join(home, ".node-red")
    fs.mkdirSync(nodeRedDir)
    for (const stamp of ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"]) {
      fs.writeFileSync(path.join(nodeRedDir, `flows.pre_schaltli_bridge_${stamp}T00-00-00-000Z.json`), "[]")
    }
    flows = [
      { id: "pekaway-tab", type: "tab", label: "MQTT API" },
      { id: "pekaway-batt", type: "mqtt in", z: "pekaway-tab", topic: "pkw/stat/batt" },
    ]
    const result = await installWithHome(home)
    expect(result.code, result.output).toBe(0)
    const copies = fs.readdirSync(nodeRedDir).filter((f) => f.startsWith("flows.pre_schaltli_bridge_")).sort()
    expect(copies).toHaveLength(3)
    // The one just made holds Pekaway's flows as they were.
    expect(JSON.parse(fs.readFileSync(path.join(nodeRedDir, copies[2]), "utf8")).map((f: FlowNode) => f.id)).toEqual(["pekaway-tab", "pekaway-batt"])
    fs.rmSync(home, { recursive: true, force: true })
  })

  test("does nothing, and says so, on a Node-RED without Pekaway's API", async () => {
    flows = [{ id: "someone-else", type: "tab", label: "Home" }]
    const result = await install()
    expect(result.code).toBe(0)
    expect(result.output).toContain("not a VanPi, nothing to do")
    expect(flows).toHaveLength(1)
  })
})
