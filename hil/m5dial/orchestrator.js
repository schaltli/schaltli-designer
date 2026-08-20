// HIL test orchestrator for the M5 Dial firmware (screenbee-m5dial repo,
// color/RGB565 render target) - same overall strategy as
// hil/epaper/orchestrator.js (see its own header comment for the full
// rationale), adapted for this device's simpler always-on HTTP API:
//
// - Every endpoint (project upload, screen switch, snapshot, topic-values)
//   lives on ONE always-on port (80) once WiFi connects - no setup-mode
//   gating, no split 80/8080 split between an upload server and a
//   snapshot server like the e-paper firmware has (see
//   TestInterfaceServer.h's own header comment for why - this device has
//   no field-hardening story yet, so there's no safety property being
//   traded away by that).
// - Snapshot is a 24-bit BMP (RGB565 internally, expanded on the way out -
//   see hil/m5dial/fixtures/build-comprehensive-test.js's header comment
//   for the exact transform and why fixture colors are pre-quantized for
//   it), not the e-paper target's 1-bit-plus-palette BMP - comparison is
//   still strict (comparePixels, any differing pixel fails), since the
//   snapshot is captured at the device's exact native 240x240 resolution,
//   same reasoning as the e-paper target.
//
// Run: node hil/m5dial/orchestrator.js --project <exported-project.zip> --device <device-ip>
//
// --reboot-stress [N] (default 5): skips the visual comparison suite
// entirely and instead re-uploads the same project N times in a row,
// requiring each reboot to come back up within a tight timeout - see
// rebootStressTest()'s own comment for what this catches and why.
//
// --heap-scan: skips the visual comparison suite and instead walks every
// screen of the uploaded (many-screen) project via POST /api/screen in a
// non-adjacent order, asserting free heap (now returned in that endpoint's
// own response) stays roughly flat rather than trending downward - see
// heapScanTest()'s own comment for what this catches and why. Use with
// --project hil/m5dial/fixtures/heap-scan-test.zip (build it first via
// node hil/m5dial/fixtures/build-heap-scan-test.js).
//
// --mqtt-deploy --device <device-ip> [--designer-url <url>] [--mqtt-ws-url
// <url>]: no --project needed. Drives the real designer UI through a real
// MQTT-triggered deploy (Deploy to Device) against an already-connected
// real device - the only mode that exercises DeployManager.cpp at all
// (every other mode uploads via TestInterfaceServer's HTTP endpoint
// instead). Requires `npm run dev` and hil/local-broker.js already
// running, and the real device already connected to that same broker. See
// mqttDeployTest()'s own comment.

const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const { chromium } = require("playwright");
const { Jimp } = require("jimp");
const JSZip = require("jszip");
const { buildReport, comparePixels } = require("../report-template");
const { combinationCount, combinationOverrides } = require("../combinations");

const MQTT_URL = process.env.HIL_MQTT_URL || "mqtt://localhost:1883";
const DESIGNER_URL = "http://localhost:3000/test-render";
const OUT_DIR = path.join(__dirname, "report");
const IMG_DIR = path.join(OUT_DIR, "images");
// The M5 Dial's DDF stopped being baked into the designer repo on
// 2026-08-16 (see docs/device-contract.md) - its real source now lives only
// in the firmware repo, unzipped, hand-edited there.
const DDF_SOURCE_DIR = path.join(__dirname, "../../../screenbee-m5dial/ddf-source");
const DATA_DDF_DIR = path.join(__dirname, "../../.data/ddf");

// Zips DDF_SOURCE_DIR and drops it into .data/ddf/, the same cache
// app/api/ddf/fetch/route.ts itself writes to - so the "Announced Devices"
// card mqttDeployTest() clicks actually exists. Mirrors e2e/ddf-seed.ts's
// seedM5DialDdf() (duplicated rather than shared - hil/ and e2e/ are
// separate JS/TS worlds with no existing shared-module convention between
// them).
async function seedM5DialDdfCache() {
  const zip = new JSZip();
  function addDir(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) addDir(full, prefix + entry.name + "/");
      else zip.file(prefix + entry.name, fs.readFileSync(full));
    }
  }
  addDir(DDF_SOURCE_DIR, "");
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  fs.mkdirSync(DATA_DDF_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DDF_DIR, "m5stack-m5dial-v1-1.ddf.zip"), buf);
}

