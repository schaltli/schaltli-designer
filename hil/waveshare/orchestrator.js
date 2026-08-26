// HIL test orchestrator for the Waveshare Knob-1.8 firmware
// (screenbee-waveshare-1v8). Same strategy as hil/m5dial/orchestrator.js -
// see its header for the full rationale - against this board's test
// interface, which is the same shape: everything on port 80 once WiFi is up.
//
// What it does, per screen and per MQTT-value combination:
//   1. publish the combination's topic values to the broker
//   2. poll GET /api/topic-values until the device reports them back, rather
//      than sleeping - a snapshot taken a few ms early captures the previous
//      value and looks exactly like a rendering bug
//   3. POST /api/screen to force a full render, then GET /snapshot.bmp
//   4. render the identical screen and values headlessly through the
//      designer's own renderer (app/test-render)
//   5. compare strictly, pixel for pixel
//
// Strict comparison is the point, not a nicety: this is the method that took
// the e-paper firmware's text rendering from 15177 differing pixels to zero,
// finding six real bugs on the way - u8g2 font-mode resets, a firmware
// border drawn after text, missing color quantization. A tolerance would
// have hidden every one of them.
//
// Needs, all at once:
//   - `npm run dev` (the designer, for the headless reference render)
//   - `npm run hil:broker` (or any broker the device is configured for)
//   - the device on the network and pointed at that same broker
//
// Run: node hil/waveshare/orchestrator.js --device <ip> [--project <zip>]
//
// --project defaults to fixtures/smoke-test.zip. Pass --skip-upload to test
// against whatever is already installed.

const fs = require("fs")
const path = require("path")
const mqtt = require("mqtt")
const { chromium } = require("playwright")
const { Jimp } = require("jimp")
const JSZip = require("jszip")
const { buildReport, comparePixels } = require("../report-template")
const { combinationCount, combinationOverrides } = require("../combinations")
const { createHash } = require("crypto")

// The designer computes this in lib/ddf-name.ts, on top of its own
// lib/sha256.ts - which exists because crypto.subtle is unavailable in the
// insecure context this app runs in. Neither can be required from here (both
// are TypeScript, and this runs under plain node), so it is recomputed with
// node's digest. Safe because e2e/ddf-name.spec.ts pins lib/sha256.ts
// against exactly this implementation at every length 0-200: if the two ever
// disagreed, that spec would go red before this ever could.
const computeDdfHash = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 16)

// Matching hil/m5dial/orchestrator.js, which spells the topics out too -
// lib/topic-prefix.ts is TypeScript and out of reach here.
const TOPIC_PREFIX = "screenbee"

const MQTT_URL = process.env.HIL_MQTT_URL || "mqtt://localhost:1883"
const DESIGNER_URL = process.env.HIL_DESIGNER_URL || "http://localhost:3000/test-render"
const OUT_DIR = path.join(__dirname, "report")
const IMG_DIR = path.join(OUT_DIR, "images")
// This board's DDF lives only in its firmware repo, never baked into this
// one - same arrangement as the M5 Dial since 2026-08-16.
const { DDF_SOURCE_DIR, withDdfFontData } = require("./ddf-fonts")
const DEFAULT_PROJECT = path.join(__dirname, "fixtures", "smoke-test.zip")

