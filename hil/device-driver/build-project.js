// Turns a DDF into a project: one screen per object type the device claims
// to support, each carrying that type's specimen and nothing else.
//
// Nothing else means what it says. A screen with two objects on it answers
// "do these two draw right together", which is a question worth asking but
// not this one - when it fails, someone still has to work out which of them
// moved. One object per screen makes a failing case name its own cause, and
// the screens are named after the type for the same reason.

const { SPECIMENS } = require("./specimens");

// Slots. Everything a specimen draws is placed relative to one of these, so
// the same table serves any panel.
//
// Both are centred, which is the only placement that is safe without knowing
// the panel's shape: a round device's DDF marks its dead corners in the
// adornment, not in device.json, so a driver reading device.json alone must
// assume the corners may not be visible. The square slot is sized against
// the inscribed circle for that reason - on a rectangular panel it simply
// looks conservative, on a round one it is the difference between a picture
// and a clipped one.
function slots(screen) {
  const short = Math.min(screen.width, screen.height);
  // 0.7071 is the inscribed square of a circle; the extra margin keeps a
  // stroke or a marker from landing on the bezel.
  const squareSide = Math.round(short * 0.7071 * 0.86);
  const square = {
    x: Math.round((screen.width - squareSide) / 2),
    y: Math.round((screen.height - squareSide) / 2),
    width: squareSide,
    height: squareSide,
  };

  const wideWidth = Math.round(Math.min(screen.width * 0.72, squareSide * 1.9));
  const wideHeight = Math.round(
    Math.min(squareSide * 0.34, screen.height * 0.3),
  );
  const wide = {
    x: Math.round((screen.width - wideWidth) / 2),
    y: Math.round((screen.height - wideHeight) / 2),
    width: wideWidth,
    height: wideHeight,
  };

  return { square, wide };
}

// Picks fonts by size rather than by name. A new device is free to ship a
// different family, and a driver that asked for "font-helvR18" by id would
// fail on it for no reason that matters.
function fontPicker(fonts) {
  const sorted = [...fonts].sort((a, b) => (a.size || 0) - (b.size || 0));
  const at = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  const chosen = {
    small: at(0),
    medium: at(0.4),
    large: at(0.7),
  };
  return {
    font: (which) => chosen[which].id,
    fontSize: (which) => chosen[which].size,
    chosen,
  };
}

// One-bit devices get black and white and nothing else - anything in between
// is quantized on both sides anyway, and choosing a grey here would only make
// the pictures harder to read.
function palette(colorDepth) {
  if (colorDepth === "1bit") {
    return {
      bg: "#ffffff",
      fg: "#000000",
      border: "#000000",
      accent: "#000000",
    };
  }
  return { bg: "#ffffff", fg: "#000000", border: "#3a3a3a", accent: "#4CAF50" };
}

