// Conformance: a device publishes a declaration of itself - which object
// types it supports, where its endpoints are, how big its screen is, which
// fonts it carries - and this holds it to that declaration.
//
// Contact the board, fetch its DDF, build a project with one screen per
// object type it claims to support, export it through the real designer,
// install it, and compare every screen against the designer's own renderer.
// Green means the board does what its DDF promises. Red means either that it
// cannot draw something it claims, or that it draws it differently from the
// reference.
//
// Called a driver until 2026-09-11, which was a poor name in a project whose
// firmware is full of real ones - the panel, the touch controller and the I2C
// expander all have drivers, and RgbPanel.h talks about what "the driver"
// does with framebuffers a few files away.
//
// Why this exists (2026-09-10): the per-device orchestrators each compare a
// hand-built fixture, so a type is covered on a board only if someone
// remembered to put it in that board's fixture - and the 4.3B had no fixture
// at all, comparing whatever project happened to be installed. Coverage was
// therefore an accident of authoring rather than a property of the device.
// Here it follows from supportedObjectTypes, which is the device's own claim
// about itself, so a board that declares a control it cannot draw fails on
// the screen named after it.
//
// What this proves, and what it does not: a green run says the device draws
// what the designer draws. It does not say either is right. A control the
// designer draws wrongly and the firmware copies faithfully passes here. For
// bringing a new board up against an established reference that is the
// correct question; for the reference itself it is not one.
//
// The project goes through the designer's real export (a browser: the bake
// is a canvas operation and there is no headless path), because a
// hand-assembled zip cannot produce a SoftwareButton's baked bitmap or a
// panel child's icon - both have shipped blank exactly that way before.
//
// Needs, all at once:
//   - `npm run dev`, for the export and the reference render
//   - `npm run hil:broker`, and the device pointed at that same broker
//   - the device reachable, serving its DDF at /ddf.zip
//
// Run: node hil/conformance/run.js --device <ip> [--ddf <dir|zip>]
//                                       [--only <type,type>] [--keep]

const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");
const { chromium } = require("playwright");
const { Jimp } = require("jimp");
const { buildReport, comparePixels } = require("../report-template");
const {
  combinationCount,
  combinationOverrides,
  screenTopics,
} = require("../combinations");
const { loadDdf } = require("./ddf");
const {
  buildProject,
  screensPerInstall,
  chunkProject,
} = require("./build-project");

const DESIGNER_URL =
  process.env.HIL_DESIGNER_URL || "http://localhost:3000/test-render";
const BROKER_URL = process.env.HIL_BROKER_URL || "mqtt://localhost:1883";
const OUT_DIR = path.join(__dirname, "report");
const IMG_DIR = path.join(OUT_DIR, "images");

