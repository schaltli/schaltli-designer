// HIL test orchestrator for the Screensmith Android app (ScreensmithAndroid
// repo) - the Android counterpart to hil/epaper/orchestrator.js, sharing
// its report format (hil/report-template.js) and combination-generation
// logic (hil/combinations.js) so both render targets get directly
// comparable reports.
//
// Differences from the e-paper orchestrator, and why:
//   - No screen-switch API exists on the Android app (unlike the firmware's
//     /api/screen), so this run only exercises combinations for screen 0 -
//     every other screen in the project is reported as "skipped", not
//     silently wrong. The project itself no longer has to be put there by
//     hand: since 2026-09-21 the app takes a deploy over MQTT like any
//     board, and this suite installs the fixture itself (see "installing the
//     fixture" below).
//   - "Actual" is a real device screenshot at the phone's own resolution/
//     density, not a fixed pixel grid - it's cropped to the rendered
//     screen-content region but left at native resolution (cropDeviceScreenshot).
//     "Expected" (the designer's crisp 360x800 reference render) is then
//     upscaled to match that native size with matchDeviceScaling, a manual
//     nearest-neighbor mapping reverse-engineered to match the specific
//     pixel correspondence the device's own bitmap scaling (Coil's
//     FilterQuality.None) produces - a generic resize library's own
//     nearest-neighbor, or letting the canvas itself anti-alias a
//     fractional-scale render, both measurably diverge from it at non-
//     integer density ratios (2026-07-27 finding, see matchDeviceScaling's
//     comment for the full story). Comparison still uses
//     comparePixelsWithTolerance (a channel-difference threshold), not the
//     e-paper target's strict any-differing-pixel-fails comparison, since a
//     few stray pixels of real device rasterization noise at object edges
//     remain even after matching the scaling exactly.
//   - Font metadata: the Android export's font entries only need a `path`
//     for the app itself (Compose loads the .ttf file directly, no CSS-
//     style family-name matching needed) - but the designer's own
//     app/test-render harness renders via canvas ctx.font, which does need
//     a family name + ascent/descent. lib/android-export.ts embeds those
//     extra fields specifically so this script can stay self-contained
//     (load everything from the exported zip alone, same as the e-paper
//     orchestrator does for BDF fonts).
//
// Run: node hil/android/orchestrator.js --project <exported-android.zip> [--device <adb-serial>]
//
// The committed fixture is fixtures/comprehensive-test.zip, rebuilt with
// fixtures/build-android-test.js - it covers every object type the Android
// DDF declares and puts every screen under a master screen. See
// hil/README.md's Android section.
//
// Precondition: the app is installed on a connected/authorized device, the
// phone is unlocked, and a broker is configured in the app's settings so it
// announces itself. The project is installed by this script.

const fs = require("fs");
const os = require("os");
const http = require("http");
const zlib = require("zlib");
const crypto = require("crypto");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const mqtt = require("mqtt");
const { chromium } = require("playwright");
const { Jimp } = require("jimp");
const JSZip = require("jszip");
const { buildReport, comparePixelsWithTolerance } = require("../report-template");
const { combinationCount, combinationOverrides } = require("../combinations");

const execFileAsync = promisify(execFile);

// See hil/epaper/orchestrator.js's identical constant for why this defaults
// to the local broker (hil/local-broker.js, `npm run hil:broker`) now
// instead of the public test.mosquitto.org (2026-08-01).
const MQTT_URL = process.env.HIL_MQTT_URL || "mqtt://localhost:1883";
const DESIGNER_URL = "http://localhost:3000/test-render";
const OUT_DIR = path.join(__dirname, "report");
const IMG_DIR = path.join(OUT_DIR, "images");
const ADB = process.env.ANDROID_ADB_PATH ||
  path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe");
const APP_ACTIVITY = "com.screensmith.android/.MainActivity";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function getProjectZipPath() {
  const zipPath = getArg("--project");
  if (!zipPath) {
    throw new Error('Missing required argument: --project "<path-to-exported-android.zip>"');
  }
  return zipPath;
}

