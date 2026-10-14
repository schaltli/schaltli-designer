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
// It used to read `schaltli-android/ddf-source/`, a checked-in description
// of "an Android phone". That directory went on 2026-09-21, when the app
// started building its own DDF from the screen it actually has; this file
// outlived it by a day and failed with "check out schaltli-android
// alongside this repo" for a directory that was never coming back.
//
// So it asks the phone, which is the only thing that knows - over the
// broker, as the designer asks (ddf/get, device contract §4) since
// 2026-10-14, when the app stopped serving it on port 8080 (#70). Which
// phone is the one on the cable: the id its app logs at start (SchaltliId),
// read over adb - a second phone on the broker is not asked.
//
// A project's own font entries carry only metrics (id, internalName, size,
// ascent, descent); the bytes live in the DDF. Unlike the firmware suites,
// the Android export DOES write the file into the bundle - the app has no
// compiled-in copy to fall back on, so `path` is what it loads from.

const path = require("path");
const { execFile } = require("child_process");
const JSZip = require("jszip");
const { deviceDdf } = require("../device-mqtt");

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
  const instanceId = await cabledInstance(prefix);
  let bytes;
  try {
    bytes = await deviceDdf(instanceId, process.env.HIL_MQTT_URL || "mqtt://localhost:1883");
  } catch (err) {
    throw new Error(
      `${instanceId} sent no description over the broker (${err.message}). Is the app running and ` +
        "connected to this machine's broker?",
    );
  }
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
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
    // And what it keeps beyond object types: local topics (§2.9).
    supportedFeatures: device.supportedFeatures || [],
    fonts,
  };
  return cached;
}

// The broker id of the phone on the cable, from the line its app logs at
// every start (MainActivity: SchaltliId). Asked again for a while: a run that
// has just started the app may look before it has said it.
async function cabledInstance(prefix) {
  for (let tries = 0; ; tries++) {
    let log = "";
    try {
      log = await adb([...prefix, "logcat", "-d", "-s", "SchaltliId:I"]);
    } catch (err) {
      throw new Error(`Could not reach the phone over USB (adb logcat failed: ${err.message}).`);
    }
    const ids = log.match(/android-[A-Za-z0-9]+/g);
    if (ids) return ids[ids.length - 1];
    if (tries >= 10) {
      throw new Error(
        "The app on the phone has not said its id since the log began. Start it afresh: " +
          "adb shell am start -S -n com.schaltli.android/.MainActivity",
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
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
