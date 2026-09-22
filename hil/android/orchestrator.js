// HIL test orchestrator for the Screensmith Android app (ScreensmithAndroid
// repo) - the Android counterpart to hil/epaper/orchestrator.js, sharing
// its report format (hil/report-template.js) and combination-generation
// logic (hil/combinations.js) so both render targets get directly
// comparable reports.
//
// Differences from the e-paper orchestrator, and why:
//   - There is no screen-switch API on the Android app (the firmware has
//     /api/screen), so this run reaches the other screens the way a hand
//     does: it swipes. Until 2026-09-22 it did not reach them at all - every
//     screen but the first was reported as "skipped", which meant the
//     Switch, the tab-control and the whole nested-panel screen were never
//     measured against anything. A swipe is also the more honest
//     instrument: it is the app's own navigation, so a run says both that
//     the picture is right and that it can be got to.
//     What a swipe cannot do is say WHERE it landed, which an API call
//     could. So navigation is checked from both ends: each swipe has to
//     change the picture and then settle (swipeToScreen), and a case that
//     fails badly is measured against every other screen's reference before
//     it is reported, so "you are on the wrong screen" cannot be mistaken
//     for "this screen is drawn wrong" (identifyScreen).
//     The project itself no longer has to be put there by hand either:
//     since 2026-09-21 the app takes a deploy over MQTT like any board, and
//     this suite installs the fixture itself (see "installing the fixture"
//     below).
//   - "Actual" is a real device screenshot at the phone's own resolution/
//     density, not a fixed pixel grid - it's cropped to the rendered
//     screen-content region but left at native resolution (cropDeviceScreenshot).
//     "Expected" is drawn by the designer at the size the device shows it -
//     see renderReference. Where the crop is a whole multiple of the project
//     (a 480 dpi phone against a 360-wide project is exactly three), the
//     headless harness draws at that multiple, so a glyph is rasterised at
//     the size it is compared at while baked bitmaps still come up
//     unsmoothed. Where it is not a whole multiple, the reference is drawn at
//     1x and enlarged with matchDeviceScaling, the nearest-neighbor mapping
//     reverse-engineered on 2026-07-27 against a real capture; see its own
//     comment for why a canvas re-render was wrong for the app of that time.
//
//     Comparison uses comparePixelsWithTolerance (a channel-difference
//     threshold), not the e-paper target's strict any-differing-pixel-fails
//     rule. The boards reach zero because they draw bitmap fonts with no
//     anti-aliasing - there are no in-between tones to disagree about. A
//     480 dpi phone draws soft edges because that is what it is for, so this
//     suite measures layout and geometry and says so, rather than printing
//     the same "pass" as the boards and meaning something weaker by it.
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
const { phoneDdf } = require("./ddf-fonts");
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

  project.assets = await iconAssetsFor(zipPath, project, zip);

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

/**
 * The icons the designer's own renderer needs to draw this project.
 *
 * The reference image is the designer drawing the project, and the designer
 * draws an icon from the SVG the author picked. An exported bundle does not
 * carry those: it carries what the DEVICE needs, which since 2026-09-22 is
 * partly the opposite - a Switch's state icons, a SoftwareButton and a level
 * indicator's header icon are baked into bitmaps there, and their sources are
 * gone.
 *
 * So the fixture builder writes the sources beside the zip
 * (`<fixture>.assets.json`), and that is what is used when it is there. It is
 * not put inside the bundle: a phone would carry a copy of every icon it can
 * already draw, in every deploy, for the sake of a test.
 *
 * Without the sidecar the sources are rebuilt from whatever SVGs the bundle
 * still holds - enough for a plain icon or a live-icon rule, and NOT enough
 * for anything baked. That case is said out loud rather than passed over,
 * because it fails in the one way this suite must never fail quietly: the
 * reference simply draws no icon, the phone draws one, and at a dozen
 * thousand pixels the difference sits comfortably under the tolerance. It
 * did exactly that for a day (found 2026-09-22, when the header icon was
 * added and turned out to be missing from the reference rather than from the
 * phone).
 */
async function iconAssetsFor(zipPath, project, zip) {
  const sidecar = zipPath.replace(/\.zip$/, ".assets.json");
  if (fs.existsSync(sidecar)) {
    const assets = JSON.parse(fs.readFileSync(sidecar, "utf8"));
    if (Array.isArray(assets) && assets.length > 0) return assets;
  }
  const rebuilt = await rehydrateIconAssets(project, zip);
  const baked = [];
  const walk = (objects) => {
    for (const obj of objects || []) {
      const props = obj.properties || {};
      if (props.iconAssetId && (obj.type === "bar" || obj.type === "slider")) baked.push(obj.id);
      if (obj.type === "button" && props.iconAssetId) baked.push(obj.id);
      for (const state of props.states || []) if (state.iconAssetId) baked.push(`${obj.id}/${state.id}`);
      walk(obj.children);
    }
  };
  for (const screen of project.screens || []) walk(screen.objects);
  if (baked.length > 0) {
    console.log(
      `WARNING: ${path.basename(sidecar)} is missing, so the reference will draw no icon for ` +
        `${baked.join(", ")} - their sources are baked into bitmaps in this bundle. Rebuild the fixture ` +
        "(node hil/android/fixtures/build-android-test.js) or those icons are compared against nothing."
    );
  }
  return rebuilt;
}