// Loads an Android-export bundle (project.json + assets/*.png +
// assets/fonts/*.ttf, see lib/android-export.ts in the designer repo).
// TTF font entries carry a `path` but no inline `data` - the app resolves
// that from its own extracted bundle at runtime, but the headless
// app/test-render harness needs the actual font bytes attached (as a
// data: URL, matching what a real DDF-loaded ProjectFont looks like).
async function loadProjectFromZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(buf);
  const projectFile = zip.file("project.json");
  if (!projectFile) throw new Error(`${zipPath} has no project.json`);
  const project = JSON.parse(await projectFile.async("string"));

  project.fonts = await Promise.all(
    (project.fonts || []).map(async (font) => {
      if (font.data || !font.path) return font;
      const entry = zip.file(font.path);
      if (!entry) throw new Error(`Font file "${font.path}" referenced by "${font.id}" not found in zip`);
      const base64 = await entry.async("base64");
      return { ...font, data: `data:font/ttf;base64,${base64}` };
    })
  );

  return project;
}

// FontFace.load() is async, but app/test-render's __renderScreenForTest
// renders + grabs the canvas synchronously in the same call - without
// pre-loading fonts here first, the very first (and only) render always
// happens before the font finishes loading and silently falls back to a
// system font instead of the real TTF. Registering (and awaiting) it here
// means it's already resolved by the time the harness's own registration
// call is a same-family no-op.
async function preloadTtfFonts(page, fonts) {
  await page.evaluate(async (fontList) => {
    await Promise.all(
      fontList
        .filter((f) => f.format === "ttf" && f.data)
        .map(async (f) => {
          const face = new FontFace(f.internalName || f.name, `url(${f.data})`);
          await face.load();
          document.fonts.add(face);
        })
    );
  }, fonts);
}

function adbArgs(deviceSerial, args) {
  return deviceSerial ? ["-s", deviceSerial, ...args] : args;
}

