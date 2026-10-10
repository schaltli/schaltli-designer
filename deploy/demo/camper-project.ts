// The start project of demo.schaltli.com, «Camper»
// (docs/2026-10-09-demo-instance.md, decision 7): the screens of the demo
// van's conversion so far, for the 4.3B, built from the device's own
// description the way the designer's New Project builds one. Every topic in
// it is one the demo van publishes (integrations/vanpi/demo-van.js), which
// e2e/demo-camper.spec.ts holds it to. Not kept as a file - the device's
// fonts make it 3 MB -: that spec, with DEMO_SEED_DIR, writes it into a
// project store, which the server's setup copies over.
//
//   Licht   Innenlicht on a dial, Einstieg on a slider, Küche, Lichterkette
//           and Aussenlicht as switches. The page's icon is a lit bulb while
//           any of them burns (a combined topic), an unlit one otherwise.
//   Wasser  fresh and grey water as tanks, and the switch that lets the grey
//           water out.
//
// A master carries the navigator, so a tap switches between them.

import { parseDeviceDescriptionFile, deviceDescriptionToProjectFields } from "@/lib/device-description"
import { declaresTouch } from "@/lib/object-types"
import { defaultThemeIdFor } from "@/lib/themes"
import { DEFAULT_SEPARATORS } from "@/lib/placeholders"

const S = "schaltli/state/"
const C = "schaltli/cmnd/"

