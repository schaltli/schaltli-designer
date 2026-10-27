#!/usr/bin/env node
// A text field typed on a board (tasks/ha-text-plan.md, F3). The board's
// own keyboard, pressed key by key through /api/touch where /api/keyboard
// says each key lies:
//
//   1. a tap on the field opens the keyboard on what the field shows;
//   2. with «Keyboard» de-CH, «Grüezi 1» typed and OK sends exactly that on
//      the write topic, and the keyboard closes;
//   3. the keys stop at max (12 characters, counted as characters);
//   4. Cancel sends nothing;
//   5. below min (2) OK sends nothing and the keyboard stays;
//   6. with de-DE, «Straße» typed and sent - the ß is a key there;
//   7. an alarm panel's code (tasks/ha-alarm-plan.md, F1): a field set to
//      «Digits» opens the keyboard on its digits;
//   8. its Disarm button - `{topic:…}` in the message, «Only when» a
//      combined topic, «Then clear» the local topic the code is typed into -
//      sends nothing without the code or with a wrong one, sends the right
//      one in its message, and the field is empty after.
//   7 and 8 need the DDF feature "button-values"; without it they are
//   skipped, loudly.
//
// The board's «Keyboard» setting is put back as it was afterwards.
//
//   node -r ./hil/device-auth.js hil/text-field.js --device 192.168.1.117
//
// Needs the designer dev server (test-render builds the zip) and the HIL
// broker (`npm run hil:broker`). Exit 0 pass, 1 fail, 2 the board is not
// reachable or has no keyboard yet (skipped, loudly).

const fs = require("fs")
const os = require("os")
const path = require("path")
const { execFileSync } = require("child_process")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { loadDdf } = require("./conformance/ddf")
const { buildProject } = require("./conformance/build-project")
const { deviceTag } = require("./device-tag")

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883"
const RUN = Date.now().toString(36)
const STATE = `hil-text-${RUN}/state`
const SET = `hil-text-${RUN}/set`
const CODE = `local/hil-text-${RUN}/code`
const ALARM = `hil-text-${RUN}/alarm`
const OUT_DIR = path.join(__dirname, "text-field-report", deviceTag())

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function parseArgs(argv) {
  const args = { device: null }
  for (let i = 2; i < argv.length; i++) if (argv[i] === "--device") args.device = argv[++i]
  return args
}

async function get(url, timeoutMs = 10000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: res.status, body: await res.text() }
}

async function post(url, fields) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  const res = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(10000) })
  return { status: res.status, body: await res.text() }
}

// A row of what the glass shows, `top` down from its top as a share: on a
// round display of the square inside its circle. The field at 0.1, the
// alarm's code at 0.4 and its Disarm at 0.7.
function rowRect(ddf, top) {
  const { width: sw, height: sh } = ddf.screen
  const round = (ddf.raw?.screen?.shape ?? ddf.screen.shape) === "round"
  const side = round ? Math.floor(Math.min(sw, sh) / Math.SQRT2) : null
  const inner = round ? { x: Math.round((sw - side) / 2), y: Math.round((sh - side) / 2), w: side, h: side } : { x: 0, y: 0, w: sw, h: sh }
  return {
    x: Math.round(inner.x + inner.w * 0.1),
    y: Math.round(inner.y + inner.h * top),
    width: Math.round(inner.w * 0.8),
    height: Math.round(Math.max(40, inner.h * 0.18)),
  }
}
const fieldRect = (ddf) => rowRect(ddf, 0.1)

