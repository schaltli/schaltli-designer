// HIL test orchestrator for MqttEPaperDisplay2 (e-paper firmware target).
//
// Strategy (per user, 2026-07-20): for each screen, run as many screenshots
// as the MAX number of examples across the topics that screen's objects
// bind to. Combination i uses examples[i % examples.length] per topic (wrap
// around for topics with fewer examples). A screen with no MQTT-bound
// objects just gets 1 combination.
//
// Per combination: publish all relevant topic values via MQTT once, force a
// full re-render on the device (POST /api/screen), fetch its snapshot, and
// render the SAME screen/overrides headlessly in the designer
// (app/test-render) - no adornment, exact screenWidth x screenHeight, same
// pixel dimensions as the device snapshot. Then a strict (any differing
// pixel = fail) pixel comparison, and an HTML report (hil/report-template.js
// - a real folder with separate image files, not a Claude Artifact) with
// expected | actual | a blink-comparator column that alternates every 0.5s.
//
// Originally built as a scratch script during the 2026-07-20 pixel-parity
// investigation (see memory: project-pixel-perfect-mismatch) - moved into
// the repo as permanent tooling 2026-07-27 so this methodology isn't lost
// between sessions. Run: node hil/epaper/orchestrator.js --project <zip> --device <ip>

const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const { chromium } = require("playwright");
const { Jimp } = require("jimp");
const JSZip = require("jszip");
const { buildReport, comparePixels } = require("../report-template");
const { combinationCount, combinationOverrides } = require("../combinations");

// A local broker (hil/local-broker.js, `npm run hil:broker`) by default -
// the public test.mosquitto.org started refusing every connection outright
// (2026-08-01, reproduced independently via a plain MQTT Explorer client
// too, not just this script) after a day of heavy HIL use. Override via
// env var for a different broker (e.g. a real HiveMQ instance) without
// editing this file.
const MQTT_URL = process.env.HIL_MQTT_URL || "mqtt://localhost:1883";
const DESIGNER_URL = "http://localhost:3000/test-render";
const OUT_DIR = path.join(__dirname, "report");
const IMG_DIR = path.join(OUT_DIR, "images");

// Loads a project exported from the app itself (project.json + fonts/*.bdf +
// assets/*, see the "Export Project" zip format) rather than a hand-built
// test fixture. project.json's fonts entries carry a `path` pointing at the
// bdf file inside the zip but no inline `data` - the app resolves that at
// runtime from the device DDF, but our headless render harness (test-render
// page) needs the actual BDF text attached to each font, so we read it here.
async function loadProjectFromZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const projectFile = zip.file("project.json");
  if (!projectFile) throw new Error(`${zipPath} has no project.json`);
  const project = JSON.parse(await projectFile.async("string"));

  project.fonts = await Promise.all(
    (project.fonts || []).map(async (font) => {
      if (font.data) return font;
      if (!font.path) throw new Error(`Font "${font.id}" has neither inline data nor a path`);
      const entry = zip.file(font.path);
      if (!entry) throw new Error(`Font file "${font.path}" referenced by "${font.id}" not found in zip`);
      return { ...font, data: await entry.async("string") };
    })
  );

  return project;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
    throw new Error('Missing required argument: --device <ip-or-hostname> (e.g. --device 192.168.1.110)');
  }
  return device;
}

// Upload the project zip via the device's testInterface.uploadUrl contract:
// POST http://{device}/api/project (port 80, UnifiedConfigurator - only
// reachable while the device is in setup mode), multipart/form-data with
// field name "file". On success, handleProjectUploadFile() (UPLOAD_FILE_END)
// calls ESP.restart() directly, which reboots the device before the "normal"
// handler ever gets to send its HTTP response - so on a SUCCESSFUL upload,
// every client (curl, fetch, browser) sees the connection just die with zero
// bytes back, indistinguishable at the network layer from a real failure
// (device unreachable, wrong port, etc). Confirmed by comparing serial output
// across identical-looking "failed" curl attempts: the ones where the device
// actually extracted the zip show `rst:0xc (RTC_SW_CPU_RST)` - an explicit
// software restart - not a crash/watchdog reset, right as the connection
// dies. So a network-level failure here is NOT proof of failure; it's
// swallowed here and waitForDeviceReady() is the only thing that actually
// confirms success (device comes back up) vs. a genuine problem (it doesn't,
// and this times out).
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