async function captureDeviceScreenshot(deviceSerial) {
  const { stdout } = await execFileAsync(ADB, adbArgs(deviceSerial, ["exec-out", "screencap", "-p"]), {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

// Finds the rendered screen-content region within a full device screenshot
// (the app's own root background is a slightly-off-white Material surface;
// the screen itself renders its own backgroundColor, pure white for most
// test projects) and crops to just that region, at the device's own native
// resolution - no resize. Restricted to exclude the status bar / gesture nav
// bar (assumed near-white on many devices too, which would otherwise pollute
// the detected bounds).
//
// Deliberately NOT resized down to the reference's 360x800: the device's
// real density (~2.25x here) isn't an integer ratio, and downscaling a thin
// 1px-wide border through it - by any resize algorithm - can shift the
// sampled row/column by a pixel, or skip a thin feature (like a 1px border
// row) entirely if no sample point happens to land on it. Both were
// observed (a 1px overall shift, and a fully-missing bottom border row) and
// were artifacts of that downscale, not real app bugs - confirmed by
// checking the untouched raw screenshot, where the border is present and
// correctly positioned at native resolution. See upscaleExpectedToMatch.
async function cropDeviceScreenshot(rawPngBuffer) {
  const img = await Jimp.read(rawPngBuffer);
  const { width: W, height: H, data } = img.bitmap;
  const topExclude = Math.floor(H * 0.05);
  const bottomExclude = Math.floor(H * 0.97);

  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = topExclude; y < bottomExclude; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error("No white screen-content region found in device screenshot");

  // minX/maxX/minY/maxY are inclusive coordinates of the first/last
  // matching pixel, so the crop span is maxX - minX + 1 (not maxX - minX,
  // which drops the maxX column/maxY row entirely) - an off-by-one that
  // shifted the box's right border by exactly 1px relative to the
  // reference in every row, the remaining mismatch after the resize
  // algorithm itself was fixed (see matchDeviceScaling; 2026-07-27 finding).
  return img.crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
}

// Upscales the crisp 1x (360x800) designer reference to the device crop's
// native resolution with a manual, deterministic nearest-neighbor mapping -
// not Jimp's built-in NEAREST_NEIGHBOR resize (which uses a different
// source/destination pixel correspondence than the one derived below) and
// not a live canvas re-render at scale (which anti-aliases fractional-pixel
// rect edges - real per-channel gray blending the real device's own
// FilterQuality.None bitmap scaling doesn't produce). Both were tried and
// both left the reference measurably different from a real device capture.
//
// The formula - sample the source pixel under each destination pixel's
// *center*, srcIndex = floor((dstIndex + 0.5) * srcDim / dstDim) - was
// reverse-engineered by testing candidate nearest-neighbor formulas against
// a real device capture's actual border-row/column pattern and keeping the
// one that reproduced it exactly (2026-07-27). It matches how GPU texture
// sampling (and Skia's bitmap shader, which is what Coil's FilterQuality.
// None ultimately draws through) conventionally samples nearest-neighbor -
// at pixel centers, not top-left corners.
function matchDeviceScaling(srcImg, dstWidth, dstHeight) {
  const { width: srcW, height: srcH, data: srcData } = srcImg.bitmap;
  const dst = new Jimp({ width: dstWidth, height: dstHeight });
  const dstData = dst.bitmap.data;
  for (let dy = 0; dy < dstHeight; dy++) {
    const sy = Math.max(0, Math.min(srcH - 1, Math.floor((dy + 0.5) * srcH / dstHeight)));
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx = Math.max(0, Math.min(srcW - 1, Math.floor((dx + 0.5) * srcW / dstWidth)));
      const si = (sy * srcW + sx) * 4;
      const di = (dy * dstWidth + dx) * 4;
      dstData[di] = srcData[si];
      dstData[di + 1] = srcData[si + 1];
      dstData[di + 2] = srcData[si + 2];
      dstData[di + 3] = srcData[si + 3];
    }
  }
  return dst;
}

// ---------------------------------------------------------------------------
// Installing the fixture, and proving the install reached the screen
// ---------------------------------------------------------------------------
//
// The app takes a project over the air since 2026-09-21, on the same topics
// every board uses (the designer's docs/2026-09-21-android-self-announce.md),
// so this suite installs its own fixture rather than asking for one to have
// been imported by hand first.
//
// It installs twice, on purpose. The first install is a marker: the fixture
// bundle with every screen background replaced by a flat colour, and
// project.json left exactly as it is. The second is the fixture itself. If
// the two device captures come out the same, the app is not drawing what was
// installed.
//
// That is not a hypothetical. On 2026-09-21 a phone drew an earlier project's
// background - a blue frame and a black field - under the current project's
// objects, because the background was cached under `assets/<screenId>.png`,
// a name every project there has ever been shares. The deploy reported
// `applied`, the bytes were on disk, and the screen kept the old ones.
// Nothing in the per-combination comparison below could see it: each case
// compares one installed project against its own reference, and a stale
// background is only visible against the project *before* it.
//
// Leaving project.json untouched in the marker is the second half of the
// same check: an install has to count even when project.json is byte for
// byte the one already loaded, because the bundle around it can still be
// different. A StateFlow of the parsed project drops that install silently.

const MARKER_BACKGROUND = 0xc81e1eff; // opaque red - nothing in a fixture is this

/**
 * The fixture with flat-coloured screen backgrounds. Same zip otherwise,
 * same project.json.
 */
async function markerBundle(zipBuffer) {
  const zip = await JSZip.loadAsync(zipBuffer);
  const project = JSON.parse(await zip.file("project.json").async("string"));
  const backgrounds = [...new Set((project.screens || []).map((s) => s.backgroundImage).filter(Boolean))];
  if (backgrounds.length === 0) {
    throw new Error("Fixture has no screen background image - nothing to mark, and nothing this check could see");
  }
  for (const name of backgrounds) {
    const entry = zip.file(name);
    if (!entry) throw new Error(`Fixture names a background it does not contain: ${name}`);
    const original = await Jimp.read(await entry.async("nodebuffer"));
    const flat = new Jimp({
      width: original.bitmap.width,
      height: original.bitmap.height,
      color: MARKER_BACKGROUND,
    });
    zip.file(name, await flat.getBuffer("image/png"));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Which of this machine's addresses the phone can actually fetch from. A
 * development machine has several - a VPN, a container bridge - and only one
 * of them is on the phone's network; the phone's own announced address says
 * which.
 */
function lanAddressNear(peerHost) {
  const candidates = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === "IPv4" && !address.internal) candidates.push(address.address);
    }
  }
  if (candidates.length === 0) {
    throw new Error("No non-internal IPv4 address on this machine to serve the bundle from");
  }
  if (!peerHost) return candidates[0];
  const peer = peerHost.split(".");
  let best = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    const parts = candidate.split(".");
    let score = 0;
    while (score < 4 && parts[score] === peer[score]) score++;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Serves one zip, once, the way the designer's /api/deploy serves one. */
function serveBundle(zipBuffer, host) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zipBuffer.length });
    res.end(zipBuffer);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "0.0.0.0", () => {
      resolve({
        url: `http://${host}:${server.address().port}/bundle.zip`,
        close: () => server.close(),
      });
    });
  });
}

