// Bundles the whole local test suite into one command: the Playwright
// `e2e/` suite, `hil/epaper/orchestrator.js`, `hil/android/
// orchestrator.js`, and `hil/m5dial/orchestrator.js` - built 2026-07-31
// (grill-me session) after repeatedly hitting the friction of running each
// of these by hand, separately, only when someone remembered to.
//
// Hardware-dependent HIL suites are skipped - loudly, in both the console
// output and the final summary, never silently - when their device isn't
// reachable, rather than failing the whole run just because a phone wasn't
// plugged in. Neither orchestrator script fails its own exit code on a
// comparison mismatch (only on a crash), so this wrapper reads each one's
// results.json itself to decide pass/fail - see the two functions below.
//
// Requires the designer dev server running (`npm run dev`,
// http://localhost:3000) for all three suites, same as either orchestrator
// run alone - not started automatically here (e2e's own playwright.config.ts
// already reuses/starts one for itself; the two HIL scripts have no such
// fallback and will just fail with a connection error if it's down, same as
// running them directly would). The two HIL suites also need a reachable
// MQTT broker (`npm run hil:broker` - see hil/README.md), same reasoning:
// not started automatically here either.
//
// Run: npm run test:all
// Override the e-paper device address with HIL_EPAPER_DEVICE=<ip> if
// 192.168.1.110 isn't current (DHCP reassignment, different network, etc).

const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
const http = require("http")

const REPO_ROOT = path.join(__dirname, "..")
const EPAPER_DEVICE = process.env.HIL_EPAPER_DEVICE || "192.168.1.110"
const EPAPER_PROJECT = path.join(__dirname, "epaper/fixtures/comprehensive-test.zip")
const ANDROID_PROJECT = path.join(__dirname, "android/fixtures/comprehensive-test.zip")
const M5DIAL_DEVICE = process.env.HIL_M5DIAL_DEVICE || "192.168.1.111"
const M5DIAL_PROJECT = path.join(__dirname, "m5dial/fixtures/comprehensive-test.zip")
const ADB = process.env.ANDROID_ADB_PATH ||
  path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe")

function httpGetStatus(url, timeoutMs = 3000) {
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

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: true, ...opts })
    child.on("close", (code) => resolve(code))
    child.on("error", () => resolve(1))
  })
}

// Not `adb -s <serial> get-state`, because we don't have a serial yet - this
// IS how we find one. Filters out "unauthorized"/"offline" lines, which
// `adb devices` lists but which can't actually run anything.
async function adbConnectedDevice() {
  if (!fs.existsSync(ADB)) return null
  return new Promise((resolve) => {
    const child = spawn(ADB, ["devices"])
    let out = ""
    child.stdout.on("data", (d) => (out += d))
    child.on("close", () => {
      const line = out
        .split("\n")
        .slice(1)
        .map((l) => l.trim())
        .find((l) => /\tdevice$/.test(l))
      resolve(line ? line.split("\t")[0] : null)
    })
    child.on("error", () => resolve(null))
  })
}

function readResults(reportDir) {
  const p = path.join(reportDir, "results.json")
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return null
  }
}

