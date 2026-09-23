#!/usr/bin/env node
// The proof a structural test cannot give: that a chip as empty as one from the
// factory boots from a factory image and comes up asking to be set up.
// docs/2026-09-18-factory-image.md, decision 9.
//
//   SCHALTLI_FACTORY_FLASH=1 node hil/factory-flash/run.js --device waveshare-touch-lcd-4v3b --port COM7
//
// It erases the whole chip first - that is the point, and also why it is armed
// by an environment variable and skips itself without one: it throws away the
// board's WiFi and MQTT credentials every time it runs. Run it by hand after
// changing how the image is merged, not on a schedule.
//
// What it does, and what each step proves:
//   1. merges a factory image from a firmware checkout's build artifacts (or
//      takes one with --image) - the same lib/factory-image.mjs the release tool
//      uses, so this is the real thing
//   2. asks the board what it is: the chip has to be an ESP32-S3, and its MAC is
//      printed so the operator sees which board is about to be erased
//   3. erase_flash - now nothing on the chip can be what makes it work
//   4. write_flash 0x0 <image> - one file, one address, the way the page does it
//   5. reads the boot output, which has to name this device and this firmware
//   6. looks for the setup access point <device-id>-setup, which only appears if
//      the firmware really ran and found no credentials
//
// Options: --device <id> (required), --port <COM7|/dev/ttyUSB0> (required),
// --image <path>, --firmware <repo path>, --seconds <serial read time>,
// --no-ap (skip the access point scan, for a machine with no WiFi adapter).

const fs = require("fs")
const os = require("os")
const path = require("path")
const { spawnSync } = require("child_process")

const HERE = __dirname
const REPO_ROOT = path.join(HERE, "..", "..")
const { mergeFactoryImage, verifyFactoryImage, findDeviceMarkers, refuseChip } = require(path.join(REPO_ROOT, "lib", "factory-image.mjs"))

// Which PlatformIO environment builds which device.
const ENVS = {
  "waveshare-knob-1v8": "waveshare-knob-touch-lcd-1v8",
  "waveshare-touch-lcd-4v3b": "waveshare-touch-lcd-4v3b",
  "m5stack-papers3": "m5stack-papers3",
}

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const device = arg("--device")
const port = arg("--port")
const seconds = Number(arg("--seconds", "25"))
const firmwareRepo = arg("--firmware", process.env.SCHALTLI_FIRMWARE_REPO || path.join(REPO_ROOT, "..", "schaltli-firmware"))
const scanForAp = !process.argv.includes("--no-ap")
const resultsPath = path.join(HERE, "results.json")