/**
 * The phone, from its own retained announcement. `--device-id` skips the
 * wait; `--device-host` goes with it when the address cannot be read from a
 * hello either.
 */
async function discoverPhone(mqttClient) {
  const given = getArg("--device-id");
  if (given) return { deviceId: given, host: getArg("--device-host") || null };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      mqttClient.removeListener("message", onMessage);
      reject(new Error(
        `No Android phone announced itself on ${MQTT_URL} within 10s. The app publishes a retained ` +
        "`screenbee/android-<id>/hello` as soon as a broker is configured in its settings - check that, or " +
        "pass --device-id to skip the wait."
      ));
    }, 10000);

    function onMessage(topic, payload) {
      const match = /^screenbee\/(android-[^/]+)\/hello$/.exec(topic);
      if (!match) return;
      clearTimeout(timer);
      mqttClient.removeListener("message", onMessage);
      let host = null;
      try {
        host = new URL(JSON.parse(payload.toString()).url).hostname;
      } catch {
        // A hello without a usable url still identifies the phone; only the
        // address to serve from has to be guessed then.
      }
      resolve({ deviceId: match[1], host });
    }

    mqttClient.on("message", onMessage);
    mqttClient.subscribe("screenbee/+/hello");
  });
}

/**
 * Publishes a deploy and waits for the device to say it applied it.
 *
 * `busy` about the deploy being waited on is treated as a failure, not as
 * noise to ride out. The device answers it when a deploy arrives while one is
 * running - and the retained message comes back on every resubscribe, so a
 * device that resubscribes in a loop answers `busy` to its own deploy,
 * repeatedly, with no percentage attached. The designer's dialog shows that
 * over the progress bar, which is how a deploy came to sit at 20% on
 * 2026-09-21 while the phone had in fact finished: reconnecting on every
 * project change left each previous connection retrying under the same
 * client identifier, the two took the connection from one another about once
 * a second, and what the app published went out on whichever was dying.
 *
 * Two installs per run is the shape that catches it: the problem compounded
 * with each one, so a single deploy never showed it.
 */