// Polls the always-on DisplaySnapshot server (port 8080) until it responds,
// meaning the device finished rebooting into normal operation with the new
// project loaded. First waits a grace period so we don't catch the old
// (pre-reboot) server still answering right before it goes down.
async function waitForDeviceReady(deviceHost, { graceMs = 4000, timeoutMs = 60000, intervalMs = 1500 } = {}) {
  console.log(`Waiting ${graceMs}ms for the device to actually restart...`);
  await sleep(graceMs);
  const snapshotUrl = `http://${deviceHost}:8080/snapshot.bmp`;
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

async function main() {
  if (process.argv.includes("--report-only")) {
    const results = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "results.json"), "utf8"));
    const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - e-paper" });
    console.log("Rebuilt report from existing results.json:", outPath);
    return;
  }

  const project = await loadProjectFromZip(getProjectZipPath());
  console.log(`Loaded project "${project.name}" - ${project.screens.length} screen(s), ${(project.fonts || []).length} font(s)`);

  if (process.argv.includes("--designer-preview")) {
    // Designer-only sanity check, no MQTT/device involved - just renders
    // every screen once (combo index 0) so new screen layouts can be eyeballed
    // before spending a real hardware run on them.
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
  const SNAPSHOT_URL = `http://${deviceHost}:8080/snapshot.bmp`;
  const SCREEN_SWITCH_URL = `http://${deviceHost}:8080/api/screen`;

  if (!process.argv.includes("--skip-upload")) {
    await uploadProjectToDevice(deviceHost, getProjectZipPath());
    await waitForDeviceReady(deviceHost);
  } else {
    console.log("--skip-upload set, assuming the device already has this exact project loaded.");
  }

  fs.mkdirSync(IMG_DIR, { recursive: true });

  console.log("Connecting to MQTT broker...");
  const mqttClient = mqtt.connect(MQTT_URL, { clientId: "hil-orchestrator-" + Math.random().toString(16).slice(2) });
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

  // --partial-update-screen <index>: exercises Application::onMqttMessage's
  // partial-update path specifically (renderObjectsPartial, triggered by an
  // MQTT message alone) - the normal per-combo loop below always calls
  // POST /api/screen between combos, which forces ScreenRenderer::
  // renderScreen() (a full refresh) every time and would never actually
  // exercise the partial-update code path at all, no matter how many
  // combos it runs. This switches to the target screen exactly ONCE, then
  // for every subsequent combination only republishes MQTT values (no
  // further /api/screen calls) - exactly what a real device does when a
  // topic changes while a screen is already showing. Needed specifically
  // to verify the tab-control/panel redraw-trigger fix (nested topic-bound
  // objects must get found and repainted via this path, not just the
  // full-refresh path every other test case here already covers).
  const partialUpdateScreenArg = getArg("--partial-update-screen");
  if (partialUpdateScreenArg !== undefined) {
    const si = Number.parseInt(partialUpdateScreenArg, 10);
    const screen = project.screens[si];
    if (!screen) throw new Error(`--partial-update-screen ${si}: no such screen (project has ${project.screens.length})`);
    const combos = combinationCount(project, screen);
    console.log(`\n[partial-update mode] Screen ${si} "${screen.name}": ${combos} combination(s), single /api/screen switch`);

    const results = [];
    for (let ci = 0; ci < combos; ci++) {
      const overrides = combinationOverrides(project, screen, ci);
      const caseId = `partial-${si}-${ci}`;
      console.log(`  [${caseId}] overrides:`, overrides);

      for (const [topic, value] of Object.entries(overrides)) {
        await new Promise((resolve, reject) => {
          mqttClient.publish(topic, value, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
        });
      }

      if (ci === 0) {
        // Only the FIRST combination switches screens (forces one full
        // refresh to get onto the target screen at all) - every subsequent
        // combination relies purely on onMqttMessage's partial-update path.
        await sleep(600);
        const switchRes = await fetch(SCREEN_SWITCH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `index=${si}`,
        });
        const switchJson = await switchRes.json();
        if (!switchJson.success) throw new Error(`/api/screen failed for case ${caseId}: ${JSON.stringify(switchJson)}`);
        await sleep(600);
      } else {
        // No screen switch - just give the device time to receive the MQTT
        // message and finish its partial e-paper refresh. Unlike /api/screen
        // (a synchronous HTTP call that only returns once rendering is
        // done), a published MQTT message gives no completion signal back -
        // this is a guessed budget, generous because a single onMqttMessage
        // can trigger MULTIPLE sequential renderObjectsPartial calls if more
        // than one topic changed in this combo (each a full e-paper partial-
        // refresh cycle, not fast), all processed synchronously one after
        // another before the MQTT client loop moves on.
        await sleep(4000);
      }

      const deviceBuf = await fetchBuffer(SNAPSHOT_URL);
      const devicePath = path.join(IMG_DIR, `device-${caseId}.bmp`);
      fs.writeFileSync(devicePath, deviceBuf);

      const dataUrl = await page.evaluate(
        (req) => window.__renderScreenForTest(req),
        { project, screenIndex: si, topicOverrides: overrides },
      );
      const expectedBuf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      const expectedPath = path.join(IMG_DIR, `expected-${caseId}.png`);
      fs.writeFileSync(expectedPath, expectedBuf);

      const [deviceImg, expectedImg] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)]);
      const { dimensionMismatch, diffPixels, totalPixels } = comparePixels(deviceImg, expectedImg);
      const pass = !dimensionMismatch && diffPixels === 0;
      console.log(`  [${caseId}] ${pass ? "PASS" : "FAIL"}` + (dimensionMismatch ? " (dimension mismatch)" : ` (${diffPixels}/${totalPixels} differing pixels)`));

      results.push({
        screenIndex: si,
        screenName: `${screen.name} (partial-update path, combo ${ci})`,
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

    await browser.close();
    mqttClient.end();
    fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} partial-update cases passed.`);
    const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - e-paper (partial update)" });
    console.log("Done:", outPath);
    return;
  }

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
      if (Object.keys(overrides).length > 0) await sleep(600); // let the device receive + cache it

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
  const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - e-paper" });
  console.log("Done:", outPath);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