const results = { status: "skipped", device, port, steps: [], when: new Date().toISOString() }
function finish(status, detail) {
  results.status = status
  results.detail = detail
  fs.writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`)
  const label = status === "pass" ? "PASS" : status === "skipped" ? "SKIPPED" : "FAIL"
  console.log(`\n[factory-flash] ${label}: ${detail}`)
  console.log(`[factory-flash] report: ${resultsPath}`)
  process.exit(status === "fail" ? 1 : 0)
}
function step(name, ok, detail) {
  results.steps.push({ name, ok, detail })
  console.log(`[factory-flash] ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`)
  return ok
}

// --- armed? ---------------------------------------------------------------
if (process.env.SCHALTLI_FACTORY_FLASH !== "1") {
  finish("skipped", "not armed - this erases a board's credentials, so it needs SCHALTLI_FACTORY_FLASH=1")
}
if (!device || !ENVS[device]) {
  finish("skipped", `--device must be one of ${Object.keys(ENVS).join(", ")}`)
}
if (!port) finish("skipped", "--port is missing (list them: python -m serial.tools.list_ports)")

// --- tools ----------------------------------------------------------------
const pioHome = process.env.PLATFORMIO_CORE_DIR || path.join(os.homedir(), ".platformio")
const python = [
  path.join(pioHome, "penv", "Scripts", "python.exe"),
  path.join(pioHome, "penv", "bin", "python"),
].find((p) => fs.existsSync(p)) || (process.platform === "win32" ? "python" : "python3")
const esptool = path.join(pioHome, "packages", "tool-esptoolpy", "esptool.py")
if (!fs.existsSync(esptool)) finish("skipped", `esptool.py not found at ${esptool} - build a board once and PlatformIO fetches it`)

// Every esptool call ends by resetting the board, and a board with native USB
// then re-enumerates: for a second or two its port simply is not there, and the
// next call fails with "Could not open COM14". Seen on the very first real run
// (2026-09-18) - erase_flash failed in the script and succeeded by hand
// moments later. So: settle before each call, and give a port that is busy or
// absent one more chance before calling it a failure.
const settle = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
const PORT_TROUBLE = /could not open|port is busy|failed to connect|no serial data received/i

// `settleFirst: false` for reading the boot output: there the two seconds are
// exactly wrong. The board starts printing the moment esptool's reset lets it
// go, and the reader has to be waiting at the port by then - its own patient
// open (read-serial.py) grabs the port as soon as it re-appears. With the wait
// in front, the whole boot was over before anyone was listening, which looked
// like a board that never came up (knob, 2026-09-18).
const run = (args, label, { settleFirst = true } = {}) => {
  console.log(`[factory-flash] ${label}…`)
  const once = () => {
    const result = spawnSync(python, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    const output = `${result.stdout || ""}${result.stderr || ""}`
    process.stdout.write(output.split("\n").map((l) => (l ? `    ${l}` : l)).join("\n"))
    return { ok: result.status === 0, output }
  }
  if (settleFirst) settle(2000)
  const first = once()
  if (first.ok || !PORT_TROUBLE.test(first.output)) return first
  console.log(`[factory-flash] the port was not ready - waiting and trying once more`)
  settle(4000)
  return once()
}

// --- 1. the image ---------------------------------------------------------
let image
let imageName = arg("--image")
if (imageName) {
  if (!fs.existsSync(imageName)) finish("fail", `--image ${imageName} does not exist`)
  image = fs.readFileSync(imageName)
  // A file from a release gets the same structural look-over the merge gets -
  // there is no reason to write something at 0x0 that fails it.
  const problems = verifyFactoryImage(image, { deviceId: device })
  if (problems.length) finish("fail", `${imageName} is not a sound factory image: ${problems.join("; ")}`)
} else {
  const buildDir = path.join(firmwareRepo, ".pio", "build", ENVS[device])
  const bootApp0 = path.join(pioHome, "packages", "framework-arduinoespressif32", "tools", "partitions", "boot_app0.bin")
  const needed = ["bootloader.bin", "partitions.bin", "firmware.bin"].map((f) => path.join(buildDir, f))
  if (![...needed, bootApp0].every((f) => fs.existsSync(f))) {
    finish("skipped", `no build artifacts for ${ENVS[device]} in ${buildDir} - build it first (pio run -e ${ENVS[device]})`)
  }
  const app = fs.readFileSync(needed[2])
  image = Buffer.from(mergeFactoryImage({
    bootloader: fs.readFileSync(needed[0]),
    partitions: fs.readFileSync(needed[1]),
    otaSelect: fs.readFileSync(bootApp0),
    app,
  }))
  imageName = path.join(HERE, `${device}-factory.bin`)
  fs.writeFileSync(imageName, image)
  const problems = verifyFactoryImage(image, { deviceId: device, app })
  if (problems.length) finish("fail", `the merged image is not sound: ${problems.join("; ")}`)
}
const markers = findDeviceMarkers(image)
if (markers.length !== 1 || markers[0] !== device) {
  finish("fail", `${imageName} carries ${markers.join(", ") || "no marker"}, not ${device}'s - refusing to write it`)
}
step("image", true, `${imageName} (${(image.length / 1048576).toFixed(2)} MB, marker ${markers[0]})`)