// Loads a project exported from the app itself. Unlike
// hil/epaper/orchestrator.js's loadProjectFromZip(), font BDF text is NOT
// expected embedded in the project zip at all - lib/project-zip.ts's
// buildDeviceProjectZip() (the real "Export Project"/deploy pipeline)
// never embeds one for this device, since ColorScreenRenderer::
// getU8g2FontById() only ever matches fonts by internalName against
// compiled-in u8g2 font tables, never reads a file. Embedding it anyway
// (this file's own approach until 2026-08-10) added ~97KB of dead weight
// to every upload and was enough on its own to exceed
// ProjectInstaller::installProjectZipFromFile()'s ~31KB single-malloc
// ceiling on this hardware - see hil/m5dial/fixtures/
// build-comprehensive-test.js's header comment. The designer's own
// headless reference render still needs real glyph data though, so this
// resolves each font's BDF text from the DDF zip instead (matched by
// internalName, the same identifier both sides already agree on) - the
// same file hil/m5dial/fixtures/build-comprehensive-test.js itself reads
// fonts from when embedding was still how this worked.
async function loadProjectFromZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const projectFile = zip.file("project.json");
  if (!projectFile) throw new Error(`${zipPath} has no project.json`);
  const project = JSON.parse(await projectFile.async("string"));

  if (!fs.existsSync(path.join(DDF_SOURCE_DIR, "device.json"))) {
    throw new Error(`M5 Dial DDF source not found at ${DDF_SOURCE_DIR} - check out screenbee-m5dial alongside this repo`);
  }
  const ddfDevice = JSON.parse(fs.readFileSync(path.join(DDF_SOURCE_DIR, "device.json"), "utf8"));
  const ddfFontsByInternalName = new Map((ddfDevice.fonts || []).map((f) => [f.internalName, f]));

  project.fonts = await Promise.all(
    (project.fonts || []).map(async (font) => {
      if (font.data) return font;
      const ddfFont = ddfFontsByInternalName.get(font.internalName);
      if (!ddfFont) throw new Error(`Font "${font.id}" (internalName "${font.internalName}") not found in the DDF`);
      const fontPath = path.join(DDF_SOURCE_DIR, ddfFont.file);
      if (!fs.existsSync(fontPath)) throw new Error(`DDF source is missing "${ddfFont.file}" for font "${font.id}"`);
      return { ...font, data: fs.readFileSync(fontPath, "utf8") };
    })
  );

  return project;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Polls GET /api/topic-values (port 80, same handler shape as the e-paper
// target's DisplaySnapshot::handleGetTopicValues - see
// hil/README.md's "combo 0 immediately after a fresh upload" writeup for
// why a fixed sleep isn't safe here either) until the device's own
// ProjectLoader cache reports every just-published override back.
async function waitForTopicValuesApplied(deviceHost, overrides, { intervalMs = 150, timeoutMs = 15000 } = {}) {
  const topics = Object.keys(overrides);
  if (topics.length === 0) return;

  const url = `http://${deviceHost}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const values = await res.json();
        if (topics.every((t) => String(values[t]) === String(overrides[t]))) return;
      }
    } catch {
      // transient - device busy handling the message that just landed; keep polling
    }
    await sleep(intervalMs);
  }
  throw new Error(`Device did not apply published topic values within ${timeoutMs}ms: ${JSON.stringify(overrides)}`);
}

async function fetchBuffer(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function getProjectZipPath() {
  const zipPath = getArg("--project");
  if (!zipPath) {
    throw new Error('Missing required argument: --project "<path-to-exported-project.zip>"');
  }
  return zipPath;
}

function getDeviceHost() {
  const device = getArg("--device");
  if (!device) {
    throw new Error('Missing required argument: --device <ip-or-hostname> (e.g. --device 192.168.1.111)');
  }
  return device;
}

// Upload the project zip via POST /api/project (port 80, always reachable -
// no setup mode on this device, see TestInterfaceServer.h's own header
// comment). On success, TestInterfaceServer::handleProjectUploadChunk()'s
// UPLOAD_FILE_END branch calls ESP.restart() directly, before the "normal"
// request handler (handleProjectUploadComplete) ever runs - so exactly
// like the e-paper target, a successful upload looks identical at the
// network layer to a failed one (connection dies, zero bytes back).
// waitForDeviceReady() below is what actually confirms success.
async function uploadProjectToDevice(deviceHost, zipPath) {
  const uploadUrl = `http://${deviceHost}/api/project`;
  console.log(`Uploading ${path.basename(zipPath)} to ${uploadUrl} ...`);
  const zipBytes = fs.readFileSync(zipPath);
  const form = new FormData();
  form.append("file", new Blob([zipBytes], { type: "application/zip" }), path.basename(zipPath));

  try {
    const res = await fetch(uploadUrl, { method: "POST", body: form });
    console.log(`Upload response: ${res.status} (device may not restart if this is an error status)`);
  } catch (err) {
    console.log(`Upload connection ended without a response (${err.message}) - this is expected on ` +
                `success too, since the device restarts itself before replying. Waiting to see if it comes back up.`);
  }
}

// Polls the always-on TestInterfaceServer (port 80) until it responds,
// meaning the device finished rebooting into normal operation with the new
// project loaded.
async function waitForDeviceReady(deviceHost, { graceMs = 4000, timeoutMs = 60000, intervalMs = 1500 } = {}) {
  console.log(`Waiting ${graceMs}ms for the device to actually restart...`);
  await sleep(graceMs);
  const snapshotUrl = `http://${deviceHost}/snapshot.bmp`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(snapshotUrl, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        console.log("Device is back up.");
        return;
      }
    } catch {
      // still rebooting / reconnecting to WiFi - keep polling
    }
    await sleep(intervalMs);
  }
  throw new Error(`Device did not come back up at ${snapshotUrl} within ${timeoutMs}ms after upload.`);
}