function arg(name, fallback) {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const deviceHost = arg("--device")
const projectZip = arg("--project", DEFAULT_PROJECT)
const skipUpload = process.argv.includes("--skip-upload")
if (!deviceHost) {
  console.error("usage: node hil/waveshare/orchestrator.js --device <ip> [--project <zip>] [--skip-upload]")
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Font BDF text is deliberately NOT in the project zip: the firmware
// resolves fonts by matching internalName against compiled-in u8g2 tables
// and never opens a file, so embedding one would be dead upload weight. The
// designer's reference render does need real glyph data though, so it is
// resolved here from the DDF source - matched on internalName, the
// identifier both sides already agree on.
async function loadProjectFromZip(zipPath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
  const projectFile = zip.file("project.json")
  if (!projectFile) throw new Error(`${zipPath} has no project.json`)
  const project = JSON.parse(await projectFile.async("string"))

  // Shared with the fixture builder (hil/waveshare/ddf-fonts.js). It used
  // to live here alone, and the builder - which bakes SoftwareButton
  // bitmaps through the real export - had no font bytes at all: the
  // reference drew real glyphs, the baked bitmap drew a fallback, and the
  // device differed from the reference by the width of one word.
  project.fonts = withDdfFontData(project.fonts)

  return project
}

async function waitForDevice(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${deviceHost}/ddf.zip`, { signal: AbortSignal.timeout(4000) })
      if (res.ok) return true
    } catch {
      // still rebooting
    }
    await sleep(2000)
  }
  return false
}

async function uploadProject(zipPath) {
  const form = new FormData()
  form.append("file", new Blob([fs.readFileSync(zipPath)]), path.basename(zipPath))
  try {
    // The device reboots into the installed project rather than rebuilding
    // live render state mid-request, so this request never gets a reply -
    // the timeout is the success path.
    await fetch(`http://${deviceHost}/api/project`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(25000),
    })
  } catch {
    // expected
  }
  if (!(await waitForDevice())) throw new Error("device did not come back after upload")
}

// Installing a project must leave the previous one's files gone, not merely
// overwrite the ones whose names happen to collide.
//
// This is checked because it was not true. The installer cleared /PROJECT by
// deleting files while walking the directory with openNextFile(), which
// advances a cursor that removal shifts, so about half the entries survived
// each pass; the leftover directory then could not be removed, mkdir() on it
// does not fail, and the install carried on and reported success. Orphaned
// background bitmaps - 388KB apiece - piled up from every project ever
// installed until the 3.5MB filesystem could no longer stage an upload, at
// which point the device refused all installs while rendering, replying and
// reporting itself perfectly healthy. Nothing in either HIL suite noticed,
// because everything they assert on kept passing (2026-08-23, fixed in
// screenbee-waveshare-1v8).
//
// The invariant is exact rather than approximate: /PROJECT afterwards holds
// what the uploaded zip carried and nothing else. `_source/` is excluded -
// the device stores the editable copy as /recovery_project.zip, outside
// /PROJECT, deliberately so that it survives an install.
async function checkInstallLeftNothingBehind(zipPath) {
  let failures = 0
  const say = (ok, name, detail) => {
    if (!ok) failures++
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`)
  }

  let fsInfo
  try {
    const res = await fetch(`http://${deviceHost}/api/fs`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    fsInfo = await res.json()
  } catch (err) {
    // Older firmware without /api/fs: say so rather than passing silently,
    // since a skipped check that looks like a pass is how this got missed.
    console.log(`skip the install left nothing behind - /api/fs unavailable (${err.message})`)
    return 0
  }

  console.log("\n--- the install cleared the previous project ---")

  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
  const expected = new Set()
  zip.forEach((relPath, entry) => {
    if (entry.dir) return
    if (relPath === "_source" || relPath.startsWith("_source/")) return
    expected.add("/PROJECT/" + relPath)
  })

  const onDevice = fsInfo.files.map((f) => f.name).filter((n) => n.startsWith("/PROJECT/"))
  const orphans = onDevice.filter((n) => !expected.has(n))
  const missing = [...expected].filter((n) => !onDevice.includes(n))

  say(
    orphans.length === 0,
    "no files from a previous project survive under /PROJECT",
    orphans.length ? `${orphans.length} orphan(s): ${orphans.slice(0, 4).join(", ")}${orphans.length > 4 ? " ..." : ""}` : `${onDevice.length} file(s), all expected`,
  )
  say(missing.length === 0, "everything the zip carries was installed", missing.length ? missing.join(", ") : `${expected.size} entry(s)`)

  // Headroom, so "the filesystem is quietly filling up" fails a test run
  // rather than surfacing one day as installs that do nothing. The staged
  // upload is written to LittleFS in full before the old project is cleared,
  // so an install needs room for the zip *on top of* everything already
  // there - that ordering is what turned a slow leak into a hard stop.
  const zipSize = fs.statSync(zipPath).size
  say(
    fsInfo.freeBytes > zipSize,
    "the filesystem can still stage an upload of this size",
    `${(fsInfo.freeBytes / 1024).toFixed(0)}KB free, zip is ${(zipSize / 1024).toFixed(0)}KB`,
  )
  say(fsInfo.lastInstallError === "", "the device reports no install error", fsInfo.lastInstallError || "none")

  return failures
}