/**
 * Puts the icon assets back out of the bundle's own SVGs, for a bundle with
 * no sidecar beside it.
 *
 * A project in the designer holds its icons as assets - an id and the SVG
 * source. The export resolves that away: it writes each icon out as a file,
 * already tinted, and leaves the object pointing at the file. The app needs
 * nothing else. The designer's own reference render, though, draws an icon
 * from the asset the object names, and with no assets at all it fell over
 * reading `.find` of undefined the moment a run reached a screen with one -
 * which is to say, the moment this suite stopped testing only the first
 * screen (2026-09-22).
 *
 * Both halves of the pair are still in the bundle - the object knows which
 * asset it wants AND which file that became - so the assets can simply be
 * built back up from the objects.
 *
 * An asset can have been written out more than once, tinted differently for
 * each object that uses it; there is only one `data` per id to hand back, and
 * the renderer tints again anyway, so any of them will do. A file that was
 * written untinted is preferred where there is one, so an object that asks
 * for no colour does not inherit another object's.
 */
async function rehydrateIconAssets(project, zip) {
  const files = new Map(); // assetId -> { file, untinted }
  const remember = (assetId, file, untinted) => {
    if (!assetId || !file) return;
    const seen = files.get(assetId);
    if (!seen || (untinted && !seen.untinted)) files.set(assetId, { file, untinted });
  };
  const walk = (objects) => {
    for (const obj of objects || []) {
      const props = obj.properties || {};
      const untinted = !props.iconColor;
      if (obj.type === "icon") remember(props.assetId, obj.path, untinted);
      if (obj.type === "button") remember(props.iconAssetId, obj.path, untinted);
      for (const state of props.states || []) {
        remember(state.iconAssetId, state.path, untinted);
        remember(state.activeIconAssetId, state.activePath, untinted);
      }
      for (const pair of props.valueIconPairs || []) {
        remember(pair.thenShowIcon || pair.id, pair.path, untinted);
      }
      walk(obj.children);
    }
  };
  for (const screen of project.screens || []) walk(screen.objects);

  const assets = [];
  for (const [id, { file }] of files) {
    const entry = zip.file(file);
    if (!entry) throw new Error(`Icon file "${file}" for asset "${id}" is not in the bundle`);
    const svg = await entry.async("string");
    assets.push({
      id,
      name: id,
      type: "icon",
      data: "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64"),
    });
  }
  return assets;
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

// Where the project sits inside a full device screenshot.
//
// Computed, not detected. It used to look for the largest near-white region,
// on the reasoning that a screen's own background is white in most test
// projects - and the comprehensive fixture's is not. On a dark screen that
// search collapsed onto whatever single pale thing was there: an 89x51 crop
// around the word "OK", compared against a whole screen's reference, for
// every case in the run (2026-09-21).
//
// The arithmetic is short because the app does nothing clever: one project
// unit is one dp (ScreenRenderer.kt applies no fit step), the activity draws
// edge to edge, and the screen is centred in it. So the region is the
// project's size in pixels, centred in the capture - no colours involved,
// and it cannot be fooled by what the project happens to contain.
//
// Deliberately NOT resized down to the project's own units: the device's
// real density is rarely an integer ratio, and downscaling a 1px border
// through it - by any algorithm - can shift the sampled row by a pixel, or
// skip a thin feature entirely. Both were observed and were artifacts of the
// downscale, not app bugs. See matchDeviceScaling.
let cachedDensity = null;
async function deviceDensity(deviceSerial) {
  if (cachedDensity) return cachedDensity;
  const { stdout } = await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "wm", "density"]));
  // "Physical density: 480", sometimes with an "Override density:" line after
  // it - the override is what is in force.
  const all = [...stdout.matchAll(/density:\s*(\d+)/g)].map((m) => Number(m[1]));
  if (all.length === 0) throw new Error(`Could not read the screen density from \`wm density\`: ${stdout}`);
  cachedDensity = all[all.length - 1];
  return cachedDensity;
}

