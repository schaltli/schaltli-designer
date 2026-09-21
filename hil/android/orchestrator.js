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

// Put back however a run ends; see keepScreenOn and reverseBrokerPort.
let restoreScreenTimeout = async () => {};
let restoreBrokerPort = async () => {};

const SWIPE_Y_FRACTION = 0.5;
const SWIPE_MS = 2500;

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

async function checkFollowTheFinger(deviceSerial) {
  const { stdout: sizeOut } = await execFileAsync(ADB, adbArgs(deviceSerial, ["shell", "wm", "size"]));
  const size = /(\d+)x(\d+)/.exec(sizeOut.split("\n").filter(Boolean).pop() || "");
  if (!size) throw new Error(`Could not read the screen size from \`wm size\`: ${sizeOut}`);
  const width = Number(size[1]);
  const height = Number(size[2]);
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
      const actualImg = await cropDeviceScreenshot(rawPng, project, deviceSerial);
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
  await restoreScreenTimeout();
  await restoreBrokerPort();
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