// Polls until the device's own loader reports every published value back.
async function waitForTopicValuesApplied(overrides, { intervalMs = 150, timeoutMs = 15000 } = {}) {
  const topics = Object.keys(overrides)
  if (topics.length === 0) return

  const url = `http://${deviceHost}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const values = await res.json()
        if (topics.every((t) => String(values[t]) === String(overrides[t]))) return
      }
    } catch {
      // transient - the device is busy handling the message that just landed
    }
    await sleep(intervalMs)
  }
  throw new Error(`device did not apply published values within ${timeoutMs}ms: ${JSON.stringify(overrides)}`)
}

// Retried, like the smoke-test verifier: at a weak signal a single ~380KB
// snapshot has been measured taking 8s, and a HIL run that fails at random
// teaches you to ignore it.
async function fetchSnapshot(attempts = 3) {
  let lastError
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://${deviceHost}/snapshot.bmp`, { signal: AbortSignal.timeout(45000) })
      if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      lastError = e
      console.log(`    (snapshot attempt ${i + 1} failed, retrying)`)
    }
  }
  throw new Error(`snapshot failed after ${attempts} attempts: ${lastError.message}`)
}

let idleScreenWas = ""

async function main() {
  fs.mkdirSync(IMG_DIR, { recursive: true })
  const project = await loadProjectFromZip(projectZip)
  console.log(`project "${project.name}", ${project.screens.length} screen(s), ${project.fonts.length} font(s) resolved`)

  let installFailures = 0
  let bootScreenFailures = 0
  if (!skipUpload) {
    // --- the idle screen at boot ----------------------------------------
    //
    // The device comes up on its configured idle screen, not on screen 0
    // (screenbee-waveshare-1v8, DeviceSettings::idleScreenId) - so a panel
    // switching heating and air conditioning is found on something harmless
    // after a power cut, the same as after it goes dark.
    //
    // Set *before* the upload, while a different project is still installed,
    // and asserted after the device reboots into this one. That ordering is
    // the point rather than a convenience: the setting stores a screen *id*
    // precisely so it survives a redeploy, and this is the only place in the
    // suite where a redeploy actually happens. Costs no extra reboot - the
    // install already does one.
    const setIdle = async (id) => {
      const res = await fetch(`http://${deviceHost}/api/device-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `idleScreenId=${id}`,
      })
      return (await res.json()).success
    }
    const idleWas = (await (await fetch(`http://${deviceHost}/api/device-settings`)).json()).idleScreenId
    const idleSet = await setIdle("screen-2")

    console.log(`uploading ${path.basename(projectZip)} to ${deviceHost}...`)
    await uploadProject(projectZip)
    installFailures = await checkInstallLeftNothingBehind(projectZip)

    console.log("\n--- idle screen at boot ---")
    const bootCheck = (name, ok, detail) => {
      if (!ok) bootScreenFailures++
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`)
    }
    bootCheck("an idle screen could be chosen before the redeploy", idleSet === true, "screen-2")
    const booted = await (await fetch(`http://${deviceHost}/api/debug`)).json()
    bootCheck(
      "the id survived the redeploy and resolved in the new project",
      booted.idleScreenId === "screen-2" && booted.idleScreenIndex === 1,
      `"${booted.idleScreenId}" -> ${booted.idleScreenIndex}`,
    )
    bootCheck(
      "the device booted onto the idle screen rather than screen 0",
      booted.screenIndex === 1,
      `screenIndex ${booted.screenIndex}`,
    )

    // Cleared for the rest of the run: every check below pages between
    // screens and asserts where it lands, and an idle screen would move the
    // device under them as soon as a run idled past the blanking timeout.
    // Restored at the end of main(), with the blanking timeout.
    await setIdle("")
    idleScreenWas = idleWas
  } else if (!(await waitForDevice(15000))) {
    throw new Error(`device at ${deviceHost} is not reachable`)
  }

  console.log("connecting to MQTT broker...")
  const mqttClient = mqtt.connect(MQTT_URL, { clientId: "hil-waveshare-" + Math.random().toString(16).slice(2) })
  await new Promise((resolve, reject) => {
    mqttClient.on("connect", resolve)
    mqttClient.on("error", reject)
    setTimeout(() => reject(new Error("MQTT connect timeout")), 10000)
  })

  console.log("launching headless designer...")
  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on("pageerror", (err) => console.log("[designer page error]", err.message))
  // domcontentloaded, not networkidle: the designer runs under `next dev`,
  // whose HMR websocket stays open forever, so "the network went quiet" is a
  // condition that may simply never arrive. The harness setting its own
  // ready flag is the real signal and the only one worth waiting on.
  //
  // The timeout is generous because a cold `next dev` compiles this route on
  // its first request, which can take far longer than a warm one - long
  // enough that a tighter limit fails against a perfectly healthy setup.
  await page.goto(DESIGNER_URL, { waitUntil: "domcontentloaded" })
  // The `undefined` is load-bearing: waitForFunction's signature is
  // (fn, arg, options), so passing the options object second silently makes
  // it the *argument* and leaves the timeout at Playwright's 30s default.
  // hil/m5dial/orchestrator.js has the same latent mistake.
  await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 90000 })

  const results = []

  // --- input actions ----------------------------------------------------
  //
  // The knob's two directions are bound to send-mqtt in the fixture, so
  // firing them must publish. Dispatched via POST /api/input rather than by
  // turning a physical knob: the quadrature decoding still needs a human,
  // but everything downstream of "an input fired" is ordinary logic and
  // belongs under test. This lives here rather than in the smoke-test
  // verifier because it is the only check that needs a broker to observe.
  // Establish the screen first rather than inheriting whatever the last run
  // left behind: actions resolve per screen, and only screen 0 binds the
  // knob. Found by this check failing on a second run purely because the
  // previous one ended on screen 1 - an order dependency that would have
  // read as a firmware regression.
  await fetch(`http://${deviceHost}/api/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "index=0",
  })

  // --- the retained hello ------------------------------------------------
  //
  // This is the only check that looks at what the device tells the *world*
  // rather than what it does when asked, and it guards a failure with no
  // symptom on the device at all: the DDF hash it announces is compiled in,
  // and the designer refuses a fetch whose bytes hash to something else. A
  // hash that has drifted from the zip does not degrade auto-discovery, it
  // ends it - the device simply never appears, while serving a perfectly
  // good DDF and behaving normally in every other respect.
  //
  // Hashed here with the designer's own computeDdfHash rather than node's
  // crypto, because the designer's implementation is what will actually
  // judge it (lib/sha256.ts exists because crypto.subtle is unavailable
  // over plain HTTP on a LAN address).
  console.log("\n--- retained hello ---")
  const hello = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no retained hello within 10s")), 10000)
    mqttClient.subscribe(`${TOPIC_PREFIX}/+/hello`, (err) => {
      if (err) {
        clearTimeout(timer)
        reject(err)
      }
    })
    const onHello = (topic, message) => {
      if (!topic.endsWith("/hello") || message.length === 0) return
      let payload
      try {
        payload = JSON.parse(message.toString())
      } catch {
        return
      }
      // Several devices may be retained on this broker; this run is about
      // the one it was pointed at.
      if (!payload.url || !payload.url.includes(deviceHost)) return
      clearTimeout(timer)
      mqttClient.off("message", onHello)
      resolve(payload)
    }
    mqttClient.on("message", onHello)
  })

  const servedDdf = new Uint8Array(
    await (await fetch(`http://${deviceHost}/ddf.zip`, { signal: AbortSignal.timeout(15000) })).arrayBuffer(),
  )
  const servedHash = computeDdfHash(servedDdf)
  const helloChecks = [
    ["announces a ddfHash", typeof hello.ddfHash === "string" && hello.ddfHash.length === 16, hello.ddfHash],
    ["the announced hash matches the DDF actually served", hello.ddfHash === servedHash, `${hello.ddfHash} vs ${servedHash}`],
    // Only the major gates anything, but an unparseable value would be
    // silently treated as absent by the deploy dialog, which is exactly the
    // check it is there to perform.
    ["announces a parseable systemGeneration", /^\d+\.\d+$/.test(hello.systemGeneration || ""), hello.systemGeneration],
    ["announces a url to fetch the DDF from", typeof hello.url === "string" && hello.url.endsWith("/ddf.zip"), hello.url],
    // The retired field. Announcing it again would not break anything today
    // - the designer ignores unknown keys - but it is how two sources of
    // truth creep back in.
    ["no longer announces the retired ddfVersion", hello.ddfVersion === undefined, String(hello.ddfVersion)],
  ]
  let helloFailures = 0
  for (const [name, ok, detail] of helloChecks) {
    if (!ok) helloFailures++
    console.log(`${ok ? "ok  " : "FAIL"} ${name}  ${detail}`)
  }

  // The device agreeing with itself is not enough - it did, while being
  // wrong. ddf_zip.h is compiled in and was regenerated by hand, so a change
  // to ddf-source/device.json could be built, flashed and announced while
  // the device kept serving the DDF from before it. Both of the checks above
  // pass in that state: the announced hash matches the served zip, because
  // both are the same stale artefact.
  //
  // What it cost: arc-level was declared, the firmware rebuilt and flashed,
  // and the designer - correctly fetching the device's live DDF during
  // project recovery - got a DDF without it and greyed the tool out. The
  // symptom was a button, three steps away from the cause. The clue was an
  // unchanged ddfHash across a change to device.json, which is impossible,
  // sitting in every HIL run with nothing asserting it.
  //
  // The build now regenerates the header (screenbee-waveshare-1v8 59e75a5),
  // so this compares the device against the repo it was built from and
  // fails if a stale image is on the board.
  try {
    const servedZip = Buffer.from(
      await (await fetch(`http://${deviceHost}/ddf.zip`, { signal: AbortSignal.timeout(15000) })).arrayBuffer(),
    )
    const served = JSON.parse(await (await JSZip.loadAsync(servedZip)).file("device.json").async("string"))
    const source = JSON.parse(fs.readFileSync(path.join(DDF_SOURCE_DIR, "device.json"), "utf8"))
    const servedTypes = [...(served.supportedObjectTypes || [])].sort()
    const sourceTypes = [...(source.supportedObjectTypes || [])].sort()
    const same = JSON.stringify(servedTypes) === JSON.stringify(sourceTypes)
    if (!same) helloFailures++
    console.log(
      `${same ? "ok  " : "FAIL"} the DDF on the device matches ddf-source/  ` +
        (same
          ? `${servedTypes.length} object type(s)`
          : `device is missing [${sourceTypes.filter((t) => !servedTypes.includes(t)).join(", ") || "-"}], ` +
            `has extra [${servedTypes.filter((t) => !sourceTypes.includes(t)).join(", ") || "-"}] - flash a current build`),
    )
  } catch (err) {
    helloFailures++
    console.log(`FAIL the DDF on the device matches ddf-source/  ${err.message}`)
  }

  // --- display blanking vs. MQTT -----------------------------------------
  //
  // The screen turns off after a stretch with no *human* input, and
  // arriving MQTT values deliberately do not count as input
  // (screenbee-waveshare-1v8 f814877). That distinction is the whole
  // feature: a screen showing live readings is exactly the one someone
  // wants dark at night, and if published values kept it awake it would
  // never blank on any project it was built for - while looking perfectly
  // implemented from the code.
  //
  // Only reachable with a broker, which is why it is here rather than in
  // verify-smoke-test.js, where the rest of the blanking checks live.
  console.log("\n--- display blanking vs. MQTT ---")
  const blankingBefore = (await (await fetch(`http://${deviceHost}/api/debug`)).json()).displayOffAfterSeconds
  const setBlanking = async (seconds) => {
    const res = await fetch(`http://${deviceHost}/api/device-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `displayOffAfterSeconds=${seconds}`,
    })
    return (await res.json()).success
  }

  let blankingFailures = 0
  const blankCheck = (name, ok, detail) => {
    if (!ok) blankingFailures++
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`)
  }

  await setBlanking(2)
  // Publish steadily across more than the timeout, touching nothing.
  for (let i = 0; i < 8; i++) {
    mqttClient.publish("hil-test/temperature", String(20 + i))
    await sleep(500)
  }
  const afterTraffic = await (await fetch(`http://${deviceHost}/api/debug`)).json()
  blankCheck(
    "the display blanks even while MQTT values keep arriving",
    afterTraffic.displayIsOff === true,
    `idle ${afterTraffic.idleMs}ms after 4s of publishing`,
  )
  // And the values really did arrive - otherwise this passes on a device
  // that simply never heard the broker, which from here looks exactly like
  // the feature working.
  let valuesArrived = true
  try {
    await waitForTopicValuesApplied({ "hil-test/temperature": "27" }, { timeoutMs: 5000 })
  } catch {
    valuesArrived = false
  }
  blankCheck("the values did arrive while it was blanking", valuesArrived, "hil-test/temperature = 27")

  // --- Antippen von Switch und SoftwareButton ----------------------------
  //
  // Bis 2026-08-24 wertete diese Firmware ein Antippen gar nicht aus: die
  // einzige Erwaehnung von SoftwareButton in main.cpp war ein Kommentar
  // "(later)". Die Objekte wurden gezeichnet und zeigten ihren Zustand
  // korrekt - der kommt ueber MQTT herein - aber ein Tipp verpuffte. Das
  // fiel niemandem auf, weil in dieser Vorlage kein bedienbares Objekt war.
  //
  // Geprueft wird deshalb das, was von aussen sichtbar ist: kommt nach einem
  // Tipp die richtige Nachricht am Broker an?
  console.log("\n--- Antippen von Switch und SoftwareButton ---")
  let tapFailures = 0
  const tapCheck = (name, ok, detail) => {
    if (!ok) tapFailures++
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`)
  }

  // Auf Screen 2, dort liegen die beiden Objekte.
  await fetch(`http://${deviceHost}/api/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "index=1",
  })
  await sleep(500)

  const touch = async (x, y) => {
    // Erst wecken, wenn der Schirm dunkel ist: auf einem dunklen Display
    // weckt der erste Tipp nur und loest bewusst nichts aus - dieses Geraet
    // schaltet Heizung und Klima, und ein Griff ins Dunkle darf nichts
    // veraendern. Ohne diesen Schritt schlaegt der Test scheinbar zufaellig
    // fehl, je nachdem wie lange die vorigen Pruefungen gedauert haben.
    const dbg = await (await fetch(`http://${deviceHost}/api/debug`)).json()
    if (dbg.displayIsOff) {
      await fetch(`http://${deviceHost}/api/touch`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "x=180&y=330&down=1",
      })
      await fetch(`http://${deviceHost}/api/touch`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "x=180&y=330&down=0",
      })
      await sleep(600)
    }
    for (const down of [1, 0]) {
      await fetch(`http://${deviceHost}/api/touch`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `x=${x}&y=${y}&down=${down}`,
      })
      await sleep(200)
    }
    await sleep(500)
  }

  const empfangen = []
  const onTap = (topic, payload) => {
    if (topic === "hil-test/schalter/set" || topic === "hil-test/knopf") {
      empfangen.push(`${topic}=${payload.toString()}`)
    }
  }
  await new Promise((resolve, reject) => {
    mqttClient.subscribe(["hil-test/schalter/set", "hil-test/knopf"], (err) => (err ? reject(err) : resolve()))
  })
  mqttClient.on("message", onTap)

  // Der Switch liegt bei x=40..320, y=180..226 - zwei gleich breite Segmente,
  // also AUS links und AN rechts.
  await touch(110, 203)
  tapCheck(
    "ein Tipp auf das linke Segment schickt dessen writeValue",
    empfangen.includes("hil-test/schalter/set=aus"),
    JSON.stringify(empfangen),
  )

  empfangen.length = 0
  await touch(250, 203)
  tapCheck(
    "ein Tipp auf das rechte Segment schickt das andere",
    empfangen.includes("hil-test/schalter/set=an"),
    JSON.stringify(empfangen),
  )

  empfangen.length = 0
  await touch(180, 263)
  tapCheck(
    "ein Tipp auf den SoftwareButton fuehrt seine Aktion aus",
    empfangen.includes("hil-test/knopf=gedrueckt"),
    JSON.stringify(empfangen),
  )

  // Und daneben passiert nichts - sonst wuerde jeder Tipp irgendwo auf dem
  // Schirm das naechstgelegene Objekt ausloesen.
  empfangen.length = 0
  await touch(180, 320)
  tapCheck(
    "ein Tipp neben die Objekte loest nichts aus",
    empfangen.length === 0,
    JSON.stringify(empfangen),
  )

  mqttClient.off("message", onTap)

  // --- Teilbild deckt sich mit Vollbild ----------------------------------
  //
  // Ein neuer Topic-Wert zeichnet seit 2026-08-24 nur noch den geaenderten
  // Ausschnitt neu statt des ganzen Bildschirms - beim Ring den bewegten
  // Bogenabschnitt und die Zahl in der Mitte, in zwei getrennten Rechtecken.
  // Der Grund war Messung, nicht Gefuehl: ein Vollbild dieses Ringes kostete
  // 244-265ms, weil jedes Ringpixel 16-fach abgetastet wird, waehrend Netz
  // und Node-RED zusammen nur 16ms brauchten. Nach dem Umbau sind es 18-21ms.
  //
  // Die Abkuerzung ist aber nur zulaessig, solange sie NICHTS am Bild aendert:
  // die ganze HIL-Kette rechnet damit, dass das Geraet Pixel fuer Pixel
  // dasselbe zeichnet wie der Designer. Deshalb hier die eine Frage, die das
  // beantwortet - ergibt teilweise gezeichnet dasselbe wie voll gezeichnet?
  //
  // Der Vergleich ueber canvasHash beweist zugleich, dass der Bogen ueberhaupt
  // neu gezeichnet wird: liesse der Teilpfad ihn stehen, muesste sich der Hash
  // vom Vollbild unterscheiden.
  console.log("\n--- Teilbild deckt sich mit Vollbild ---")
  let partialFailures = 0
  const partialCheck = (name, ok, detail) => {
    if (!ok) partialFailures++
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`)
  }

  const debugJson = async () => (await (await fetch(`http://${deviceHost}/api/debug`)).json())

  // Auf den Ring-Screen und einen definierten Ausgangswert.
  await fetch(`http://${deviceHost}/api/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "index=0",
  })
  mqttClient.publish("hil-test/level", "10")
  await waitForTopicValuesApplied({ "hil-test/level": "10" }, { timeoutMs: 5000 })
  await sleep(400)

  // Mehrere Schritte hintereinander, damit sich ein Fehler im Ausschnitt
  // aufsummieren kann statt sich im ersten Schritt zu verstecken.
  for (const wert of ["30", "60", "90", "40"]) {
    mqttClient.publish("hil-test/level", wert)
    await waitForTopicValuesApplied({ "hil-test/level": wert }, { timeoutMs: 5000 })
    await sleep(300)
  }

  const teilweise = await debugJson()
  // Erzwingt ein Vollbild desselben Zustands.
  await fetch(`http://${deviceHost}/api/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "index=0",
  })
  await sleep(600)
  const voll = await debugJson()

  partialCheck(
    "teilweise gezeichnet ergibt denselben Bildschirm wie voll gezeichnet",
    typeof teilweise.canvasHash === "number" && teilweise.canvasHash === voll.canvasHash,
    `canvasHash ${teilweise.canvasHash} vs ${voll.canvasHash}`,
  )

  // Und dass die Abkuerzung wirklich genommen wurde - sonst pruefte der
  // Vergleich oben zwei Vollbilder gegeneinander und waere wertlos.
  const lat = teilweise.lat || []
  partialCheck(
    "der Teilbild-Pfad wurde tatsaechlich benutzt",
    lat.some((e) => e[1] === "prt"),
    lat.filter((e) => e[1] === "prt").slice(-1).map((e) => e[2]).join("") || "keine prt-Marke",
  )

  // Restore, so a test run does not leave a device setting changed behind
  // it - the suite already replaces the installed project, which is enough
  // surprise for one run.
  await setBlanking(blankingBefore)
  await fetch(`http://${deviceHost}/api/device-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `idleScreenId=${idleScreenWas}`,
  })

  const knobResults = []
  await new Promise((resolve, reject) => {
    mqttClient.subscribe("hil-test/knob", (err) => (err ? reject(err) : resolve()))
  })
  const onKnob = (topic, payload) => {
    if (topic === "hil-test/knob") knobResults.push(payload.toString())
  }
  mqttClient.on("message", onKnob)

  for (const id of ["button-1", "button-0"]) {
    const res = await fetch(`http://${deviceHost}/api/input`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `id=${id}`,
    })
    const json = await res.json()
    if (!json.success) throw new Error(`/api/input ${id} failed: ${JSON.stringify(json)}`)
    await sleep(600)
  }
  mqttClient.off("message", onKnob)

  const knobOk = knobResults.join(",") === "up,down"
  console.log(`\nknob actions: ${knobOk ? "PASS" : "FAIL"} (published ${JSON.stringify(knobResults)})`)
  // Kept out of `results`, which feeds buildReport() - that report is a
  // side-by-side image comparison and every row needs a device/expected
  // image pair. A non-visual check has no images to show, so it is counted
  // separately rather than given fake ones.
  const nonVisualFailures =
    (knobOk ? 0 : 1) + helloFailures + blankingFailures + installFailures + bootScreenFailures +
    partialFailures + tapFailures

  for (let si = 0; si < project.screens.length; si++) {
    const screen = project.screens[si]
    const combos = combinationCount(project, screen)
    console.log(`\nscreen ${si} "${screen.name}": ${combos} combination(s)`)

    for (let ci = 0; ci < combos; ci++) {
      const overrides = combinationOverrides(project, screen, ci)
      const caseId = `${si}-${ci}`

      for (const [topic, value] of Object.entries(overrides)) {
        await new Promise((resolve, reject) => {
          mqttClient.publish(topic, value, { qos: 1 }, (err) => (err ? reject(err) : resolve()))
        })
      }
      await waitForTopicValuesApplied(overrides)

      const switchRes = await fetch(`http://${deviceHost}/api/screen`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `index=${si}`,
      })
      const switchJson = await switchRes.json()
      if (!switchJson.success) throw new Error(`/api/screen failed for ${caseId}: ${JSON.stringify(switchJson)}`)

      const deviceBuf = await fetchSnapshot()
      const devicePath = path.join(IMG_DIR, `device-${caseId}.bmp`)
      fs.writeFileSync(devicePath, deviceBuf)

      // This panel is RGB565. Without saying so, every anti-aliased pixel in
      // the reference - the greys along a rounded corner, say - is a
      // guaranteed mismatch, because the device physically cannot hold the
      // value the reference computed. 46 of 52 differing pixels on the
      // SoftwareButton were exactly that and nothing else (2026-08-25).
      // Not read from the DDF: `screen.colorDepth` there says what colours
      // objects may be drawn in, which is a different question from what
      // the framebuffer can store.
      const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
        quantize: "rgb565",
        project,
        screenIndex: si,
        topicOverrides: overrides,
      })
      const expectedBuf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")
      const expectedPath = path.join(IMG_DIR, `expected-${caseId}.png`)
      fs.writeFileSync(expectedPath, expectedBuf)

      const [deviceImg, expectedImg] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)])
      const { dimensionMismatch, diffPixels, totalPixels } = comparePixels(deviceImg, expectedImg)
      const pass = !dimensionMismatch && diffPixels === 0
      console.log(
        `  [${caseId}] ${pass ? "PASS" : "FAIL"}` +
          (dimensionMismatch ? " (dimension mismatch)" : ` (${diffPixels}/${totalPixels} differing pixels)`) +
          `  ${JSON.stringify(overrides)}`,
      )

      results.push({
        screenIndex: si,
        screenName: screen.name,
        comboIndex: ci,
        overrides,
        pass,
        diffPixels,
        totalPixels,
        dimensionMismatch,
        actualFile: `images/device-${caseId}.bmp`,
        expectedFile: `images/expected-${caseId}.png`,
        actualDims: `${deviceImg.bitmap.width}x${deviceImg.bitmap.height}`,
        expectedDims: `${expectedImg.bitmap.width}x${expectedImg.bitmap.height}`,
      })
    }
  }

  await browser.close()
  mqttClient.end()

  fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2))
  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} visual cases passed, ${nonVisualFailures} non-visual failure(s).`)
  const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - Waveshare Knob-1.8" })
  console.log("report:", outPath)
  process.exit(passed === results.length && nonVisualFailures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("FAILED:", err)
  process.exit(1)
})
