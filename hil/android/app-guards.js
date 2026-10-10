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
// Run: node hil/android/app-guards.js [--device <adb serial>]
// Needs the broker (npm run hil:broker) the phone is set to, the app running.
// Exit 0 pass, 1 fail, 2 no phone.
const fs = require("fs")
const path = require("path")
const http = require("http")
const crypto = require("crypto")
const { execFile } = require("child_process")
const { promisify } = require("util")
const mqtt = require("mqtt")
const JSZip = require("jszip")

const execFileAsync = promisify(execFile)
const ADB = process.env.ANDROID_ADB_PATH || path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe")
const MQTT_URL = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
const FIXTURE = path.join(__dirname, "fixtures", "comprehensive-test.zip")
const SET_BROKER = ["shell", "am", "broadcast", "-a", "com.schaltli.android.SET_BROKER", "-n", "com.schaltli.android/.data.BrokerConfigReceiver"]

const arg = (flag) => {
  const i = process.argv.indexOf(flag)
  return i > 0 ? process.argv[i + 1] : null
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function adb(serial, args) {
  const { stdout } = await execFileAsync(ADB, serial ? ["-s", serial, ...args] : args)
  return stdout
}

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

// A zip served to the phone down the cable (adb reverse).
async function serve(serial, bytes) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": bytes.length })
    res.end(bytes)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const port = server.address().port
  await adb(serial, ["reverse", `tcp:${port}`, `tcp:${port}`])
  return {
    url: `http://127.0.0.1:${port}/bundle.zip`,
    close: async () => {
      server.close()
      await adb(serial, ["reverse", "--remove", `tcp:${port}`]).catch(() => {})
    },
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

async function brightnessOverride(serial) {
  const out = await adb(serial, ["shell", "dumpsys", "power"])
  const m = /mScreenBrightnessOverrideFromWindowManager=(-?[\d.]+)/.exec(out)
  return m ? Number(m[1]) : null
}

async function main() {
  const serial = arg("--device")
  try {
    await adb(serial, ["get-state"])
  } catch {
    console.warn("SKIPPED - no adb device connected")
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
    displayOffBefore = (/data="(\d+)"/.exec(await adb(serial, [...SET_BROKER, "--ei", "displayOffSeconds", "3"])) || [])[1] || "0"
    let dark = null
    for (let i = 0; i < 10 && dark === null; i++) {
      await sleep(1000)
      const value = await brightnessOverride(serial)
      if (value !== null && value >= 0) dark = value
    }
    // The window asks for the backlight off (0); the phone reports its own
    // floor for it (4 on the P20). Anything between the floor and a dim
    // glow is not off.
    check(dark !== null && dark <= 4, `2. dark after 3 s with the backlight at the device's floor (override ${dark})`)
    const size = /(\d+)x(\d+)/.exec(await adb(serial, ["shell", "wm", "size"]))
    await adb(serial, ["shell", "input", "tap", String(Math.round(Number(size[1]) / 2)), String(Math.round(Number(size[2]) * 0.9))])
    await sleep(800)
    check((await brightnessOverride(serial)) === -1, "   a touch brings the brightness back")
  } finally {
    await adb(serial, [...SET_BROKER, "--ei", "displayOffSeconds", displayOffBefore]).catch(() => {})
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
