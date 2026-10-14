// What the Android app refuses and how it goes dark, on the phone on the cable
// (2026-10-10, tester Arno's report - schaltli-android#3 and #5):
//
//   1. a board's export sent to the phone is refused, saying what it is for,
//      and the project on the phone stays; and an Android bundle made for
//      another phone is installed (the app says so with a toast, which this
//      cannot read - the deploy-status "applied" is what it can);
//   2. the display goes dark after its timeout with the backlight off - the
//      window's brightness override at the device's floor, not a dimmed
//      glow - and a touch brings it back.
//
// Not covered here: the address in the announcement after a WiFi change
// (schaltli-android#6) - Android lets no computer switch a phone's WiFi.
//
// Run: node hil/android/app-guards.js (the phone with its test interface on)
// Needs the broker (npm run hil:broker) the phone is set to, the app running.
// Exit 0 pass, 1 fail, 2 no phone.
const fs = require("fs")
const path = require("path")
const http = require("http")
const crypto = require("crypto")
const mqtt = require("mqtt")
// The phone through the app's test interface, not adb (phone.js, #70).
const phoneApi = require("./phone")
const JSZip = require("jszip")

const MQTT_URL = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
const FIXTURE = path.join(__dirname, "fixtures", "comprehensive-test.zip")

const arg = (flag) => {
  const i = process.argv.indexOf(flag)
  return i > 0 ? process.argv[i + 1] : null
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The phone on this broker: an online android-* hello.
async function findPhone(client) {
  const hellos = new Map()
  const online = new Set()
  client.on("message", (topic, payload) => {
    const m = /^schaltli\/(android-[^/]+)\/(hello|status)$/.exec(topic)
    if (!m || payload.length === 0) return
    if (m[2] === "hello") hellos.set(m[1], JSON.parse(payload.toString()))
    else if (payload.toString() === "online") online.add(m[1])
    else online.delete(m[1])
  })
  client.subscribe(["schaltli/+/hello", "schaltli/+/status"])
  await sleep(2500)
  const id = [...online].find((i) => hellos.has(i))
  return id ? { instanceId: id, hello: hellos.get(id) } : null
}

// A zip served to the phone over its WiFi.
async function serve(serial, bytes) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": bytes.length })
    res.end(bytes)
  })
  await new Promise((r) => server.listen(0, "0.0.0.0", r))
  const port = server.address().port
  // Over the phone's WiFi, as from a designer (since 2026-10-14).
  const host = await phoneApi.addressTowardPhone(MQTT_URL)
  return {
    url: `http://${host}:${port}/bundle.zip`,
    close: async () => server.close(),
  }
}

// Sends a deploy and returns the last state the phone reports for it.
async function deploy(client, serial, instanceId, bytes) {
  const served = await serve(serial, bytes)
  const deployId = crypto.randomUUID()
  const statusTopic = `schaltli/${instanceId}/deploy-status`
  try {
    return await new Promise((resolve) => {
      let last = { state: "nothing" }
      const timer = setTimeout(() => done(), 60000)
      function onMessage(topic, payload) {
        if (topic !== statusTopic) return
        const status = JSON.parse(payload.toString())
        if (status.deployId !== deployId) return
        last = status
        if (["applied", "error", "busy", "up_to_date"].includes(status.state)) done()
      }
      function done() {
        clearTimeout(timer)
        client.removeListener("message", onMessage)
        resolve(last)
      }
      client.on("message", onMessage)
      client.subscribe(statusTopic, () => {
        const crc32 = require("zlib").crc32 ? require("zlib").crc32(bytes) : undefined
        client.publish(`schaltli/${instanceId}/deploy`, JSON.stringify({ deployId, url: served.url, crc32 }), { retain: true, qos: 1 })
      })
    })
  } finally {
    client.publish(`schaltli/${instanceId}/deploy`, "", { retain: true, qos: 1 })
    await served.close()
  }
}

// What the app's window asks of the backlight: 0 off (ScreenSleep's dark),
// -1 the system's own (/api/debug, screenBrightness).
async function brightnessOverride(serial) {
  const value = (await phoneApi.debug()).screenBrightness
  return typeof value === "number" ? value : null
}

async function main() {
  const serial = arg("--device")
  try {
    await phoneApi.phone(MQTT_URL)
  } catch (err) {
    console.warn(`SKIPPED - ${err.message}`)
    process.exit(2)
  }
  const client = mqtt.connect(MQTT_URL, { connectTimeout: 5000, reconnectPeriod: 0 })
  await new Promise((resolve, reject) => {
    client.once("connect", resolve)
    client.once("error", reject)
  })
  const failures = []
  const check = (ok, what) => {
    console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`)
    if (!ok) failures.push(what)
  }
  let displayOffBefore = "0"
  try {
    const phone = await findPhone(client)
    if (!phone) {
      console.warn(`SKIPPED - no Android phone online on ${MQTT_URL}`)
      process.exit(2)
    }
    console.log(`phone ${phone.instanceId} (${phone.hello.name}, app ${phone.hello.firmwareVersion})`)

    // 1. A board's export: refused, naming what it is for.
    const fixture = await JSZip.loadAsync(fs.readFileSync(FIXTURE))
    const project = JSON.parse(await fixture.file("project.json").async("string"))
    const board = new JSZip()
    const { platform, ...boardProject } = project
    board.file("project.json", JSON.stringify({ ...boardProject, deviceId: "waveshare-touch-lcd-4v3b" }))
    const refused = await deploy(client, serial, phone.instanceId, await board.generateAsync({ type: "nodebuffer" }))
    check(refused.state === "error", `1. a board's export is refused (state ${refused.state})`)
    check(/exported for "waveshare-touch-lcd-4v3b", not for this phone/.test(refused.error || ""), `   saying what it is for: "${refused.error || ""}"`)

    // ... and an Android bundle made for another phone is installed.
    fixture.file("project.json", JSON.stringify({ ...project, deviceId: "android-someoneelse", deviceName: "Another Phone" }))
    const other = await deploy(client, serial, phone.instanceId, await fixture.generateAsync({ type: "nodebuffer" }))
    check(other.state === "applied", `   a bundle made for another phone is installed (state ${other.state})`)

    // 2. Dark after the timeout, the backlight off; a touch brings it back.
    displayOffBefore = String((await phoneApi.debug()).displayOffSeconds ?? 0)
    await phoneApi.setDisplayOff(3)
    let dark = null
    for (let i = 0; i < 10 && dark === null; i++) {
      await sleep(1000)
      const value = await brightnessOverride(serial)
      if (value !== null && value >= 0) dark = value
    }
    // The window asks for the backlight off: 0, which the phone turns into
    // its own floor (4 on the P20, as dumpsys said it until 2026-10-14).
    check(dark !== null && dark === 0, `2. dark after 3 s, the window asking for the backlight off (screenBrightness ${dark})`)
    const size = await phoneApi.debug()
    await phoneApi.tap(size.width / 2, size.height * 0.9)
    await sleep(800)
    check((await brightnessOverride(serial)) === -1, "   a touch brings the brightness back")
  } finally {
    await phoneApi.setDisplayOff(Number(displayOffBefore)).catch(() => {})
    client.end(true)
  }
  if (failures.length) {
    console.error(`\nFAIL - ${failures.length} check(s)`)
    process.exit(1)
  }
  console.log("\nPASS - the app refuses a board's export and goes dark with the backlight off")
}

main().catch((e) => {
  console.error(`FAIL - ${e.message}`)
  process.exit(1)
})
