// Where this suite's font bytes come from: the phone's own Device
// Description File, fetched from the phone.
//
// Two callers need the SAME answer: the fixture builder injects the bytes so
// the export writes a real assets/fonts/Roboto.ttf, and the orchestrator
// needs the same face registered before it renders the designer's reference
// image. When only one of them has it, the reference draws real Roboto
// glyphs while the other side falls back to a generic sans - neither is
// wrong on its own, they are reading different fonts, and every glyph
// differs.
//
// It used to read `ScreensmithAndroid/ddf-source/`, a checked-in description
// of "an Android phone". That directory went on 2026-09-21, when the app
// started building its own DDF from the screen it actually has; this file
// outlived it by a day and failed with "check out ScreensmithAndroid
// alongside this repo" for a directory that was never coming back.
//
// So it asks the phone, which is the only thing that knows. Over `adb
// forward` rather than the network: the app serves its DDF on port 8080, and
// the cable works whatever wifi either end is on - the phone spent
// 2026-09-21 on the van's network while this machine stayed at home.
//
// A project's own font entries carry only metrics (id, internalName, size,
// ascent, descent); the bytes live in the DDF. Unlike the firmware suites,
// the Android export DOES write the file into the bundle - the app has no
// compiled-in copy to fall back on, so `path` is what it loads from.

const path = require("path");
const { execFile } = require("child_process");
const JSZip = require("jszip");

const ADB =
  process.env.ANDROID_ADB_PATH ||
  path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe");

/** The phone's DDF, fetched once per process. */
let cached = null;

function adb(args) {
  return new Promise((resolve, reject) =>
    execFile(ADB, args, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );
}

/**
 * The connected phone's DDF: its screen, its identity and its fonts with
 * their bytes.
 *
 * `deviceSerial` is only needed when more than one device is attached.
 */
async function phoneDdf(deviceSerial) {
  if (cached) return cached;
  const prefix = deviceSerial ? ["-s", deviceSerial] : [];
  // A port nobody else is on: a run that crashed without tidying up leaves
  // its forward behind, and reusing it would reach a closed socket.
  const port = 18080 + Math.floor(Math.random() * 500);
  try {
    await adb([...prefix, "forward", `tcp:${port}`, "tcp:8080"]);
  } catch (err) {
    throw new Error(
      "Could not reach the phone to ask for its DDF. Connect it over USB with the app running " +
        `(adb forward failed: ${err.message}).`,
    );
  }
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ddf.zip`);
    if (!res.ok) {
      throw new Error(
        `The phone answered ${res.status} for its own DDF. Is the app in the foreground? It serves this ` +
          "only while it is running.",
      );
    }
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    const device = JSON.parse(await zip.file("device.json").async("string"));
    const fonts = [];
    for (const font of device.fonts || []) {
      // `file` is the DDF's own name for it (device-contract.md SS1); the
      // designer's ProjectFont calls the same thing `path`.
      const file = font.file ?? font.path;
      const entry = zip.file(file);
      if (!entry) throw new Error(`The phone's DDF names a font it does not contain: ${file}`);
      const base64 = Buffer.from(await entry.async("nodebuffer")).toString("base64");
      fonts.push({
        id: font.id,
        name: font.internalName ?? font.id,
        displayName: font.displayName ?? font.id,
        path: file,
        internalName: font.internalName,
        size: font.size,
        ascent: font.ascent,
        descent: font.descent,
        format: "ttf",
        data: `data:font/ttf;base64,${base64}`,
      });
    }
    cached = {
      screen: device.screen,
      device: device.device,
      // What the phone says it can draw. The fixture builder holds itself to
      // this list: a type declared here and missing from the fixture is a
      // type the suite reports nothing about, which reads exactly like a
      // type that works.
      supportedObjectTypes: device.supportedObjectTypes || [],
      fonts,
    };
    return cached;
  } finally {
    await adb([...prefix, "forward", "--remove", `tcp:${port}`]).catch(() => {});
  }
}

/**
 * Returns a copy of `fonts` with `data` filled in from the phone's DDF.
 * Fonts that already have their own bytes are left alone.
 */
async function withDdfFontData(fonts, deviceSerial) {
  const ddf = await phoneDdf(deviceSerial);
  return fonts.map((font) => {
    if (font.data) return font;
    const match = ddf.fonts.find((f) => f.id === font.id);
    if (!match) throw new Error(`The phone's DDF has no font "${font.id}"`);
    return { ...font, ...match };
  });
}

/** Every font the phone's DDF declares, as project font entries with their bytes. */
async function allDdfFonts(deviceSerial) {
  const ddf = await phoneDdf(deviceSerial);
  return ddf.fonts.map((font) => ({ ...font }));
}

module.exports = { phoneDdf, withDdfFontData, allDdfFonts };
