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

const asMap = (updates: { topic: string; value: string }[]) => Object.fromEntries(updates.map((u) => [u.topic, u.value]))

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

    expect(asMap(logic.flatten("maxxfan", RECORDED.maxxfan))).toMatchObject({
      "schaltli/state/maxxfan/power": "off",
      "schaltli/state/maxxfan/speed": "3",
      "schaltli/state/maxxfan/vent": "close",
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
    // The same topic in a user-built shape (the reference van has one) is not read.
    expect(logic.flatten("maxxfan", '{"mode":"OFF","speed":90}')).toEqual([])
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
    expect(logic.command("schaltli/cmnd/dimmer/8", "toggle", state).publish[0].payload).toBe("off")
    expect(logic.command("schaltli/cmnd/dimmer/1", "toggle", state).publish[0].payload).toBe("on")
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
    const nodeApi = { status: (s: unknown) => status.push(s), warn: () => {}, error: () => {} }
    new Function("context", "flow", "node", node.initialize)(context, flowApi, nodeApi)
    const body = new Function("msg", "context", "flow", "node", node.func)
    return { run: (msg: unknown) => body(msg, context, flowApi, nodeApi), status }
  }

  test("its function nodes do on Node-RED's terms what the logic promises", () => {
    const byId = Object.fromEntries(flow.nodes.map((n: { id: string }) => [n.id, n]))
    const flowContext = new Map<string, unknown>()

    const requests = nodeRedFunction(byId["sbb-requests"], flowContext).run({})
    expect(requests[0].map((m: { topic: string }) => m.topic)).toContain("pkw/stat/relay")

    const values = nodeRedFunction(byId["sbb-values"], flowContext)
    const published = values.run({ topic: "pkw/tele/relay", payload: RECORDED.relay })
    expect(published[0]).toContainEqual({ topic: "schaltli/state/relay/6/power", payload: "on", retain: true })
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
    expect(dark).toEqual([null, null, [{ topic: "schaltli/state/theme", payload: "dark", retain: true }]])
    expect(commands.run({ topic: "schaltli/cmnd/theme", payload: "dark" })).toBeNull()
    expect(commands.run({ topic: "schaltli/cmnd/theme", payload: "toggle" })![2][0].payload).toBe("light")
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
