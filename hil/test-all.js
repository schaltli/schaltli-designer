// Bundles the whole local test suite into one command: the Playwright
// `e2e/` suite, `hil/epaper/orchestrator.js`, `hil/android/
// orchestrator.js` and (since 2026-08-20) `hil/waveshare/`'s orchestrator
// plus its smoke-test verifier - built
// 2026-07-31 (grill-me session) after repeatedly hitting the friction of
// running each of these by hand, separately, only when someone remembered
// to.
//
// Since 2026-08-29 it also runs the Android app's own JVM unit test, which
// needs no hardware: it checks that repo's copy of the arc rasterizer
// against a golden file generated from THIS repo, so a change here is what
// breaks it and the person making that change is who should see it.
//
// Hardware-dependent HIL suites are skipped - loudly, in both the console
// output and the final summary, never silently - when their device isn't
// reachable, rather than failing the whole run just because a phone wasn't
// plugged in. The epaper orchestrator doesn't fail its own exit code on a
// comparison mismatch (only on a crash), so this wrapper reads each
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
// override with HIL_EPAPER_DEVICE / HIL_WAVESHARE_DEVICE
// =<ip> when one has moved (a wrong address just skips that suite, loudly).

const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
const http = require("http")

const REPO_ROOT = path.join(__dirname, "..")
const EPAPER_DEVICE = process.env.HIL_EPAPER_DEVICE || "192.168.1.110"
const EPAPER_PROJECT = path.join(__dirname, "epaper/fixtures/comprehensive-test.zip")
const ANDROID_PROJECT = path.join(__dirname, "android/fixtures/comprehensive-test.zip")
const WAVESHARE_DEVICE = process.env.HIL_WAVESHARE_DEVICE || "192.168.1.114"
const WAVESHARE_PROJECT = path.join(__dirname, "waveshare/fixtures/smoke-test.zip")
// The 4.3B is a second, separate device on the network - not another mode
// of the knob - so it has its own address.
const WAVESHARE_4V3B_DEVICE = process.env.HIL_WAVESHARE_4V3B_DEVICE || "192.168.1.117"
// The Android app repo, checked out alongside this one. Its arc-rasterizer
// unit test is the only step here that needs no device at all - see the
// android-unit block below for why it runs from this suite anyway.
const ANDROID_REPO = process.env.SCREENBEE_ANDROID_REPO || path.join(REPO_ROOT, "..", "ScreensmithAndroid")
// The Waveshare firmware repo, checked out alongside this one. It owns the
// editable DDF source for both of its boards; the 4.3B's built zip is
// checked in here so the freshness check below can compare against it
// without a device present. (It no longer lacks an HTTP server - it serves
// its own /ddf.zip and announces it over MQTT like the knob does.)
const WAVESHARE_REPO = process.env.SCREENBEE_WAVESHARE_REPO || path.join(REPO_ROOT, "..", "screenbee-waveshare-1v8")
const ADB = process.env.ANDROID_ADB_PATH ||
  path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe")

// Gradle, in decreasing order of "this is what the developer actually
// uses": the repo's own wrapper, then a wrapper distribution Android
// Studio has already unpacked, then whatever is on PATH. The Android
// project is built from Studio and carries no wrapper script of its own,
// so without the second option this step would skip on the very machine it
// was written on.
function findGradle() {
  const wrapper = path.join(ANDROID_REPO, process.platform === "win32" ? "gradlew.bat" : "gradlew")
  if (fs.existsSync(wrapper)) return wrapper

  const distsDir = path.join(process.env.USERPROFILE || process.env.HOME || "", ".gradle", "wrapper", "dists")
  if (fs.existsSync(distsDir)) {
    const binary = process.platform === "win32" ? "gradle.bat" : "gradle"
    for (const dist of fs.readdirSync(distsDir).sort().reverse()) {
      const distPath = path.join(distsDir, dist)
      if (!fs.statSync(distPath).isDirectory()) continue
      for (const hash of fs.readdirSync(distPath)) {
        const candidate = path.join(distPath, hash, dist.replace(/-(bin|all)$/, ""), "bin", binary)
        if (fs.existsSync(candidate)) return candidate
      }
    }
  }

  return process.platform === "win32" ? null : "gradle"
}

