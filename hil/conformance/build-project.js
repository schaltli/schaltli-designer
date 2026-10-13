// Turns a DDF into a project: one screen per object type the device claims
// to support, each carrying that type's specimen and nothing else.
//
// Nothing else means what it says. A screen with two objects on it answers
// "do these two draw right together", which is a question worth asking but
// not this one - when it fails, someone still has to work out which of them
// moved. One object per screen makes a failing case name its own cause, and
// the screens are named after the type for the same reason.

const { SPECIMENS } = require("./specimens");
const JSZip = require("jszip");

// Types a device may still declare but the designer no longer makes.
const RETIRED_TYPES = new Set(["live-text"]);

// Slots. Everything a specimen draws is placed relative to one of these, so
// the same table serves any panel.
//
// Both are centred, which is the only placement that is safe without knowing
// the panel's shape: a round device's DDF marks its dead corners in the
// adornment, not in device.json, so a run reading device.json alone must
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
// different family, and a run that asked for "font-helvR18" by id would
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
//
// `track` is the exception, and the reason it exists as its own entry: it is
// the part of a control that a filled part is drawn ON TOP OF, and on one bit
// there is no shade that reads as "behind". Painting it in the fill's own
// black made the arc a full ring at every value - three combinations, three
// identical pictures, and a fill angle that could have been anything. Blank
// here means the filled sector is the only thing on the dial, so the value
// drives the picture again.
function palette(colorDepth) {
  if (colorDepth === "1bit") {
    return {
      bg: "#ffffff",
      fg: "#000000",
      border: "#000000",
      accent: "#000000",
      track: "#ffffff",
    };
  }
  // Sixteen greys: black lines, as lib/control-palette.ts starts a real
  // project on this depth. The dark grey below came out as a washed-out
  // frame and marker on the PaperS3 (2026-09-14), which made the test screen
  // look worse than anything the designer would actually produce. Accent and
  // track stay as they are, so the arc's black setpoint marker still shows
  // against its fill.
  if (colorDepth === "4bit") {
    return { bg: "#ffffff", fg: "#000000", border: "#000000", accent: "#4CAF50", track: "#3a3a3a" };
  }
  return { bg: "#ffffff", fg: "#000000", border: "#3a3a3a", accent: "#4CAF50", track: "#3a3a3a" };
}

