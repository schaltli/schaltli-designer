// Bundles the whole local test suite into one command: the Playwright
// `e2e/` suite, `hil/epaper/orchestrator.js`, `hil/android/
// orchestrator.js`, `hil/m5dial/orchestrator.js` and (since 2026-08-20)
// `hil/waveshare/`'s orchestrator plus its smoke-test verifier - built
// 2026-07-31 (grill-me session) after repeatedly hitting the friction of
// running each of these by hand, separately, only when someone remembered
// to.
//
// Hardware-dependent HIL suites are skipped - loudly, in both the console
// output and the final summary, never silently - when their device isn't
// reachable, rather than failing the whole run just because a phone wasn't
// plugged in. The epaper and m5dial orchestrators don't fail their own exit
// code on a comparison mismatch (only on a crash), so this wrapper reads each
// one's results.json itself to decide pass/fail - see the two functions
// below. The Waveshare one does set its exit code, and also runs a check that
// never reaches results.json, so both signals are combined there.
//
// Requires the designer dev server running (`npm run dev`,
// http://localhost:3000) for every suite here, same as any orchestrator run
// alone - not started automatically (e2e's own playwright.config.ts already
// reuses/starts one for itself; the HIL scripts have no such fallback and
// will just fail with a connection error if it's down, same as running them
// directly would). Every orchestrator also needs a reachable MQTT broker
// (`npm run hil:broker` - see hil/README.md), same reasoning: not started
// automatically here either. The one exception is the Waveshare smoke-test
// verifier, which talks only to the device over HTTP and needs neither.
//
// Run: npm run test:all
// Each board's address has a default that DHCP can invalidate at any time -
// override with HIL_EPAPER_DEVICE / HIL_M5DIAL_DEVICE / HIL_WAVESHARE_DEVICE
// =<ip> when one has moved (a wrong address just skips that suite, loudly).

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
const WAVESHARE_DEVICE = process.env.HIL_WAVESHARE_DEVICE || "192.168.1.114"
const WAVESHARE_PROJECT = path.join(__dirname, "waveshare/fixtures/smoke-test.zip")
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

  // Separate from the orchestrator above because it covers a different code
  // path entirely: the orchestrator installs projects over HTTP
  // (POST /api/project) and never reaches DeployManager, so the MQTT deploy
  // flow - download, CRC verify, install, reboot - had no coverage at all.
  // Produces no report of its own; it either passes or explains itself in
  // the output. Skips loudly on its own when the device is unreachable.
  console.log(`\n=== M5 Dial MQTT deploy (device: ${M5DIAL_DEVICE}) ===`)
  if (!m5dialReachable) {
    console.warn(`SKIPPED - device not reachable at http://${M5DIAL_DEVICE}/snapshot.bmp`)
    summary.push({ name: "m5dial-deploy", status: "SKIPPED", detail: `device unreachable at ${M5DIAL_DEVICE}` })
  } else {
    const exitCode = await run("node", ["hil/m5dial/deploy-check.js", "--device", M5DIAL_DEVICE, "--project", M5DIAL_PROJECT], { cwd: REPO_ROOT })
    summary.push({
      name: "m5dial-deploy",
      status: exitCode === 0 ? "PASS" : "FAIL",
      detail: exitCode === 0 ? "download, verify, install, reboot" : `exit code ${exitCode} - see output above`,
    })
  }

  console.log(`\n=== Waveshare HIL (device: ${WAVESHARE_DEVICE}) ===`)
  const waveshareReachable = (await httpGetStatus(`http://${WAVESHARE_DEVICE}/snapshot.bmp`)) === 200
  if (!waveshareReachable) {
    console.warn(`SKIPPED - device not reachable at http://${WAVESHARE_DEVICE}/snapshot.bmp (set HIL_WAVESHARE_DEVICE to override)`)
    summary.push({ name: "waveshare-HIL", status: "SKIPPED", detail: `device unreachable at ${WAVESHARE_DEVICE}`, report: "hil/waveshare/report/index.html" })
  } else if (!fs.existsSync(WAVESHARE_PROJECT)) {
    console.warn(`SKIPPED - fixture not found: ${WAVESHARE_PROJECT}`)
    summary.push({ name: "waveshare-HIL", status: "SKIPPED", detail: "fixture missing", report: "hil/waveshare/report/index.html" })
  } else {
    const exitCode = await run("node", ["hil/waveshare/orchestrator.js", "--project", WAVESHARE_PROJECT, "--device", WAVESHARE_DEVICE], { cwd: REPO_ROOT })
    const results = readResults(path.join(__dirname, "waveshare/report"))
    if (!results) {
      summary.push({ name: "waveshare-HIL", status: "FAIL", detail: `crashed (exit code ${exitCode}) - see output above`, report: "hil/waveshare/report/index.html" })
    } else {
      const passed = results.filter((r) => r.pass).length
      const visualOk = passed === results.length && results.length > 0
      // Unlike the other two orchestrators, this one *does* set its own exit
      // code on a mismatch - and it also runs a check that never reaches
      // results.json: the knob's two directions are asserted through MQTT,
      // which has no image pair to put in the report. Reading only
      // results.json would call the whole suite green while that check
      // failed, so the exit code decides too.
      const ok = visualOk && exitCode === 0
      const detail = visualOk && exitCode !== 0
        ? `${passed}/${results.length} visual cases, but a non-visual check failed - see output above`
        : `${passed}/${results.length} visual cases`
      summary.push({ name: "waveshare-HIL", status: ok ? "PASS" : "FAIL", detail, report: "hil/waveshare/report/index.html" })
    }
  }

  // Runs after the orchestrator, not before: it fires a swipe that opens the
  // screen menu overlay, which then dismisses itself on a timer, and a
  // snapshot taken while it is still up would look like a rendering bug.
  // It re-installs the fixture itself rather than inheriting whatever state
  // the orchestrator left - a test establishes its own precondition.
  console.log(`\n=== Waveshare smoke test (device: ${WAVESHARE_DEVICE}) ===`)
  if (!waveshareReachable) {
    console.warn(`SKIPPED - device not reachable at http://${WAVESHARE_DEVICE}/snapshot.bmp`)
    summary.push({ name: "waveshare-smoke", status: "SKIPPED", detail: `device unreachable at ${WAVESHARE_DEVICE}` })
  } else if (!fs.existsSync(WAVESHARE_PROJECT)) {
    console.warn(`SKIPPED - fixture not found: ${WAVESHARE_PROJECT}`)
    summary.push({ name: "waveshare-smoke", status: "SKIPPED", detail: "fixture missing" })
  } else {
    const exitCode = await run("node", ["hil/waveshare/verify-smoke-test.js", WAVESHARE_DEVICE], { cwd: REPO_ROOT })
    summary.push({
      name: "waveshare-smoke",
      status: exitCode === 0 ? "PASS" : "FAIL",
      detail: exitCode === 0 ? "render colors, screen switch, swipe-up screen menu" : `exit code ${exitCode} - see output above`,
    })
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
    console.log(`${s.name.padEnd(16)} ${s.status.padEnd(8)} ${s.detail}`)
  }
  console.log("\nReports:")
  // Not every suite produces one - the MQTT deploy check has nothing to
  // show beyond its own output - so skip those rather than printing
  // "undefined" next to their name.
  for (const s of summary.filter((s) => s.report)) {
    console.log(`  ${s.name}: ${s.report}`)
  }

  const anyFail = summary.some((s) => s.status === "FAIL")
  console.log(`\nOverall: ${anyFail ? "FAIL" : "PASS"}`)
  process.exit(anyFail ? 1 : 0)
}

main()