async function main() {
  const summary = []

  console.log("\n=== e2e (Playwright) ===")
  const e2eCode = await run("npx", ["playwright", "test"], { cwd: REPO_ROOT })
  summary.push({
    name: "e2e",
    status: e2eCode === 0 ? "PASS" : "FAIL",
    detail: e2eCode === 0 ? "" : `exit code ${e2eCode}`,
    report: "playwright-report/index.html",
  })

  console.log(`\n=== epaper HIL (device: ${EPAPER_DEVICE}) ===`)
  const epaperReachable = (await httpGetStatus(`http://${EPAPER_DEVICE}/`)) === 200
  if (!epaperReachable) {
    console.warn(`SKIPPED - device not reachable at http://${EPAPER_DEVICE}/ (set HIL_EPAPER_DEVICE to override)`)
    summary.push({ name: "epaper-HIL", status: "SKIPPED", detail: `device unreachable at ${EPAPER_DEVICE}`, report: "hil/epaper/report/index.html" })
  } else if (!fs.existsSync(EPAPER_PROJECT)) {
    console.warn(`SKIPPED - fixture not found: ${EPAPER_PROJECT}`)
    summary.push({ name: "epaper-HIL", status: "SKIPPED", detail: "fixture missing", report: "hil/epaper/report/index.html" })
  } else {
    const exitCode = await run("node", ["hil/epaper/orchestrator.js", "--project", EPAPER_PROJECT, "--device", EPAPER_DEVICE], { cwd: REPO_ROOT })
    const results = readResults(path.join(__dirname, "epaper/report"))
    if (!results) {
      summary.push({ name: "epaper-HIL", status: "FAIL", detail: `crashed (exit code ${exitCode}) - see output above`, report: "hil/epaper/report/index.html" })
    } else {
      const passed = results.filter((r) => r.pass).length
      const ok = passed === results.length && results.length > 0
      summary.push({ name: "epaper-HIL", status: ok ? "PASS" : "FAIL", detail: `${passed}/${results.length} cases`, report: "hil/epaper/report/index.html" })
    }
  }

  console.log(`\n=== M5 Dial HIL (device: ${M5DIAL_DEVICE}) ===`)
  const m5dialReachable = (await httpGetStatus(`http://${M5DIAL_DEVICE}/snapshot.bmp`)) === 200
  if (!m5dialReachable) {
    console.warn(`SKIPPED - device not reachable at http://${M5DIAL_DEVICE}/snapshot.bmp (set HIL_M5DIAL_DEVICE to override)`)
    summary.push({ name: "m5dial-HIL", status: "SKIPPED", detail: `device unreachable at ${M5DIAL_DEVICE}`, report: "hil/m5dial/report/index.html" })
  } else if (!fs.existsSync(M5DIAL_PROJECT)) {
    console.warn(`SKIPPED - fixture not found: ${M5DIAL_PROJECT}`)
    summary.push({ name: "m5dial-HIL", status: "SKIPPED", detail: "fixture missing", report: "hil/m5dial/report/index.html" })
  } else {
    const exitCode = await run("node", ["hil/m5dial/orchestrator.js", "--project", M5DIAL_PROJECT, "--device", M5DIAL_DEVICE], { cwd: REPO_ROOT })
    const results = readResults(path.join(__dirname, "m5dial/report"))
    if (!results) {
      summary.push({ name: "m5dial-HIL", status: "FAIL", detail: `crashed (exit code ${exitCode}) - see output above`, report: "hil/m5dial/report/index.html" })
    } else {
      const passed = results.filter((r) => r.pass).length
      const ok = passed === results.length && results.length > 0
      summary.push({ name: "m5dial-HIL", status: ok ? "PASS" : "FAIL", detail: `${passed}/${results.length} cases`, report: "hil/m5dial/report/index.html" })
    }
  }

  console.log("\n=== android HIL ===")
  if (!fs.existsSync(ANDROID_PROJECT)) {
    console.warn(`SKIPPED - no committed Android HIL fixture yet (expected at ${path.relative(REPO_ROOT, ANDROID_PROJECT)})`)
    summary.push({ name: "android-HIL", status: "SKIPPED", detail: "no fixture committed yet", report: "hil/android/report/index.html" })
  } else {
    const serial = await adbConnectedDevice()
    if (!serial) {
      console.warn("SKIPPED - no adb-authorized device connected")
      summary.push({ name: "android-HIL", status: "SKIPPED", detail: "no adb device connected", report: "hil/android/report/index.html" })
    } else {
      const exitCode = await run("node", ["hil/android/orchestrator.js", "--project", ANDROID_PROJECT, "--device", serial], { cwd: REPO_ROOT })
      const results = readResults(path.join(__dirname, "android/report"))
      if (!results) {
        summary.push({ name: "android-HIL", status: "FAIL", detail: `crashed (exit code ${exitCode}) - see output above`, report: "hil/android/report/index.html" })
      } else {
        const tested = results.filter((r) => !r.skipped)
        const passed = tested.filter((r) => r.pass).length
        const ok = passed === tested.length && tested.length > 0
        summary.push({
          name: "android-HIL",
          status: ok ? "PASS" : "FAIL",
          detail: `${passed}/${tested.length} cases (${results.length - tested.length} screen(s) skipped)`,
          report: "hil/android/report/index.html",
        })
      }
    }
  }

  console.log("\n=== Test Summary ===")
  for (const s of summary) {
    console.log(`${s.name.padEnd(12)} ${s.status.padEnd(8)} ${s.detail}`)
  }
  console.log("\nReports:")
  for (const s of summary) {
    console.log(`  ${s.name}: ${s.report}`)
  }

  const anyFail = summary.some((s) => s.status === "FAIL")
  console.log(`\nOverall: ${anyFail ? "FAIL" : "PASS"}`)
  process.exit(anyFail ? 1 : 0)
}

main()
