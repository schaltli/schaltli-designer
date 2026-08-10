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
const DDF_PATH = path.join(__dirname, "../../public/ddf/m5stack-m5dial.ddf.zip");

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

  const ddfZip = await JSZip.loadAsync(fs.readFileSync(DDF_PATH));
  const ddfDevice = JSON.parse(await ddfZip.file("device.json").async("string"));
  const ddfFontsByInternalName = new Map((ddfDevice.fonts || []).map((f) => [f.internalName, f]));

  project.fonts = await Promise.all(
    (project.fonts || []).map(async (font) => {
      if (font.data) return font;
      const ddfFont = ddfFontsByInternalName.get(font.internalName);
      if (!ddfFont) throw new Error(`Font "${font.id}" (internalName "${font.internalName}") not found in the DDF`);
      const entry = ddfZip.file(ddfFont.file);
      if (!entry) throw new Error(`DDF is missing "${ddfFont.file}" for font "${font.id}"`);
      return { ...font, data: await entry.async("string") };
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

async function main() {
  if (process.argv.includes("--report-only")) {
    const results = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "results.json"), "utf8"));
    const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - M5 Dial" });
    console.log("Rebuilt report from existing results.json:", outPath);
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