function parseArgs(argv) {
  const args = {
    device: process.env.HIL_DRIVER_DEVICE || null,
    ddf: null,
    only: null,
    keep: false,
    batch: null,
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--device") args.device = argv[++i];
    else if (argv[i] === "--ddf") args.ddf = argv[++i];
    else if (argv[i] === "--only")
      args.only = argv[++i].split(",").map((s) => s.trim());
    else if (argv[i] === "--keep") args.keep = true;
    else if (argv[i] === "--batch") args.batch = Number(argv[++i]);
  }
  if (!args.device) throw new Error("--device <ip> is required");
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The device reboots into the freshly installed project rather than
// rebuilding its render state mid-request, so the upload never gets a reply.
// A dropped connection is the success path, and coming back is the proof.
//
// But "dropped" and "never connected" are not the same thing, and treating
// them alike is a trap this suite has fallen into before. The e-paper only
// registers /api/project while it is in setup mode, so an upload attempted
// during normal operation cannot connect at all - and a run that shrugs that
// off goes on to compare against whatever was already installed, reporting a
// large, confusing pixel difference instead of "the upload never happened"
// (hil/README.md records the same finding against the epaper orchestrator on
// 2026-07-30).
//
// curl's exit codes separate them: 7 is "failed to connect" and 6 is a name
// that does not resolve - in both cases nothing was sent, so the run stops
// and says so.
//
// A timeout is deliberately NOT in that list, though it was at first. On the
// e-paper an upload that fully succeeds still ends this way: the board
// installs the project and restarts before replying, and the restart outlasts
// any sane client timeout - 60s measured, with the project verifiably
// installed afterwards. Treating a timeout as failure there would reject the
// normal case on one of the three devices this has to work on.
const CONNECT_FAILED = new Map([
  [6, "could not resolve the host"],
  [
    7,
    "could not connect - on this device the upload endpoint may only exist in setup mode",
  ],
]);

async function uploadProject(
  zipBuffer,
  testInterface,
  deviceHost,
  screenCount,
  expectedScreenIds,
) {
  const tmp = path.join(OUT_DIR, "uploaded.zip");
  fs.writeFileSync(tmp, zipBuffer);
  const { execFileSync } = require("child_process");
  try {
    execFileSync("curl", [
      "-s",
      "--show-error",
      "-m",
      "25",
      "-F",
      `file=@${tmp}`,
      testInterface.uploadUrl,
      "-o",
      "/dev/null",
    ]);
  } catch (err) {
    const reason = CONNECT_FAILED.get(err.status);
    if (reason) {
      throw new Error(
        `the upload never reached ${testInterface.uploadUrl}: ${reason} (curl exit ${err.status}).\n` +
          "Nothing was installed, so continuing would compare against whatever is already on the device.",
      );
    }
    // Anything else is the device rebooting mid-request, which is how a
    // successful upload ends on every board here.
  }

  // Readiness is the screen switch, retried - not a probe of some other
  // endpoint. Two earlier attempts got this wrong in instructive ways: a
  // HEAD on the snapshot URL never succeeds, because this firmware routes
  // GET only and answers HEAD with a 404; and a GET of it is not a readiness
  // signal either, because the snapshot needs a rendered framebuffer and so
  // arrives well after the HTTP server does.
  //
  // Retrying the very call the run makes next avoids inventing a third
  // answer. It is declared in the DDF, it is cheap, and when it finally
  // succeeds the device is ready by definition rather than by proxy.
  // Switching to the LAST screen, not the first, and that is the check that
  // the project actually changed.
  //
  // How long that can take, measured rather than guessed (4.3B, 2026-09-14):
  // three installs in a row, with a probe every ten seconds running alongside
  // and nothing else touching the board. Twenty of two hundred probes failed,
  // and every one of them fell inside the installs or the minute after the
  // last one finished - the device went on being silent for over a minute
  // after the upload's own HTTP response had come back. What it is doing in
  // that minute is rebooting: the install path restarts on purpose, so the
  // new project.json is picked up fresh rather than rebuilt live, and the
  // device answers nothing until it is back. Confirmed by uptime the next
  // day - polled through a whole run it read 10s, 97s, 112s, then 5s again,
  // a reboot every couple of minutes against thirteen installs.
  //
  // Every failure was a timeout, never a refused connection. That is the
  // distinction worth keeping: refused means nothing is listening and the
  // firmware is the suspect, timed out means the device never got to the
  // packet. Signal strength held between -63 and -73 dBm throughout with no
  // decay before an outage, which is what ruled out the radio - the first
  // thing suspected, and wrongly.
  //
  // So a run that fails here has usually not found a bug. It has found a
  // board still writing flash, and the deadline below is what decides whether
  // that counts as broken.

  // Index 0 exists in every project ever installed, so a device still running
  // the previous one answers it happily and the run goes on to compare
  // against the wrong thing - producing a huge, baffling pixel difference
  // instead of "the upload did not land". The epaper orchestrator lost a run
  // to exactly that on 2026-07-30. The last index of what was just installed
  // is the cheapest thing that a stale project usually cannot satisfy, and it
  // needs no endpoint beyond the one the DDF already declares.
  //
  // "Usually" stopped being enough on 2026-09-14: a one-screen install on the
  // 4.3B did not land, the switch to index 0 succeeded against the previous
  // one-screen project, and the box specimen was reported as 54864 differing
  // pixels - a picture of the line specimen from the install before. So where
  // the board lists its screens (the shared test interface's
  // /api/device-settings), the ids have to be the ones just uploaded before
  // the device counts as back. A board without that endpoint keeps the
  // index check alone.
  const origin = new URL(testInterface.snapshotUrl).origin;
  const started = Date.now();
  const deadline = started + 180000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await switchScreen(screenCount - 1, testInterface, 5000);
      if (expectedScreenIds) {
        const res = await fetch(`${origin}/api/device-settings`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
        if (res && res.ok) {
          const listed = ((await res.json()).screens || []).map((s) => s.id);
          if (listed.join("\n") !== expectedScreenIds.join("\n")) {
            throw new Error(`still running screens [${listed.join(", ")}], not the uploaded [${expectedScreenIds.join(", ")}]`);
          }
        }
      }
      console.log(
        `  device is back after ${((Date.now() - started) / 1000).toFixed(0)}s` +
          (screenCount > 1
            ? ` (screen ${screenCount - 1} exists, so the install landed)`
            : ""),
      );
      return;
    } catch (err) {
      lastError = err;
    }
    await sleep(2000);
  }
  throw new Error(
    `the device never accepted a switch to screen ${screenCount - 1} within 180s of the upload.\n` +
      "Either it did not come back, or it is still running a project with fewer screens - " +
      `which would mean the upload never landed. Last error: ${lastError?.message}`,
  );
}

