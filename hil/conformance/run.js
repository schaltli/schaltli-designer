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
  // Index 0 exists in every project ever installed, so a device still running
  // the previous one answers it happily and the run goes on to compare
  // against the wrong thing - producing a huge, baffling pixel difference
  // instead of "the upload did not land". The epaper orchestrator lost a run
  // to exactly that on 2026-07-30. The last index of what was just installed
  // is the cheapest thing that a stale project usually cannot satisfy, and it
  // needs no endpoint beyond the one the DDF already declares.
  const started = Date.now();
  const deadline = started + 180000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await switchScreen(screenCount - 1, testInterface, 5000);
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

  const { project, skipped } = buildProject(effectiveDdf);
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
    );

    for (let si = 0; si < chunk.screens.length; si++) {
      const screen = chunk.screens[si];
      const combos = combinationCount(chunk, screen);
      console.log(`\n[${screen.name}] ${combos} combination(s)`);

      for (let ci = 0; ci < combos; ci++) {
        const overrides = combinationOverrides(project, screen, ci);
        const caseId = `${screen.name}-${ci}`.replace(/[^a-zA-Z0-9-]/g, "-");

        // One case that throws must not take the rest of the run with it.
        // A published value that never arrives, or a snapshot that gives up,
        // says something about that case and nothing about the eight types
        // still queued behind it - and on a flaky radio it is the likeliest
        // way a run ends. Before this, one such timeout on the knob's
        // arc-level ended the run with eight types never photographed
        // (2026-09-10).
        try {
          for (const [topic, value] of Object.entries(overrides)) {
            await new Promise((resolve, reject) => {
              mqttClient.publish(topic, value, { qos: 1 }, (err) =>
                err ? reject(err) : resolve(),
              );
            });
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