async function cropDeviceScreenshot(rawPngBuffer, project, deviceSerial) {
  const img = await Jimp.read(rawPngBuffer);
  const scale = (await deviceDensity(deviceSerial)) / 160;
  const w = Math.round(project.screenWidth * scale);
  const h = Math.round(project.screenHeight * scale);
  if (w > img.bitmap.width || h > img.bitmap.height) {
    throw new Error(
      `The project is ${project.screenWidth}x${project.screenHeight} units, which at this phone's density ` +
        `is ${w}x${h} pixels - larger than its ${img.bitmap.width}x${img.bitmap.height} screen. It cannot all ` +
        "be shown, so nothing here can be compared. Rebuild the fixture for this phone: " +
        "node hil/android/fixtures/build-android-test.js",
    );
  }
  return img.crop({
    x: Math.round((img.bitmap.width - w) / 2),
    y: Math.round((img.bitmap.height - h) / 2),
    w,
    h,
  });
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

/**
 * The reference, drawn the way the phone draws it.
 *
 * Until 2026-09-21 the app blitted a whole screen as one bitmap, so the
 * honest reference was a 1x render blown up with matchDeviceScaling, and a
 * live canvas re-render at scale was measurably wrong - that is what the
 * comment above it records, and it was true of that app.
 *
 * The app has since changed underneath it. Shapes and text are drawn natively
 * by Compose (LevelShape.kt, SwitchShape.kt), and only single pictures are
 * baked - the switch icons and the whole SoftwareButton. Against that app a
 * 1x-then-enlarge reference compares a blocky glyph against a smooth one, and
 * the measurement says exactly that: on 2026-09-22, 12 127 of 2 199 960 pixels
 * differed beyond the tolerance, every one of them on a glyph, on the two
 * diagonal data lines, or on one round icon. Every baked bitmap and every
 * axis-aligned edge already matched to the pixel.
 *
 * So when the device crop is a whole multiple of the project, the harness is
 * asked to draw at that multiple: text and shapes get rasterised at the size
 * they are shown at, while baked bitmaps still come up unsmoothed. Each half
 * is then compared against its own kind.
 *
 * At a fractional ratio none of that is established - the 2026-07-27 finding
 * stands there - so the old path is kept.
 */
async function renderReference(page, project, screenIndex, overrides, dstWidth, dstHeight) {
  const sx = dstWidth / project.screenWidth;
  const sy = dstHeight / project.screenHeight;
  // HIL_ANDROID_NO_SCALE forces the old 1x-then-enlarge path. It is how you
  // tell a difference caused by this function from one that was already
  // there: run the same case both ways and compare.
  const wholeMultiple =
    !process.env.HIL_ANDROID_NO_SCALE && sx === sy && Number.isInteger(sx) && sx >= 1;

  const req = { project, screenIndex, topicOverrides: overrides };
  if (wholeMultiple) req.scale = sx;

  const dataUrl = await page.evaluate((r) => window.__renderScreenForTest(r), req);
  const raw = await Jimp.read(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  return wholeMultiple ? raw : matchDeviceScaling(raw, dstWidth, dstHeight);
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
 * Serves one zip, once, the way the designer's /api/deploy serves one - and
 * hands it to the phone down the USB cable rather than over the network.
 *
 * `adb reverse` makes a port on the phone's own loopback reach this process,
 * so the address the phone fetches from is always 127.0.0.1 and it does not
 * matter which network either end is on. That stopped being a detail on
 * 2026-09-21: the phone moved to the van's wifi while this machine stayed at
 * home, the retained `hello` still arrived (the way in exists), and every
 * deploy then sat waiting for a download that could never happen, because
 * the way back does not.
 *
 * It also removes a guess. The address to serve from used to be picked by
 * comparing this machine's interfaces against the phone's announced one - a
 * development machine has several, and only one of them is ever right.
 */
function serveBundle(zipBuffer, deviceSerial) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": zipBuffer.length });
    res.end(zipBuffer);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      try {
        await execFileAsync(ADB, adbArgs(deviceSerial, ["reverse", `tcp:${port}`, `tcp:${port}`]));
      } catch (err) {
        server.close();
        reject(new Error(`Could not open a reverse port on the phone (adb reverse tcp:${port}): ${err.message}`));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${port}/bundle.zip`,
        close: async () => {
          server.close();
          // Left behind, these pile up on the device across runs.
          await execFileAsync(ADB, adbArgs(deviceSerial, ["reverse", "--remove", `tcp:${port}`])).catch(() => {});
        },
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
async function deployBundle(mqttClient, deviceId, zipBuffer, deviceSerial, label) {
  const served = await serveBundle(zipBuffer, deviceSerial);
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
    await served.close();
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
 * Turns off the banner a notification drops over the top of the screen, for
 * as long as this run takes.
 *
 * A phone is not a panel: it has a life of its own, and on 2026-09-22 a
 * WhatsApp banner arrived during one capture and put 152,000 differing
 * pixels into one case of twelve - a 7% failure with nothing wrong in the
 * app at all. Re-running would have made it go away, which is the worst
 * possible outcome: a suite that fails at random teaches you to ignore it.
 *
 * Only the heads-up banner is turned off, not notifications themselves, and
 * it is put back afterwards. Nothing else about the phone is touched.
 */
async function silenceBanners(deviceSerial) {
  const read = async () => {
    const { stdout } = await execFileAsync(
      ADB,
      adbArgs(deviceSerial, ["shell", "settings", "get", "global", "heads_up_notifications_enabled"]),
    );
    return stdout.trim();
  };
  const before = await read().catch(() => "null");
  await execFileAsync(
    ADB,
    adbArgs(deviceSerial, ["shell", "settings", "put", "global", "heads_up_notifications_enabled", "0"]),
  ).catch(() => {});
  return async () => {
    const back = before && before !== "null" ? before : "1";
    await execFileAsync(
      ADB,
      adbArgs(deviceSerial, ["shell", "settings", "put", "global", "heads_up_notifications_enabled", back]),
    ).catch(() => {});
  };
}

/**
 * Makes this machine's broker reachable from the phone at 127.0.0.1, over
 * the cable.
 *
 * So that a test run cannot touch a real installation. The phone under test
 * is also a phone in a camper: the broker it is normally pointed at carries
 * `screenbee/cmnd/relay/...`, and those topics open valves and start pumps.
 * A suite that installs projects and sends gestures has no business being on
 * that broker at all, however careful its own fixture is.
 *
 * `adb reverse` puts this machine's port 1883 on the phone's own loopback,
 * so the app's broker setting reads 127.0.0.1 and every packet goes down the
 * USB cable. Unplug it and the app connects to nothing, which is the right
 * way for this to fail.
 *
 * The app's setting is not changed from here - that is a phone someone owns,
 * and a test should not silently repoint it. It is checked instead, with an
 * error that says what to type.
 */
async function reverseBrokerPort(deviceSerial, brokerUrl) {
  const port = Number(new URL(brokerUrl).port || 1883);
  await execFileAsync(ADB, adbArgs(deviceSerial, ["reverse", `tcp:${port}`, `tcp:${port}`]));
  return async () => {
    await execFileAsync(ADB, adbArgs(deviceSerial, ["reverse", "--remove", `tcp:${port}`])).catch(() => {});
  };
}

/**
 * Refuses a fixture that could switch anything real.
 *
 * Belt and braces beside the reverse above: `screenbee/cmnd/...` is what a
 * relay listens to, and nothing this suite installs may ever bind one. It
 * publishes a value for every topic a fixture declares, so a fixture that
 * named a command topic would be pressing switches by design.
 */
function refuseRealCommands(project) {
  const bound = new Set();
  const walk = (objects) => {
    for (const obj of objects || []) {
      for (const key of ["topic", "writeTopic", "setpointTopic"]) {
        const value = obj.properties?.[key];
        if (value) bound.add(value);
      }
      walk(obj.children);
    }
  };
  for (const screen of project.screens || []) walk(screen.objects);
  for (const topic of project.topics || []) if (topic.topic) bound.add(topic.topic);

  const real = [...bound].filter((t) => t.startsWith("screenbee/cmnd/"));
  if (real.length > 0) {
    throw new Error(
      `This fixture binds ${real.join(", ")}. Those are commands to a real installation - a relay, a pump, ` +
        "a valve - and this suite publishes a value for every topic a fixture declares. Fixtures use hil/*.",
    );
  }
}

/**
 * Keeps the screen on for as long as this run takes, and puts the setting
 * back afterwards.
 *
 * A phone left to itself turns its screen off and locks, and then every
 * capture is of a lock screen. It happens between runs as much as during
 * one: installing a build kills the app, the app is what was holding the
 * screen awake (FLAG_KEEP_SCREEN_ON), and by the time the next run starts
 * the phone is asleep and needs a person with the PIN.
 *
 * `stay_on_while_plugged_in` is a number of power sources as a bitmask; 2 is
 * USB, which is how a phone under test is attached. Read first and restored
 * at the end, because this is somebody's phone and a test should hand it
 * back as it found it.
 */
async function keepScreenOn(deviceSerial) {
  const { stdout } = await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "settings", "get", "global", "stay_on_while_plugged_in"]));
  const before = stdout.trim();
  await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "svc", "power", "stayon", "usb"]));
  return async () => {
    if (!/^\d+$/.test(before)) return;
    await execFileAsync(
      ADB,
      adbArgs(deviceSerial, ["shell", "settings", "put", "global", "stay_on_while_plugged_in", before]),
    ).catch(() => {});
  };
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
  // Before anything else that takes time: from here on the phone stays awake
  // by itself rather than by the app happening to be in front.
  restoreScreenTimeout = await keepScreenOn(deviceSerial);
  // The broker reaches the phone over the cable from here on.
  restoreBrokerPort = await reverseBrokerPort(deviceSerial, MQTT_URL);
  restoreBanners = await silenceBanners(deviceSerial);
  const fixture = fs.readFileSync(zipPath);
  // A fixture built for another screen compares a clipped picture against a
  // whole reference, and every case fails for a reason that has nothing to
  // do with the app. Said here, once, rather than found later as noise.
  const project = JSON.parse(await (await JSZip.loadAsync(fixture)).file("project.json").async("string"));
  refuseRealCommands(project);
  const ddf = await phoneDdf(deviceSerial);
  if (project.screenWidth !== ddf.screen.width || project.screenHeight !== ddf.screen.height) {
    throw new Error(
      `The fixture is built for a ${project.screenWidth}x${project.screenHeight} screen and this phone ` +
        `announces ${ddf.screen.width}x${ddf.screen.height}. Rebuild it: ` +
        "node hil/android/fixtures/build-android-test.js",
    );
  }

  const { deviceId, host: phoneHost } = await discoverPhone(mqttClient);
  // Named before the first deploy goes out, so the caller can clear it again
  // however this ends.
  onDeviceKnown(deviceId);
  console.log(`Phone: ${deviceId}${phoneHost ? ` at ${phoneHost}` : ""}`);

  // A screenshot of a phone showing the launcher proves nothing either.
  await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "am", "start", "-n", APP_ACTIVITY]));
  await sleep(2000);

  console.log("Installing the marker bundle (flat background, unchanged project.json)...");
  await deployBundle(mqttClient, deviceId, await markerBundle(fixture), deviceSerial, "the marker bundle");
  await sleep(2000);
  const markerFrame = await captureDeviceScreenshot(deviceSerial);

  console.log("Installing the fixture...");
  await deployBundle(mqttClient, deviceId, fixture, deviceSerial, "the fixture");
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

// ---------------------------------------------------------------------------
// Paging that follows the finger
// ---------------------------------------------------------------------------
//
// The app carries the picture along under a horizontal swipe that is bound to
// another screen, the way the Waveshare firmware does (`FollowSwipe.h`). It
// is a thing you can only see while the finger is still down, so this drives
// a deliberately slow `adb input swipe` and looks at the glass part of the
// way through.
//
// Three claims, and all three matter:
//
//   1. Partway through a drag the picture is somewhere else. That is the
//      following.
//   2. Once let go past a third of the way, it stays somewhere else. That is
//      the paging.
//   3. The outgoing screen is never back in the middle after the finger has
//      gone. See below.
//   4. A drag that stops short leaves the screen exactly as it was - not
//      approximately, exactly. That is the spring back, and it is the half
//      that is easy to get wrong: a follow that never returns is a screen
//      stuck at an angle.
//
// **The paging swipe is let go just past the threshold, not carried across.**
// That is the case that catches things, and it took a person's eye to find
// out why (2026-09-21): a gesture carried nearly all the way leaves the glide
// almost nothing to cover, so anything wrong at the end of it is over before
// it can be seen. Let go near the threshold, the glide still has most of the
// screen to travel - and the screen swiped away flashed back into the middle
// for 148ms at the end of it, because the transition was being torn down the
// instant the move was *asked* for rather than when it arrived. Claim 3 is
// that bug, written down.
//
// Claim 3 is sampled as a burst rather than at one instant: where exactly a
// flash would fall depends on how long the glide took. Several captures
// across the settling, none of which may look like the screen the swipe
// started from. It cannot report a fault that is not there - the outgoing
// screen centred is not a state a correct transition ever passes through -
// and with a window that was 148ms wide against captures every ~120ms it
// would have to be lucky to miss one.
//
// `input swipe` takes a few hundred milliseconds to start, and the capture
// itself is not instant, so the sampling point is a fraction of the gesture
// rather than a wall-clock figure.

// Put back however a run ends; see keepScreenOn, reverseBrokerPort and
// silenceBanners.
let restoreScreenTimeout = async () => {};
let restoreBrokerPort = async () => {};
let restoreBanners = async () => {};

const SWIPE_Y_FRACTION = 0.5;
const SWIPE_MS = 2500;
// Getting somewhere, rather than being watched on the way: short enough that
// four screens do not cost a minute, long enough that `input swipe` still
// produces a gesture the app reads as a swipe rather than a flick.
const NAV_SWIPE_MS = 400;

/** The phone's screen in device pixels, read once. */
let cachedScreenSize = null;
async function screenSize(deviceSerial) {
  if (cachedScreenSize) return cachedScreenSize;
  const { stdout } = await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "wm", "size"]));
  const size = /(\d+)x(\d+)/.exec(stdout.split("\n").filter(Boolean).pop() || "");
  if (!size) throw new Error(`Could not read the screen size from \`wm size\`: ${stdout}`);
  cachedScreenSize = { width: Number(size[1]), height: Number(size[2]) };
  return cachedScreenSize;
}

/** Runs a swipe without waiting for it, so the screen can be looked at mid-gesture. */
function startSwipe(deviceSerial, fromX, toX, y, ms) {
  const child = execFile(
    ADB,
    adbArgs(deviceSerial, ["shell", "input", "touchscreen", "swipe", String(fromX), String(y), String(toX), String(y), String(ms)]),
    () => {},
  );
  return new Promise((resolve) => child.on("exit", () => resolve()));
}

/** Fraction of pixels that differ between two captures, 0 when identical. */
async function frameChange(a, b) {
  return frameDifference(a, b);
}

/**
 * Captures for as long as a gesture lasts, and hands back every frame.
 *
 * Paced by how long a capture itself takes rather than by a chosen interval:
 * `input swipe` takes a variable few hundred milliseconds to start, and a
 * screencap is not instant either, so any fixed sampling point lands inside
 * the movement on one run and outside it on the next. That read as "the
 * picture did not move" and stopped the whole suite, twice (2026-09-21).
 */
async function captureThroughout(deviceSerial, gesture) {
  const frames = [];
  let running = true;
  gesture.then(() => { running = false; });
  while (running) frames.push(await captureDeviceScreenshot(deviceSerial));
  return frames;
}

/**
 * Captures until the picture stops changing, and hands back the still frame.
 *
 * A paging swipe is let go before it is finished - the app glides the rest of
 * the way - so there is no moment that can be waited for by the clock. Two
 * identical captures in a row is the only honest signal that the glide is
 * over, and it is what makes the navigation below self-paced on a slow phone
 * instead of guessing at a sleep.
 */
async function settledFrame(deviceSerial, timeoutMs = 6000) {
  let previous = await captureDeviceScreenshot(deviceSerial);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const next = await captureDeviceScreenshot(deviceSerial);
    if ((await frameChange(previous, next)) < 0.001) return next;
    previous = next;
  }
  return previous;
}

/**
 * Goes from one screen to another by swiping, one screen per swipe.
 *
 * The app's own navigation, not a back door: swipe-left is bound to
 * next-screen on this fixture's master, so this is the same gesture a hand
 * makes, and a run that cannot swipe is a run that has found something.
 *
 * Every step is checked, because the position is carried forward: the loop
 * below remembers which screen it is on, and one swipe that quietly did
 * nothing would measure every screen after it against the wrong reference.
 * The check is the same 5% of the frame the paging test uses - two screens of
 * this fixture differ by far more than that, and a swipe that merely sprang
 * back differs by nothing.
 */
async function swipeToScreen(deviceSerial, from, to) {
  if (from === to) return;
  const { width, height } = await screenSize(deviceSerial);
  const y = Math.round(height * SWIPE_Y_FRACTION);
  const forward = to > from;
  for (let step = 0; step < Math.abs(to - from); step++) {
    const at = forward ? from + step : from - step;
    const before = await settledFrame(deviceSerial);
    await startSwipe(
      deviceSerial,
      Math.round(width * (forward ? 0.85 : 0.15)),
      Math.round(width * (forward ? 0.15 : 0.85)),
      y,
      NAV_SWIPE_MS,
    );
    const after = await settledFrame(deviceSerial);
    const changed = await frameChange(before, after);
    if (changed < 0.05) {
      const stuckPath = path.join(IMG_DIR, `nav-stuck-${at}.png`);
      fs.writeFileSync(stuckPath, after);
      throw new Error(
        `Swiping ${forward ? "on from" : "back from"} screen ${at} left the same picture on the glass ` +
        `(${(changed * 100).toFixed(2)}% of the frame changed). Either the swipe is not bound to a screen ` +
        `change on this screen, or the app did not page. See ${stuckPath}.`
      );
    }
  }
}

/**
 * Which screen a picture is of, out of all of them - used only when a case
 * has already failed.
 *
 * A swipe cannot report where it landed, so a run that pages one screen too
 * far reports the project as drawn wrong, at 40% of pixels, and says nothing
 * about navigation. That happened on the very first run of this (2026-09-22).
 * Rendering the other screens with the same topic values costs a second and
 * turns that into one sentence.
 */
async function identifyScreen(page, project, overrides, actualImg) {
  const scores = [];
  for (let si = 0; si < project.screens.length; si++) {
    const reference = await renderReference(
      page, project, si, overrides, actualImg.bitmap.width, actualImg.bitmap.height,
    );
    const { diffPixels, totalPixels } = comparePixelsWithTolerance(reference, actualImg);
    scores.push({ screenIndex: si, name: project.screens[si].name, pct: (100 * diffPixels) / totalPixels });
  }
  scores.sort((a, b) => a.pct - b.pct);
  return scores;
}

/**
 * Where a point in the project's own units lands on the glass.
 *
 * The same arithmetic the crop makes, read the other way: the screen is the
 * project's size in pixels, centred in the capture, so a unit is the density
 * and the object's own coordinates are the screen's.
 */
async function devicePointFor(deviceSerial, project, xUnits, yUnits) {
  const scale = (await deviceDensity(deviceSerial)) / 160;
  const { width, height } = await screenSize(deviceSerial);
  const left = Math.round((width - project.screenWidth * scale) / 2);
  const top = Math.round((height - project.screenHeight * scale) / 2);
  return { x: Math.round(left + xUnits * scale), y: Math.round(top + yUnits * scale) };
}

/**
 * The first thing on a screen a finger can do something with, container
 * children included - and where it sits on the glass.
 *
 * An object inside a tab-control's panel carries coordinates relative to that
 * container, not to the screen. Its own rules work in those coordinates and
 * so does the app's hit test, but a tap has to land on the screen, so the
 * ancestors' offsets are carried down here. Without that, the first tap at a
 * nested Switch landed 250 units above it, on the master's title, and
 * published nothing (2026-09-22).
 */
function firstTappable(objects, dx = 0, dy = 0) {
  for (const obj of objects || []) {
    const props = obj.properties || {};
    const isSwitch = obj.type === "switch" || obj.type === "button-group";
    const settable = ["slider", "bar", "gauge", "dial"].includes(obj.type) && props.writeTopic;
    if ((isSwitch && props.writeTopic) || settable) return { obj, dx, dy };
    const nested = firstTappable(obj.children, dx + obj.x, dy + obj.y);
    if (nested) return nested;
  }
  return null;
}

/** Resolves with the first message on `topic`, or rejects when nothing comes. */
function nextMessageOn(mqttClient, topic, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      mqttClient.removeListener("message", onMessage);
      mqttClient.unsubscribe(topic, () => {});
      reject(new Error(`nothing was published on ${topic} within ${timeoutMs}ms`));
    }, timeoutMs);
    const onMessage = (received, payload) => {
      if (received !== topic) return;
      clearTimeout(timer);
      mqttClient.removeListener("message", onMessage);
      mqttClient.unsubscribe(topic, () => {});
      resolve(payload.toString());
    };
    mqttClient.on("message", onMessage);
    mqttClient.subscribe(topic, { qos: 1 }, (err) => {
      if (err) {
        clearTimeout(timer);
        mqttClient.removeListener("message", onMessage);
        reject(err);
      }
    });
  });
}