// Repeatedly re-uploads the same project (each upload triggers ESP.restart(),
// see uploadProjectToDevice()'s comment) and requires each reboot to come
// back up well inside a tight timeout - added 2026-08-15 after a real,
// intermittent boot crash was found flashing real hardware: ProjectLoader::
// parseScreens() (screenbee-m5dial repo) grew a std::vector<ScreenObject> via
// repeated push_back() with no reserve(), and on this exact fixture (large
// enough to matter) the doubling-reallocation spike sometimes exceeded
// available heap, causing an uncaught std::bad_alloc -> abort() -> reboot
// loop (observed 2 crashes before a 3rd attempt succeeded). Fixed with
// reserve() calls plus a try/catch safety net (ProjectLoader.cpp).
//
// This can't be caught by the normal per-case comparison loop below - that
// only runs once the device is already up, and waitForDeviceReady()'s own
// default 60s timeout is generous enough to silently absorb a crash-and-
// retry cycle rather than fail on it. A short, tight per-cycle timeout is
// used instead of directly observing the crash (no direct serial access
// here - the orchestrator only ever talks to the device over the network,
// deliberately, since a real HIL device is meant to be tested wirelessly,
// not tethered to whatever machine happens to run this script) - a clean
// single boot (WiFi already knows the AP, straight to test-interface-ready)
// comfortably finishes well under this; a crash-and-retry cycle needs an
// entire *second* WiFi+MQTT handshake on top of the first, which does not.
// PENDING_MS is a reasoned estimate from the manual verification that found
// and fixed this bug, not a measurement across many real runs - tighten or
// loosen it if it proves flaky once this has run for real a few times.
async function rebootStressTest(deviceHost, zipPath, cycles) {
  const PER_CYCLE_TIMEOUT_MS = 20000;
  console.log(`\nReboot stress test: ${cycles} cycle(s), ${PER_CYCLE_TIMEOUT_MS}ms allowed per boot.`);

  for (let i = 1; i <= cycles; i++) {
    // Logged separately, not as one combined "cycle took Xms" number -
    // uploadProjectToDevice()'s fetch() has no timeout of its own, and
    // consistently takes ~60s here to notice the device dropped the
    // connection (it restarts before replying, on every upload, success or
    // not - see that function's comment). That's real but has nothing to
    // do with reboot health; folding it into one number made an entirely
    // clean run look like every boot took over a minute, which would have
    // buried the one number that actually matters (readyMs, the tight
    // budget this test exists to enforce) the first time anyone actually
    // read this log.
    const uploadStart = Date.now();
    await uploadProjectToDevice(deviceHost, zipPath);
    const uploadMs = Date.now() - uploadStart;

    const readyStart = Date.now();
    try {
      await waitForDeviceReady(deviceHost, { timeoutMs: PER_CYCLE_TIMEOUT_MS });
    } catch (err) {
      throw new Error(
        `Reboot stress test failed on cycle ${i}/${cycles}: ${err.message} - likely a crash-and-retry ` +
          `boot loop (see ProjectLoader::parseScreens()'s reserve() fix), not a normal slow boot.`,
      );
    }
    console.log(`  cycle ${i}/${cycles}: upload ${uploadMs}ms, ready ${Date.now() - readyStart}ms`);
  }
  console.log(`All ${cycles} reboot cycles came back up cleanly.`);
}

