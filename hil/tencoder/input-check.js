// A guided check of the LilyGO T-Encoder Pro's inputs, with a person at the
// board (tasks/lilygo-t-encoder-pro-plan.md, T2). The board shows each step on
// its own screen - turn right, turn left, press, tap, swipe, let it go dark
// and wake it - and the script moves on once the board has seen the input: both
// in /api/debug's counters and as the MQTT message the step's screen binds
// to that input, so a pass means the input reached a project's action, not
// only the decoder.
//
// Not part of test:all: nobody turns the ring there. Run it after any change
// to the board's input path (BoardHardware.h, QuadratureEncoderReader, the
// key in main.cpp). Written because the first try at this check ran blind
// against an empty screen (2026-11-22, the user: «der Bildschirm ist immer
// dunkel, der soll zeigen was ich machen muss»), and on a round screen with
// no way to tell up from down («ich weiss ja nicht was oben und unten ist»):
// every step therefore draws a bar and «OBEN» at the top edge.
//
// The project is hand-built and has only text and boxes, which the firmware
// draws live from the fonts it carries - no designer server needed.
//
// Run: node -r ./hil/device-auth.js hil/tencoder/input-check.js --device <ip>
//        [--broker mqtt://127.0.0.1:1883] [--step-timeout 90] [--only s-dark,s-press]
// --only runs the named steps (their screen ids) and no others.
// Exit 0 pass, 1 a step failed or timed out, 2 board not reachable.
const http = require("http")
const JSZip = require("jszip")
const mqtt = require("mqtt")

function parseArgs(argv) {
  const args = { device: process.env.HIL_TENCODER_DEVICE || null, broker: "mqtt://127.0.0.1:1883", stepTimeoutS: 90, only: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i]
    else if (argv[i] === "--broker") args.broker = argv[++i]
    else if (argv[i] === "--step-timeout") args.stepTimeoutS = Number(argv[++i])
    else if (argv[i] === "--only") args.only = argv[++i].split(",")
  }
  if (!args.device) {
    console.error("usage: node -r ./hil/device-auth.js hil/tencoder/input-check.js --device <ip>")
    process.exit(2)
  }
  return args
}

const DEVICE_ID = "lilygo-t-encoder-pro"
const SIZE = 390
const TOPIC = "hil-test/tencoder/input"

// Two faces from the board's own DDF (ddf-source-lilygotencoderpro).
const FONTS = [
  { id: "font-robotob-c26", displayName: "Roboto Bold 43px", internalName: "robotob-c26", size: 43, ascent: 33, descent: 10, family: "Roboto", weight: "bold", bpp: 4, capHeight: 26 },
  { id: "font-roboto-c16", displayName: "Roboto 27px", internalName: "roboto-c16", size: 27, ascent: 21, descent: 6, family: "Roboto", weight: "regular", bpp: 4, capHeight: 16 },
]

function text(id, y, h, value, fontId, color = "#ffffff") {
  return {
    id, type: "text", zIndex: 2, x: 45, y, width: 300, height: h,
    properties: { text: value, fontId, color, textAlign: "center", fontWeight: "normal" },
  }
}

// The top marker: a bar along the top of the circle and the word under it.
function topMarker() {
  return [
    { id: "top-bar", type: "box", zIndex: 1, x: 135, y: 14, width: 120, height: 14, properties: { fillColor: "#ffff00", strokeColor: "#ffff00", strokeWidth: 0, cornerRadius: 7 } },
    text("top-word", 34, 30, "OBEN", "font-roboto-c16", "#ffff00"),
  ]
}

// Every input any screen can see, sent to TOPIC with its own name, so the
// script knows which input reached the project.
const ACTIONS = Object.fromEntries(
  ["button-0", "button-1", "button-2", "swipe-up", "swipe-down", "swipe-left", "swipe-right"].map((id) => [
    id, { type: "send-mqtt", mqttTopic: TOPIC, mqttMessage: id },
  ]),
)

