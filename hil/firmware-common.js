// What hil/firmware-upload.js and hil/firmware-ota.js share: reading a board's
// firmware state out of /api/debug, and the builds in the screenbee-firmware
// checkout they compare it with.

const fs = require("fs")
const os = require("os")
const path = require("path")
const http = require("http")
const crypto = require("crypto")

const FIRMWARE_REPO = process.env.SCREENBEE_FIRMWARE_REPO || path.resolve(__dirname, "..", "..", "screenbee-firmware")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function get(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (c) => (body += c))
      res.on("end", () => resolve({ status: res.statusCode, body }))
    })
    req.on("timeout", () => {
      req.destroy()
      reject(new Error(`GET ${url} timed out after ${timeoutMs}ms`))
    })
    req.on("error", reject)
  })
}

// The lines the 4.3B and PaperS3 add to /api/debug: the sketch MD5, the reset
// reason and running slot (BootReport.h), and the build and the images it
// installs (FirmwareImage.h). null when the first two are missing - a board
// from before 2026-09-15.
function parseBoot(body) {
  const md5 = body.match(/firmware ([0-9a-f]{32})/)
  const boot = body.match(/last reset ([a-z -]+), running from (\S+)/)
  if (!md5 || !boot) return null
  const uptime = body.match(/uptime (\d+) s/)
  const build = body.match(/firmware build (\S+), installs only images for (\S+)/)
  return {
    md5: md5[1],
    reset: boot[1],
    slot: boot[2],
    uptime: uptime ? Number(uptime[1]) : null,
    build: build ? build[1] : null,
    installsOnlyFor: build ? build[2] : null,
  }
}

async function readBoot(base, timeoutMs = 5000) {
  const r = await get(`${base}/api/debug`, timeoutMs)
  return r.status === 200 ? parseBoot(r.body) : null
}

// Polls until the board answers with its firmware state again, after a
// restart.
async function waitForBoot(base, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  await sleep(3000)
  while (Date.now() < deadline) {
    try {
      const state = await readBoot(base, 3000)
      if (state) return state
    } catch {}
    await sleep(2000)
  }
  return null
}

function loadBuild(env) {
  const file = path.join(FIRMWARE_REPO, ".pio", "build", env, "firmware.bin")
  if (!fs.existsSync(file)) return null
  const image = fs.readFileSync(file)
  return {
    file,
    image,
    md5: crypto.createHash("md5").update(image).digest("hex"),
    sha256: crypto.createHash("sha256").update(image).digest("hex"),
    device: imageDevice(image),
  }
}

// The DEVICE_ID an image was built for, from the marker the firmware's
// FirmwareImage.h compiles into it.
function imageDevice(image) {
  const m = image.toString("latin1").match(/<<screenbee-image device=([a-z0-9-]+)>>/)
  return m ? m[1] : null
}

// A board downloads from this machine, so it needs an address it can route
// to rather than localhost.
function lanAddress() {
  if (process.env.HIL_LAN_IP) return process.env.HIL_LAN_IP
  for (const iface of Object.values(os.networkInterfaces()).flat()) {
    if (iface && iface.family === "IPv4" && !iface.internal && iface.address.startsWith("192.168.")) {
      return iface.address
    }
  }
  throw new Error("No 192.168.x LAN address found - set HIL_LAN_IP explicitly")
}

module.exports = { FIRMWARE_REPO, sleep, get, parseBoot, readBoot, waitForBoot, loadBuild, imageDevice, lanAddress }
