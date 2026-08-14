// Exercises the M5 Dial's *MQTT deploy* path against real hardware, which
// nothing else covers: orchestrator.js installs projects over HTTP
// (POST /api/project), so it never touches DeployManager at all.
//
// Built 2026-08-15 to make a one-off verification permanent. The firmware's
// DeployManager::downloadToFile() gained two guards against a disk-full
// download silently reporting success - a per-write check and a read-back
// of the file's real size - and the risk they carry is the *happy* path:
// if either guard is wrong, every deploy fails, not just the rare
// out-of-space one. That is what this asserts.
//
// Serves the fixture zip over HTTP itself and publishes the deploy trigger
// the designer would publish, then follows deploy-status through to
// "rebooting" and waits for the device to actually come back serving
// snapshots. Any error state, or a stall, fails.
//
// Run: node hil/m5dial/deploy-check.js [--device <ip>] [--project <zip>]
// Needs the MQTT broker (npm run hil:broker). Skips - loudly - when the
// device isn't reachable, same contract as the orchestrators.

const fs = require("fs")
const http = require("http")
const path = require("path")
const zlib = require("zlib")
const os = require("os")
const mqtt = require("mqtt")

const TOPIC_PREFIX = "screenbee"
const HTTP_PORT = Number(process.env.HIL_DEPLOY_PORT || 8899)
const STATUS_TIMEOUT_MS = 90000
const REBOOT_TIMEOUT_MS = 90000

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const deviceHost = arg("--device", process.env.HIL_M5DIAL_DEVICE || "192.168.1.111")
const projectZip = arg("--project", path.join(__dirname, "fixtures", "comprehensive-test.zip"))
const brokerUrl = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"

// The device downloads from this machine, so "localhost" is useless here -
// it needs a LAN address it can actually route to.
function lanAddress() {
  if (process.env.HIL_LAN_IP) return process.env.HIL_LAN_IP
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface && iface.family === "IPv4" && !iface.internal && iface.address.startsWith("192.168.")) {
      return iface.address
    }
  }
  throw new Error("No 192.168.x LAN address found - set HIL_LAN_IP explicitly")
}

function httpStatus(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on("timeout", () => {
      req.destroy()
      resolve(null)
    })
    req.on("error", () => resolve(null))
  })
}

// The device's own MQTT client id, taken from whatever it retained in its
// hello - hardcoding it would break the moment this runs against a
// different unit.
function findDeviceClientId(client) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("No M5 Dial hello seen on the broker within 10s")), 10000)
    client.subscribe(`${TOPIC_PREFIX}/+/hello`, () => {})
    client.on("message", (topic, payload) => {
      if (!topic.endsWith("/hello") || payload.length === 0) return
      try {
        if (JSON.parse(payload.toString()).deviceId !== "m5stack-m5dial-v1-1") return
      } catch {
        return
      }
      clearTimeout(timer)
      resolve(topic.split("/")[1])
    })
  })
}

async function main() {
  if (!fs.existsSync(projectZip)) {
    console.warn(`SKIPPED - fixture not found: ${projectZip}`)
    process.exit(0)
  }
  if ((await httpStatus(`http://${deviceHost}/snapshot.bmp`)) !== 200) {
    console.warn(`SKIPPED - device not reachable at http://${deviceHost}/snapshot.bmp (set HIL_M5DIAL_DEVICE to override)`)
    process.exit(0)
  }

  const zip = fs.readFileSync(projectZip)
  const crc32 = zlib.crc32(zip) >>> 0
  const lanIp = lanAddress()

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zip.length })
    res.end(zip)
  })
  await new Promise((resolve) => server.listen(HTTP_PORT, "0.0.0.0", resolve))
  console.log(`Serving ${path.basename(projectZip)} (${zip.length} bytes, crc32 ${crc32}) on http://${lanIp}:${HTTP_PORT}`)

  const client = mqtt.connect(brokerUrl, { clientId: `hil-deploy-check-${Date.now()}` })
  await new Promise((resolve, reject) => {
    client.on("connect", resolve)
    client.on("error", reject)
  })

  const clientId = await findDeviceClientId(client)
  console.log(`Device MQTT client id: ${clientId}`)

  const deployId = `hil-deploy-${Date.now()}`
  const states = []
  const reachedRebooting = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Deploy stalled after ${STATUS_TIMEOUT_MS}ms - states seen: ${states.join(" -> ") || "(none)"}`)),
      STATUS_TIMEOUT_MS,
    )
    client.subscribe(`${TOPIC_PREFIX}/${clientId}/deploy-status`, () => {})
    client.on("message", (topic, payload) => {
      if (!topic.endsWith("/deploy-status") || payload.length === 0) return
      let msg
      try {
        msg = JSON.parse(payload.toString())
      } catch {
        return
      }
      if (msg.deployId !== deployId) return
      if (states[states.length - 1] !== msg.state) states.push(msg.state)
      console.log(`  ${msg.state}${msg.percent >= 0 ? ` ${msg.percent}%` : ""}${msg.message ? ` - ${msg.message}` : ""}`)
      if (msg.state === "error") {
        clearTimeout(timer)
        reject(new Error(`Device reported deploy error: ${msg.message || "(no message)"}`))
      }
      if (msg.state === "rebooting") {
        clearTimeout(timer)
        resolve()
      }
    })
  })

  client.publish(
    `${TOPIC_PREFIX}/${clientId}/deploy`,
    JSON.stringify({ deployId, url: `http://${lanIp}:${HTTP_PORT}/project.zip`, crc32 }),
    { retain: true },
  )
  console.log(`Published deploy trigger ${deployId}`)

  try {
    await reachedRebooting
  } finally {
    client.end()
    server.close()
  }

  // "rebooting" is the device's own claim; coming back and serving a
  // snapshot again is the proof. A deploy that bricks the boot would
  // otherwise still look like a pass.
  const deadline = Date.now() + REBOOT_TIMEOUT_MS
  process.stdout.write("Waiting for the device to come back")
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    process.stdout.write(".")
    if ((await httpStatus(`http://${deviceHost}/snapshot.bmp`)) === 200) {
      console.log("\nPASS - full MQTT deploy: download, CRC verify, install, reboot, back online.")
      return
    }
  }
  throw new Error(`\nDevice did not come back at http://${deviceHost}/snapshot.bmp within ${REBOOT_TIMEOUT_MS}ms`)
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`)
  process.exit(1)
})
