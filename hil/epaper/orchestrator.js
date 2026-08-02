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
const os = require("os");
const zlib = require("zlib");
const crypto = require("crypto");
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

// Mirrors lib/topic-prefix.ts - kept as its own literal here rather than
// imported, since this is a plain Node script (no TS build step) and that
// file is TypeScript. Update both together if this ever changes.
const TOPIC_PREFIX = "screenbee";

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

// Polls GET /api/topic-values (added 2026-08-01 alongside this fix) until
// the device's own ProjectLoader cache reports every just-published
// override back, instead of a fixed sleep() and hoping it was long enough.
// Root cause found via serial-log instrumentation: the device is single-
// threaded, and ScreenRenderer::renderObjectsPartial() escalates the very
// first MQTT-triggered partial update after every boot into a full render
// (ScreenRenderer.cpp's `partialUpdateCounter_ == 1` branch) - a real
// e-paper full refresh, ~2-4s of blocking work during which mqttClient_.
// loop() never runs, so any of a combo's OTHER just-published topics sit
// undelivered. No fixed sleep is safe against that (a slow combo-0 first
// message can make an arbitrarily long queue of subsequent messages wait),
// so this polls for a real signal instead of guessing a duration.
// 8000 (this fixture's original budget, fine for 3 topics the device has
// subscribed to on every prior run) wasn't always enough once a 4th, brand
// new topic (hil-test/lock, added 2026-08-02 for MQTTIconField coverage)
// needed its very first subscribe+settle cycle on real hardware - confirmed
// by hand that the exact same publish/poll succeeds fine with more margin,
// so this is a timing budget, not a logic bug.
async function waitForTopicValuesApplied(deviceHost, overrides, { intervalMs = 150, timeoutMs = 15000 } = {}) {
  const topics = Object.keys(overrides);
  if (topics.length === 0) return;

  const url = `http://${deviceHost}:8080/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`;
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
    throw new Error('Missing required argument: --device <ip-or-hostname> (e.g. --device 192.168.1.110)');
  }
  return device;
}

