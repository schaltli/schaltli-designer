#!/usr/bin/env node
// The recorder as it runs on a Pekaway (tasks/charts-recorder-plan.md R6):
// its own process against the bench's broker (hil/local-broker.js, or any
// broker on localhost:1883), a want laid as Deploy lays one, values sent,
// and the history read back retained - then killed, the broker's copy
// cleared, and started again from its file.
//
// Exit 0 passed, 1 failed, 2 skipped (no broker, or another recorder
// recording there). Everything it lays is cleared again at the end.

"use strict"

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawn } = require("child_process")
const mqtt = require("mqtt")
const { dateOf } = require("../recorder/history")

const BROKER = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
const ID = "hil-recorder"
const WANT = `schaltli/history/wants/${ID}`
const LEVEL = "hil/recorder/level"
const HEATER = "hil/recorder/heater"
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hil-recorder-"))
const file = path.join(dir, "history.json")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(ok, what) {
  console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
  if (!ok) failures++
}

function startRecorder() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "recorder", "index.js"), "--broker", BROKER, "--file", file, "--id", ID, "--tick-ms", "300", "--save-ms", "500"], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  child.stdout.on("data", (d) => process.stdout.write(`  [recorder] ${d.toString().replace(/^\[recorder\] /gm, "")}`))
  child.stderr.on("data", (d) => process.stdout.write(`  [recorder] ${d}`))
  return child
}

async function stopRecorder(child) {
  if (child.exitCode !== null) return
  const gone = new Promise((r) => child.once("exit", r))
  child.kill()
  await gone
}

/** The retained message on a topic within `ms`, parsed; null for none. */
async function retained(client, topic, accept = () => true, ms = 6000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const got = await new Promise((resolve) => {
      const timer = setTimeout(() => done(null), 400)
      function done(v) {
        clearTimeout(timer)
        client.removeListener("message", on)
        client.unsubscribe(topic)
        resolve(v)
      }
      function on(t, m) {
        if (t === topic && m.length > 0) done(JSON.parse(m.toString()))
      }
      client.on("message", on)
      client.subscribe(topic)
    })
    if (got && accept(got)) return got
    await sleep(200)
  }
  return null
}

async function main() {
  console.log("\n=== recorder (host, the bench's broker) ===")
  let client
  try {
    client = await mqtt.connectAsync(BROKER, { reconnectPeriod: 0, connectTimeout: 3000 })
  } catch (err) {
    console.warn(`SKIPPED - no broker at ${BROKER} (${err.message})`)
    return 2
  }
  const presence = await retained(client, "schaltli/history/recorder", () => true, 800)
  if (presence && presence.state === "online" && presence.id !== ID && Date.now() / 1000 - (presence.seen ?? 0) < 180) {
    console.warn(`SKIPPED - another recorder (${presence.id}) records on ${BROKER}`)
    await client.endAsync()
    return 2
  }

  let recorder = startRecorder()
  const today = dateOf(Date.now() / 1000, TZ)
  const levelDay = `schaltli/history/${LEVEL}~v/day/${today}`
  try {
    check(!!(await retained(client, "schaltli/history/recorder", (p) => p.state === "online" && p.id === ID)), "it says it records")
    await client.publishAsync(WANT, JSON.stringify({ series: [{ topic: `${LEVEL}#v`, kind: "level" }, { topic: HEATER, kind: "state", onMeans: [{ op: "==", value: "on" }] }] }), { retain: true, qos: 1 })
    await sleep(1500)
    await client.publishAsync(LEVEL, JSON.stringify({ v: 42 }))
    await client.publishAsync(HEATER, "on")
    const recent = await retained(client, `schaltli/history/${LEVEL}~v/recent`, (p) => p.mean.includes(42))
    check(!!recent && recent.mean.length === 120, "the level's last two hours, 42 in them, under the field's ~ name")
    const day = await retained(client, levelDay, (p) => p.mean.includes(42))
    check(!!day && day.date === today, `today (${today}) laid with the level in it`)
    const heater = await retained(client, `schaltli/history/${HEATER}/day/${today}`, (p) => p.on.length === 1)
    check(!!heater, "the heater's on-period laid")
    const now = await retained(client, "schaltli/history/now")
    check(!!now && now.tz === TZ, `its clock and zone (${now?.tz})`)

    await sleep(1000)
    await stopRecorder(recorder)
    check(fs.existsSync(file), "its file written")
    // The broker forgets, as a Mosquitto without persistence restarted.
    await client.publishAsync(levelDay, "", { retain: true, qos: 1 })
    check((await retained(client, levelDay, () => true, 600)) === null, "the broker's copy cleared")
    recorder = startRecorder()
    check(!!(await retained(client, levelDay, (p) => p.mean.includes(42))), "started again, it lays the day from its file")
  } finally {
    await stopRecorder(recorder)
    for (const topic of [
      WANT,
      "schaltli/history/recorder",
      "schaltli/history/now",
      levelDay,
      `schaltli/history/${LEVEL}~v/recent`,
      `schaltli/history/${LEVEL}~v/recent6`,
      `schaltli/history/${LEVEL}~v/daily`,
      `schaltli/history/${HEATER}/day/${today}`,
      `schaltli/history/${HEATER}/recent`,
      `schaltli/history/${HEATER}/recent6`,
      `schaltli/history/${HEATER}/daily`,
    ]) {
      await client.publishAsync(topic, "", { retain: true, qos: 1 })
    }
    await client.endAsync()
    fs.rmSync(dir, { recursive: true, force: true })
  }
  console.log(failures === 0 ? "recorder: PASS" : `recorder: FAIL (${failures})`)
  return failures === 0 ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
