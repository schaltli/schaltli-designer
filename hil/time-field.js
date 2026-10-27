#!/usr/bin/env node
// A time field set on a board (tasks/ha-time-plan.md, F2). The board's own
// picker, worked through /api/touch where /api/picker says its parts lie:
//
//   1. a tap on the field opens the picker on the field's time, on the step
//      (06:32 reported, step 5: 06:30);
//   2. the minute wheel dragged up three values, slowly, and let go: it
//      settles on 06:45 (buttons: the minute's up button three times);
//   3. a tap on the hour's neighbour below brings 07 to the middle, one
//      above takes it back (buttons: the hour's up and down);
//   4. OK sends 06:45:00 on the write topic and closes it;
//   5. a quick flick on the hour runs on further than the finger went
//      (wheels only);
//   6. Cancel sends nothing and closes it.
//
//   node -r ./hil/device-auth.js hil/time-field.js --device 192.168.1.117
//
// Needs the designer dev server (test-render builds the zip) and the HIL
// broker. Exit 0 pass, 1 fail, 2 the board is not reachable or has no
// picker yet (skipped, loudly).

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const STATE = `hil-time-${RUN}/state`
const SET = `hil-time-${RUN}/set`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

function fieldRect(ddf) {
  const { width: sw, height: sh } = ddf.screen
  const round = (ddf.raw?.screen?.shape ?? ddf.screen.shape) === "round"
  const side = round ? Math.floor(Math.min(sw, sh) / Math.SQRT2) : null
  const inner = round ? { x: Math.round((sw - side) / 2), y: Math.round((sh - side) / 2), w: side, h: side } : { x: 0, y: 0, w: sw, h: sh }
  return { x: Math.round(inner.x + inner.w * 0.2), y: Math.round(inner.y + inner.h * 0.1), width: Math.round(inner.w * 0.6), height: Math.round(Math.max(40, inner.h * 0.18)) }
}