// --- 2. who is on the cable ----------------------------------------------
// Asked before anything is erased, and printed: the operator should see which
// board is about to lose its credentials. The chip family is also the one thing
// the hardware can settle - all three boards are ESP32-S3 - so a cable in some
// other chip stops here rather than after a board fails to boot. No --chip, so
// esptool says what it really found instead of being told what to expect.
const identity = run([esptool, "--port", port, "read_mac"], `asking ${port} what it is`)
const chip = ((identity.output.match(/^Chip is (.+)$/m) || [])[1] || "").trim()
const mac = ((identity.output.match(/^MAC: (.+)$/m) || [])[1] || "").trim()
if (!identity.ok) {
  step("chip", false, "could not be asked")
  finish("fail", `nothing answered on ${port} - is the port right, and is anything else using it?`)
}
const wrongChip = refuseChip(chip)
if (wrongChip) {
  step("chip", false, wrongChip)
  finish("fail", wrongChip)
}
results.chip = chip
results.mac = mac
step("chip", true, `${chip}, MAC ${mac}`)

// --- 3. erase -------------------------------------------------------------
// Everything after this depends only on what this script writes.
const erased = run([esptool, "--chip", "esp32s3", "--port", port, "erase_flash"], `erasing ${port} completely`)
if (!step("erase_flash", erased.ok, erased.ok ? "the chip is now as empty as a new one" : "see the output above")) {
  finish("fail", "the chip could not be erased - is the port right, and is anything else using it?")
}

// --- 4. write -------------------------------------------------------------
const written = run(
  [esptool, "--chip", "esp32s3", "--port", port, "--baud", "921600", "write_flash", "0x0", imageName],
  `writing the factory image at 0x0`,
)
if (!step("write_flash", written.ok, written.ok ? "one file at 0x0" : "see the output above")) {
  finish("fail", "the image could not be written")
}

// --- 5. the boot output ---------------------------------------------------
// On the knob, opening the port resets the board (its CH340 pulls DTR/RTS), so
// what gets read there is the boot after that reset rather than the one esptool
// triggered. Either one proves the same thing, and nothing is lost.
const boot = run(
  [path.join(HERE, "read-serial.py"), port, String(seconds)],
  `reading ${seconds}s of boot output`,
  { settleFirst: false },
)
const bootText = boot.output
const bootSaysDevice = bootText.includes(device) || bootText.includes("Schaltli") || /\[(4v3b|knob|papers3|WiFiSetupServer)\]/.test(bootText)
step("boot output", bootSaysDevice, bootSaysDevice ? "the firmware announced itself over serial" : "nothing recognisable came out of the port")
results.boot = bootText.split("\n").slice(-40).join("\n")

// --- 6. the setup access point -------------------------------------------
// A device with no credentials opens <device-id>-setup (WiFiSetupServer.cpp).
// Seeing it means the firmware really ran, found an empty NVS and got as far as
// asking to be configured - which is exactly the state a buyer should meet.
let apSeen = null
if (scanForAp) {
  const ssid = `${device}-setup`
  const scan = () => {
    if (process.platform === "win32") {
      const r = spawnSync("netsh", ["wlan", "show", "networks"], { encoding: "utf8" })
      return `${r.stdout || ""}`
    }
    const r = spawnSync("nmcli", ["--terse", "--fields", "SSID", "device", "wifi", "list", "--rescan", "yes"], { encoding: "utf8" })
    return `${r.stdout || ""}`
  }
  const until = Date.now() + 90_000
  console.log(`[factory-flash] looking for the access point ${ssid} (up to 90s)…`)
  while (Date.now() < until) {
    const networks = scan()
    if (!networks.trim()) {
      apSeen = null
      break
    }
    if (networks.includes(ssid)) {
      apSeen = true
      break
    }
    // A plain synchronous wait: this script is a sequence of hardware steps,
    // there is nothing else for it to do while the radio settles.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000)
  }
  if (apSeen === null) step("setup access point", true, "no WiFi scan available on this machine - not checked")
  else step("setup access point", apSeen, apSeen ? `${ssid} is on the air` : `${ssid} never appeared`)
}

const failed = results.steps.filter((s) => !s.ok)
if (failed.length) finish("fail", `${failed.length} step(s) failed: ${failed.map((s) => s.name).join(", ")}`)
finish("pass", `${device} came up from a completely erased chip`)