// Uploads a many-screen project once, then walks every screen index via
// POST /api/screen in a DELIBERATELY NON-ADJACENT order, asserting the
// `freeHeap` field each response now carries (TestInterfaceServer.cpp,
// 2026-08-17) stays roughly flat rather than trending downward - added
// 2026-08-17 alongside screenbee-m5dial's lazy per-screen-loading refactor
// (ProjectLoader/ProjectInstaller/ColorScreenRenderer): before that
// refactor, EVERY screen's full object tree was parsed and kept resident in
// RAM simultaneously at load time, so total RAM usage scaled with total
// project size across every screen, not with what's actually displayed -
// measured live to leave as little as ~44KB free on real hardware even for
// a near-empty 3-screen/3-object project. The fix caps steady-state RAM to
// roughly "the currently displayed screen's own size" via a single-slot
// cache (IProjectLoader::getScreenObjects()) that only reparses on an
// actual screen-index change.
//
// This test doesn't compare against a "before" baseline (today, free heap
// is already flat forever pre-refactor too, since everything was resident
// from the first load - nothing to regress against until the refactor
// shipped). What it actually catches is a FUTURE change accidentally
// turning that single-slot cache into something unbounded (e.g. someone
// "fixing" a perceived bug by caching every screen ever requested instead
// of investigating a real cache-miss cost) - the flat-heap assertion makes
// that regress loudly instead of silently reintroducing the original
// problem in a new form.
//
// Non-adjacent order matters: TestInterfaceServer's /api/screen accepts any
// index a caller sends, with no guarantee it's ever adjacent to whatever's
// currently displayed (a real HIL orchestrator, or a swipe/goto-screen
// action, can jump anywhere) - a scan that only ever walked 0..N-1 in order
// wouldn't exercise that at all.
async function heapScanTest(deviceHost, zipPath, project) {
  const screenCount = project.screens.length;
  console.log(`\nHeap scan test: ${screenCount} screen(s), non-adjacent switch order.`);

  await uploadProjectToDevice(deviceHost, zipPath);
  await waitForDeviceReady(deviceHost);

  // Deterministic non-adjacent order: alternates from the two ends inward
  // (e.g. for 8 screens: 0, 7, 1, 6, 2, 5, 3, 4) - every consecutive pair in
  // this sequence is at least 2 apart until the very last couple of
  // screens, and it's the same sequence every run (a fixed regression test
  // shouldn't depend on Math.random()).
  const order = [];
  let lo = 0, hi = screenCount - 1;
  while (lo <= hi) {
    order.push(lo++);
    if (lo <= hi) order.push(hi--);
  }

  const readings = [];
  for (const index of order) {
    const res = await fetch(`http://${deviceHost}/api/screen`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `index=${index}`,
    });
    const body = await res.json();
    if (!body.success) {
      throw new Error(`Heap scan failed switching to screen ${index}: ${body.message || "unknown error"}`);
    }
    readings.push({ index, freeHeap: body.freeHeap });
    console.log(`  screen ${index}: freeHeap=${body.freeHeap}`);
  }

  // Tolerance, not exact equality - a small amount of drift from unrelated
  // WiFi/MQTT/TCP housekeeping is normal (observed live, 2026-08-17: a few
  // hundred bytes per request under rapid-fire polling, stabilizing once
  // request frequency drops - see this session's own investigation before
  // concluding it wasn't a leak). What this guards against is a LARGE,
  // repeated-per-switch loss consistent with an unbounded cache - sized
  // generously above the largest single screen's own materialize cost
  // (a few KB at most for this fixture's 10-object screens) so it only
  // fires on a real regression, not normal jitter.
  const TOLERANCE_BYTES = 8192;
  const firstHeap = readings[0].freeHeap;
  const minHeap = Math.min(...readings.map((r) => r.freeHeap));
  const drop = firstHeap - minHeap;
  console.log(`  first freeHeap=${firstHeap}, min freeHeap=${minHeap}, drop=${drop} (tolerance ${TOLERANCE_BYTES})`);
  if (drop > TOLERANCE_BYTES) {
    throw new Error(
      `Heap scan failed: free heap dropped ${drop} bytes across ${order.length} non-adjacent screen switches ` +
        `(tolerance ${TOLERANCE_BYTES}) - looks like an unbounded per-screen cache, not normal jitter.`,
    );
  }
  console.log(`Heap scan passed: free heap stayed within tolerance across ${order.length} non-adjacent switches.`);
}