async function deployBundle(mqttClient, deviceId, zipBuffer, host, label) {
  const served = await serveBundle(zipBuffer, host);
  const deployId = crypto.randomUUID();
  const statusTopic = `screenbee/${deviceId}/deploy-status`;
  try {
    await new Promise((resolve, reject) => {
      let lastState = "nothing";
      const timer = setTimeout(
        () => finish(new Error(`The phone never applied ${label} (60s; last state: ${lastState})`)),
        60000,
      );

      function finish(err) {
        clearTimeout(timer);
        mqttClient.removeListener("message", onMessage);
        if (err) reject(err); else resolve();
      }

      function onMessage(topic, payload) {
        if (topic !== statusTopic) return;
        let message;
        try {
          message = JSON.parse(payload.toString());
        } catch {
          return;
        }
        if (message.deployId !== deployId) return;
        lastState = message.state;
        if (message.state === "applied") finish(null);
        else if (message.state === "error") {
          finish(new Error(`The phone refused ${label}: ${message.error || "no reason given"}`));
        } else if (message.state === "busy") {
          finish(new Error(
            `The phone called ${label} busy with itself. Its own deploy came back to it while it was ` +
            "installing it, which means the retained message is being re-delivered - a connection being " +
            "rebuilt underneath, or a subscription registered more than once. The designer's dialog shows " +
            "this over the progress bar and stops moving."
          ));
        }
      }

      mqttClient.on("message", onMessage);
      mqttClient.subscribe(statusTopic, (err) => {
        if (err) return finish(err);
        mqttClient.publish(
          `screenbee/${deviceId}/deploy`,
          JSON.stringify({ deployId, url: served.url, crc32: zlib.crc32(zipBuffer) }),
          { qos: 1, retain: true },
        );
      });
    });
  } finally {
    served.close();
  }
}

/** Fraction of pixels that differ between two device captures. */
async function frameDifference(aBuffer, bBuffer) {
  const a = await Jimp.read(aBuffer);
  const b = await Jimp.read(bBuffer);
  if (a.bitmap.width !== b.bitmap.width || a.bitmap.height !== b.bitmap.height) return 1;
  const da = a.bitmap.data;
  const db = b.bitmap.data;
  let differing = 0;
  for (let i = 0; i < da.length; i += 4) {
    if (Math.abs(da[i] - db[i]) > 8 || Math.abs(da[i + 1] - db[i + 1]) > 8 || Math.abs(da[i + 2] - db[i + 2]) > 8) {
      differing++;
    }
  }
  return differing / (da.length / 4);
}

/**
 * Refuses to run against a phone nobody can see.
 *
 * A deploy needs neither the screen nor the lock: MQTT and the download work
 * through both, and the app reports `applied` from behind a lock screen. So
 * every capture would be the lock screen, the marker and the fixture would
 * look identical, and the check below would report the bug it exists to
 * find. Said here instead, where it is true.
 */
async function assertPhoneAwake(deviceSerial) {
  const { stdout: power } = await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "dumpsys", "power"]));
  if (/mWakefulness=(Asleep|Dozing)/.test(power)) {
    throw new Error("The phone's screen is off. Wake it and unlock it - every capture would be of nothing.");
  }
  const { stdout: window } = await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "dumpsys", "window"]));
  if (/isStatusBarKeyguard=true/.test(window) || /mDreamingLockscreen=true/.test(window)) {
    throw new Error("The phone is locked. Unlock it - every capture would be of the lock screen.");
  }
}

/**
 * Installs the fixture, having first installed a marker, and refuses to go on
 * if the screen did not change between the two.
 */
async function installFixture(mqttClient, zipPath, deviceSerial, onDeviceKnown = () => {}) {
  await assertPhoneAwake(deviceSerial);
  const fixture = fs.readFileSync(zipPath);
  const { deviceId, host: phoneHost } = await discoverPhone(mqttClient);
  // Named before the first deploy goes out, so the caller can clear it again
  // however this ends.
  onDeviceKnown(deviceId);
  console.log(`Phone: ${deviceId}${phoneHost ? ` at ${phoneHost}` : ""}`);
  const serveFrom = lanAddressNear(phoneHost);

  // A screenshot of a phone showing the launcher proves nothing either.
  await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "am", "start", "-n", APP_ACTIVITY]));
  await sleep(2000);

  console.log("Installing the marker bundle (flat background, unchanged project.json)...");
  await deployBundle(mqttClient, deviceId, await markerBundle(fixture), serveFrom, "the marker bundle");
  await sleep(2000);
  const markerFrame = await captureDeviceScreenshot(deviceSerial);

  console.log("Installing the fixture...");
  await deployBundle(mqttClient, deviceId, fixture, serveFrom, "the fixture");
  await sleep(2000);
  const fixtureFrame = await captureDeviceScreenshot(deviceSerial);

  fs.writeFileSync(path.join(IMG_DIR, "install-marker.png"), markerFrame);
  fs.writeFileSync(path.join(IMG_DIR, "install-fixture.png"), fixtureFrame);

  const changed = await frameDifference(markerFrame, fixtureFrame);
  if (changed < 0.2) {
    throw new Error(
      `The phone drew the same thing before and after the fixture was installed ` +
      `(${(changed * 100).toFixed(2)}% of the frame changed). Both installs reported \`applied\`, so the ` +
      `bundle is on disk and the app is not showing it - the shape of a cache keyed on a file name rather ` +
      `than on which project the file came from. See ${path.join(IMG_DIR, "install-marker.png")} and ` +
      `${path.join(IMG_DIR, "install-fixture.png")}.`
    );
  }
  console.log(`The install reached the screen (${(changed * 100).toFixed(1)}% of the frame changed).`);
  return deviceId;
}