// This machine's own LAN-reachable address - used only by --deploy-flow to
// build the URL the *device* fetches its deploy zip from
// (app/api/deploy/[instanceId]). "localhost" would resolve to the device's
// own loopback, not this machine, since the device does that GET itself -
// same reasoning as hil/local-broker.js's localLanAddresses().
// Picks whichever local IPv4 address is actually on the same subnet as
// deviceHost (using each interface's own netmask), not just "the first
// non-internal IPv4 found" - this machine can have multiple (e.g. a real
// Ethernet/WiFi LAN adapter *and* a Tailscale/VPN virtual adapter), and
// picking the wrong one produces a URL the device can never reach
// (2026-08-01 finding: picked a Tailscale address, DeployManager's HTTP
// GET failed outright with "HTTP -1" - a real bug, not a hypothetical).
// Falls back to the first non-internal IPv4 if nothing matches the
// device's subnet, same as before, so this only changes behavior when a
// better match actually exists.
function localLanAddress(deviceHost) {
  const deviceParts = deviceHost.split(".").map(Number);
  let fallback = null;

  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family !== "IPv4" || iface.internal) continue;
      if (!fallback) fallback = iface.address;

      if (iface.netmask && deviceParts.length === 4) {
        const maskParts = iface.netmask.split(".").map(Number);
        const ifaceParts = iface.address.split(".").map(Number);
        const sameSubnet = maskParts.every((m, i) => (ifaceParts[i] & m) === (deviceParts[i] & m));
        if (sameSubnet) return iface.address;
      }
    }
  }

  if (fallback) return fallback;
  throw new Error("Could not determine this machine's LAN IP address");
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

  // --deploy-flow: exercises the real MQTT self-deploy path end-to-end
  // (DeployManager, ProjectInstaller) against actual hardware - the
  // designer-side UI/discovery logic is covered separately by
  // e2e/deploy-dialog.spec.ts against a fake device, since that doesn't
  // need real firmware. Assumes the device is already running with SOME
  // project loaded (--skip-upload's assumption, not re-checked here) -
  // this mode is about verifying a deploy an already-running device
  // receives, not about getting the device into that state.
  if (process.argv.includes("--deploy-flow")) {
    if (!project.deviceId) throw new Error("--deploy-flow: loaded project has no top-level deviceId");

    console.log(`\n[deploy-flow mode] Discovering device announcing deviceId "${project.deviceId}"...`);
    const instanceId = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("No matching device hello received within 10s - is the device running and pointed at this broker?")), 10000);
      mqttClient.subscribe(`${TOPIC_PREFIX}/+/hello`, (err) => err && reject(err));
      mqttClient.on("message", (topic, message) => {
        const parts = topic.split("/");
        if (parts.length !== 3 || parts[0] !== TOPIC_PREFIX || parts[2] !== "hello") return;
        try {
          const hello = JSON.parse(message.toString());
          if (hello.deviceId === project.deviceId) {
            clearTimeout(timeout);
            resolve(parts[1]);
          }
        } catch {
          // malformed hello - keep waiting
        }
      });
    });
    console.log(`[deploy-flow mode] Found device instance "${instanceId}"`);

    const zipBytes = fs.readFileSync(getProjectZipPath());

    // Waits for a deploy-status sequence to reach a terminal state
    // (rebooting = success, error/busy = failure), logging every
    // intermediate state as it arrives, same states deploy-dialog.tsx
    // reacts to.
    async function runDeploy(label, bytesToDeploy) {
      const uploadForm = new FormData();
      uploadForm.append("instanceId", instanceId);
      uploadForm.append("file", new Blob([bytesToDeploy], { type: "application/zip" }), "project.zip");
      const uploadRes = await fetch("http://localhost:3000/api/deploy", { method: "POST", body: uploadForm });
      if (!uploadRes.ok) throw new Error(`${label}: /api/deploy upload failed (${uploadRes.status})`);
      const { path: deployPath } = await uploadRes.json();

      const deployId = crypto.randomUUID();
      const crc32 = zlib.crc32(bytesToDeploy);
      const statusTopic = `${TOPIC_PREFIX}/${instanceId}/deploy-status`;

      const terminal = await new Promise((resolve, reject) => {
        const overallTimeout = setTimeout(() => reject(new Error(`${label}: no terminal deploy-status within 90s`)), 90000);
        mqttClient.subscribe(statusTopic, (err) => err && reject(err));
        const onMessage = (topic, message) => {
          if (topic !== statusTopic) return;
          let status;
          try {
            status = JSON.parse(message.toString());
          } catch {
            return;
          }
          if (status.deployId !== deployId) return;
          console.log(`  [${label}] ${status.state}${status.percent !== undefined ? ` (${status.percent}%)` : ""}${status.error ? ` - ${status.error}` : ""}`);
          if (status.state === "rebooting" || status.state === "error" || status.state === "busy") {
            clearTimeout(overallTimeout);
            mqttClient.removeListener("message", onMessage);
            resolve(status);
          }
        };
        mqttClient.on("message", onMessage);

        mqttClient.publish(
          statusTopic.replace("/deploy-status", "/deploy"),
          JSON.stringify({ deployId, url: `http://${localLanAddress(deviceHost)}:3000${deployPath}`, crc32 }),
          { qos: 1, retain: true },
        );
      });

      return terminal;
    }

    // Reference image for screen 0 using whatever values a freshly-booted
    // device actually renders with - NOT combo 0. A fresh deploy publishes
    // no MQTT values at all; the device's own TestDataHelper::
    // setExampleValues() (called from loadAndRenderProject() on every
    // boot) seeds every topic from the *middle* example
    // (examples[length/2]), not the first - combo 0 (examples[0]) doesn't
    // match that and produced a large, entirely spurious diff (2026-08-01
    // finding, this mode's own first hardware run).
    function bootExampleOverrides(screen) {
      const topicsByName = Object.fromEntries((project.topics || []).map((t) => [t.topic, t]));
      const overrides = {};
      const walk = (objects) => {
        for (const obj of objects) {
          const topic = obj.properties?.topic;
          if (topic) {
            const examples = topicsByName[topic]?.examples || [];
            if (examples.length > 0) overrides[topic] = examples[Math.floor(examples.length / 2)];
          }
          if (obj.children && obj.children.length > 0) walk(obj.children);
        }
      };
      walk(screen.objects);
      return overrides;
    }

    async function fetchDeviceSnapshotAndCompare(label) {
      const deviceBuf = await fetchBuffer(SNAPSHOT_URL);
      const devicePath = path.join(IMG_DIR, `deploy-flow-${label}.bmp`);
      fs.mkdirSync(IMG_DIR, { recursive: true });
      fs.writeFileSync(devicePath, deviceBuf);

      const overrides = bootExampleOverrides(project.screens[0]);
      const dataUrl = await page.evaluate(
        (req) => window.__renderScreenForTest(req),
        { project, screenIndex: 0, topicOverrides: overrides },
      );
      const expectedBuf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      const expectedPath = path.join(IMG_DIR, `deploy-flow-${label}-expected.png`);
      fs.writeFileSync(expectedPath, expectedBuf);

      const [deviceImg, expectedImg] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)]);
      return comparePixels(deviceImg, expectedImg);
    }

    console.log("\n[deploy-flow mode] Case 1: valid deploy (matching device type)");
    const validResult = await runDeploy("valid", zipBytes);
    if (validResult.state !== "rebooting") {
      throw new Error(`[deploy-flow mode] valid deploy did not succeed: ${JSON.stringify(validResult)}`);
    }
    await waitForDeviceReady(deviceHost);
    const validCompare = await fetchDeviceSnapshotAndCompare("valid");
    const validPass = !validCompare.dimensionMismatch && validCompare.diffPixels === 0;
    console.log(`[deploy-flow mode] Case 1 (device now rendering the deployed project): ${validPass ? "PASS" : "FAIL"} (${validCompare.diffPixels}/${validCompare.totalPixels} differing pixels)`);

    console.log("\n[deploy-flow mode] Case 2: wrong-deviceId deploy is rejected, old project stays live");
    const mismatchedZip = await JSZip.loadAsync(zipBytes);
    const mismatchedProjectJson = JSON.parse(await mismatchedZip.file("project.json").async("string"));
    mismatchedProjectJson.deviceId = "__hil-deploy-flow-mismatch__";
    mismatchedZip.file("project.json", JSON.stringify(mismatchedProjectJson, null, 2));
    const mismatchedBytes = await mismatchedZip.generateAsync({ type: "nodebuffer" });

    const mismatchResult = await runDeploy("mismatch", mismatchedBytes);
    const mismatchRejected = mismatchResult.state === "error" && /incompatible/i.test(mismatchResult.error || "");
    console.log(`[deploy-flow mode] Case 2 (rejected with a clear reason): ${mismatchRejected ? "PASS" : "FAIL"} (${JSON.stringify(mismatchResult)})`);

    // No reboot happened for the rejected deploy, but re-check the snapshot
    // anyway - this is the actual proof that /PROJECT was never touched,
    // not just that DeployManager *said* it rejected the deploy.
    const rollbackCompare = await fetchDeviceSnapshotAndCompare("after-rejected");
    const rollbackPass = !rollbackCompare.dimensionMismatch && rollbackCompare.diffPixels === 0;
    console.log(`[deploy-flow mode] Case 2 rollback check (still rendering the valid project): ${rollbackPass ? "PASS" : "FAIL"} (${rollbackCompare.diffPixels}/${rollbackCompare.totalPixels} differing pixels)`);

    await browser.close();
    mqttClient.end();

    const allPass = validPass && mismatchRejected && rollbackPass;
    console.log(`\n[deploy-flow mode] ${allPass ? "ALL PASS" : "FAILED"}`);
    if (!allPass) process.exit(1);
    return;
  }

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
        await waitForTopicValuesApplied(deviceHost, overrides);
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
  const outPath = buildReport(results, OUT_DIR, { title: "HIL Test Report - e-paper" });
  console.log("Done:", outPath);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