/**
 * Taps what a screen offers, and checks what comes out of the phone.
 *
 * Everything else this suite does is a picture, and a picture cannot show
 * what a finger MEANS. A Switch that draws perfectly and writes the wrong
 * state, or a bar whose track is a pixel off so that the middle of it
 * publishes 49, both pass every comparison in this file (2026-09-22: touch
 * had never been exercised on the phone at all).
 *
 * What it is checked against is the designer's own mapping, asked of the
 * harness at the moment of the tap (`__tapMeaningForTest`) - not a copy of
 * the rule written here, which would only prove that two guesses agree.
 *
 * The tap is a real `input tap` at the point the arithmetic says, so the
 * whole chain is exercised: the hit rectangle, the unit conversion, the
 * state or value chosen, and the publish.
 */
async function checkTouch(deviceSerial, mqttClient, page, project, screen, si) {
  const found = firstTappable(screen.objects);
  if (!found) return;
  const { obj: target, dx, dy } = found;
  const props = target.properties || {};
  const writeTopic = props.writeTopic;

  // Where to put the finger: the middle of the second state for a group (so
  // the answer is the same whatever is currently reported), the middle of
  // the object for anything else.
  const states = props.states || [];
  const middleOfSecond = states.length > 1 && target.type === "button-group";
  const isArc = target.type === "gauge" || target.type === "dial";
  const atX = middleOfSecond
    ? target.x + target.width * 1.5 / states.length
    : target.x + target.width / 2;
  // On a ring, straight above the middle: twelve o'clock is a place on the
  // scale rather than a place on the glass, which is the whole difference
  // between a ring's mapping and a bar's.
  const atY = isArc ? target.y + target.height / 4 : target.y + target.height / 2;

  const meaning = await page.evaluate(
    (req) => window.__tapMeaningForTest(req),
    {
      type: target.type,
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      properties: props,
      fonts: project.fonts || [],
      atX,
      atY,
      // Whatever the last combination left on the glass is what a toggle
      // would work from; the group's answer does not depend on it.
      activeIndex: -1,
    },
  );

  const expected = meaning.writeValue !== undefined && meaning.writeValue !== null
    ? String(meaning.writeValue)
    : String(Math.round(meaning.value));
  // The meaning is worked out in the object's own coordinates; the tap is
  // made in the screen's.
  const point = await devicePointFor(deviceSerial, project, dx + atX, dy + atY);

  const waiting = nextMessageOn(mqttClient, writeTopic, 8000);
  await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "input", "tap", String(point.x), String(point.y)]));
  let got;
  try {
    got = await waiting;
  } catch (err) {
    throw new Error(
      `Screen ${si}: tapping ${target.type} "${target.id}" at (${Math.round(dx + atX)}, ${Math.round(dy + atY)}) ` +
      `published nothing. The designer says that point means "${expected}" on ${writeTopic}. ${err.message}`
    );
  }

  // A number is compared as a number: the designer rounds for display and the
  // app formats without a decimal point, and 50 is 50 either way. One unit of
  // slack, because the tap lands on a whole device pixel and the point asked
  // for is a fraction of one.
  const bothNumeric = !Number.isNaN(Number(got)) && !Number.isNaN(Number(expected));
  const agrees = bothNumeric ? Math.abs(Number(got) - Number(expected)) <= 1 : got === expected;
  if (!agrees) {
    throw new Error(
      `Screen ${si}: tapping ${target.type} "${target.id}" at (${Math.round(dx + atX)}, ${Math.round(dy + atY)}) ` +
      `published "${got}" on ${writeTopic}, but the designer makes that point mean "${expected}". ` +
      "The picture and the finger have drifted apart."
    );
  }
  console.log(`  touch: tapping ${target.type} "${target.id}" published "${got}" on ${writeTopic}, as the designer says it should`);
}