// Gradle needs a JVM, and finding one is a separate problem from finding
// Gradle - which cost a whole run to learn. This machine has a Gradle
// unpacked under ~/.gradle and no java on PATH at all, so findGradle()
// succeeded, the wrapper started, and the step reported "exit code 9009" -
// Windows for "command not found". Nothing was broken; the gate was simply
// red because a JVM was invisible.
//
// Same order of preference as findGradle: whatever the developer actually
// uses first. Android Studio bundles a JBR and does not put it on PATH,
// which is exactly why this has to be looked for rather than assumed.
function findJavaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, "bin"))) {
    return process.env.JAVA_HOME
  }
  const exe = process.platform === "win32" ? "java.exe" : "java"
  const candidates = [
    path.join("C:", "Program Files", "Android", "Android Studio", "jbr"),
    path.join("C:", "Program Files", "Android", "Android Studio", "jre"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Android Studio", "jbr"),
    path.join(process.env.HOME || "", "Applications", "Android Studio.app", "Contents", "jbr", "Contents", "Home"),
    "/usr/lib/jvm/default-java",
  ]
  for (const home of candidates) {
    if (home && fs.existsSync(path.join(home, "bin", exe))) return home
  }
  return null
}

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

  // First, and deliberately cheap: it needs no device, no broker and not
  // even the dev server, so it is the one step that can fail before
  // anything else is set up. It runs here rather than only inside
  // `next build` because nothing in this workflow builds - the dev server
  // compiles on demand and never type-checks the whole tree. Zero errors
  // since 2026-08-22; before that the gate was off in next.config.mjs and
  // 28 had accumulated behind it.
  console.log("\n=== typecheck (tsc) ===")
  const typeCode = await run("npm", ["run", "typecheck"], { cwd: REPO_ROOT })
  summary.push({
    name: "typecheck",
    status: typeCode === 0 ? "PASS" : "FAIL",
    detail: typeCode === 0 ? "" : `exit code ${typeCode}`,
    report: "",
  })

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

  // Separate from the orchestrator above because it covers a different code
  // path entirely: the orchestrator installs projects over HTTP
  // (POST /api/project) and never reaches DeployManager, so the MQTT deploy
  // flow - download, CRC verify, install, reboot - had no coverage at all.
  // Ran against the M5 Dial until that device was dropped on 2026-09-10;
  // DeployManager is shared firmware, so the knob exercises the same code.
  // Produces no report of its own; it either passes or explains itself in
  // the output. Skips loudly on its own when the device is unreachable.
  console.log(`\n=== Waveshare MQTT deploy (device: ${WAVESHARE_DEVICE}) ===`)
  if (!waveshareReachable) {
    console.warn(`SKIPPED - device not reachable at http://${WAVESHARE_DEVICE}/snapshot.bmp`)
    summary.push({ name: "waveshare-deploy", status: "SKIPPED", detail: `device unreachable at ${WAVESHARE_DEVICE}` })
  } else {
    const exitCode = await run("node", ["hil/waveshare/deploy-check.js", "--device", WAVESHARE_DEVICE, "--project", WAVESHARE_PROJECT], { cwd: REPO_ROOT })
    summary.push({
      name: "waveshare-deploy",
      status: exitCode === 0 ? "PASS" : "FAIL",
      detail: exitCode === 0 ? "download, verify, install, reboot" : `exit code ${exitCode} - see output above`,
    })
  }

  // Panel memory bandwidth on the 4.3B.
  //
  // Here because a wrong number about this board once became settled fact: a
  // swipe was measured, rejected as "the bus is full at 43ms a frame", and
  // written into a commit message and a source header. The floor is actually
  // 25ms, which only came out when the factory demo was flashed back and
  // visibly slid most of the screen. The firmware now carries the benchmark
  // permanently and this asserts it, so the next person inherits a measured
  // number instead of a story. Skips loudly on its own when the device is
  // absent, and produces no report - it passes or explains itself.
  console.log(`\n=== Waveshare 4.3B panel bandwidth (device: ${WAVESHARE_4V3B_DEVICE}) ===`)
  {
    const exitCode = await run("node", ["hil/waveshare4v3b/panel-bandwidth.js", "--device", WAVESHARE_4V3B_DEVICE], { cwd: REPO_ROOT })
    summary.push({
      name: "waveshare-4v3b-bandwidth",
      status: exitCode === 0 ? "PASS" : "FAIL",
      detail: exitCode === 0 ? "frame floor and swipe-frame cost within bounds" : `exit code ${exitCode} - see output above`,
    })
  }

  // The arc rasterizer's exact short cut, checked against the sampling it
  // replaces over geometries no installed project contains.
  //
  // Supersampling every pixel sixteen times was 185ms of a 312ms render; the
  // short cut recognises the ~92% of pixels that cannot disagree with
  // themselves and answers without sampling, which took the arc from 269ms
  // to 124ms with the screen byte-for-byte identical. The exactness rests on
  // a bound on how far a cross product can move across one pixel, and this
  // is what keeps that from being merely asserted.
  console.log(`\n=== Waveshare 4.3B arc rasterizer self-test (device: ${WAVESHARE_4V3B_DEVICE}) ===`)
  {
    const exitCode = await run("node", ["hil/waveshare4v3b/arc-selftest.js", "--device", WAVESHARE_4V3B_DEVICE], { cwd: REPO_ROOT })
    summary.push({
      name: "waveshare-4v3b-arc",
      status: exitCode === 0 ? "PASS" : "FAIL",
      detail: exitCode === 0 ? "short cut and 16x sampling agree on every pixel" : `exit code ${exitCode} - see output above`,
    })
  }

  // Pixel parity for the 4.3B.
  //
  // The permanent form of a comparison run by hand on 2026-09-10, which
  // found two real bugs in its first hour: a button label centred two pixels
  // off in the designer's preview, and a snapshot that served the screen a
  // swipe had just left. Neither was visible to anyone looking at the panel.
  //
  // --rebake, so the run measures the firmware rather than the age of the
  // deployed bake. Without it the first run reported 714 differing pixels,
  // 564 of which were simply a project exported before the designer's
  // renderer last changed. It re-exports what is installed and puts it back,
  // which is a write to the device - deliberate, and the reason this step
  // needs the device to be one you are willing to deploy to.
  // Conformance: the device publishes a declaration of itself - which object
  // types it supports, where its endpoints are, how big its screen is - and
  // this holds it to that declaration.
  //
  // The step above compares whatever project happens to be installed, so
  // which types it covers is an accident of what the board is doing that day.
  // This one covers every type the DDF claims. It found two disagreements
  // nothing had ever exercised on this renderer the first time it ran - see
  // hil/README.md.
  //
  // Runs against the 4.3B because that is where it was proven. It takes a
  // device argument and nothing else, so pointing it at another board is a
  // one-line change once that board's DDF declares a testInterface.
  console.log(`\n=== conformance (device: ${WAVESHARE_4V3B_DEVICE}) ===`)
  {
    const reachable = (await httpGetStatus(`http://${WAVESHARE_4V3B_DEVICE}/snapshot.bmp`)) === 200
    if (!reachable) {
      console.warn(`SKIPPED - device not reachable at http://${WAVESHARE_4V3B_DEVICE}/snapshot.bmp`)
      summary.push({
        name: "conformance",
        status: "SKIPPED",
        detail: `device unreachable at ${WAVESHARE_4V3B_DEVICE}`,
        report: "hil/conformance/report/index.html",
      })
    } else {
      const exitCode = await run("node", ["hil/conformance/run.js", "--device", WAVESHARE_4V3B_DEVICE], {
        cwd: REPO_ROOT,
      })
      const results = readResults(path.join(__dirname, "conformance/report"))
      if (!results) {
        summary.push({
          name: "conformance",
          status: "FAIL",
          detail: `crashed (exit code ${exitCode}) - see output above`,
          report: "hil/conformance/report/index.html",
        })
      } else {
        const passed = results.filter((r) => r.pass).length
        const types = [...new Set(results.map((r) => r.screenName))].length
        const failingTypes = [...new Set(results.filter((r) => !r.pass).map((r) => r.screenName))]
        summary.push({
          name: "conformance",
          status: passed === results.length ? "PASS" : "FAIL",
          detail:
            passed === results.length
              ? `${types} object type(s), ${passed}/${results.length} cases`
              : `${failingTypes.join(", ")} differ - ${passed}/${results.length} cases`,
          report: "hil/conformance/report/index.html",
        })
      }
    }
  }

  console.log(`\n=== Waveshare 4.3B pixel parity (device: ${WAVESHARE_4V3B_DEVICE}) ===`)
  {
    const reachable = (await httpGetStatus(`http://${WAVESHARE_4V3B_DEVICE}/snapshot.bmp`)) === 200
    if (!reachable) {
      console.warn(`SKIPPED - device not reachable at http://${WAVESHARE_4V3B_DEVICE}/snapshot.bmp (set HIL_WAVESHARE_4V3B_DEVICE to override)`)
      summary.push({ name: "waveshare-4v3b-HIL", status: "SKIPPED", detail: `device unreachable at ${WAVESHARE_4V3B_DEVICE}`, report: "hil/waveshare4v3b/report/index.html" })
    } else {
      const exitCode = await run("node", ["hil/waveshare4v3b/orchestrator.js", "--device", WAVESHARE_4V3B_DEVICE, "--rebake"], { cwd: REPO_ROOT })
      const results = readResults(path.join(__dirname, "waveshare4v3b/report"))
      if (!results) {
        summary.push({ name: "waveshare-4v3b-HIL", status: "FAIL", detail: `crashed (exit code ${exitCode}) - see output above`, report: "hil/waveshare4v3b/report/index.html" })
      } else {
        const passed = results.filter((r) => r.pass).length
        const worst = results.reduce((m, r) => Math.max(m, r.diffPixels || 0), 0)
        summary.push({
          name: "waveshare-4v3b-HIL",
          status: passed === results.length && results.length > 0 ? "PASS" : "FAIL",
          detail: `${passed}/${results.length} visual cases, worst ${worst}px`,
          report: "hil/waveshare4v3b/report/index.html",
        })
      }
    }
  }

  // Is the Android DDF this repo serves still the one its source describes?
  //
  // `public/ddf/android-phone.ddf.zip` is a built artefact whose source
  // lives in the app's repo (ScreensmithAndroid/ddf-source). A built file
  // checked in next to no check is a file that goes stale quietly - which is
  // exactly what happened to the M5 Dial's DDF, and to this one, whose
  // supportedObjectTypes was missing two types the app could render. The
  // builder's output is byte-deterministic, so this only ever fires on a
  // real difference.
  console.log("\n=== android DDF freshness ===")
  const ddfBuilder = path.join(ANDROID_REPO, "tools", "build-ddf.js")
  if (!fs.existsSync(ddfBuilder)) {
    console.warn(`SKIPPED - Android repo not checked out at ${ANDROID_REPO} (set SCREENBEE_ANDROID_REPO to override)`)
    summary.push({ name: "android-ddf", status: "SKIPPED", detail: "Android repo not checked out", report: "" })
  } else {
    const exitCode = await run("node", [ddfBuilder, "--check"], { cwd: ANDROID_REPO })
    summary.push({
      name: "android-ddf",
      status: exitCode === 0 ? "PASS" : "FAIL",
      detail: exitCode === 0 ? "public/ddf zip matches ddf-source" : "stale - run node tools/build-ddf.js in the Android repo",
      report: "",
    })
  }

  // Same guard for the Waveshare 4.3B, and for the same reason: public/ddf
  // carries a copy of bytes whose editable source lives in another repo, so
  // something has to compare them or they drift silently. That is the exact
  // failure this DDF machinery was built to prevent - a device serving one
  // DDF while the designer holds another, both with correct hashes for what
  // they have, and no way to tell from either side.
  //
  // Checks the generator's own header and DeviceInfo hash too, so a firmware
  // source edited without regenerating is caught here as well.
  console.log("\n=== waveshare 4.3B DDF freshness ===")
  const wsGenerator = path.join(WAVESHARE_REPO, "tools", "generate-ddf-header.js")
  const wsDdfZip = path.join(REPO_ROOT, "public", "ddf", "waveshare-touch-lcd-4v3b.ddf.zip")
  if (!fs.existsSync(wsGenerator)) {
    console.warn(`SKIPPED - Waveshare repo not checked out at ${WAVESHARE_REPO} (set SCREENBEE_WAVESHARE_REPO to override)`)
    summary.push({ name: "waveshare-ddf", status: "SKIPPED", detail: "Waveshare repo not checked out", report: "" })
  } else {
    const exitCode = await run("node", [wsGenerator, "ddf-source-4v3b", "--check", "--zip", wsDdfZip], {
      cwd: WAVESHARE_REPO,
    })
    summary.push({
      name: "waveshare-ddf",
      status: exitCode === 0 ? "PASS" : "FAIL",
      detail:
        exitCode === 0
          ? "public/ddf zip matches ddf-source-4v3b"
          : "stale - see the regenerate command printed above",
      report: "",
    })
  }

  // The Android app's own JVM unit test, which holds that repo's copy of
  // the arc rasterizer to the numbers the designer's copy produces
  // (hil/android/fixtures/build-arc-golden.js records them). It needs no
  // phone and no broker, but it belongs in this suite rather than in that
  // repo alone: the golden file is generated from THIS repo, so a change to
  // lib/arc-raster.ts here is exactly what invalidates it, and the person
  // making that change is the one who has to see it go red.
  console.log("\n=== android unit tests (arc rasterizer) ===")
  if (!fs.existsSync(path.join(ANDROID_REPO, "app", "build.gradle.kts"))) {
    console.warn(`SKIPPED - Android repo not checked out at ${ANDROID_REPO} (set SCREENBEE_ANDROID_REPO to override)`)
    summary.push({ name: "android-unit", status: "SKIPPED", detail: "Android repo not checked out", report: "" })
  } else {
    const gradle = findGradle()
    if (!gradle) {
      console.warn("SKIPPED - no Gradle found (no wrapper in the Android repo, none on PATH, none unpacked under ~/.gradle)")
      summary.push({ name: "android-unit", status: "SKIPPED", detail: "no Gradle available", report: "" })
    } else {
      // JAVA_HOME is passed explicitly rather than relied on: Gradle finds a
      // JVM through it, and Android Studio's bundled one is never on PATH.
      const javaHome = findJavaHome()
      if (javaHome) console.log(`using JAVA_HOME=${javaHome}`)
      else console.warn("no JVM found - Gradle will fail rather than run; set JAVA_HOME to fix")
      const exitCode = await run(gradle, ["testDebugUnitTest", "--console=plain"], {
        cwd: ANDROID_REPO,
        env: javaHome ? { ...process.env, JAVA_HOME: javaHome } : process.env,
      })
      summary.push({
        name: "android-unit",
        status: exitCode === 0 ? "PASS" : "FAIL",
        detail: exitCode === 0 ? "arc rasterizer matches the designer" : `exit code ${exitCode} - see output above`,
        report: "",
      })
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