function screen(id, title, lines) {
  return {
    id, name: id, backgroundColor: "#000000",
    buttonActions: ACTIONS,
    objects: [
      ...topMarker(),
      text(`${id}-title`, 140, 50, title, "font-robotob-c26"),
      ...lines.map((l, i) => text(`${id}-l${i}`, 200 + i * 32, 30, l, "font-roboto-c16", "#aaaaaa")),
    ],
  }
}

// What the person does, what the screen says, and when the step has passed:
// `done(start, now, seen)` over /api/debug at the step's start and now, and
// the MQTT messages that arrived during the step.
const STEPS = [
  { screen: screen("s-right", "5x rechts", ["im Uhrzeigersinn drehen", "5 Rasten"]),
    done: (a, b, seen) => b.dispatchedRight - a.dispatchedRight >= 5 && count(seen, "button-1") >= 5,
    report: (a, b, seen) => `dispatchedRight +${b.dispatchedRight - a.dispatchedRight}, button-1 x${count(seen, "button-1")}, button-0 x${count(seen, "button-0")}` },
  { screen: screen("s-left", "3x links", ["gegen den Uhrzeigersinn", "3 Rasten"]),
    done: (a, b, seen) => b.dispatchedLeft - a.dispatchedLeft >= 3 && count(seen, "button-0") >= 3,
    report: (a, b, seen) => `dispatchedLeft +${b.dispatchedLeft - a.dispatchedLeft}, button-0 x${count(seen, "button-0")}, button-1 x${count(seen, "button-1")}` },
  { screen: screen("s-press", "2x drücken", ["den Ring drücken"]),
    done: (a, b, seen) => b.dispatchedPresses - a.dispatchedPresses >= 2 && count(seen, "button-2") >= 2,
    report: (a, b, seen) => `dispatchedPresses +${b.dispatchedPresses - a.dispatchedPresses}, button-2 x${count(seen, "button-2")}` },
  { screen: screen("s-tap", "2x tippen", ["irgendwo aufs Display"]),
    done: (a, b) => b.touchReleaseCount - a.touchReleaseCount >= 2,
    report: (a, b) => `releases +${b.touchReleaseCount - a.touchReleaseCount}, last at ${b.lastTouchX},${b.lastTouchY} (${b.lastReleaseVerdict})` },
  { screen: screen("s-swipe", "nach OBEN", ["wischen, zum gelben Balken"]),
    done: (a, b, seen) => count(seen, "swipe-up") >= 1,
    report: (a, b, seen) => `last verdict ${b.lastReleaseVerdict}, swipes ${seen.filter((s) => s.startsWith("swipe")).join(",") || "none"}` },
  // Dark and awake again in one step: a screen switch for a separate wake
  // step would itself light the board. The press that wakes it must not
  // also be dispatched.
  { screen: screen("s-dark", "warten", ["nichts berühren, bis es", "dunkel ist - dann drücken"]),
    done: (a, b, seen, st) => {
      if (b.displayIsOff === true) st.sawDark = true
      return st.sawDark === true && b.displayIsOff === false
    },
    report: (a, b, seen, st) => `went dark ${st.sawDark ? "yes" : "no"} (after ${b.displayOffAfterSeconds} s), awake ${b.displayIsOff === false}, button-2 sent ${count(seen, "button-2")}x (0 expected: a wake only wakes)`,
    check: (a, b, seen) => count(seen, "button-2") === 0 },
]

function count(seen, id) {
  return seen.filter((s) => s === id).length
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 4000 }, (res) => {
      let d = ""
      res.on("data", (c) => (d += c))
      res.on("end", () => resolve({ status: res.statusCode, body: d }))
    }).on("timeout", function () { this.destroy(new Error("timeout")) }).on("error", reject)
  })
}

async function debug(base) {
  const r = await get(`${base}/api/debug`)
  if (r.status !== 200) throw new Error(`/api/debug answered ${r.status}`)
  return JSON.parse(r.body)
}