function buildProject(ddf, { topicPrefix = "hil-conformance" } = {}) {
  const { screen, fonts, supportedObjectTypes } = ddf;
  const { square, wide } = slots(screen);
  const { font, fontSize } = fontPicker(fonts);
  const colors = palette(screen.colorDepth);

  const screens = [];
  const masters = [];
  const taps = {};
  const drags = {};
  const topics = [];
  const assets = new Map();
  const skipped = [];

  for (const type of supportedObjectTypes) {
    // Declared by every board, which still draws one for a project already on
    // it, but no longer made by the designer: Live Text went into Text with a
    // `{topic:…}` placeholder (2026-10-07), and the text specimen covers that.
    if (RETIRED_TYPES.has(type)) continue;
    const specimen = SPECIMENS[type];
    if (!specimen) {
      // Loud, never silent. A device declaring a type this table has never
      // heard of is the single most useful thing a conformance run can report: it
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
      // What the device says it can draw, for the specimens that need a
      // child object rather than just themselves.
      //
      // A tab-control's panels have to contain something, and that something
      // has to be a type this device supports too - which is not automatic.
      // The e-paper declares nine types and "icon" is not among them, so a
      // panel holding an icon asked it to draw a control it never claimed:
      // it rendered its unknown-type placeholder, the comparison reported
      // 24000 differing pixels, and the fault was the specimen's rather than
      // the board's (2026-09-12).
      supports: (t) => supportedObjectTypes.includes(t),
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
    // Kept beside the project rather than inside it: a tap is something the
    // run does to the device, not something the device is told about, and a
    // stray field in project.json would reach the firmware's loader.
    if (built.taps && built.taps.length) taps[type] = built.taps;
    if (built.drags && built.drags.length) drags[type] = built.drags;

    // A specimen that lives on a master - the navigator does, and a device
    // draws it over every screen that uses the master - brings that master's
    // objects. The master goes at the end of the project's screens, so the
    // specimens' screens keep the indices the device pages by
    // (chunkProject keeps it so).
    const master = built.master
      ? { id: `master-${type}`, name: `${type} master`, isMaster: true, backgroundColor: colors.bg, objects: built.master }
      : null;
    if (master) masters.push(master);
    screens.push({
      id: `screen-${type}`,
      name: type,
      backgroundColor: colors.bg,
      ...(master ? { masterScreenId: master.id } : {}),
      ...(built.screen || {}),
      objects: built.objects,
    });
  }

  if (screens.length === 0) {
    throw new Error(
      `none of this device's declared types have a specimen: ${supportedObjectTypes.join(", ")}. ` +
        "Add one to hil/conformance/specimens.js.",
    );
  }

  const project = {
    name: `${ddf.deviceName} conformance`,
    systemGeneration: ddf.systemGeneration,
    // Deliberately NOT embeddedDdfZipBase64, though ddf.zipBase64 is right
    // there. Setting it makes the export write the whole DDF into
    // _source/ddf.zip, which is correct for a project a human keeps and
    // pointless for one of these: it is a throwaway fixture that the next
    // install deletes, and nobody ever recovers it from the board.
    //
    // The cost is not theoretical. It took every install from about 4KB to
    // about 170KB - thirteen of those per run, over a link this session has
    // seen drop to 11 KB/s. Tried on 2026-09-10 to satisfy the knob smoke
    // verifier's "carries its own DDF" check, which only ever fires when the
    // conformance run happens immediately before that verifier; test:all's order
    // does not do that.
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
      // Not the default (Switzerland's "." and "'"): a device that ignored
      // the exported separators would still draw the default and pass. The
      // apostrophe stays, for its glyph (specimens.js, text).
      decimalSeparator: ",",
      thousandsSeparator: "'",
    },
    topics,
    assets: [...assets.values()],
    hardwareButtons: [],
    fonts: fonts.map(({ data, ...metrics }) => metrics),
    screens: [...screens, ...masters],
  };

  return { project, skipped, fontsWithData: fonts, taps, drags };
}

// How much one install may hold: the project's files as the board unpacks
// them into LittleFS, measured from the real export (run.js) - not guessed
// per screen, as until 2026-10-13, from a full-screen bitmap the export has
// not carried since 2026-09-25 (docs/device-contract.md §2, "Static
// content").
//
// Every board left has the 16 MB layout with about 3.4 MB of filesystem
// (default_16MB.csv). 1.5 MB keeps well below it: guessing high is the
// expensive direction - the retired e-paper once filled its filesystem with
// a project and could only be recovered over USB, its WiFi credentials gone
// with the partition.
const INSTALL_BUDGET_BYTES = 1.5 * 1024 * 1024;

/** The bytes a zip's files take unpacked. */
async function unpackedBytes(zipBuffer) {
  const zip = await JSZip.loadAsync(zipBuffer);
  let total = 0;
  for (const file of Object.values(zip.files)) {
    if (!file.dir) total += (await file.async("nodebuffer")).length;
  }
  return total;
}

// Splits a project into installable chunks, each a complete project carrying
// only its own screens and only the topics those screens bind to.
//
// Masters are not counted: each chunk carries the masters its screens use,
// after them, so a screen's index in the chunk is the one the device pages by.
function chunkProject(project, screenTopicsOf, size) {
  const chunks = [];
  const shown = project.screens.filter((s) => !s.isMaster);
  for (let i = 0; i < shown.length; i += size) {
    const own = shown.slice(i, i + size);
    const masterIds = new Set(own.map((s) => s.masterScreenId).filter(Boolean));
    const screens = [...own, ...project.screens.filter((s) => s.isMaster && masterIds.has(s.id))];
    const used = new Set(own.flatMap((s) => screenTopicsOf(project, s)));
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

module.exports = { buildProject, slots, INSTALL_BUDGET_BYTES, unpackedBytes, chunkProject };
