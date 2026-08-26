import { test, expect } from "@playwright/test"
import { spawn, type ChildProcess } from "child_process"
import mqtt from "mqtt"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"

// hil/simulate-project.js - the mock MQTT host that closes a Switch's round
// trip on a desk (2026-08-25).
//
// Why it exists: a Switch only changes what it shows when its read topic
// changes, and a tap only publishes to its write topic. In the camper,
// Node-RED closes that loop; anywhere else nothing does, so every
// interaction test had to happen in the vehicle. The mock derives the loop
// from the project itself - every Switch already declares both halves - so
// there is no configuration to write and, more to the point, no second copy
// of a fact that can drift from the first.
//
// Tested through the real script and a real broker rather than by importing
// its functions: the derivation is only half of it, and the half that
// actually broke interaction testing was the round trip. A unit test of the
// table would have passed while nothing ever answered.
//
// Needs `npm run hil:broker` (same as every other MQTT-dependent spec here).

const BROKER_WS = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"
const SCRIPT = path.join(__dirname, "..", "hil", "simulate-project.js")

// A Switch's derivation needs nothing but its own properties, so these
// fixtures are hand-built rather than exported through the designer - the
// script reads project.json and never looks at anything else.
function switchObject(id: string, readTopic: string, writeTopic: string, states: any[], mode?: string) {
  return {
    id,
    type: "Switch",
    zIndex: 0,
    x: 0,
    y: 0,
    width: 200,
    height: 46,
    properties: { topic: readTopic, writeTopic, ...(mode ? { mode } : {}), states },
  }
}