const svg = (body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString("base64")}`

// Three icons of its own, drawn here: a bulb unlit, a bulb burning, a drop.
const ASSETS = [
  {
    id: "icon-bulb-off",
    name: "Bulb off",
    type: "icon",
    data: svg(
      '<path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2V17h5v-1c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/><path fill="currentColor" d="M9.5 18.5h5V20h-5zM10.5 21h3v1.2h-3z"/>',
    ),
  },
  {
    id: "icon-bulb-on",
    name: "Bulb on",
    type: "icon",
    data: svg(
      '<path fill="currentColor" d="M12 4.5a5.5 5.5 0 0 0-3.3 9.9c.6.5 1 1.2 1 2V17h4.6v-.6c0-.8.4-1.5 1-2A5.5 5.5 0 0 0 12 4.5z"/><path fill="currentColor" d="M9.7 18.3h4.6v1.5H9.7zM10.6 20.8h2.8V22h-2.8z"/><path stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M12 1v1.6M3.6 4.6l1.2 1.1M20.4 4.6l-1.2 1.1M1.5 11h1.7M20.8 11h1.7"/>',
    ),
  },
  {
    id: "icon-drop",
    name: "Drop",
    type: "icon",
    data: svg('<path fill="currentColor" d="M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5z"/>'),
  },
]

const topic = (t: string, type: "numeric" | "text", examples: string[]) => ({ id: `t-${t.replace(/[^a-z0-9]+/gi, "-")}`, topic: t, type, examples })

const TOPICS = [
  ...[1, 2, 3].flatMap((n) => [
    topic(`${S}dimmer/${n}/level`, "numeric", ["0", "40", "80"]),
    topic(`${S}dimmer/${n}/power`, "text", ["off", "on"]),
    topic(`${S}dimmer/${n}/name`, "text", [["Innenlicht", "Küche", "Einstieg"][n - 1]]),
    topic(`${C}dimmer/${n}`, "text", ["on", "off", "50"]),
  ]),
  ...[1, 2, 3].flatMap((n) => [
    topic(`${S}relay/${n}/power`, "text", ["off", "on"]),
    topic(`${S}relay/${n}/name`, "text", [["Lichterkette", "Aussenlicht", "Grauwasser ablassen"][n - 1]]),
    topic(`${C}relay/${n}`, "text", ["on", "off"]),
  ]),
  ...[1, 2].flatMap((n) => [
    topic(`${S}tank/${n}/level`, "numeric", n === 1 ? ["80", "40", "10"] : ["35", "70", "95"]),
    topic(`${S}tank/${n}/name`, "text", [["Frischwasser", "Grauwasser"][n - 1]]),
  ]),
]

// Any light burning: the Licht page's icon reads it.
const COMBINED = [
  {
    id: "ct-any-light",
    name: "licht_an",
    mode: "any",
    conditions: [
      ...[1, 2, 3].map((n) => ({ source: { namespace: "topic", path: `${S}dimmer/${n}/power` }, op: "yes" })),
      ...[1, 2].map((n) => ({ source: { namespace: "topic", path: `${S}relay/${n}/power` }, op: "yes" })),
    ],
  },
]

let next = 1
const id = (what: string) => `obj-${what}-${next++}`

// A text showing a name the bridge brings from Pekaway, so a renamed light in
// Pekaway is renamed here too.
function name(x: number, y: number, width: number, path: string, fontId = "font-helvR18") {
  const lv = `lv${next}`
  return {
    id: id("name"),
    type: "text",
    x,
    y,
    width,
    height: 30,
    zIndex: next,
    properties: {
      text: `{live:${lv}}`,
      liveValues: [{ id: lv, source: { namespace: "topic", path }, rules: [] }],
      fontId,
      color: "text",
      textAlign: "left",
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
  }
}

function title(text: string) {
  return {
    id: id("title"),
    type: "text",
    x: 124,
    y: 18,
    width: 300,
    height: 40,
    zIndex: next,
    properties: { text, fontId: "font-helvB24", color: "text", textAlign: "left", backgroundColor: "transparent", borderColor: "transparent" },
  }
}

function onOff(x: number, y: number, read: string, write: string, labels: [string, string] = ["Aus", "An"]) {
  return {
    id: id("switch"),
    type: "switch",
    x,
    y,
    width: 220,
    height: 60,
    zIndex: next,
    properties: {
      topic: read,
      writeTopic: write,
      states: [
        { id: "off", label: labels[0], readValue: "off", writeValue: "off", showAsOn: false },
        { id: "on", label: labels[1], readValue: "on", writeValue: "on", showAsOn: true },
      ],
      switchStyle: "filled",
      switchColor: "accent",
      fontId: "font-helvR18",
    },
  }
}

const LINEAR = [
  { value: 0, barSizePercent: 0 },
  { value: 100, barSizePercent: 100 },
]

function lightScreen() {
  return {
    id: "screen-licht",
    name: "Licht",
    masterScreenId: "master-1",
    iconLive: {
      id: "lv-licht-icon",
      source: { namespace: "combined", path: "licht_an" },
      rules: [{ op: "yes", result: { kind: "icon", icon: "icon-bulb-on" } }],
      otherwise: { kind: "icon", icon: "icon-bulb-off" },
    },
    objects: [
      title("Licht"),
      name(124, 70, 260, `${S}dimmer/1/name`),
      {
        id: id("dial"),
        type: "dial",
        x: 124,
        y: 104,
        width: 250,
        height: 250,
        zIndex: next,
        properties: {
          topic: `${S}dimmer/1/level`,
          writeTopic: `${C}dimmer/1`,
          calibrationPoints: LINEAR,
          minAngle: 225,
          maxAngle: 135,
          direction: "cw",
          thickness: 22,
          displayValue: "percentage",
          fillColor: "accent",
          textColor: "text",
          fontId: "font-helvB24",
          step: 5,
        },
      },
      name(124, 376, 260, `${S}dimmer/3/name`),
      {
        id: id("slider"),
        type: "slider",
        x: 124,
        y: 408,
        width: 260,
        height: 52,
        zIndex: next,
        properties: {
          topic: `${S}dimmer/3/level`,
          writeTopic: `${C}dimmer/3`,
          direction: "left-to-right",
          calibrationPoints: LINEAR,
          displayValue: "percentage",
          fillColor: "accent",
          thickness: 24,
          textColor: "text",
          fontId: "font-helvR18",
          step: 5,
        },
      },
      name(452, 70, 300, `${S}dimmer/2/name`),
      onOff(452, 104, `${S}dimmer/2/power`, `${C}dimmer/2`),
      name(452, 196, 300, `${S}relay/1/name`),
      onOff(452, 230, `${S}relay/1/power`, `${C}relay/1`),
      name(452, 322, 300, `${S}relay/2/name`),
      onOff(452, 356, `${S}relay/2/power`, `${C}relay/2`),
    ],
  }
}

function tank(x: number, n: number, fillColor: string) {
  return [
    {
      id: id("tank"),
      type: "bar",
      x,
      y: 80,
      width: 110,
      height: 300,
      zIndex: next,
      properties: {
        topic: `${S}tank/${n}/level`,
        barDirection: "bottom-to-top",
        calibrationPoints: LINEAR,
        displayValue: "percentage",
        fillColor,
        textColor: "text",
        fontId: "font-helvB24",
      },
    },
    name(x - 10, 392, 160, `${S}tank/${n}/name`),
  ]
}

function waterScreen() {
  return {
    id: "screen-wasser",
    name: "Wasser",
    masterScreenId: "master-1",
    iconAssetId: "icon-drop",
    objects: [
      title("Wasser"),
      ...tank(140, 1, "accent"),
      ...tank(300, 2, "accentAlt"),
      name(460, 178, 330, `${S}relay/3/name`),
      onOff(460, 212, `${S}relay/3/power`, `${C}relay/3`, ["Zu", "Offen"]),
    ],
  }
}

/** The project, from the device's description (a DDF zip). */
export async function buildCamperProject(ddfZip: Uint8Array) {
  next = 1
  const parsed = await parseDeviceDescriptionFile(Buffer.from(ddfZip))
  const fields = deviceDescriptionToProjectFields(parsed, Buffer.from(ddfZip).toString("base64"))
  const master = {
    id: "master-1",
    name: "Master",
    isMaster: true,
    themeId: defaultThemeIdFor(fields.colorDepth),
    objects: [
      {
        id: "obj-navigator",
        type: "navigator",
        x: 0,
        y: 0,
        width: 104,
        height: fields.screenHeight,
        zIndex: 100,
        properties: { edge: "left", shows: "iconsAndText", fontId: "font-helvR12" },
      },
    ],
  }
  return {
    name: "Camper",
    screenWidth: fields.screenWidth,
    screenHeight: fields.screenHeight,
    screens: [master, lightScreen(), waterScreen()],
    assets: ASSETS,
    fonts: fields.fonts,
    hardwareButtons: fields.hardwareButtons,
    snapGuides: [],
    adornment: fields.adornment,
    adornmentDrawingArea: fields.adornmentDrawingArea,
    embeddedDdfZipBase64: fields.ddfZipBase64,
    settings: {
      exportFormat: "esp32",
      gridSize: 20,
      snapTolerance: 8,
      snapGrid: '{"horizontal":[], "vertical":[]}',
      colorDepth: fields.colorDepth,
      decimalSeparator: DEFAULT_SEPARATORS.decimal,
      thousandsSeparator: DEFAULT_SEPARATORS.thousands,
      deviceId: fields.deviceId,
      deviceName: fields.deviceName,
      devicePlatform: fields.devicePlatform,
      supportedObjectTypes: fields.supportedObjectTypes,
      deviceActions: fields.deviceActions,
      ddfHash: fields.ddfHash,
      supportsSoftwareButtons: declaresTouch(fields.supportedObjectTypes),
      needsPageIconsInSize: fields.needsPageIconsInSize,
      pixelsPerMm: fields.pixelsPerMm,
      typographies: fields.typographies,
      screenShape: fields.screenShape,
      popupCloseRadius: fields.popupCloseRadius,
    },
    topics: TOPICS,
    combinedTopics: COMBINED,
    nextId: next + 1,
  }
}