function buildProject(ddf, { topicPrefix = "hil-driver" } = {}) {
  const { screen, fonts, supportedObjectTypes } = ddf;
  const { square, wide } = slots(screen);
  const { font, fontSize } = fontPicker(fonts);
  const colors = palette(screen.colorDepth);

  const screens = [];
  const topics = [];
  const assets = new Map();
  const skipped = [];

  for (const type of supportedObjectTypes) {
    const specimen = SPECIMENS[type];
    if (!specimen) {
      // Loud, never silent. A device declaring a type this table has never
      // heard of is the single most useful thing this driver can report: it
      // means the designer grew a control and nothing here covers it.
      skipped.push(type);
      continue;
    }

    const screenTopics = [];
    const ctx = {
      square,
      wide,
      screen,
      colors,
      font,
      fontSize,
      id: (name) => `obj-${type}-${name}`.replace(/[^a-zA-Z0-9-]/g, "-"),
      // Registered per screen, so a specimen's values only ever drive its own
      // screen's combinations.
      topic: (name, valueType, examples) => {
        const full = `${topicPrefix}/${type}/${name}`.toLowerCase();
        screenTopics.push({
          id: `topic-${type}-${name}`,
          topic: full,
          type: valueType,
          examples,
        });
        return full;
      },
    };

    const built = specimen.build(ctx);
    for (const asset of built.assets || []) assets.set(asset.id, asset);
    topics.push(...screenTopics);

    screens.push({
      id: `screen-${type}`,
      name: type,
      backgroundColor: colors.bg,
      objects: built.objects,
    });
  }

  if (screens.length === 0) {
    throw new Error(
      `none of this device's declared types have a specimen: ${supportedObjectTypes.join(", ")}. ` +
        "Add one to hil/device-driver/specimens.js.",
    );
  }

  const project = {
    name: `${ddf.deviceName} type coverage`,
    systemGeneration: ddf.systemGeneration,
    // Carried into the export as _source/ddf.zip, so what this installs is
    // self-contained on the device rather than depending on the board still
    // serving the DDF it was built from.
    ...(ddf.zipBase64 ? { embeddedDdfZipBase64: ddf.zipBase64 } : {}),
    screenWidth: screen.width,
    screenHeight: screen.height,
    settings: {
      colorDepth: screen.colorDepth,
      // In settings, not at the top level: that is where the export reads it
      // from (lib/project-zip.ts writes `deviceId: project.settings.deviceId`
      // into the device's project.json), and the firmware checks it before
      // touching its project directory. Set at the top level instead, the
      // exported zip carries no deviceId at all and the board rejects the
      // upload - silently, from this side, because the upload's reply never
      // arrives anyway. The first run here spent its time comparing against
      // the project that was already installed.
      deviceId: ddf.deviceId,
      deviceName: ddf.deviceName,
    },
    topics,
    assets: [...assets.values()],
    hardwareButtons: [],
    fonts: fonts.map(({ data, ...metrics }) => metrics),
    screens,
  };

  return { project, skipped, fontsWithData: fonts };
}

// How many screens can be installed at once.
//
// The export flattens each screen's static content into a full-screen 24-bit
// bitmap, and the firmware inflates the zip into LittleFS, so what has to fit
// is width*height*3 per screen - uncompressed, however well it zipped. On the
// 4.3B that is 1.15MB a screen against a partition of a few megabytes, so a
// project with a screen per object type does not fit and the install fails in
// the least helpful way available: the upload's reply never arrives anyway,
// so from the harness's side a rejected project looks exactly like an
// accepted one, and the run then compares against whatever was already on the
// device.
//
// Hence a budget rather than a fixed count: a 360x360 panel fits five screens
// in the same space this one fits one, and neither number should be written
// down here. 2MB is deliberately below the ~3MB an ESP32 default partition
// table leaves for a filesystem, since the project's own JSON, fonts and icon
// bitmaps have to live there too.
const INSTALL_BUDGET_BYTES = 2 * 1024 * 1024;

function screensPerInstall(screen, override) {
  if (override) return override;
  const perScreen = screen.width * screen.height * 3;
  return Math.max(1, Math.floor(INSTALL_BUDGET_BYTES / perScreen));
}

// Splits a project into installable chunks, each a complete project carrying
// only its own screens and only the topics those screens bind to.
function chunkProject(project, screenTopicsOf, size) {
  const chunks = [];
  for (let i = 0; i < project.screens.length; i += size) {
    const screens = project.screens.slice(i, i + size);
    const used = new Set(screens.flatMap((s) => screenTopicsOf(project, s)));
    chunks.push({
      ...project,
      // Assets are left whole on purpose: the export bakes only what a screen
      // actually references, so carrying the two stencils in every chunk
      // costs nothing on the device and keeps the chunks comparable.
      topics: project.topics.filter((t) => used.has(t.topic)),
      screens,
    });
  }
  return chunks;
}

module.exports = { buildProject, slots, screensPerInstall, chunkProject };