async function writeProjectZip(
  name: string,
  objects: any[],
  topics: any[] = [],
  extraScreens: any[] = [],
): Promise<string> {
  const project = {
    name,
    screenWidth: 360,
    screenHeight: 360,
    topics,
    assets: [],
    fonts: [],
    screens: [{ id: "s1", name: "Screen 1", objects }, ...extraScreens],
  }
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(project))
  const buf = await zip.generateAsync({ type: "nodebuffer" })
  const file = path.join(os.tmpdir(), `mock-sim-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, buf)
  return file
}

function runList(zipPath: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, zipPath, "--list"], { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    child.stdout.on("data", (d) => (out += d.toString()))
    child.stderr.on("data", (d) => (out += d.toString()))
    child.on("close", (code) => resolve({ code: code ?? -1, out }))
  })
}

// Starts the mock and waits until it says it is subscribed - publishing
// before that races the subscription and loses the message, which would
// look exactly like a broken mapping.
function startMock(zipPath: string, args: string[] = []): Promise<{ child: ChildProcess; out: () => string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, zipPath, ...args], { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    const timer = setTimeout(() => reject(new Error(`mock never reported listening:\n${out}`)), 20000)
    child.stdout.on("data", (d) => {
      out += d.toString()
      if (out.includes("listening on")) {
        clearTimeout(timer)
        resolve({ child, out: () => out })
      }
    })
    child.stderr.on("data", (d) => (out += d.toString()))
    child.on("close", () => {
      clearTimeout(timer)
      reject(new Error(`mock exited before listening:\n${out}`))
    })
  })
}

function connectObserver(clientId: string): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(BROKER_WS, { clientId })
    client.on("connect", () => resolve(client))
    client.on("error", reject)
  })
}

// Resolves with the first payload seen on `topic`, or null after `withinMs`.
// The null case is a real assertion in its own right - "nothing came back"
// is what --drop is supposed to produce.
function waitFor(client: mqtt.MqttClient, topic: string, withinMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), withinMs)
    client.on("message", (t, payload) => {
      if (t === topic) {
        clearTimeout(timer)
        resolve(payload.toString())
      }
    })
    client.subscribe(topic)
  })
}

test.describe("mock MQTT host", () => {
  test("derives the round trip from a Switch, and says what it cannot derive", async () => {
    const zipPath = await writeProjectZip("derive", [
      switchObject("sw-a", "state/a", "cmd/a", [
        { id: "a0", label: "AUS", readValue: "0", writeValue: "aus" },
        { id: "a1", label: "AN", readValue: "1", writeValue: "an" },
      ]),
      // Single-area mode derives identically - the mapping is a property of
      // the states, not of how they are drawn.
      switchObject(
        "sw-b",
        "state/b",
        "cmd/b",
        [
          { id: "b0", label: "AUS", readValue: "off", writeValue: "0", showMarker: false },
          { id: "b1", label: "AN", readValue: "on", writeValue: "1", showMarker: true },
        ],
        "single",
      ),
      // A half-filled state cannot take part in a round trip. Reported
      // rather than dropped silently: it is usually a state someone started
      // and did not finish, and that is worth seeing.
      switchObject("sw-c", "state/c", "cmd/c", [{ id: "c0", label: "Halb", readValue: "", writeValue: "x" }]),
      {
        id: "btn",
        type: "SoftwareButton",
        zIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        properties: { text: "Alles AUS", action: { type: "send-mqtt", mqttTopic: "cmd/all", mqttMessage: "aus" } },
      },
    ])

    const { code, out } = await runList(zipPath)
    expect(code).toBe(0)

    expect(out).toContain('cmd/a = "aus"  ->  state/a = "0"')
    expect(out).toContain('cmd/a = "an"  ->  state/a = "1"')
    expect(out).toContain('cmd/b = "0"  ->  state/b = "off"')
    expect(out).toContain('cmd/b = "1"  ->  state/b = "on"')
    expect(out).toContain("derived 4 mapping(s) from 2 command topic(s)")

    expect(out).toContain("no read value")

    // The honest half: a SoftwareButton's send-mqtt action says nothing
    // anywhere about what it should do to any state topic - that rule lives
    // only in the real automation. Naming it is the difference between "this
    // button is dead" and "this button is not describable yet".
    expect(out).toContain("have no derivable answer")
    expect(out).toContain('cmd/all = "aus"')

    fs.unlinkSync(zipPath)
  })

  test("two Switches claiming one command is a reported conflict, not a coin flip", async () => {
    const zipPath = await writeProjectZip("conflict", [
      switchObject("sw-first", "state/first", "cmd/shared", [
        { id: "f1", label: "AN", readValue: "1", writeValue: "an" },
      ]),
      switchObject("sw-second", "state/second", "cmd/shared", [
        { id: "s1", label: "AN", readValue: "9", writeValue: "an" },
      ]),
    ])

    const { out } = await runList(zipPath)
    // Guessing here would look exactly like a firmware bug later on.
    expect(out).toContain("CONFLICT")
    expect(out).toContain("keeping the first")
    expect(out).toContain("state/first")
    expect(out).toContain("state/second")

    fs.unlinkSync(zipPath)
  })

  test("a command gets answered with retained state - the loop a desk otherwise lacks", async ({}, testInfo) => {
    const tag = `t${testInfo.testId.replace(/[^a-z0-9]/gi, "")}`
    const cmd = `mock-${tag}/cmd/light`
    const state = `mock-${tag}/state/light`
    const zipPath = await writeProjectZip("roundtrip", [
      switchObject("sw", state, cmd, [
        { id: "s0", label: "AUS", readValue: "0", writeValue: "aus" },
        { id: "s1", label: "AN", readValue: "1", writeValue: "an" },
      ]),
    ])

    const mock = await startMock(zipPath)
    const observer = await connectObserver(`e2e-mock-obs-${testInfo.testId}`)
    try {
      const answer = waitFor(observer, state, 8000)
      observer.publish(cmd, "an")
      expect(await answer, "the mock should answer the command with the mapped state").toBe("1")

      // Retained, like the real thing: a device that reconnects reads its
      // state back off the broker, and a non-retained answer would leave
      // every reboot showing "?".
      const fresh = await connectObserver(`e2e-mock-retain-${testInfo.testId}`)
      try {
        expect(await waitFor(fresh, state, 5000), "the answer should be retained").toBe("1")
      } finally {
        fresh.end(true)
      }
    } finally {
      observer.publish(state, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      observer.end(true)
      mock.child.kill()
      fs.unlinkSync(zipPath)
    }
  })

  test("--drop leaves a command unanswered, which is what a timeout rollback needs", async ({}, testInfo) => {
    const tag = `t${testInfo.testId.replace(/[^a-z0-9]/gi, "")}`
    const cmd = `mock-${tag}/cmd/dropped`
    const state = `mock-${tag}/state/dropped`
    const zipPath = await writeProjectZip("drop", [
      switchObject("sw", state, cmd, [{ id: "s1", label: "AN", readValue: "1", writeValue: "an" }]),
    ])

    const mock = await startMock(zipPath, ["--drop", "dropped"])
    const observer = await connectObserver(`e2e-mock-drop-${testInfo.testId}`)
    try {
      const answer = waitFor(observer, state, 3000)
      observer.publish(cmd, "an")
      // Nothing comes back, on purpose - this is how the 3s rollback and the
      // hollow marker become observable without unplugging a real lamp.
      expect(await answer, "a dropped command must stay unanswered").toBeNull()
      expect(mock.out()).toContain("DROPPED")
    } finally {
      observer.end(true)
      mock.child.kill()
      fs.unlinkSync(zipPath)
    }
  })

  test("--delay holds the answer back long enough to watch the marker sit hollow", async ({}, testInfo) => {
    const tag = `t${testInfo.testId.replace(/[^a-z0-9]/gi, "")}`
    const cmd = `mock-${tag}/cmd/slow`
    const state = `mock-${tag}/state/slow`
    const zipPath = await writeProjectZip("delay", [
      switchObject("sw", state, cmd, [{ id: "s1", label: "AN", readValue: "1", writeValue: "an" }]),
    ])

    const mock = await startMock(zipPath, ["--delay", "1200"])
    const observer = await connectObserver(`e2e-mock-delay-${testInfo.testId}`)
    try {
      const answer = waitFor(observer, state, 8000)
      const sent = Date.now()
      observer.publish(cmd, "an")
      expect(await answer).toBe("1")
      const elapsed = Date.now() - sent
      // The lower bound is the assertion; the upper one only catches a
      // delay that is being ignored in the other direction.
      expect(elapsed, `answered after ${elapsed}ms, expected at least 1200ms`).toBeGreaterThanOrEqual(1100)
      expect(elapsed).toBeLessThan(6000)
    } finally {
      observer.publish(state, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      observer.end(true)
      mock.child.kill()
      fs.unlinkSync(zipPath)
    }
  })

  // Declared rules on the command topic (topics[].mock, 2026-08-25). Two
  // things needed them and neither is describable any other way: a
  // SoftwareButton's send-mqtt action, whose consequence lives only in the
  // real automation, and a rotary encoder publishing "up" - which is not a
  // mapping at all but arithmetic on a value no object in the project
  // names. Both had to be answerable before an interaction could be tested
  // anywhere but in the vehicle.
  test.describe("declared rules", () => {
    test("a rule sets a literal value, and one command can move several topics", async ({}, testInfo) => {
      const tag = `t${testInfo.testId.replace(/[^a-z0-9]/gi, "")}`
      const cmd = `mock-${tag}/cmd/all`
      const a = `mock-${tag}/state/a`
      const b = `mock-${tag}/state/b`
      const zipPath = await writeProjectZip("rules-set", [], [
        {
          id: "t-cmd",
          topic: cmd,
          type: "text",
          examples: ["aus"],
          // An "all off" button is exactly the case that made the rule live
          // on the command topic rather than on the state: one event, four
          // consequences, one place to read it.
          mock: [{ id: "r", when: "aus", then: [
            { id: "e1", topic: a, kind: "set", value: "0" },
            { id: "e2", topic: b, kind: "set", value: "0" },
          ] }],
        },
      ])

      const mock = await startMock(zipPath)
      const observer = await connectObserver(`e2e-rule-set-${testInfo.testId}`)
      try {
        const gotA = waitFor(observer, a, 8000)
        const gotB = waitFor(observer, b, 8000)
        observer.publish(cmd, "aus")
        expect(await gotA).toBe("0")
        expect(await gotB).toBe("0")
      } finally {
        for (const t of [a, b]) observer.publish(t, "", { retain: true })
        await new Promise((r) => setTimeout(r, 200))
        observer.end(true)
        mock.child.kill()
        fs.unlinkSync(zipPath)
      }
    })

    test("an add rule accumulates and clamps - a knob, not a lookup", async ({}, testInfo) => {
      const tag = `t${testInfo.testId.replace(/[^a-z0-9]/gi, "")}`
      const cmd = `mock-${tag}/cmd/dim`
      const level = `mock-${tag}/state/dim`
      const zipPath = await writeProjectZip("rules-add", [], [
        {
          id: "t-cmd",
          topic: cmd,
          type: "text",
          examples: ["up", "down"],
          mock: [
            { id: "r1", when: "up", then: [{ id: "e1", topic: level, kind: "add", value: "10", min: "0", max: "30" }] },
            { id: "r2", when: "down", then: [{ id: "e2", topic: level, kind: "add", value: "-10", min: "0", max: "30" }] },
          ],
        },
      ])

      const mock = await startMock(zipPath)
      const observer = await connectObserver(`e2e-rule-add-${testInfo.testId}`)
      try {
        const seen: string[] = []
        observer.on("message", (t, payload) => {
          if (t === level) seen.push(payload.toString())
        })
        await new Promise<void>((resolve) => observer.subscribe(level, () => resolve()))

        // An unknown topic starts at its lower bound: the first turn of a
        // knob has to do something visible, or the mock looks like it is
        // not running.
        for (let i = 0; i < 5; i++) {
          observer.publish(cmd, "up")
          await new Promise((r) => setTimeout(r, 250))
        }
        // 0 -> 10 -> 20 -> 30, then held at the ceiling twice.
        expect(seen).toEqual(["10", "20", "30", "30", "30"])

        seen.length = 0
        for (let i = 0; i < 5; i++) {
          observer.publish(cmd, "down")
          await new Promise((r) => setTimeout(r, 250))
        }
        expect(seen).toEqual(["20", "10", "0", "0", "0"])
      } finally {
        observer.publish(level, "", { retain: true })
        await new Promise((r) => setTimeout(r, 200))
        observer.end(true)
        mock.child.kill()
        fs.unlinkSync(zipPath)
      }
    })

    test("a rule wins over a derived mapping for the same payload", async ({}, testInfo) => {
      const tag = `t${testInfo.testId.replace(/[^a-z0-9]/gi, "")}`
      const cmd = `mock-${tag}/cmd/light`
      const state = `mock-${tag}/state/light`
      const zipPath = await writeProjectZip(
        "rules-override",
        [
          switchObject("sw", state, cmd, [
            { id: "s1", label: "AN", readValue: "1", writeValue: "an" },
          ]),
        ],
        [
          {
            id: "t-cmd",
            topic: cmd,
            type: "text",
            examples: ["an"],
            // The Switch would derive "an" -> "1". The author says 99.
            mock: [{ id: "r", when: "an", then: [{ id: "e", topic: state, kind: "set", value: "99" }] }],
          },
        ],
      )

      const mock = await startMock(zipPath)
      const observer = await connectObserver(`e2e-rule-override-${testInfo.testId}`)
      try {
        const answer = waitFor(observer, state, 8000)
        observer.publish(cmd, "an")
        // Derivation is a convenience; a declaration is a decision.
        expect(await answer).toBe("99")
      } finally {
        observer.publish(state, "", { retain: true })
        await new Promise((r) => setTimeout(r, 200))
        observer.end(true)
        mock.child.kill()
        fs.unlinkSync(zipPath)
      }
    })

    test("a rule covering a SoftwareButton takes it off the unanswered list", async () => {
      const button = {
        id: "btn",
        type: "SoftwareButton",
        zIndex: 0,
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        properties: { text: "Alles AUS", action: { type: "send-mqtt", mqttTopic: "cmd/all", mqttMessage: "aus" } },
      }

      const withoutRule = await writeProjectZip("btn-bare", [button])
      const bare = await runList(withoutRule)
      expect(bare.out).toContain("have no derivable answer")
      fs.unlinkSync(withoutRule)

      const withRule = await writeProjectZip("btn-ruled", [button], [
        {
          id: "t-cmd",
          topic: "cmd/all",
          type: "text",
          examples: ["aus"],
          mock: [{ id: "r", when: "aus", then: [{ id: "e", topic: "state/all", kind: "set", value: "0" }] }],
        },
      ])
      const ruled = await runList(withRule)
      expect(ruled.out).toContain("declared 1 mock rule(s)")
      expect(ruled.out).not.toContain("have no derivable answer")
      fs.unlinkSync(withRule)
    })

    test("a half-written rule is reported, not silently skipped", async () => {
      const zipPath = await writeProjectZip("rules-broken", [], [
        {
          id: "t-cmd",
          topic: "cmd/x",
          type: "text",
          examples: [],
          mock: [
            { id: "r1", when: "", then: [{ id: "e", topic: "state/x", kind: "set", value: "1" }] },
            { id: "r2", when: "go", then: [] },
          ],
        },
      ])
      const { out } = await runList(zipPath)
      // Both are the shape of a rule someone started and did not finish.
      // Dropping them quietly would leave a command that looks configured
      // and answers nothing.
      expect(out).toContain("no payload to match on")
      expect(out).toContain("no effects")
      fs.unlinkSync(zipPath)
    })
  })

  test("refuses a non-local broker unless told to", async () => {
    const zipPath = await writeProjectZip("guard", [
      switchObject("sw", "state/x", "cmd/x", [{ id: "s1", label: "AN", readValue: "1", writeValue: "an" }]),
    ])

    // Publishing retained state onto a broker that already has a real
    // automation on it means two answers per command and displays that
    // disagree with the hardware. The address is deliberately unroutable:
    // the guard has to fire before any connection is attempted, otherwise
    // this test would just be measuring a connection timeout.
    const result = await new Promise<{ code: number; out: string }>((resolve) => {
      const child = spawn(process.execPath, [SCRIPT, zipPath, "--broker", "mqtt://192.0.2.1:1883"], {
        stdio: ["ignore", "pipe", "pipe"],
      })
      let out = ""
      child.stdout.on("data", (d) => (out += d.toString()))
      child.stderr.on("data", (d) => (out += d.toString()))
      child.on("close", (code) => resolve({ code: code ?? -1, out }))
    })

    expect(result.code).toBe(1)
    expect(result.out).toContain("refusing to publish")
    expect(result.out).toContain("--allow-remote")

    fs.unlinkSync(zipPath)
  })
})
