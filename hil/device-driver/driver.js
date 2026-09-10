// A pixel-parity run against any device, generated from that device's own
// DDF. Contact the board, fetch its DDF, build a project with one screen per
// object type it claims to support, export it through the real designer,
// install it, and compare every screen against the designer's own renderer.
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
// Run: node hil/device-driver/driver.js --device <ip> [--ddf <dir|zip>]
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
// A timeout is the success path, and coming back is the proof.
async function uploadProject(zipBuffer, testInterface, deviceHost) {
  const tmp = path.join(OUT_DIR, "uploaded.zip");
  fs.writeFileSync(tmp, zipBuffer);
  const { execFileSync } = require("child_process");
  try {
    execFileSync("curl", [
      "-s",
      "-m",
      "25",
      "-F",
      `file=@${tmp}`,
      testInterface.uploadUrl,
      "-o",
      "/dev/null",
    ]);
  } catch {
    // expected: the device rebooted mid-request
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
  const started = Date.now();
  const deadline = started + 180000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await switchScreen(0, testInterface, 5000);
      console.log(
        `  device is back after ${((Date.now() - started) / 1000).toFixed(0)}s`,
      );
      return;
    } catch (err) {
      lastError = err;
    }
    await sleep(2000);
  }
  throw new Error(
    `the device did not accept a screen switch within 180s of the upload: ${lastError?.message}`,
  );
}

// Polls until the device's own loader reports every published value back.
// Sleeping instead races the device and then blames the renderer for it.
async function waitForTopicValuesApplied(
  overrides,
  deviceHost,
  { intervalMs = 150, timeoutMs = 15000 } = {},
) {
  const topics = Object.keys(overrides);
  if (topics.length === 0) return;
  const url = `http://${deviceHost}/api/topic-values?topics=${encodeURIComponent(topics.join(","))}`;
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

async function fetchSnapshot(testInterface, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(testInterface.snapshotUrl, {
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000)
        throw new Error(`snapshot truncated: ${buf.length} bytes`);
      return buf;
    } catch (err) {
      lastError = err;
      console.log(
        `    (snapshot attempt ${i + 1} failed: ${err.message}, retrying)`,
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
    console.log("   Add one to hil/device-driver/specimens.js.\n");
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
    await uploadProject(zipBuffer, ddf.testInterface, args.device);

    for (let si = 0; si < chunk.screens.length; si++) {
      const screen = chunk.screens[si];
      const combos = combinationCount(chunk, screen);
      console.log(`\n[${screen.name}] ${combos} combination(s)`);

      for (let ci = 0; ci < combos; ci++) {
        const overrides = combinationOverrides(project, screen, ci);
        const caseId = `${screen.name}-${ci}`.replace(/[^a-zA-Z0-9-]/g, "-");

        for (const [topic, value] of Object.entries(overrides)) {
          await new Promise((resolve, reject) => {
            mqttClient.publish(topic, value, { qos: 1 }, (err) =>
              err ? reject(err) : resolve(),
            );
          });
        }
        await waitForTopicValuesApplied(overrides, args.device);

        // Every combination forces a render here, unlike the 4.3B's own
        // orchestrator which deliberately leaves later ones to the partial
        // redraw path. This driver is asking whether the device can draw each
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
                deviceImg.bitmap.data[i + 2] === expectedImg.bitmap.data[j + 2];
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
    title: `HIL type coverage - ${ddf.deviceName}`,
  });
  console.log("report:", outPath);
  process.exit(passed === results.length && skipped.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FAILED:", err.message || err);
  process.exit(1);
});