function textProject(ddf, stamp) {
  const { project } = buildProject(ddf, { topicPrefix: `hil-text-${RUN}` })
  const sorted = [...ddf.fonts].sort((a, b) => (a.size || 0) - (b.size || 0))
  const font = sorted[Math.floor(sorted.length * 0.4)]
  project.name = "HIL text field"
  project.fonts = ddf.fonts
  project.combinedTopics = [{ id: "code-ok", name: "code_ok", mode: "all", conditions: [{ source: { namespace: "topic", path: CODE }, op: "==", operand: "1234" }] }]
  project.topics = [
    { id: "state", topic: STATE, type: "text", examples: ["Hallo"] },
    { id: "set", topic: SET, type: "text", examples: ["Hallo"] },
    { id: "code", topic: CODE, type: "text", examples: [], local: true, initial: "" },
    { id: "alarm", topic: ALARM, type: "text", examples: ["DISARM"] },
  ]
  project.screens = [
    {
      id: `text-${stamp}`,
      name: "Text",
      backgroundColor: "#ffffff",
      objects: [
        {
          id: "field",
          type: "text-field",
          zIndex: 1,
          ...fieldRect(ddf),
          properties: {
            topic: STATE,
            writeTopic: SET,
            minLength: 2,
            maxLength: 12,
            fieldColor: "#e5e5e5",
            lineColor: "#6750a4",
            textColor: "#000000",
            fontId: font.id,
          },
        },
        {
          id: "code",
          type: "text-field",
          zIndex: 2,
          ...rowRect(ddf, 0.4),
          properties: { topic: CODE, writeTopic: CODE, hidden: true, keyboard: "digits", fieldColor: "#e5e5e5", lineColor: "#6750a4", textColor: "#000000", fontId: font.id },
        },
        {
          id: "disarm",
          type: "button",
          zIndex: 3,
          ...rowRect(ddf, 0.7),
          properties: {
            text: "Disarm",
            buttonStyle: "filled",
            fontId: font.id,
            action: { type: "send-mqtt", mqttTopic: ALARM, mqttMessage: `{"action":"DISARM","code":"{topic:${CODE}}"}`, onlyWhen: "code_ok", clears: CODE },
          },
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
    // Right after a board restarts, the dev server answered test-render with
    // a 500 now and then («Unexpected end of JSON input», 2026-10-27) and the
    // page never got ready; a second load was fine. So up to three.
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
  const args = parseArgs(process.argv)
  if (!args.device) {
    console.error("usage: node -r ./hil/device-auth.js hil/text-field.js --device <ip>")
    process.exit(1)
  }
  const base = `http://${args.device}`
  try {
    if ((await get(`${base}/api/debug`, 4000)).status !== 200) throw new Error("no answer")
  } catch {
    console.warn(`SKIPPED - no board reachable at ${base}/api/debug`)
    process.exit(2)
  }
  const probe = await get(`${base}/api/keyboard`).catch(() => ({ status: 0 }))
  if (probe.status !== 200) {
    console.warn(`SKIPPED - ${args.device} has no /api/keyboard: a firmware from before the text field's keyboard`)
    process.exit(2)
  }

  const ddf = await loadDdf(args.device)
  const eink = /papers3/i.test(ddf.deviceId || "")
  const stamp = `${RUN}-${args.device.replace(/\./g, "-")}`
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })

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
  const alarm = []
  client.on("message", (topic, payload) => {
    if (topic === SET) sent.push(payload.toString("utf8"))
    if (topic === ALARM) alarm.push(payload.toString("utf8"))
  })
  await new Promise((resolve) => client.subscribe([SET, ALARM], resolve))
  const publish = (topic, value) => new Promise((resolve) => client.publish(topic, value, { retain: true }, resolve))

  const settings = JSON.parse((await get(`${base}/api/device-settings`)).body)
  const layoutBefore = settings.keyboardLayout || ""

  const touch = async (x, y, down) => {
    const r = await fetch(`${base}/api/touch?x=${Math.round(x)}&y=${Math.round(y)}&down=${down ? 1 : 0}`, { method: "POST", signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(`/api/touch answered ${r.status}`)
  }
  // On e-ink a press is held past a refresh, or the board reads only the lift.
  const tap = async (x, y, settle = eink ? 2500 : 250) => {
    await touch(x, y, true)
    await sleep(eink ? 1200 : 80)
    await touch(x, y, false)
    await sleep(settle)
  }
  const keyboard = async () => JSON.parse((await get(`${base}/api/keyboard`)).body)
  const pressKey = async (key) => tap(key.x + key.w / 2, key.y + key.h / 2)
  const pressKind = async (kind) => {
    const kb = await keyboard()
    const key = kb.keys.find((k) => k.kind === kind)
    if (!key) throw new Error(`no ${kind} key on the ${kb.layer} layer`)
    await pressKey(key)
  }
  // One character, through shift or the symbols as a person reaches it.
  const typeChar = async (ch) => {
    if (ch === " ") return pressKind("space")
    for (let attempt = 0; attempt < 4; attempt++) {
      const kb = await keyboard()
      const key = kb.keys.find((k) => k.kind === "char" && k.label === ch)
      if (key) return pressKey(key)
      if (kb.layer === "lower") await pressKind("shift")
      else if (kb.layer === "upper") {
        await pressKind("shift")
        await pressKind("symbols")
      } else await pressKind("letters")
    }
    throw new Error(`no key types «${ch}» on the ${(await keyboard()).layout} keyboard`)
  }
  const typeText = async (text) => {
    for (const ch of text) await typeChar(ch)
  }
  const clear = async () => {
    for (let n = [...(await keyboard()).text].length; n > 0; n--) await pressKind("backspace")
  }
  const field = fieldRect(ddf)
  const tapField = () => tap(field.x + field.width / 2, field.y + field.height / 2, eink ? 4000 : 800)
  const snapshot = async (name) => {
    const buf = Buffer.from(await (await fetch(`${base}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })).arrayBuffer())
    fs.writeFileSync(path.join(OUT_DIR, `${name}.bmp`), buf)
  }
  const waitSent = async (count, ms = 5000) => {
    const deadline = Date.now() + ms
    while (sent.length < count && Date.now() < deadline) await sleep(100)
  }

  try {
    console.log(`text field ${SET} on ${args.device}`)
    await post(`${base}/api/device-settings`, { keyboardLayout: "de-CH" })
    await publish(STATE, "Hallo")

    const zipPath = path.join(os.tmpdir(), `hil-text-${stamp}.zip`)
    fs.writeFileSync(zipPath, await buildZip(textProject(ddf, stamp)))
    try {
      execFileSync("curl", ["-s", "--show-error", "-m", "25", "-F", `file=@${zipPath}`, ddf.testInterface.uploadUrl])
    } catch (err) {
      if (err.status === 6 || err.status === 7) throw new Error(`the upload never reached ${ddf.testInterface.uploadUrl}`)
    }
    const deadline = Date.now() + 180000
    for (;;) {
      try {
        const r = await get(`${base}/api/device-settings`, 5000)
        if (r.status === 200 && r.body.includes(`text-${stamp}`)) break
      } catch {}
      if (Date.now() > deadline) throw new Error("the board did not come back with the installed project")
      await sleep(3000)
    }
    await sleep(eink ? 5000 : 3000)
    // A first touch on a blanked panel only wakes it: below the field.
    await tap(field.x + field.width / 2, Math.min(ddf.screen.height - 5, field.y + field.height * 3))

    await tapField()
    let kb = await keyboard()
    check("1. a tap on the field opens the keyboard on what it shows", kb.open && kb.text === "Hallo", JSON.stringify({ open: kb.open, text: kb.text }))
    await snapshot("1-open")

    await clear()
    await typeText("Grüezi 1")
    kb = await keyboard()
    // The PaperS3 says how long its last key took from press to glass.
    if (typeof kb.lastKeyMs === "number") console.log(`  key press to glass: ${kb.lastKeyMs} ms`)
    await snapshot("2-typed")
    await pressKind("ok")
    await waitSent(1)
    kb = await keyboard()
    check("2. de-CH: «Grüezi 1» typed, OK sends it, the keyboard closes", sent[0] === "Grüezi 1" && !kb.open, `sent ${JSON.stringify(sent)}, open ${kb.open}`)
    await sleep(eink ? 3000 : 800)
    await snapshot("2-sent")

    await tapField()
    await clear()
    await typeText("äbcdefghijklmn")
    kb = await keyboard()
    check("3. the keys stop at max: 12 characters", [...kb.text].length === 12 && kb.text === "äbcdefghijkl", kb.text)

    await pressKind("cancel")
    await sleep(1500)
    kb = await keyboard()
    check("4. Cancel sends nothing and closes", sent.length === 1 && !kb.open, `sent ${JSON.stringify(sent)}, open ${kb.open}`)

    await tapField()
    await clear()
    await typeText("a")
    await pressKind("ok")
    await sleep(1500)
    kb = await keyboard()
    check("5. below min OK sends nothing, the keyboard stays", sent.length === 1 && kb.open && kb.canSend === false, `sent ${JSON.stringify(sent)}, open ${kb.open}`)
    await pressKind("cancel")

    await post(`${base}/api/device-settings`, { keyboardLayout: "de-DE" })
    await tapField()
    kb = await keyboard()
    await clear()
    await typeText("Straße")
    await pressKind("ok")
    await waitSent(2)
    check("6. de-DE: «Straße» typed with its ß and sent", kb.layout === "de-DE" && sent[1] === "Straße", `layout ${kb.layout}, sent ${JSON.stringify(sent)}`)

    const features = ddf.raw?.supportedFeatures ?? ddf.supportedFeatures ?? []
    if (!features.includes("button-values")) {
      console.warn(`  SKIPPED 7-8 - ${args.device}'s DDF has no "button-values": a firmware from before the alarm panel`)
    } else {
      const codeRect = rowRect(ddf, 0.4)
      const disarmRect = rowRect(ddf, 0.7)
      const tapCode = () => tap(codeRect.x + codeRect.width / 2, codeRect.y + codeRect.height / 2, eink ? 4000 : 800)
      const tapDisarm = () => tap(disarmRect.x + disarmRect.width / 2, disarmRect.y + disarmRect.height / 2, eink ? 4000 : 800)
      const typeCode = async (code) => {
        await tapCode()
        await clear()
        await typeText(code)
        await pressKind("ok")
        await sleep(eink ? 3000 : 800)
      }

      await tapCode()
      kb = await keyboard()
      check("7. a field for digits opens the keyboard on its digits", kb.open && kb.layer === "symbols", `open ${kb.open}, layer ${kb.layer}`)
      await snapshot("7-digits")
      await pressKind("cancel")
      await sleep(eink ? 3000 : 800)

      await tapDisarm()
      await typeCode("1111")
      await tapDisarm()
      await sleep(1500)
      const heldBack = alarm.length === 0
      await typeCode("1234")
      await tapDisarm()
      const deadline = Date.now() + 5000
      while (alarm.length < 1 && Date.now() < deadline) await sleep(100)
      await sleep(eink ? 3000 : 800)
      await tapCode()
      kb = await keyboard()
      check(
        "8. Disarm: nothing without the code or with a wrong one; the right one in its message, the field empty after",
        heldBack && alarm.length === 1 && alarm[0] === '{"action":"DISARM","code":"1234"}' && kb.text === "",
        `sent ${JSON.stringify(alarm)}, field «${kb.text}»`,
      )
      await pressKind("cancel")
    }
  } finally {
    if (layoutBefore) await post(`${base}/api/device-settings`, { keyboardLayout: layoutBefore }).catch(() => {})
    client.end(true)
  }

  const failed = results.filter((r) => !r).length
  console.log(failed === 0 ? `PASS - ${args.device}: ${results.length} check(s) passed` : `FAIL - ${args.device}: ${failed} of ${results.length} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(`FAIL - ${err.message}`)
  process.exit(1)
})