// Polls until the device's own loader reports every published value back.
// Sleeping instead races the device and then blames the renderer for it.
// Presses one point and waits for what the device should say about it.
//
// The two types this exists for - Switch and SoftwareButton - draw the same
// picture whether or not anything was pressed, so photographing them proves
// only that they can be drawn. What a press proves is the part no picture
// contains: that the device found the object under the finger, worked out
// which segment, and sent that segment's value.
//
// Checked by what the device publishes rather than by what it draws next: a
// press sends a command, and the state comes back later on the read topic
// from whatever the command controls. At the moment of the press there is
// nothing new on the glass to compare.
//
// Returns null on success, or a sentence saying what went wrong.
async function tapAndExpect(tap, testInterface, mqttClient, timeoutMs = 15000) {
  const origin = new URL(testInterface.snapshotUrl).origin;
  const url = `${origin}/api/touch`;

  // Waits for the *expected* value rather than for the next message on the
  // topic, and keeps what else turned up.
  //
  // The press below happens twice (see there), so the second one publishes a
  // second copy a moment later - and the next tap in the list, on the same
  // topic, would otherwise take that straggler for its own answer and report
  // the previous segment's value. Matching on the value makes a late copy
  // harmless and a genuinely wrong value a timeout that says what it saw.
  const seen = [];
  const heard = new Promise((resolve) => {
    const onMessage = (topic, payload) => {
      if (topic !== tap.topic) return;
      const value = payload.toString();
      seen.push(value);
      if (value !== tap.value) return;
      mqttClient.removeListener("message", onMessage);
      resolve(value);
    };
    mqttClient.on("message", onMessage);
    setTimeout(() => {
      mqttClient.removeListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
  });

  await new Promise((resolve, reject) => {
    mqttClient.subscribe(tap.topic, { qos: 1 }, (err) =>
      err ? reject(err) : resolve(),
    );
  });

  // Down then up, because the firmware acts on release - a hold that becomes
  // something else must not also have fired what it was resting on.
  const press = async () => {
    for (const down of [1, 0]) {
      const res = await fetch(`${url}?x=${tap.x}&y=${tap.y}&down=${down}`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 404) {
        return "this device has no /api/touch endpoint, so a press cannot be simulated";
      }
      if (!res.ok) return `POST ${url} answered ${res.status}`;
    }
    return null;
  };

  // Twice, deliberately, and not because presses get lost.
  //
  // A device that blanks its screen after inactivity treats the first touch
  // on a dark panel as waking it and nothing else - "a finger that arrived on
  // a dark panel is not pressing anything at all", as the 4.3B's own firmware
  // puts it. A conformance run has pauses long enough to reach that state, so
  // a single press proves nothing about a device with the feature and
  // everything about one without it.
  //
  // Pressing the same point twice is safe for both specimens here: the button
  // sends the same command again, and the Switch's segmented mode asks for
  // the same segment again. Both are commands, not toggles.
  const failed = await press();
  if (failed) return failed;
  await sleep(400);
  const again = await press();
  if (again) return again;

  const got = await heard;
  if (got === null) {
    const others = seen.length ? ` (saw ${seen.map((v) => `"${v}"`).join(", ")})` : "";
    return (
      `"${tap.value}" never arrived on ${tap.topic} within ${timeoutMs / 1000}s${others}` +
      (seen.length ? "" : " - if this device blanks its screen, the press may only have woken it")
    );
  }
  return null;
}

// A finger dragged across something settable, and what the device made of
// it. The counterpart of tapAndExpect above, for a level indicator with a
// write topic (designer docs/2026-09-17-settable-level.md): the press sets
// the value under the finger, the drag follows it, and the release publishes
// what it settled on - so the last word on the write topic is the value the
// finger let go on, and that is what is checked.
//
// Injected one position at a time, which is what a drag is over this
// interface: /api/touch takes a position per call and only the lift says
// down=0.
//
// Returns null on success, or a sentence saying what went wrong.
async function dragAndExpect(drag, testInterface, mqttClient, timeoutMs = 15000) {
  const origin = new URL(testInterface.snapshotUrl).origin;
  const url = `${origin}/api/touch`;

  const seen = [];
  const heard = new Promise((resolve) => {
    const onMessage = (topic, payload) => {
      if (topic !== drag.topic) return;
      const value = payload.toString();
      seen.push(value);
      if (value !== drag.value) return;
      mqttClient.removeListener("message", onMessage);
      resolve(value);
    };
    mqttClient.on("message", onMessage);
    setTimeout(() => {
      mqttClient.removeListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
  });

  await new Promise((resolve, reject) => {
    mqttClient.subscribe(drag.topic, { qos: 1 }, (err) => (err ? reject(err) : resolve()));
  });

  // Five positions plus the lift, with a gap between them: enough for the
  // coalescer to let more than one through, and few enough that a slow panel
  // is not asked to redraw thirty times.
  const steps = 5;
  const send = async (x, y, down) => {
    const res = await fetch(`${url}?x=${Math.round(x)}&y=${Math.round(y)}&down=${down}`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) return "this device has no /api/touch endpoint, so a drag cannot be simulated";
    if (!res.ok) return `POST ${url} answered ${res.status}`;
    return null;
  };

  // A dark panel takes the first contact as a wake-up and nothing else, so it
  // gets one before the drag that matters - and deliberately NOT on the
  // object being dragged. A settable level acts on a tap, so waking it there
  // set a value of its own: the PaperS3 reported the wake-up's 20 rather than
  // the drag's 80, and the two boards that follow a finger only passed
  // because the drag overwrote it (2026-09-17).
  const wakeAt = drag.wakeAt || { x: 2, y: 2 };
  const wake = await send(wakeAt.x, wakeAt.y, 1);
  if (wake) return wake;
  await sleep(120);
  const wakeLift = await send(wakeAt.x, wakeAt.y, 0);
  if (wakeLift) return wakeLift;
  await sleep(400);

  for (let i = 0; i <= steps; i++) {
    const x = drag.from.x + ((drag.to.x - drag.from.x) * i) / steps;
    const y = drag.from.y + ((drag.to.y - drag.from.y) * i) / steps;
    const failed = await send(x, y, 1);
    if (failed) return failed;
    await sleep(150);
  }
  const lift = await send(drag.to.x, drag.to.y, 0);
  if (lift) return lift;

  const got = await heard;
  if (got === null) {
    const others = seen.length ? ` (saw ${seen.map((v) => `"${v}"`).join(", ")})` : "";
    return `"${drag.value}" never arrived on ${drag.topic} within ${timeoutMs / 1000}s${others}`;
  }
  return null;
}

async function waitForTopicValuesApplied(
  overrides,
  testInterface,
  // 30s rather than the 15 this started with. The endpoint returns a few
  // bytes, so the timeout is not about its size - it is about a radio that
  // drops packets: the same run that measured a snapshot at 11 KB/s lost
  // this poll too, and reported it as "the device did not apply the value",
  // which points at the firmware and is wrong.
  { intervalMs = 150, timeoutMs = 30000 } = {},
) {
  const topics = Object.keys(overrides);
  if (topics.length === 0) return;

  // Built from the snapshot URL's own origin, not from the bare host.
  //
  // That is where a device's other test endpoints live, and assuming port 80
  // is wrong on at least one of them: the e-paper serves its snapshot and
  // screen switch on 8080 and answers 404 on 80. This function treats a 404
  // as "this device has no such endpoint" and falls back to a sleep, so the
  // wrong port did not fail loudly - it quietly stopped verifying that
  // published values had arrived at all, on the one device where they were
  // not arriving (2026-09-12).
  const origin = new URL(testInterface.snapshotUrl).origin;
  const url = `${origin}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`;
  const deadline = Date.now() + timeoutMs;
  let sawEndpoint = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        sawEndpoint = true;
        const values = await res.json();
        if (topics.every((t) => String(values[t]) === String(overrides[t])))
          return;
      } else if (res.status === 404) {
        // Optional endpoint. Without it there is nothing to poll, so fall
        // back to waiting - stated rather than silent, because it is the
        // difference between a synchronised run and a hopeful one.
        await sleep(1200);
        return;
      }
    } catch {
      // transient - the device is busy with the message that just landed
    }
    await sleep(intervalMs);
  }
  if (!sawEndpoint) {
    await sleep(1200);
    return;
  }
  throw new Error(
    `device did not apply published values within ${timeoutMs}ms: ${JSON.stringify(overrides)}`,
  );
}

// A snapshot is the largest thing this run moves - a full framebuffer, over
// a megabyte on an 800x480 panel - so it is where a weak link shows up first
// and where it is least obvious what happened.
//
// The timeout is deliberately far longer than a healthy fetch needs. On this
// board a good link delivers that megabyte in a couple of seconds; at
// -81dBm it took 68, which a 45s timeout turned into three identical
// "operation was aborted" lines and no hint that the radio was the problem.
// Reporting the throughput whenever a fetch is slow is the other half: the
// number says "the link degraded" in a way a timeout never does, and this
// run spent an hour being read as a firmware hang for want of it.
const SNAPSHOT_TIMEOUT_MS = 180000;
const SNAPSHOT_SLOW_MS = 10000;

async function fetchSnapshot(testInterface, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    const started = Date.now();
    try {
      const res = await fetch(testInterface.snapshotUrl, {
        signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000)
        throw new Error(`snapshot truncated: ${buf.length} bytes`);
      const elapsed = Date.now() - started;
      if (elapsed > SNAPSHOT_SLOW_MS) {
        console.log(
          `    (snapshot took ${(elapsed / 1000).toFixed(0)}s for ${(buf.length / 1024).toFixed(0)}KB` +
            ` = ${(((buf.length / elapsed) * 1000) / 1024).toFixed(0)} KB/s - check the link, not the renderer)`,
        );
      }
      return buf;
    } catch (err) {
      lastError = err;
      console.log(
        `    (snapshot attempt ${i + 1} failed after ${((Date.now() - started) / 1000).toFixed(0)}s: ${err.message}, retrying)`,
      );
      await sleep(500);
    }
  }
  throw new Error(
    `snapshot failed after ${attempts} attempts: ${lastError.message}`,
  );
}

async function switchScreen(index, testInterface, timeoutMs = 20000) {
  const res = await fetch(testInterface.screenSwitchUrl, {
    method: testInterface.screenSwitchMethod || "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `index=${index}`,
    // Bounded, because this doubles as the post-install readiness probe and
    // a booting device accepts the connection long before it answers.
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(
      `screen switch to ${index} failed: HTTP ${res.status} ${JSON.stringify(json)}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(IMG_DIR, { recursive: true });

  console.log(`device: ${args.device}`);
  const ddf = await loadDdf(args.device, args.ddf);
  console.log(`DDF:    ${ddf.origin}`);
  console.log(
    `        ${ddf.deviceName} (${ddf.deviceId}), ${ddf.screen.width}x${ddf.screen.height} ${ddf.screen.colorDepth}`,
  );
  console.log(
    `        declares ${ddf.supportedObjectTypes.length} object type(s), ${ddf.fonts.length} font(s)`,
  );

  let effectiveDdf = ddf;
  if (args.only) {
    const unknown = args.only.filter(
      (t) => !ddf.supportedObjectTypes.includes(t),
    );
    if (unknown.length > 0)
      throw new Error(
        `--only names type(s) this device does not declare: ${unknown.join(", ")}`,
      );
    effectiveDdf = { ...ddf, supportedObjectTypes: args.only };
  }

  const { project, skipped, taps, drags } = buildProject(effectiveDdf);
  console.log(
    `project: ${project.screens.length} screen(s), one per type: ${project.screens.map((s) => s.name).join(", ")}`,
  );
  if (skipped.length > 0) {
    console.log(
      `\n!! ${skipped.length} declared type(s) have no specimen and are NOT covered: ${skipped.join(", ")}`,
    );
    console.log("   Add one to hil/conformance/specimens.js.\n");
  }

  console.log(`connecting to ${BROKER_URL} ...`);
  const mqttClient = mqtt.connect(BROKER_URL);
  await new Promise((resolve, reject) => {
    mqttClient.on("connect", resolve);
    mqttClient.on("error", reject);
    setTimeout(() => reject(new Error("MQTT connect timeout")), 10000);
  });

  console.log("launching headless designer...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (err) =>
    console.log("[designer page error]", err.message),
  );
  // domcontentloaded, not networkidle: under `next dev` the HMR websocket
  // never goes quiet. The harness's own ready flag is the real signal.
  await page.goto(DESIGNER_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__testRenderReady === true,
    undefined,
    { timeout: 90000 },
  );

  const quantize = ddf.testInterface.snapshotQuantize || undefined;
  console.log(
    `comparison: ${quantize ? `reference quantized to ${quantize}` : "no quantization declared"}`,
  );

  const perInstall = screensPerInstall(ddf.screen, args.batch);
  const chunks = chunkProject(project, screenTopics, perInstall);
  console.log(
    `installs:   ${chunks.length} (${perInstall} screen(s) each, ` +
      `${((ddf.screen.width * ddf.screen.height * 3) / 1024 / 1024).toFixed(2)}MB of background per screen)`,
  );

  const results = [];
  for (let bi = 0; bi < chunks.length; bi++) {
    // The fonts the DEVICE has, put back for the export and the reference
    // render. They are stripped from the uploaded project on purpose - the
    // device already has the bytes, and a zip carrying them would ship a
    // second copy of the same file.
    const chunk = { ...chunks[bi], fonts: ddf.fonts };
    console.log(
      `\n=== install ${bi + 1}/${chunks.length}: ${chunk.screens.map((s) => s.name).join(", ")}`,
    );
    const base64 = await page.evaluate(
      (p) => window.__buildDeviceZipForTest(p),
      chunk,
    );
    const zipBuffer = Buffer.from(base64, "base64");
    console.log(`  ${(zipBuffer.length / 1024).toFixed(0)}KB, installing ...`);
    await uploadProject(
      zipBuffer,
      ddf.testInterface,
      args.device,
      chunk.screens.length,
      chunk.screens.map((s) => s.id),
    );

    // One photographed case: the values published (or, for the case before
    // any value, not), confirmed by the device's own report, then its
    // snapshot against the designer's render of the same values.
    const runCase = async (si, screen, ci, caseId, overrides, publish) => {
      // One case that throws must not take the rest of the run with it.
      // A published value that never arrives, or a snapshot that gives up,
      // says something about that case and nothing about the eight types
      // still queued behind it - and on a flaky radio it is the likeliest
      // way a run ends. Before this, one such timeout on the knob's
      // arc-level ended the run with eight types never photographed
      // (2026-09-10).
      try {
        if (publish) {
          for (const [topic, value] of Object.entries(overrides)) {
            await new Promise((resolve, reject) => {
              mqttClient.publish(topic, value, { qos: 1 }, (err) =>
                err ? reject(err) : resolve(),
              );
            });
          }
        }
        await waitForTopicValuesApplied(overrides, ddf.testInterface);

        // Every combination forces a render here, unlike the 4.3B's own
        // orchestrator which deliberately leaves later ones to the partial
        // redraw path. This run is asking whether the device can draw each
        // control at all; partial redraw is a different question and the board
        // that has it already has a test for it.
        await switchScreen(si, ddf.testInterface);
        await sleep(ddf.testInterface.postRenderSettleMs || 0);

        const deviceBuf = await fetchSnapshot(ddf.testInterface);
        const devicePath = path.join(IMG_DIR, `device-${caseId}.bmp`);
        fs.writeFileSync(devicePath, deviceBuf);

        const dataUrl = await page.evaluate(
          (req) => window.__renderScreenForTest(req),
          {
            quantize,
            project: chunk,
            screenIndex: si,
            topicOverrides: overrides,
          },
        );
        const expectedBuf = Buffer.from(
          dataUrl.replace(/^data:image\/png;base64,/, ""),
          "base64",
        );
        const expectedPath = path.join(IMG_DIR, `expected-${caseId}.png`);
        fs.writeFileSync(expectedPath, expectedBuf);

        const [deviceImg, expectedImg] = await Promise.all([
          Jimp.read(devicePath),
          Jimp.read(expectedPath),
        ]);
        const {
          dimensionMismatch,
          diffPixels,
          totalPixels,
          quantisationPixels,
          realPixels,
        } = comparePixels(deviceImg, expectedImg);
        const pass = !dimensionMismatch && diffPixels === 0;

        let diffFile;
        if (!pass && !dimensionMismatch) {
          // The mask is the only view that answers "where", which is the
          // question a failing case actually raises. Magenta on near-black:
          // nothing a rendered screen contains looks like it, so a single
          // differing pixel is still findable.
          const mask = deviceImg.clone();
          for (let y = 0; y < mask.bitmap.height; y++) {
            for (let x = 0; x < mask.bitmap.width; x++) {
              const i = mask.bitmap.width * y * 4 + x * 4;
              const j = expectedImg.bitmap.width * y * 4 + x * 4;
              const same =
                deviceImg.bitmap.data[i] === expectedImg.bitmap.data[j] &&
                deviceImg.bitmap.data[i + 1] ===
                  expectedImg.bitmap.data[j + 1] &&
                deviceImg.bitmap.data[i + 2] ===
                  expectedImg.bitmap.data[j + 2];
              mask.bitmap.data[i] = same ? 12 : 255;
              mask.bitmap.data[i + 1] = same ? 14 : 0;
              mask.bitmap.data[i + 2] = same ? 16 : 255;
              mask.bitmap.data[i + 3] = 255;
            }
          }
          await mask.write(path.join(IMG_DIR, `diff-${caseId}.png`));
          diffFile = `images/diff-${caseId}.png`;
        }

        console.log(
          `  ${pass ? "PASS" : "FAIL"}` +
            (dimensionMismatch
              ? " (dimension mismatch)"
              : ` (${diffPixels}/${totalPixels} differing: ${realPixels} real, ${quantisationPixels} one 565 step)`) +
            `  ${JSON.stringify(overrides)}`,
        );

        results.push({
          screenIndex: results.length,
          screenName: screen.name,
          comboIndex: ci,
          overrides,
          pass,
          diffPixels,
          totalPixels,
          quantisationPixels,
          realPixels,
          dimensionMismatch,
          actualFile: `images/device-${caseId}.bmp`,
          expectedFile: `images/expected-${caseId}.png`,
          diffFile,
          actualDims: `${deviceImg.bitmap.width}x${deviceImg.bitmap.height}`,
          expectedDims: `${expectedImg.bitmap.width}x${expectedImg.bitmap.height}`,
        });
      } catch (err) {
        // Recorded as a failed case, with the reason where the pixel count
        // would be, so the report says what happened rather than leaving a
        // gap someone has to notice.
        console.log(`  ERROR ${err.message}`);
        results.push({
          screenIndex: results.length,
          screenName: screen.name,
          comboIndex: ci,
          overrides,
          pass: false,
          error: err.message,
          diffPixels: -1,
          totalPixels: 0,
          quantisationPixels: 0,
          realPixels: 0,
          dimensionMismatch: false,
          // The report reads these off every row, so an errored case has to
          // carry them too - it renders no images, but it still has to be
          // a row rather than a crash at the end of an otherwise good run.
          actualFile: "",
          expectedFile: "",
          actualDims: "0x0",
          expectedDims: "0x0",
        });
      }
    };

    // Before any value, every screen of the install first - nothing has been
    // published to this install yet, so each topic holds what the device
    // started with. That has to be nothing: a device shows no value until a
    // real one arrives, the designer's live preview the same
    // (docs/2026-09-15-live-data.md, decision 6). Waiting for the device to
    // report "" is what checks the loader starts empty - it would still
    // report a topic's first example if it seeded from there, which every
    // board did until 2026-09-15 - and the photograph checks that each type
    // draws "no value" the way the designer does.
    for (let si = 0; si < chunk.screens.length; si++) {
      const screen = chunk.screens[si];
      const topics = screenTopics(chunk, screen);
      if (topics.length === 0) continue;
      console.log(`\n[${screen.name}] before any value`);
      await runCase(
        si,
        screen,
        "empty",
        `${screen.name}-empty`.replace(/[^a-zA-Z0-9-]/g, "-"),
        Object.fromEntries(topics.map((t) => [t, ""])),
        false,
      );
    }

    for (let si = 0; si < chunk.screens.length; si++) {
      const screen = chunk.screens[si];
      const combos = combinationCount(chunk, screen);
      let lastOverrides = {};
      console.log(`\n[${screen.name}] ${combos} combination(s)`);

      for (let ci = 0; ci < combos; ci++) {
        const overrides = combinationOverrides(project, screen, ci);
        const caseId = `${screen.name}-${ci}`.replace(/[^a-zA-Z0-9-]/g, "-");
        await runCase(si, screen, ci, caseId, overrides, true);
        // Kept for the after-drag reference below: the values the device is
        // still showing when the drag happens.
        lastOverrides = overrides;
      }

      // Dragging, for the one type a finger sets rather than presses.
      const screenDrags = drags[screen.name] || []
      for (const drag of screenDrags) {
        const problem = await dragAndExpect(drag, ddf.testInterface, mqttClient)
        console.log(
          `  ${problem ? "FAIL" : "PASS"} drag ${drag.what} -> ${drag.topic} = ${drag.value}` +
            (problem ? `  (${problem})` : ""),
        )
        results.push({
          screenIndex: results.length,
          screenName: `${screen.name} (drag ${drag.what})`,
          comboIndex: 0,
          overrides: {},
          pass: !problem,
          error: problem || undefined,
          diffPixels: problem ? -1 : 0,
          totalPixels: 0,
          quantisationPixels: 0,
          realPixels: 0,
          dimensionMismatch: false,
          actualFile: "",
          expectedFile: "",
          actualDims: "0x0",
          expectedDims: "0x0",
        })

        // What the drag left on the glass: the marker where the finger asked
        // for, the fill where the installation last reported. The reference
        // is the designer rendering that same pair, so a device that moved
        // the fill instead - which is what this firmware did until
        // 2026-09-17 - differs by every pixel of both.
        if (!problem && drag.marker) {
          const overrides = { ...lastOverrides, [drag.marker.topic]: drag.marker.value }
          const caseId = `${screen.name}-after-drag`.replace(/[^a-zA-Z0-9-]/g, "-")
          try {
            const deviceBuf = await fetchSnapshot(ddf.testInterface)
            const devicePath = path.join(IMG_DIR, `device-${caseId}.bmp`)
            fs.writeFileSync(devicePath, deviceBuf)
            const dataUrl = await page.evaluate((req) => window.__renderScreenForTest(req), {
              quantize,
              project: chunk,
              screenIndex: si,
              topicOverrides: overrides,
            })
            const expectedPath = path.join(IMG_DIR, `expected-${caseId}.png`)
            fs.writeFileSync(expectedPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"))
            const [deviceImg, expectedImg] = await Promise.all([Jimp.read(devicePath), Jimp.read(expectedPath)])
            const { dimensionMismatch, diffPixels, totalPixels, quantisationPixels, realPixels } = comparePixels(
              deviceImg,
              expectedImg,
            )
            const pass = !dimensionMismatch && diffPixels === 0
            console.log(
              `  ${pass ? "PASS" : "FAIL"} the drag moved the marker, not the fill` +
                ` (${diffPixels}/${totalPixels} differing: ${realPixels} real, ${quantisationPixels} one 565 step)`,
            )
            results.push({
              screenIndex: results.length,
              screenName: `${screen.name} (after drag)`,
              comboIndex: "after-drag",
              overrides,
              pass,
              diffPixels,
              totalPixels,
              quantisationPixels,
              realPixels,
              dimensionMismatch,
              actualFile: `images/device-${caseId}.bmp`,
              expectedFile: `images/expected-${caseId}.png`,
              actualDims: `${deviceImg.bitmap.width}x${deviceImg.bitmap.height}`,
              expectedDims: `${expectedImg.bitmap.width}x${expectedImg.bitmap.height}`,
            })
          } catch (err) {
            console.log(`  ERROR after the drag: ${err.message}`)
            results.push({
              screenIndex: results.length,
              screenName: `${screen.name} (after drag)`,
              comboIndex: "after-drag",
              overrides,
              pass: false,
              error: err.message,
              diffPixels: -1,
              totalPixels: 0,
              quantisationPixels: 0,
              realPixels: 0,
              dimensionMismatch: false,
              actualFile: "",
              expectedFile: "",
              actualDims: "0x0",
              expectedDims: "0x0",
            })
          }
        }
      }

      // Pressing, for the types a photograph cannot speak for.
      const screenTaps = taps[screen.name] || [];
      for (const tap of screenTaps) {
        const problem = await tapAndExpect(tap, ddf.testInterface, mqttClient);
        console.log(
          `  ${problem ? "FAIL" : "PASS"} tap ${tap.what} -> ${tap.topic} = ${tap.value}` +
            (problem ? `  (${problem})` : ""),
        );
        results.push({
          screenIndex: results.length,
          screenName: `${screen.name} (tap ${tap.what})`,
          comboIndex: 0,
          overrides: {},
          pass: !problem,
          error: problem || undefined,
          diffPixels: problem ? -1 : 0,
          totalPixels: 0,
          quantisationPixels: 0,
          realPixels: 0,
          dimensionMismatch: false,
          actualFile: "",
          expectedFile: "",
          actualDims: "0x0",
          expectedDims: "0x0",
        });
      }
    }
  }

  await browser.close();
  mqttClient.end();

  fs.writeFileSync(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify(results, null, 2),
  );
  if (!args.keep)
    fs.rmSync(path.join(OUT_DIR, "uploaded.zip"), { force: true });

  const passed = results.filter((r) => r.pass).length;
  const failedTypes = [
    ...new Set(results.filter((r) => !r.pass).map((r) => r.screenName)),
  ];
  console.log(`\n${passed}/${results.length} visual cases passed.`);
  if (failedTypes.length > 0)
    console.log(`failing type(s): ${failedTypes.join(", ")}`);
  if (skipped.length > 0)
    console.log(`uncovered declared type(s): ${skipped.join(", ")}`);

  const outPath = buildReport(results, OUT_DIR, {
    title: `Conformance - ${ddf.deviceName}`,
  });
  console.log("report:", outPath);
  process.exit(passed === results.length && skipped.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