async function checkFollowTheFinger(deviceSerial) {
  const { width, height } = await screenSize(deviceSerial);
  const y = Math.round(height * SWIPE_Y_FRACTION);

  const before = await captureDeviceScreenshot(deviceSerial);

  // Let go just past the third that commits, so the glide has most of the
  // screen left to cover. See the note above on why this and not a swipe
  // carried all the way across.
  const pagingSwipe = startSwipe(deviceSerial, Math.round(width * 0.8), Math.round(width * 0.42), y, SWIPE_MS);
  // Sampled several times across the gesture and judged on the largest
  // displacement, rather than once at a chosen moment. `input swipe` takes a
  // variable few hundred milliseconds to start, so a single sample lands
  // inside the movement on one run and before it on the next - which read as
  // "the picture did not move" and stopped the whole suite (2026-09-21).
  const midFrames = await captureThroughout(deviceSerial, pagingSwipe);

  // Across the settling, looking for the screen that was swiped away coming
  // back to the middle.
  const settlingFrames = [];
  for (let i = 0; i < 5; i++) {
    settlingFrames.push(await captureDeviceScreenshot(deviceSerial));
  }
  await sleep(1200);
  const after = await captureDeviceScreenshot(deviceSerial);

  fs.writeFileSync(path.join(IMG_DIR, "swipe-after.png"), after);

  let moved = 0;
  let during = midFrames[midFrames.length - 1];
  for (const frame of midFrames) {
    const change = await frameChange(before, frame);
    if (change > moved) {
      moved = change;
      during = frame;
    }
  }
  fs.writeFileSync(path.join(IMG_DIR, "swipe-during.png"), during);
  if (moved < 0.05) {
    throw new Error(
      "The picture did not move while a swipe was being made. A horizontal swipe bound to another screen " +
      "is supposed to carry the outgoing screen out and the incoming one in under the finger " +
      `(only ${(moved * 100).toFixed(2)}% of the frame differed mid-gesture). See ${path.join(IMG_DIR, "swipe-during.png")}.`
    );
  }
  const paged = await frameChange(before, after);
  if (paged < 0.05) {
    throw new Error(
      `A swipe most of the way across left the same screen on the glass (${(paged * 100).toFixed(2)}% changed). ` +
      `See ${path.join(IMG_DIR, "swipe-after.png")}.`
    );
  }

  // Only once the swipe is known to have paged: a gesture that merely
  // sprang back ends on the screen it started from, which is indistinguishable
  // from the flash this looks for.
  for (let i = 0; i < settlingFrames.length; i++) {
    const back = await frameChange(before, settlingFrames[i]);
    if (back < 0.001) {
      fs.writeFileSync(path.join(IMG_DIR, "swipe-flashback.png"), settlingFrames[i]);
      throw new Error(
        "The screen that was swiped away came back to the middle while the swipe was settling. " +
        "The transition is being torn down before the screen it asked for has arrived, so for as long as " +
        "that takes - a recomposition and a background decode - the outgoing screen is centred again. " +
        `See ${path.join(IMG_DIR, "swipe-flashback.png")}.`
      );
    }
  }


  // A quarter of the way is past the 60-unit threshold that starts a follow
  // and short of the third that finishes one, so this one has to come back.
  const settled = await captureDeviceScreenshot(deviceSerial);
  const shortSwipe = startSwipe(deviceSerial, Math.round(width * 0.85), Math.round(width * 0.55), y, SWIPE_MS);
  // Sampled across the gesture and judged on the largest displacement, for
  // the same reason the paging swipe above is: where a single sample lands
  // depends on how long `input swipe` took to start.
  const shortFrames = await captureThroughout(deviceSerial, shortSwipe);
  await sleep(1200);
  const sprung = await captureDeviceScreenshot(deviceSerial);

  let shortMoved = 0;
  let midShort = shortFrames[shortFrames.length - 1];
  for (const frame of shortFrames) {
    const change = await frameChange(settled, frame);
    if (change > shortMoved) {
      shortMoved = change;
      midShort = frame;
    }
  }
  fs.writeFileSync(path.join(IMG_DIR, "swipe-short-during.png"), midShort);
  const shortStayed = await frameChange(settled, sprung);
  if (shortMoved < 0.02) {
    throw new Error(
      "A drag past the swipe threshold did not move the picture at all, so there was nothing to spring " +
      `back from (${(shortMoved * 100).toFixed(2)}% differed mid-gesture). See ${path.join(IMG_DIR, "swipe-short-during.png")}.`
    );
  }
  if (shortStayed > 0.001) {
    throw new Error(
      `A drag that stopped short of a third of the way did not come back to where it was ` +
      `(${(shortStayed * 100).toFixed(3)}% of the frame is still different). A follow that does not return ` +
      "leaves the screen sitting at an angle."
    );
  }

  // Back to the screen the fixture opens on, because everything below
  // compares screen 0 against screen 0's reference. Done with the opposite
  // swipe rather than by reinstalling, which makes the tidying up an
  // assertion of its own: the way back has to land exactly where it started.
  const backSwipe = startSwipe(deviceSerial, Math.round(width * 0.15), Math.round(width * 0.85), y, 600);
  await backSwipe;
  await sleep(1200);
  const home = await captureDeviceScreenshot(deviceSerial);
  const returned = await frameChange(before, home);
  if (returned > 0.001) {
    fs.writeFileSync(path.join(IMG_DIR, "swipe-returned.png"), home);
    throw new Error(
      `Swiping back did not land on the screen the fixture opens with ` +
      `(${(returned * 100).toFixed(3)}% of the frame is different). Every case below compares screen 0 ` +
      `against screen 0's reference, so the run would be measuring the wrong picture. ` +
      `See ${path.join(IMG_DIR, "swipe-returned.png")}.`
    );
  }

  console.log(
    `Paging follows the finger (${(moved * 100).toFixed(1)}% mid-gesture, ${(paged * 100).toFixed(1)}% after; ` +
    `a short drag moved ${(shortMoved * 100).toFixed(1)}% and sprang all the way back, and the way back ` +
    `landed exactly where it started).`
  );
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
    await restoreScreenTimeout();
    await restoreBrokerPort();
    await restoreBanners();
    throw err;
  }

  try {
    await checkFollowTheFinger(deviceSerial);
    // Back to a known screen by installing the fixture again, rather than by
    // trusting the gestures above to have left the phone where they found
    // it. Every case below compares screen 0 against screen 0's reference,
    // and a run that starts on the wrong screen reports the whole project as
    // wrong (2026-09-21: it sat on "Ring" and was measured against
    // "Readouts"). An install is three seconds and cannot be argued with.
    console.log("Back to the first screen...");
    await deployBundle(mqttClient, deviceId, fs.readFileSync(getProjectZipPath()), deviceSerial, "the fixture again");
    await sleep(1500);
  } catch (err) {
    await clearDeploy();
    await restoreScreenTimeout();
    await restoreBrokerPort();
    await restoreBanners();
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

  // Where the phone is. The fixture was just reinstalled, which puts it on
  // the first screen; from here on every move is made by this script and has
  // to be made deliberately, because a screen measured against another
  // screen's reference fails for a reason that is nowhere in the picture.
  let currentScreen = 0;

  for (let si = 0; si < project.screens.length; si++) {
    const screen = project.screens[si];

    if (si !== currentScreen) {
      console.log(`\nSwiping from screen ${currentScreen} to ${si}...`);
      await swipeToScreen(deviceSerial, currentScreen, si);
      currentScreen = si;
    }

    const combos = combinationCount(project, screen);
    console.log(`\nScreen ${si} "${screen.name}": ${combos} combination(s)`);

    let touchedThisScreen = false;
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
      const actualImg = await cropDeviceScreenshot(rawPng, project, deviceSerial);
      const actualPath = path.join(IMG_DIR, `actual-${caseId}.png`);
      await actualImg.write(actualPath);

      // 3. Render the same screen/overrides headlessly in the designer, at
      // the size the device actually shows them - see renderReference.
      const expectedImg = await renderReference(
        page, project, si, overrides, actualImg.bitmap.width, actualImg.bitmap.height,
      );
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

      // A tenth of the screen is far more than rasterisation noise and far
      // less than a whole different screen; past it, the first thing to rule
      // out is that the swipe went somewhere else.
      let landedOn = null;
      if (!pass && mismatchPct > 10) {
        const scores = await identifyScreen(page, project, overrides, actualImg);
        if (scores[0].screenIndex !== si) {
          landedOn = scores[0];
          console.log(
            `  [${caseId}] this is screen ${landedOn.screenIndex} "${landedOn.name}" ` +
            `(${landedOn.pct.toFixed(2)}% against it, ${mismatchPct.toFixed(2)}% against the one expected) - ` +
            "the swipe did not land where the run thinks it did."
          );
        }
      }

      results.push({
        landedOn,
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

      // Once per screen, after its pictures are taken: a real tap, and what
      // the phone publishes for it. Last rather than first, because a tap
      // leaves a ring behind - what was asked and not yet confirmed - and
      // that belongs in no comparison above. The next screen's own values
      // clear it.
      if (!touchedThisScreen) {
        touchedThisScreen = true;
        await checkTouch(deviceSerial, mqttClient, page, project, screen, si);
      }
    }
  }

  await browser.close();

  // Back to the first screen, by swiping the other way. Not housekeeping for
  // its own sake: the run is the only thing that moved the phone, so putting
  // it back is also the check that the way back works - and it leaves the
  // glass showing what someone walking past would expect.
  try {
    await swipeToScreen(deviceSerial, currentScreen, 0);
  } catch (err) {
    console.log(`Could not swipe back to the first screen: ${err.message}`);
  }

  // The deploy is retained, so leaving it there would have the phone
  // reinstall this fixture every time it reconnects, for ever.
  await clearDeploy();
  await restoreScreenTimeout();
  await restoreBrokerPort();
  await restoreBanners();
  mqttClient.end();

  fs.writeFileSync(path.join(OUT_DIR, "results.json"), JSON.stringify(results, null, 2));
  const testedResults = results.filter((r) => !r.skipped);
  const skipped = results.length - testedResults.length;
  console.log(
    `\n${testedResults.filter((r) => r.pass).length}/${testedResults.length} cases passed` +
    (skipped > 0 ? ` (${skipped} screen(s) skipped).` : ` across ${project.screens.length} screen(s).`)
  );
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