function timeProject(ddf, stamp) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-time-${RUN}` })
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  project.name = "HIL time field"
  project.fonts = ddf.fonts
  project.combinedTopics = []
  project.topics = [
    { id: "state", topic: STATE, type: "text", examples: ["06:32:00"] },
    { id: "set", topic: SET, type: "text", examples: ["06:30:00"] },
  ]
  project.screens = [
    {
      id: `time-${stamp}`,
      name: "Time",
      backgroundColor: "#ffffff",
      objects: [
        {
          id: "field",
          type: "time-field",
          zIndex: 1,
          ...fieldRect(ddf),
          properties: { topic: STATE, writeTopic: SET, minuteStep: 5, fieldColor: "#e5e5e5", lineColor: "#6750a4", textColor: "#000000", fontId: sorted[Math.floor(sorted.length * 0.6)].id },
        },
      ],
    },
  ]
  return project
}

async function buildZip(project) {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    // Right after a board restarts the dev server answered 500 now and then
    // (hil/text-field.js): up to three loads.
    for (let attempt = 1; ; attempt++) {
      const res = await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
      const ready = res && res.ok() && (await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 }).then(() => true, () => false))
      if (ready) break
      if (attempt === 3) throw new Error(`test-render did not get ready (HTTP ${res ? res.status() : "none"})`)
      await sleep(2000)
    }
    return Buffer.from(await page.evaluate((p) => window.__buildDeviceZipForTest(p), project), "base64")
  } finally {
    await browser.close()
  }
}

async function main() {
  const device = process.argv[process.argv.indexOf("--device") + 1]
  if (!device || device.startsWith("--")) {
    console.error("usage: node -r ./hil/device-auth.js hil/time-field.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no answer")
  } catch {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  if ((await get(`${base}/api/picker`).catch(() => ({ status: 0 }))).status !== 200) {
    console.warn(`SKIPPED - ${device} has no /api/picker: a firmware from before the time field's picker`)
    process.exit(2)
  }

  const ddf = await loadDdf(device)
  const eink = /papers3/i.test(ddf.deviceId || "")
  const stamp = `${RUN}-${device.replace(/\./g, "-")}`
  const results = []
  const check = (name, ok, detail = "") => {
    results.push(ok)
    console.log(`  ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  }

  const client = mqtt.connect(BROKER_URL)
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
    setTimeout(() => reject(new Error(`no broker at ${BROKER_URL}`)), 10000)
  })
  const sent = []
  client.on("message", (topic, payload) => {
    if (topic === SET) sent.push(payload.toString())
  })
  await new Promise((resolve) => client.subscribe(SET, resolve))

  const touch = async (x, y, down) => {
    const r = await fetch(`${base}/api/touch?x=${Math.round(x)}&y=${Math.round(y)}&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`/api/touch answered ${r.status}`)
  }
  const tap = async (x, y, settle = eink ? 2500 : 400) => {
    await touch(x, y, true)
    await sleep(eink ? 1200 : 80)
    await touch(x, y, false)
    await sleep(settle)
  }
  const picker = async () => JSON.parse((await get(`${base}/api/picker`)).body)
  const middle = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
  // Until the wheels have come to rest.
  const rested = async () => {
    for (let i = 0; i < 30; i++) {
      const p = await picker()
      if (!p.open || !p.settling) return p
      await sleep(100)
    }
    return picker()
  }
  // A finger on a wheel moved by `dy` in `steps`, `ms` apart, held still
  // `holdMs` before the lift (a slow drag), or let go at once (a flick).
  const drag = async (r, dy, steps, ms, holdMs) => {
    const { x, y } = middle(r)
    await touch(x, y, true)
    await sleep(60)
    for (let i = 1; i <= steps; i++) {
      await touch(x, y + (dy * i) / steps, true)
      await sleep(ms)
    }
    if (holdMs) await sleep(holdMs)
    await touch(x, y + dy, false)
    return rested()
  }
  const field = fieldRect(ddf)

  try {
    console.log(`time field ${SET} on ${device}`)
    await publish(client, STATE, "06:32:00")
    const zipPath = path.join(os.tmpdir(), `hil-time-${stamp}.zip`)
    fs.writeFileSync(zipPath, await buildZip(timeProject(ddf, stamp)))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
    }
    const deadline = Date.now() + 180000
    for (;;) {
      try {
        const r = await get(`${base}/api/device-settings`, 5000)
        if (r.status === 200 && r.body.includes(`time-${stamp}`)) break
      } catch {}
      if (Date.now() > deadline) throw new Error("the board did not come back with the installed project")
      await sleep(3000)
    }
    await sleep(eink ? 5000 : 3000)
    await tap(field.x + field.width / 2, Math.min(ddf.screen.height - 5, field.y + field.height * 3))

    const open = async () => {
      await tap(field.x + field.width / 2, field.y + field.height / 2, eink ? 4000 : 800)
      return picker()
    }
    let p = await open()
    check("1. a tap opens the picker on the field's time, on the step", p.open && p.value === "06:30", JSON.stringify({ open: p.open, value: p.value, style: p.style }))
    const wheels = p.style === "wheels"

    if (wheels) p = await drag(p.minute, -3 * p.itemH, 18, 30, 300)
    else for (let i = 0; i < 3; i++) await tap(middle(p.minuteUp).x, middle(p.minuteUp).y)
    p = await rested()
    check(`2. the minutes ${wheels ? "dragged up three values settle" : "up three times"} on 06:45`, p.value === "06:45", p.value)

    if (wheels) {
      const below = { x: middle(p.hour).x, y: middle(p.hour).y + p.itemH }
      await tap(below.x, below.y)
    } else await tap(middle(p.hourUp).x, middle(p.hourUp).y)
    p = await rested()
    const up = p.value
    if (wheels) await tap(middle(p.hour).x, middle(p.hour).y - p.itemH)
    else await tap(middle(p.hourDown).x, middle(p.hourDown).y)
    p = await rested()
    check("3. the hour's neighbour comes to the middle, and back", up === "07:45" && p.value === "06:45", `${up}, then ${p.value}`)

    await tap(middle(p.ok).x, middle(p.ok).y)
    const until = Date.now() + 6000
    while (sent.length === 0 && Date.now() < until) await sleep(100)
    p = await picker()
    check("4. OK sends 06:45:00 and closes", sent[0] === "06:45:00" && !p.open, `sent ${JSON.stringify(sent)}, open ${p.open}`)

    await sleep(eink ? 3000 : 800)
    p = await open()
    if (wheels) {
      // Two values' worth in about 60 ms: the wheel must run on past them.
      const before = Number(p.value.slice(0, 2))
      p = await drag(p.hour, -2 * p.itemH, 3, 20, 0)
      const ran = (Number(p.value.slice(0, 2)) - before + 24) % 24
      check("5. a quick flick runs on further than the finger went", ran > 2, `${before} -> ${p.value} (${ran} on)`)
    }

    await tap(middle(p.cancel).x, middle(p.cancel).y)
    await sleep(1500)
    p = await picker()
    check("6. Cancel sends nothing and closes", sent.length === 1 && !p.open, `sent ${JSON.stringify(sent)}, open ${p.open}`)
  } finally {
    client.end(true)
  }

  const failed = results.filter((r) => !r).length
  console.log(failed === 0 ? `PASS - ${device}: ${results.length} check(s) passed` : `FAIL - ${device}: ${failed} of ${results.length} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

function publish(client, topic, value) {
  return new Promise((resolve) => client.publish(topic, value, { retain: true, qos: 1 }, resolve))
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
