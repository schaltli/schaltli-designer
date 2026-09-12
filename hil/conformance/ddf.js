// Everything a conformance run knows about a device comes from its DDF, and
// the DDF comes from the device itself. That is the point: onboarding a new
// board should not require a checked-out firmware repo, a hand-written
// fixture, or an entry in any table here.
//
// A device serves the whole thing at GET /ddf.zip - device.json, the
// adornment, and the BDF bytes of every font it declares - so one fetch
// yields the supported object types, the screen geometry, the endpoints to
// drive, and the fonts a generated project has to reference. --ddf takes a
// local directory or zip instead, for a board whose HTTP server is not up
// yet.

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

// The endpoints the harness drives, as the DDF declares them. Templates
// carry {ip}; nothing else in this file knows a URL.
function resolveTestInterface(testInterface, deviceHost) {
  if (!testInterface) {
    throw new Error(
      "this DDF declares no testInterface block - a device cannot be driven without one. " +
        "See DEVICE_GUIDE.md; it is nine lines of JSON.",
    );
  }
  const resolved = { ...testInterface };
  for (const key of Object.keys(resolved)) {
    if (typeof resolved[key] === "string")
      resolved[key] = resolved[key].replace(/\{ip\}/g, deviceHost);
  }
  for (const required of ["uploadUrl", "screenSwitchUrl", "snapshotUrl"]) {
    if (!resolved[required])
      throw new Error(`this DDF's testInterface is missing ${required}`);
  }
  return resolved;
}

// The project's font entries need the metrics AND the bytes. Both are in the
// DDF: the metrics inline in device.json, the bytes in the zip it came with.
// Reading them from anywhere else is how a run ends up comparing the
// designer's fallback canvas font against the device's real glyphs and
// blaming the renderer.
async function fontsWithData(deviceJson, readFile) {
  const fonts = [];
  for (const font of deviceJson.fonts || []) {
    if (!font.file) throw new Error(`font "${font.id}" declares no file`);
    const data = await readFile(font.file);
    if (data == null)
      throw new Error(
        `the DDF is missing "${font.file}" for font "${font.id}"`,
      );
    fonts.push({
      id: font.id,
      name: font.displayName,
      displayName: font.displayName,
      // The path the font file gets inside the exported project, and the
      // reason it gets exported at all: lib/project-zip.ts ships a font's
      // bytes only when it carries both data and path, and writes this same
      // string into project.json for the firmware to open. Reusing the DDF's
      // own file name keeps the two halves pointing at one file.
      path: font.file,
      internalName: font.internalName,
      size: font.size,
      ascent: font.ascent,
      descent: font.descent,
      data,
    });
  }
  if (fonts.length === 0)
    throw new Error(
      "this DDF declares no fonts - nothing that draws text could be generated",
    );
  return fonts;
}

function shape(deviceJson, fonts, testInterface, origin, zipBase64) {
  const screen = deviceJson.screen || {};
  if (!screen.width || !screen.height)
    throw new Error("this DDF declares no screen width/height");

  const supportedObjectTypes = deviceJson.supportedObjectTypes || [];
  if (supportedObjectTypes.length === 0) {
    throw new Error(
      "this DDF declares no supportedObjectTypes - there is nothing to generate",
    );
  }

  return {
    origin,
    // The DDF's own bytes, kept so a generated project can embed them. A
    // device project that carries its DDF opens self-contained later - the
    // export writes them to _source/ddf.zip, and the knob's smoke verifier
    // checks the copy it recovers from the board for exactly that.
    // Null when the DDF came from a directory rather than a zip.
    zipBase64,
    deviceId: deviceJson.device?.id,
    deviceName: deviceJson.device?.name || deviceJson.device?.id,
    systemGeneration: deviceJson.systemGeneration || "1.0",
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: screen.colorDepth || "24bit",
    },
    supportedObjectTypes,
    supportsSoftwareButtons: deviceJson.supportsSoftwareButtons === true,
    testInterface,
    fonts,
    raw: deviceJson,
  };
}

async function fromZipBuffer(buffer, deviceHost, origin) {
  const zip = await JSZip.loadAsync(buffer);
  const entry = zip.file("device.json");
  if (!entry) throw new Error(`${origin} contains no device.json`);
  const deviceJson = JSON.parse(await entry.async("string"));
  const fonts = await fontsWithData(deviceJson, async (file) => {
    const f = zip.file(file);
    return f ? await f.async("string") : null;
  });
  return shape(
    deviceJson,
    fonts,
    resolveTestInterface(deviceJson.testInterface, deviceHost),
    origin,
    buffer.toString("base64"),
  );
}

async function fromDirectory(dir, deviceHost) {
  const devicePath = path.join(dir, "device.json");
  if (!fs.existsSync(devicePath))
    throw new Error(`${dir} contains no device.json`);
  const deviceJson = JSON.parse(fs.readFileSync(devicePath, "utf8"));
  const fonts = await fontsWithData(deviceJson, async (file) => {
    const p = path.join(dir, file);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  });
  return shape(
    deviceJson,
    fonts,
    resolveTestInterface(deviceJson.testInterface, deviceHost),
    dir,
    null,
  );
}

// The device's own copy, which is the one that matters: it is what the
// firmware actually loaded, so a board flashed with a stale build is caught
// here rather than showing up later as a rendering difference nobody can
// place.
async function fromDevice(deviceHost, { timeoutMs = 30000 } = {}) {
  const url = `http://${deviceHost}/ddf.zip`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return fromZipBuffer(buffer, deviceHost, url);
}

async function loadDdf(deviceHost, localPath) {
  if (!localPath) return fromDevice(deviceHost);
  if (fs.statSync(localPath).isDirectory())
    return fromDirectory(localPath, deviceHost);
  return fromZipBuffer(fs.readFileSync(localPath), deviceHost, localPath);
}

module.exports = { loadDdf };