async function showScreen(base, index) {
  const res = await fetch(`${base}/api/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `index=${index}`,
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`/api/screen ${index} answered ${res.status}`)
}

async function main() {
  const { device, broker, stepTimeoutS, only } = parseArgs(process.argv)
  const base = `http://${device}`
  try {
    await debug(base)
  } catch (e) {
    console.warn(`SKIPPED - ${base}/api/debug not reachable (${e.message})`)
    process.exit(2)
  }

  // The finish screen last, so it is there when the steps are done.
  const finish = { id: "s-done", name: "s-done", backgroundColor: "#003300", objects: [...topMarker(), text("done-title", 160, 50, "fertig", "font-robotob-c26")] }
  const project = {
    name: "T-Encoder Pro input check",
    systemGeneration: "1.4",
    deviceId: DEVICE_ID,
    screenWidth: SIZE,
    screenHeight: SIZE,
    settings: { colorDepth: "24bit" },
    topics: [],
    assets: [],
    hardwareButtons: [],
    fonts: FONTS,
    screens: [...STEPS.map((s) => s.screen), finish],
  }
  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(project))
  const form = new FormData()
  form.append("file", new Blob([await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })]), "input-check.zip")
  const up = await fetch(`${base}/api/project`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) })
  const upText = await up.text()
  if (!up.ok || !/"success":\s*true/.test(upText)) {
    console.error(`FAIL - the board refused the check's project: ${upText.slice(0, 200)}`)
    process.exit(1)
  }
  console.log("project installed")
  await new Promise((r) => setTimeout(r, 4000))

  const client = mqtt.connect(broker)
  let seen = []
  await new Promise((resolve, reject) => {
    client.on("connect", () => client.subscribe(TOPIC, (err) => (err ? reject(err) : resolve())))
    client.on("error", reject)
  })
  // Each message with the time it came, for the log: whether a press
  // arrived before or after the board said it was awake.
  const t0 = Date.now()
  const log = []
  client.on("message", (_t, m) => {
    seen.push(m.toString())
    log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s mqtt ${m.toString()}`)
  })

  const fails = []
  for (let i = 0; i < STEPS.length; i++) {
    const step = STEPS[i]
    if (only && !only.includes(step.screen.id)) continue
    // A dark screen would hide the instruction: wake it first, by showing
    // the screen (a screen switch over the test interface wakes the board).
    await showScreen(base, i)
    await new Promise((r) => setTimeout(r, 600))
    seen = []
    const start = await debug(base)
    console.log(`\nstep ${i + 1}/${STEPS.length}: ${step.screen.objects.find((o) => o.id.endsWith("-title")).properties.text}`)
    const deadline = Date.now() + stepTimeoutS * 1000
    let now = start
    let passed = false
    const state = {}
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400))
      try {
        const prev = now
        now = await debug(base)
        if (prev.displayIsOff !== now.displayIsOff) log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s displayIsOff ${now.displayIsOff}`)
        if (prev.dispatchedPresses !== now.dispatchedPresses) log.push(`${((Date.now() - t0) / 1000).toFixed(1)}s dispatchedPresses ${now.dispatchedPresses}`)
      } catch {
        continue
      }
      if (step.done(start, now, seen, state)) {
        passed = true
        break
      }
    }
    // Late messages of the same input (MQTT behind the counter).
    await new Promise((r) => setTimeout(r, 800))
    const extra = step.check ? step.check(start, now, seen, state) : true
    const ok = passed && extra
    console.log(`  ${ok ? "PASS" : passed ? "FAIL" : "TIMEOUT"} ${step.report(start, now, seen, state)}`)
    if (!ok) {
      fails.push(`step ${i + 1} (${step.screen.id})`)
      for (const line of log.splice(0)) console.log(`    ${line}`)
    }
    log.length = 0
  }
  await showScreen(base, STEPS.length)
  client.end()
  console.log(fails.length ? `\nFAIL - ${fails.join(", ")}` : "\nPASS - every input reached the project")
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
