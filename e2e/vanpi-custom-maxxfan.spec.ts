import { test, expect } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

// The MaxxFan's BLE flow in vanpi-custom (block plan Task 12): once the
// VanPi bridge has heard it, schaltli/cmnd/maxxfan/<part> is left to this
// flow, which turns each command into the BLE controller's JSON on
// ble/<mac>/command/set. The flow lives in the vanpi-custom repository, next
// to this one; without a checkout there is nothing to test.
//
// Run on the van at Checkpoint C; this keeps what was seen there.

const FLOW = path.join(__dirname, "..", "..", "vanpi-custom", "flows", "maxxfan.json")

type FlowNode = { id: string; type: string; topic?: string; func?: string; wires?: string[][] }

function loadFlow(): FlowNode[] | null {
  return fs.existsSync(FLOW) ? JSON.parse(fs.readFileSync(FLOW, "utf8")) : null
}

// Runs a function node's body the way Node-RED does, with msg, node, context
// and flow in scope.
function nodeRedFunction(node: FlowNode, flowState: Record<string, unknown>) {
  const own = new Map<string, unknown>()
  const context = { get: (k: string) => own.get(k), set: (k: string, v: unknown) => own.set(k, v) }
  const flow = { get: (k: string) => flowState[k], set: (k: string, v: unknown) => (flowState[k] = v) }
  const warnings: string[] = []
  const sent: { payload: string }[] = []
  const nodeApi = { warn: (w: string) => warnings.push(w), send: (m: { payload: string }) => sent.push(m), error: () => {} }
  const body = new Function("msg", "context", "flow", "node", node.func!)
  return {
    run: (topic: string, payload: string) => body({ topic, payload }, context, flow, nodeApi) as { payload: string } | null,
    warnings,
    sent,
  }
}

test.describe("vanpi-custom: the MaxxFan's BLE flow takes Schaltli commands", () => {
  const nodes = loadFlow()
  test.skip(!nodes, `vanpi-custom is not checked out next to this repository (${FLOW})`)

  const byId = () => Object.fromEntries(nodes!.map((n) => [n.id, n]))
  const fn = (state: Record<string, unknown> = {}) => nodeRedFunction(byId()["mf_fn_schaltli"], { maxxfan: state })
  const json = (out: { payload: string } | null) => (out ? JSON.parse(out.payload) : null)

  test("it listens on schaltli/cmnd/maxxfan/# and sends to the controller's command topic", () => {
    const inNode = nodes!.find((n) => n.type === "mqtt in" && n.topic === "schaltli/cmnd/maxxfan/#")
    expect(inNode, "an mqtt in on schaltli/cmnd/maxxfan/#").toBeTruthy()
    expect(inNode!.wires).toEqual([["mf_fn_schaltli"]])
    expect(byId()["mf_fn_schaltli"].wires).toEqual([["mf_mqtt_out"]])
    expect(byId()["mf_mqtt_out"].topic).toMatch(/^ble\/.+\/command\/set$/)
  })

  test("mode, power, cover and airflow become the controller's words at once", () => {
    const f = fn({ mode: "OFF" })
    expect(json(f.run("schaltli/cmnd/maxxfan/mode", "auto"))).toEqual({ mode: "AUTO" })
    expect(json(f.run("schaltli/cmnd/maxxfan/mode", " Manual "))).toEqual({ mode: "MANUAL" })
    // Home Assistant's climate word for by hand (the bridge announces the MaxxFan as a climate).
    expect(json(f.run("schaltli/cmnd/maxxfan/mode", "fan_only"))).toEqual({ mode: "MANUAL" })
    expect(json(f.run("schaltli/cmnd/maxxfan/power", "on"))).toEqual({ mode: "MANUAL" })
    expect(json(f.run("schaltli/cmnd/maxxfan/power", "off"))).toEqual({ mode: "OFF" })
    expect(json(f.run("schaltli/cmnd/maxxfan/cover", "open"))).toEqual({ cover: "OPEN" })
    expect(json(f.run("schaltli/cmnd/maxxfan/cover", "closed"))).toEqual({ cover: "CLOSED" })
    expect(json(f.run("schaltli/cmnd/maxxfan/airflow", "in"))).toEqual({ airflow: "IN" })
    // Power on while it runs leaves it as it is.
    expect(fn({ mode: "AUTO" }).run("schaltli/cmnd/maxxfan/power", "on")).toBeNull()
  })

  test("speed and temperature go once the slider rests, speed rounded to the controller's tens", async () => {
    const f = fn({ mode: "MANUAL" })
    for (const v of ["30", "40", "47"]) expect(f.run("schaltli/cmnd/maxxfan/speed", v)).toBeNull()
    await new Promise((r) => setTimeout(r, 400))
    expect(f.sent.map((m) => JSON.parse(m.payload))).toEqual([{ speed: 50 }])

    f.run("schaltli/cmnd/maxxfan/speed", "3")
    f.run("schaltli/cmnd/maxxfan/temperature", "22")
    await new Promise((r) => setTimeout(r, 400))
    // The last one wins.
    expect(f.sent.slice(1).map((m) => JSON.parse(m.payload))).toEqual([{ temperature: 22 }])
    f.run("schaltli/cmnd/maxxfan/speed", "3")
    await new Promise((r) => setTimeout(r, 400))
    expect(JSON.parse(f.sent.at(-1)!.payload)).toEqual({ speed: 10 })
  })

  test("an unknown part or a value out of range is dropped, and said so", () => {
    const f = fn()
    for (const [part, value] of [
      ["mode", "turbo"],
      ["power", "maybe"],
      ["speed", "0"],
      ["speed", "101"],
      ["speed", "fast"],
      ["temperature", "38"],
      ["cover", "ajar"],
      ["airflow", "up"],
      ["vent", "open"],
    ]) {
      expect(f.run(`schaltli/cmnd/maxxfan/${part}`, value), `${part} = ${value}`).toBeNull()
    }
    expect(f.warnings).toHaveLength(9)
    expect(f.warnings[0]).toContain("schaltli/cmnd/maxxfan/mode = turbo")
    expect(f.sent).toEqual([])
  })
})
