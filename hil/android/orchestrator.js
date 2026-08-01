// HIL test orchestrator for the Screensmith Android app (ScreensmithAndroid
// repo) - the Android counterpart to hil/epaper/orchestrator.js, sharing
// its report format (hil/report-template.js) and combination-generation
// logic (hil/combinations.js) so both render targets get directly
// comparable reports.
//
// Differences from the e-paper orchestrator, and why:
//   - No upload/screen-switch HTTP API exists on the Android app (unlike
//     the firmware's /api/project and /api/screen) - the app currently
//     only shows the first screen of whatever project was last imported
//     through its own file picker, which adb can't drive. So this run:
//       1. assumes the project bundle has ALREADY been imported into the
//          app by hand, and the app is in the foreground;
//       2. only exercises combinations for screen 0 (every other screen in
//          the project is reported as "skipped", not silently wrong);
//       3. still automates the part that *can* be automated - publishing
//          MQTT overrides and capturing a screenshot via adb - for each
//          combination on that screen.
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
// Precondition: the exported project is already imported and showing in
// the Screensmith Android app on a connected/authorized device.

const fs = require("fs");
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
// data: URL, matching what a real DDF-loaded ScreenmanFont looks like).
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