async function main() {
  if (process.argv.includes("--report-only")) {
    const results = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "results.json"), "utf8"));
    const outPath = buildReport(results, OUT_DIR, {
      title: "HIL Test Report - Android",
      subtitle: "tolerance comparison (reference upscaled to device resolution)",
    });
    console.log("Rebuilt report from existing results.json:", outPath);
    return;
  }

  const project = await loadProjectFromZip(getProjectZipPath());
  console.log(`Loaded project "${project.name}" - ${project.screens.length} screen(s), ${(project.fonts || []).length} font(s)`);
  const deviceSerial = getArg("--device"); // optional - required only if multiple devices are attached

  fs.mkdirSync(IMG_DIR, { recursive: true });

  console.log("Connecting to MQTT broker...");
  const mqttClient = mqtt.connect(MQTT_URL, { clientId: "hil-android-orchestrator-" + Math.random().toString(16).slice(2) });
  await new Promise((resolve, reject) => {
    mqttClient.on("connect", resolve);
    mqttClient.on("error", reject);
    setTimeout(() => reject(new Error("MQTT connect timeout")), 10000);
  });
  console.log("MQTT connected.");

  // A deploy is retained, and this run publishes two of them. If it stops
  // anywhere after that - a failed check, a crash - the last one stays on the
  // broker naming an HTTP server that died with the process, and the phone
  // goes on trying to fetch it for as long as it is switched on. Cleared
  // whatever happens.
  let deviceId = getArg("--device-id") || null;
  const clearDeploy = async () => {
    if (!deviceId) return;
    await new Promise((resolve) => {
      mqttClient.publish(`screenbee/${deviceId}/deploy`, "", { qos: 1, retain: true }, () => resolve());
    });
  };
  process.on("exit", () => {
    // Best effort on the synchronous way out; the awaited path below is the
    // one that normally does it.
    if (deviceId) mqttClient.publish(`screenbee/${deviceId}/deploy`, "", { qos: 1, retain: true });
  });

  try {
    deviceId = await installFixture(mqttClient, getProjectZipPath(), deviceSerial, (id) => { deviceId = id; });
  } catch (err) {
    await clearDeploy();
    throw err;
  }

  console.log("Launching headless browser...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.log("[designer page error]", err.message));
  await page.goto(DESIGNER_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__testRenderReady === true, { timeout: 10000 });
  await preloadTtfFonts(page, project.fonts || []);
  console.log("Designer render harness ready (fonts preloaded).");

  const results = [];

  for (let si = 0; si < project.screens.length; si++) {
    const screen = project.screens[si];

    if (si !== 0) {
      // See file header: no remote screen-switch capability yet. Recorded
      // as a result row (not silently dropped) so the report makes the gap
      // visible instead of just looking like fewer screens exist.
      console.log(`\nScreen ${si} "${screen.name}": SKIPPED (no remote screen-switch API on Android yet)`);
      results.push({
        screenIndex: si,
        screenName: screen.name,
        comboIndex: 0,
        skipped: true,
        skipReason: "No remote screen-switch API on Android yet - only screen 0 (the screen shown right after import) can be exercised automatically.",
      });
      continue;
    }

    const combos = combinationCount(project, screen);
    console.log(`\nScreen ${si} "${screen.name}": ${combos} combination(s)`);

    for (let ci = 0; ci < combos; ci++) {
      const overrides = combinationOverrides(project, screen, ci);
      const caseId = `${si}-${ci}`;
      console.log(`  [${caseId}] overrides:`, overrides);

      // 1. Publish every relevant topic value, then give the app time to
      // receive it over MQTT and redraw (no completion signal to poll for,
      // unlike the firmware's synchronous /api/screen call).
      for (const [topic, value] of Object.entries(overrides)) {
        await new Promise((resolve, reject) => {
          mqttClient.publish(topic, value, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
        });
      }
      await sleep(Object.keys(overrides).length > 0 ? 1500 : 300);

      // 2. Capture + crop the device screenshot (native resolution, no resize).
      const rawPng = await captureDeviceScreenshot(deviceSerial);
      const actualImg = await cropDeviceScreenshot(rawPng);
      const actualPath = path.join(IMG_DIR, `actual-${caseId}.png`);
      await actualImg.write(actualPath);

      // 3. Render the same screen/overrides headlessly in the designer at
      // its native 1x (crisp, no anti-aliasing needed - every object's
      // coordinates are whole numbers), then upscale it to the device
      // crop's native resolution with matchDeviceScaling - reproducing the
      // same nearest-neighbor sampling the device's own bitmap scaling uses
      // instead of relying on canvas anti-aliasing or a generic resize
      // library's own (different) nearest-neighbor implementation.
      const dataUrl = await page.evaluate(
        (req) => window.__renderScreenForTest(req),
        { project, screenIndex: si, topicOverrides: overrides },
      );
      const expectedBuf = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      const expectedRaw = await Jimp.read(expectedBuf);
      const expectedImg = matchDeviceScaling(expectedRaw, actualImg.bitmap.width, actualImg.bitmap.height);
      const expectedPath = path.join(IMG_DIR, `expected-${caseId}.png`);
      await expectedImg.write(expectedPath);

      // 4. Tolerance pixel comparison (see file header for why not strict).
      const { dimensionMismatch, diffPixels, totalPixels } = comparePixelsWithTolerance(expectedImg, actualImg);
      const mismatchPct = totalPixels > 0 ? (100 * diffPixels) / totalPixels : 0;
      const pass = !dimensionMismatch && mismatchPct < 2;
      console.log(
        `  [${caseId}] ${pass ? "PASS" : "FAIL"}` +
        (dimensionMismatch ? " (dimension mismatch)" : ` (${diffPixels}/${totalPixels}px, ${mismatchPct.toFixed(2)}%)`)
      );

      results.push({
        screenIndex: si,
        screenName: screen.name,
        comboIndex: ci,
        overrides,
        pass,
        diffPixels,
        totalPixels,
        dimensionMismatch,
        expectedFile: `images/expected-${caseId}.png`,
        actualFile: `images/actual-${caseId}.png`,
        expectedDims: `${expectedImg.bitmap.width}x${expectedImg.bitmap.height}`,
        actualDims: `${actualImg.bitmap.width}x${actualImg.bitmap.height}`,
      });
    }
  }

  await browser.close();
  // The deploy is retained, so leaving it there would have the phone
  // reinstall this fixture every time it reconnects, for ever.
  await clearDeploy();
  mqttClient.end();

  fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
  const testedResults = results.filter((r) => !r.skipped);
  console.log(`\n${testedResults.filter((r) => r.pass).length}/${testedResults.length} cases passed (${results.length - testedResults.length} screen(s) skipped).`);
  console.log("Building HTML report...");
  const outPath = buildReport(results, OUT_DIR, {
    title: "HIL Test Report - Android",
    subtitle: "tolerance comparison (reference upscaled to device resolution)",
  });
  console.log("Done:", outPath);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