// Drives the *real* designer UI (not the HTTP /api/project path
// uploadProjectToDevice() above uses) through a real MQTT-triggered deploy
// against a real, already-connected device - added 2026-08-15 to close a
// real gap: --reboot-stress and the normal comparison suite both upload via
// TestInterfaceServer's HTTP endpoint, which never exercises
// DeployManager.cpp at all (schemaVersion/deviceId peek-checks, the
// LittleFS.rename() promotion to RECOVERY_PROJECT_PATH, GET
// /recovery-project) - see docs/nested-provenance.md's "Version
// compatibility" section (designer repo) for what that path is supposed to
// do. This is the only thing in this file that actually triggers it.
//
// Requires: `npm run dev` already running (designerRootUrl reachable), and
// the local broker (hil/local-broker.js) already running and reachable by
// *both* this script and the real device - the same broker instance, not
// a separate one, since a real device's own MQTT config points at one
// specific broker.
async function mqttDeployTest(deviceHost, designerRootUrl, mqttWsUrl) {
  console.log(`\nMQTT deploy test against ${deviceHost}, designer at ${designerRootUrl}`);

  console.log("Checking GET /recovery-project before the deploy (expect 404 if this device has never had one)...");
  const beforeRes = await fetch(`http://${deviceHost}/recovery-project`).catch((e) => ({ status: `error: ${e.message}` }));
  console.log(`  before: ${beforeRes.status}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("[designer page error]", err.message));

  console.log("Creating a fresh M5 Dial project in the real designer UI...");
  await seedM5DialDdfCache();
  await page.goto(designerRootUrl, { waitUntil: "networkidle" });
  await page.getByText("Server DDFs", { exact: true }).waitFor({ timeout: 15000 });
  await page.locator('[data-ddf-section="auto-discovered"] [data-device-id="m5stack-m5dial-v1-1"]').first().click();
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.waitForTimeout(1500);

  console.log("Opening Deploy to Device...");
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Deploy to Device" }).click();

  console.log("Waiting for the real device to appear in the deploy dialog (listening on the broker)...");
  // .space-y-1 button is the device-row list specifically (confirmed
  // against the real rendered DOM, deploy-dialog.tsx) - not a name match,
  // since this device's hello carries no "name" field (main.cpp's
  // publishHello()), so the UI falls back to its MQTT client id (e.g.
  // "M5Dial-e41fe3e22748"), which varies per physical unit.
  const deviceRow = page.locator(".space-y-1 button").first();
  await deviceRow.waitFor({ state: "visible", timeout: 20000 });
  await deviceRow.click();

  console.log("Watching the broker directly for this deploy's trigger + status (more reliable than reading UI text)...");
  const mqttClient = await new Promise((resolve, reject) => {
    const client = mqtt.connect(mqttWsUrl, { clientId: "hil-m5dial-mqtt-deploy-watch-" + Math.random().toString(16).slice(2) });
    client.on("connect", () => resolve(client));
    client.on("error", reject);
  });
  mqttClient.subscribe("screenbee/+/deploy");
  mqttClient.subscribe("screenbee/+/deploy-status");

  const finalStatus = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("No terminal deploy-status (rebooting/error) within 60s")), 60000);
    mqttClient.on("message", (topic, message) => {
      if (!topic.endsWith("/deploy-status") || message.length === 0) return;
      let status;
      try {
        status = JSON.parse(message.toString());
      } catch {
        return;
      }
      console.log(`  deploy-status: ${status.state}${status.error ? " - " + status.error : ""}`);
      if (status.state === "rebooting" || status.state === "error") {
        clearTimeout(timeout);
        resolve(status);
      }
    });
  });

  await page.getByRole("button", { name: "Deploy", exact: true }).click();
  const result = await finalStatus;
  mqttClient.end();
  await browser.close();

  if (result.state !== "rebooting") {
    throw new Error(`Deploy did not reach "rebooting": ${JSON.stringify(result)}`);
  }
  console.log("Deploy succeeded (device is rebooting with the new project applied).");

  console.log("Waiting for the device to come back up...");
  await waitForDeviceReady(deviceHost);

  console.log("Checking GET /recovery-project after the deploy (expect 200 with a real nested project now)...");
  const afterRes = await fetch(`http://${deviceHost}/recovery-project`);
  if (!afterRes.ok) {
    throw new Error(`GET /recovery-project returned ${afterRes.status} after a successful deploy - promotion didn't happen`);
  }
  const exportBytes = Buffer.from(await afterRes.arrayBuffer());
  const exportZip = await JSZip.loadAsync(exportBytes);
  const embeddedProject = exportZip.file("_source/project.zip");
  if (!embeddedProject) {
    throw new Error("Retained export has no _source/project.zip - nested-provenance embedding isn't in it");
  }
  const projectZip = await JSZip.loadAsync(await embeddedProject.async("nodebuffer"));
  const hasEmbeddedDdf = !!projectZip.file("_source/ddf.zip");
  console.log(
    `  after: 200, ${exportBytes.length} bytes, _source/project.zip present, ` +
      `nested _source/ddf.zip ${hasEmbeddedDdf ? "present" : "MISSING"}`,
  );
  if (!hasEmbeddedDdf) {
    throw new Error("_source/project.zip has no _source/ddf.zip inside it - nesting is broken");
  }

  console.log("\nMQTT deploy test PASSED: real deploy through DeployManager.cpp, recovery copy retained and correctly nested.");
}

async function main() {
  if (process.argv.includes("--report-only")) {
    const results = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "results.json"), "utf8"));
    const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - M5 Dial" });
    console.log("Rebuilt report from existing results.json:", outPath);
    return;
  }

  if (process.argv.includes("--mqtt-deploy")) {
    // No --project needed - this mode builds its own fresh M5 Dial project
    // live in the designer UI rather than loading an exported fixture.
    const deviceHost = getDeviceHost();
    const designerRootUrl = getArg("--designer-url") || "http://localhost:3000/";
    const mqttWsUrl = getArg("--mqtt-ws-url") || (process.env.HIL_MQTT_WS_URL || "ws://localhost:9001");
    await mqttDeployTest(deviceHost, designerRootUrl, mqttWsUrl);
    return;
  }

  const project = await loadProjectFromZip(getProjectZipPath());
  console.log(`Loaded project "${project.name}" - ${project.screens.length} screen(s), ${(project.fonts || []).length} font(s)`);

  if (process.argv.includes("--designer-preview")) {
    // Designer-only sanity check, no MQTT/device involved - renders every
    // screen once (combo index 0) to eyeball a layout before spending a
    // real hardware run on it.
    const previewDir = path.join(__dirname, "designer-preview");
    fs.mkdirSync(previewDir, { recursive: true });
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on("pageerror", (err) => console.log("[designer page error]", err.message));
    await page.goto(DESIGNER_URL, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__testRenderReady === true, { timeout: 10000 });
    for (let si = 0; si < project.screens.length; si++) {
      const screen = project.screens[si];
      const overrides = combinationOverrides(project, screen, 0);
      const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), { project, screenIndex: si, topicOverrides: overrides });
      const buf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      const outPath = path.join(previewDir, `${si}-${screen.name.replace(/[^a-z0-9]+/gi, "-")}.png`);
      fs.writeFileSync(outPath, buf);
      console.log("Saved", outPath);
    }
    await browser.close();
    return;
  }

  const deviceHost = getDeviceHost();

  if (process.argv.includes("--reboot-stress")) {
    const cycles = Number.parseInt(getArg("--reboot-stress"), 10) || 5;
    await rebootStressTest(deviceHost, getProjectZipPath(), cycles);
    return;
  }

  if (process.argv.includes("--heap-scan")) {
    await heapScanTest(deviceHost, getProjectZipPath(), project);
    return;
  }

  const SNAPSHOT_URL = `http://${deviceHost}/snapshot.bmp`;
  const SCREEN_SWITCH_URL = `http://${deviceHost}/api/screen`;

  if (!process.argv.includes("--skip-upload")) {
    await uploadProjectToDevice(deviceHost, getProjectZipPath());
    await waitForDeviceReady(deviceHost);
  } else {
    console.log("--skip-upload set, assuming the device already has this exact project loaded.");
  }

  fs.mkdirSync(IMG_DIR, { recursive: true });

  console.log("Connecting to MQTT broker...");
  const mqttClient = mqtt.connect(MQTT_URL, { clientId: "hil-m5dial-orchestrator-" + Math.random().toString(16).slice(2) });
  await new Promise((resolve, reject) => {
    mqttClient.on("connect", resolve);
    mqttClient.on("error", reject);
    setTimeout(() => reject(new Error("MQTT connect timeout")), 10000);
  });
  console.log("MQTT connected.");

  console.log("Launching headless browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("[designer page error]", err.message));
  await page.goto(DESIGNER_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__testRenderReady === true, { timeout: 10000 });
  console.log("Designer render harness ready.");

  const results = [];

  for (let si = 0; si < project.screens.length; si++) {
    const screen = project.screens[si];
    const combos = combinationCount(project, screen);
    console.log(`\nScreen ${si} "${screen.name}": ${combos} combination(s)`);

    for (let ci = 0; ci < combos; ci++) {
      const overrides = combinationOverrides(project, screen, ci);
      const caseId = `${si}-${ci}`;
      console.log(`  [${caseId}] overrides:`, overrides);

      // 1. Publish every relevant topic value once, before switching screens.
      for (const [topic, value] of Object.entries(overrides)) {
        await new Promise((resolve, reject) => {
          mqttClient.publish(topic, value, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
        });
      }
      await waitForTopicValuesApplied(deviceHost, overrides);

      // 2. Force a full re-render on the device and fetch its snapshot.
      const switchRes = await fetch(SCREEN_SWITCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `index=${si}`,
      });
      const switchJson = await switchRes.json();
      if (!switchJson.success) throw new Error(`/api/screen failed for case ${caseId}: ${JSON.stringify(switchJson)}`);

      const deviceBuf = await fetchBuffer(SNAPSHOT_URL);
      const devicePath = path.join(IMG_DIR, `device-${caseId}.bmp`);
      fs.writeFileSync(devicePath, deviceBuf);

      // 3. Render the same screen/overrides headlessly in the designer.
      const dataUrl = await page.evaluate(
        (req) => window.__renderScreenForTest(req),
        { project, screenIndex: si, topicOverrides: overrides },
      );
      const expectedBuf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      const expectedPath = path.join(IMG_DIR, `expected-${caseId}.png`);
      fs.writeFileSync(expectedPath, expectedBuf);

      // 4. Strict pixel-by-pixel comparison.
      const [deviceImg, expectedImg] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)]);
      const { dimensionMismatch, diffPixels, totalPixels } = comparePixels(deviceImg, expectedImg);
      const pass = !dimensionMismatch && diffPixels === 0;
      console.log(`  [${caseId}] ${pass ? "PASS" : "FAIL"}` + (dimensionMismatch ? " (dimension mismatch)" : ` (${diffPixels}/${totalPixels} differing pixels)`));

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
      });
    }
  }

  await browser.close();
  mqttClient.end();

  fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} cases passed.`);
  console.log("Building HTML report...");
  const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - M5 Dial" });
  console.log("Done:", outPath);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
