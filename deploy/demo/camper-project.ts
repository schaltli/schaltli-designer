// The start project of demo.schaltli.com, «Camper»
// (docs/2026-10-09-demo-instance.md, decision 7): the screens of the demo
// van's conversion so far, for the 4.3B, built from the device's own
// description the way the designer's New Project builds one. Every topic in
// it is one the demo van publishes (integrations/vanpi/demo-van.js), which
// e2e/demo-camper.spec.ts holds it to. Not kept as a file - the device's
// fonts make it 3 MB -: that spec, with DEMO_SEED_DIR, writes it into a
// project store, which the server's setup copies over.
//
//   Energie first, an energy diagram as a Flow or a Sankey - «Flow | Sankey»
//           top right switches them on this display only (the local topic
//           local/energie/view, docs/2026-10-13-local-topics.md): the sun,
//           the mains charger and the
//           DC-DC charger off the engine into the 12 V bus, the battery and
//           what draws off it, the dots running while watts flow. The
//           battery is Pekaway's shunt through the bridge; the rest comes as
//           in the author's van (vanpi-custom: its BLE bridge's
//           ble/charger/... and ble/orion/..., its Node-RED tab's
//           van/energy/...), so the page goes into his project as it is.
//           The page's icon is an empty battery below 20 %.
//   Licht   Innenlicht on a dial, Einstieg on a slider, Küche, Lichterkette
//           and Aussenlicht as switches. The page's icon is a lit bulb while
//           any of them burns (a combined topic), an unlit one otherwise.
//   Wasser  fresh and grey water as tanks, the water pump, and the switch
//           that lets the grey water out. The page's icon is a drop with an exclamation mark
//           while the grey water is above 80 % or the fresh below 20 %.
//   MaxxFan, Heizung  «Coming soon» - the conversion's next stages, there
//           already so the navigator shows where the van is going.
//
// A master carries the navigator, so a tap switches between them, and top
// right the switch between light and dark.

import { parseDeviceDescriptionFile, deviceDescriptionToProjectFields } from "@/lib/device-description"
import { declaresTouch } from "@/lib/object-types"
import { defaultThemeIdFor } from "@/lib/themes"
import { DEFAULT_SEPARATORS } from "@/lib/placeholders"

const S = "schaltli/state/"
const C = "schaltli/cmnd/"

const svg = (body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString("base64")}`

// Icons of its own, drawn here: the pages' bulbs, drops, fan and flame, and
// the sun and the moon of the theme switch.
const ASSETS = [
  {
    id: "icon-sun",
    name: "Sun",
    type: "icon",
    data: svg(
      '<circle cx="12" cy="12" r="4.5" fill="currentColor"/><path stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 1.5v2.5M12 20v2.5M1.5 12H4M20 12h2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>',
    ),
  },
  {
    id: "icon-moon",
    name: "Moon",
    type: "icon",
    data: svg('<path fill="currentColor" d="M14.5 2.5a9.5 9.5 0 1 0 7 15.6A8 8 0 0 1 14.5 2.5z"/>'),
  },
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
  {
    id: "icon-drop-alert",
    name: "Drop, attention",
    type: "icon",
    data: svg(
      '<path fill="currentColor" d="M10 2.5S3.5 10 3.5 14.5a6.5 6.5 0 0 0 13 0C16.5 10 10 2.5 10 2.5z"/><path fill="currentColor" d="M19.2 3h2.6l-.4 11h-1.8zM19.3 16.5h2.4V19h-2.4z"/>',
    ),
  },
  {
    id: "icon-battery",
    name: "Battery",
    type: "icon",
    data: svg('<path fill="none" stroke="currentColor" stroke-width="1.8" d="M7 4.5h10v17H7z"/><path fill="currentColor" d="M10 2h4v2.5h-4zM9 13h6v6.5H9zM9 8.5h6v3.5H9z"/>'),
  },
  {
    id: "icon-battery-low",
    name: "Battery low",
    type: "icon",
    data: svg('<path fill="none" stroke="currentColor" stroke-width="1.8" d="M7 4.5h10v17H7z"/><path fill="currentColor" d="M10 2h4v2.5h-4zM9 17h6v2.5H9zM11 7.5h2v6.5h-2z"/>'),
  },
  {
    id: "icon-plug",
    name: "Plug",
    type: "icon",
    data: svg('<path fill="currentColor" d="M8 2h2v5H8zM14 2h2v5h-2zM5 7.5h14V11a7 7 0 0 1-6 6.9V22h-2v-4.1A7 7 0 0 1 5 11z"/>'),
  },
  {
    id: "icon-engine",
    name: "Engine",
    type: "icon",
    data: svg('<path fill="currentColor" d="M7 4h7v2h-2v2h3l2 2h2V8h3v9h-3v-2h-2v3h-4l-2 2H8l-2-2H4v-3H2V9h2v3h1V8h4V6H7z"/>'),
  },
  {
    id: "icon-load",
    name: "Bolt",
    type: "icon",
    data: svg('<path fill="currentColor" d="M14 1.5 4.5 13.5H11l-1.5 9 9.5-12.5h-6.5z"/>'),
  },
  {
    id: "icon-fan",
    name: "Fan",
    type: "icon",
    data: svg(
      '<circle cx="12" cy="12" r="2" fill="currentColor"/><path fill="currentColor" d="M12 10C11 6 12 2.5 15 2.5s3 3.5-1 7.5zM14 12c4-1 7.5 0 7.5 3s-3.5 3-7.5-1zM12 14c1 4 0 7.5-3 7.5s-3-3.5 1-7.5zM10 12c-4 1-7.5 0-7.5-3s3.5-3 7.5 1z"/>',
    ),
  },
  {
    id: "icon-flame",
    name: "Flame",
    type: "icon",
    data: svg(
      '<path fill="currentColor" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6.5 0 2 1 3.5 2.5 3.5C11 8 10.5 5 12 2z"/>',
    ),
  },
]

const topic = (t: string, type: "numeric" | "text", examples: string[]) => ({ id: `t-${t.replace(/[^a-z0-9]+/gi, "-")}`, topic: t, type, examples })

// A topic whose payload is {"value": ...}, read through its field "value".
const jsonTopic = (t: string, type: "numeric" | "text", values: string[]) => ({
  ...topic(t, "text", values.map((v) => JSON.stringify({ value: type === "numeric" ? Number(v) : v }))),
  type: "json" as const,
  subtopics: [{ id: `${topic(t, "text", []).id}-value`, path: "value", type }],
})

const ENERGY_VIEW = "local/energie/view"

const TOPICS = [
  ...[1, 2, 3].flatMap((n) => [
    topic(`${S}dimmer/${n}/level`, "numeric", ["0", "40", "80"]),
    topic(`${S}dimmer/${n}/power`, "text", ["off", "on"]),
    topic(`${S}dimmer/${n}/name`, "text", [["Innenlicht", "Küche", "Einstieg"][n - 1]]),
    topic(`${C}dimmer/${n}`, "text", ["on", "off", "50"]),
  ]),
  ...[1, 2, 3, 4].flatMap((n) => [
    topic(`${S}relay/${n}/power`, "text", ["off", "on"]),
    topic(`${S}relay/${n}/name`, "text", [["Lichterkette", "Aussenlicht", "Grauwasser ablassen", "Wasserpumpe"][n - 1]]),
    topic(`${C}relay/${n}`, "text", ["on", "off"]),
  ]),
  ...[1, 2].flatMap((n) => [
    topic(`${S}tank/${n}/level`, "numeric", n === 1 ? ["80", "40", "10"] : ["35", "70", "95"]),
    topic(`${S}tank/${n}/name`, "text", [["Frischwasser", "Grauwasser"][n - 1]]),
  ]),
  // Pekaway's shunt and solar charger; the battery's watts are the bridge's.
  topic(`${S}battery/soc`, "numeric", ["78", "100", "15"]),
  topic(`${S}battery/voltage`, "numeric", ["13.12", "13.39", "12.48"]),
  topic(`${S}battery/current`, "numeric", ["20.79", "-2.13", "0.00"]),
  topic(`${S}battery/power`, "numeric", ["278", "-28", "0"]),
  // As the author's van has them beside Pekaway (vanpi-custom): the chargers
  // from its BLE bridge as {"value": ...}, the sun and what draws from its
  // Node-RED tab Energie.
  ...["charger", "orion"].flatMap((d) => [
    jsonTopic(`ble/${d}/watts`, "numeric", d === "charger" ? ["394", "0"] : ["620", "0"]),
  ]),
  topic("van/energy/solar_watts", "numeric", ["150", "60", "0"]),
  topic("van/energy/consumers_watts", "numeric", ["6", "92", "180"]),
  // Light or dark for every device at once; the bridge keeps it.
  topic(`${S}theme`, "text", ["light", "dark"]),
  topic(`${C}theme`, "text", ["light", "dark"]),
  // Which look the energy page shows - each display its own, nothing on the
  // broker (a local topic).
  { ...topic(ENERGY_VIEW, "text", ["flow", "sankey"]), local: true, initial: "flow" },
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
  // The water wants attention: grey nearly full, or fresh nearly empty.
  {
    id: "ct-water-alert",
    name: "wasser_achtung",
    mode: "any",
    conditions: [
      { source: { namespace: "topic", path: `${S}tank/2/level` }, op: ">", operand: "80" },
      { source: { namespace: "topic", path: `${S}tank/1/level` }, op: "<", operand: "20" },
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

function onOff(
  x: number,
  y: number,
  read: string,
  write: string,
  labels: [string, string] = ["Aus", "An"],
  values: [string, string] = ["off", "on"],
  size: [number, number] = [220, 60],
  icons: [string, string] | null = null,
) {
  return {
    id: id("switch"),
    type: "switch",
    x,
    y,
    width: size[0],
    height: size[1],
    zIndex: next,
    properties: {
      topic: read,
      writeTopic: write,
      states: [
        { id: values[0], label: labels[0], readValue: values[0], writeValue: values[0], showAsOn: false, ...(icons ? { iconAssetId: icons[0] } : {}) },
        { id: values[1], label: labels[1], readValue: values[1], writeValue: values[1], showAsOn: true, ...(icons ? { iconAssetId: icons[1] } : {}) },
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
    iconLive: {
      id: "lv-wasser-icon",
      source: { namespace: "combined", path: "wasser_achtung" },
      rules: [{ op: "yes", result: { kind: "icon", icon: "icon-drop-alert" } }],
      otherwise: { kind: "icon", icon: "icon-drop" },
    },
    objects: [
      title("Wasser"),
      ...tank(140, 1, "accent"),
      ...tank(300, 2, "accentAlt"),
      name(460, 96, 330, `${S}relay/4/name`),
      onOff(460, 130, `${S}relay/4/power`, `${C}relay/4`),
      name(460, 236, 330, `${S}relay/3/name`),
      onOff(460, 270, `${S}relay/3/power`, `${C}relay/3`, ["Zu", "Offen"]),
    ],
  }
}

const NONE_YET = { kind: "text", parts: ["–"] }
const VALUE = { value: true }
const decimals = (n: number) => ({ kind: "number", decimals: n, grouped: false })

// A value with its unit.
function withUnit(lvId: string, path: string, places: number, unit: string) {
  return { id: lvId, source: { namespace: "topic", path }, format: decimals(places), rules: [], otherwise: { kind: "text", parts: [VALUE, unit] }, noValueYet: NONE_YET }
}

// Energy, as an energy diagram's Flow (docs/2026-10-11-energy-diagram.md):
// across the top what comes in - the sun, the mains, the engine -, below the
// battery and what draws, each a circle on the 12 V bus whose dots run while
// watts flow; the battery's charge as its ring and in %. The demo van's
// numbers add up (the battery's watts are what comes in less what draws), so
// nothing is worked out as a rest.
const WATTS = [{ text: "{watts} W" }]

function energyScreen() {
  const box = { x: 124, y: 66, width: 656, height: 404 }
  const at = (fx: number, fy: number) => ({ x: Math.round(box.width * fx), y: Math.round(box.height * fy) })
  const line = (lvId: string, path: string, places: number, unit: string) => ({ text: `{live:${lvId}}`, liveValues: [withUnit(lvId, path, places, unit)] })
  const diagram = (mode: "flow" | "sankey") => energyDiagram(mode, box, at, line)
  return {
    id: "screen-energie",
    name: "Energie",
    masterScreenId: "master-1",
    iconLive: {
      id: "lv-energie-icon",
      source: { namespace: "topic", path: `${S}battery/soc` },
      rules: [{ op: "<", operand: "20", result: { kind: "icon", icon: "icon-battery-low" } }],
      otherwise: { kind: "icon", icon: "icon-battery" },
    },
    objects: [
      title("Energie"),
      // Flow or Sankey, on this display only: the switch writes a local
      // topic the switcher reads (docs/2026-10-13-local-topics.md).
      // Between the title and the master's light/dark switch (x 604), as a
      // button group: both looks on view, the shown one marked.
      { ...onOff(426, 14, ENERGY_VIEW, ENERGY_VIEW, ["Flow", "Sankey"], ["flow", "sankey"], [172, 48]), type: "button-group", id: id("view") },
      {
        id: id("looks"),
        type: "switcher",
        ...box,
        zIndex: next,
        properties: { topic: ENERGY_VIEW },
        children: (["flow", "sankey"] as const).map((mode) => ({
          id: id(`look-${mode}`),
          type: "panel",
          x: 0,
          y: 0,
          width: box.width,
          height: box.height,
          zIndex: 0,
          properties: { comparisonOperator: "==", comparisonValue: mode },
          children: [diagram(mode)],
        })),
      },
    ],
  }
}

// The energy page's diagram in one of its two looks, as a switcher's panel
// holds it (at the panel's 0,0).
function energyDiagram(mode: "flow" | "sankey", box: { width: number; height: number }, at: (fx: number, fy: number) => { x: number; y: number }, line: (lvId: string, path: string, places: number, unit: string) => any) {
  return {
    id: id(`energy-${mode}`),
    type: "energy-diagram",
    x: 0,
    y: 0,
    width: box.width,
    height: box.height,
    zIndex: next,
    properties: {
      mode,
      motion: true,
      fullScale: 1000,
      fontId: "font-luRS14",
      valueFontId: "font-luRS18",
      nodes: [
        { id: "bus", role: "bus", name: "12 V", ...at(0.5, 0.4) },
        { id: "solar", role: "source", name: "Solar", iconAssetId: "icon-sun", colorRole: "energySun", topic: "van/energy/solar_watts", lines: WATTS, ...at(0.14, 0.16) },
        { id: "landstrom", role: "source", name: "Landstrom", iconAssetId: "icon-plug", colorRole: "energyGrid", topic: "ble/charger/watts#value", lines: WATTS, ...at(0.5, 0.12) },
        { id: "booster", role: "source", name: "Ladebooster", iconAssetId: "icon-engine", colorRole: "energyEngine", topic: "ble/orion/watts#value", lines: WATTS, ...at(0.86, 0.16) },
        {
          id: "batterie",
          role: "storage",
          name: "Batterie",
          iconAssetId: "icon-battery",
          colorRole: "energyCharge",
          topic: `${S}battery/power`,
          chargeTopic: `${S}battery/soc`,
          lines: [{ text: "{watts} W" }, line("soc", `${S}battery/soc`, 0, " %")],
          ...at(0.22, 0.64),
        },
        { id: "verbraucher", role: "sink", name: "Verbraucher", iconAssetId: "icon-load", colorRole: "energyLoad", topic: "van/energy/consumers_watts", lines: WATTS, ...at(0.78, 0.64) },
      ],
    },
  }
}

// A page of a stage still to come: its title and «Coming soon».
function comingSoon(id: string, pageName: string, icon: string) {
  return {
    id,
    name: pageName,
    masterScreenId: "master-1",
    iconAssetId: icon,
    objects: [
      title(pageName),
      {
        id: `obj-soon-${id}`,
        type: "text",
        x: 124,
        y: 200,
        width: 660,
        height: 60,
        zIndex: 2,
        properties: { text: "Coming soon", fontId: "font-fur42", color: "textMuted", textAlign: "center", backgroundColor: "transparent", borderColor: "transparent" },
      },
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
      // Top right on every page: light or dark, for every device at once.
      onOff(fields.screenWidth - 196, 14, `${S}theme`, `${C}theme`, ["Hell", "Dunkel"], ["light", "dark"], [180, 48], ["icon-sun", "icon-moon"]),
    ],
  }
  return {
    name: "Camper",
    screenWidth: fields.screenWidth,
    screenHeight: fields.screenHeight,
    screens: [master, energyScreen(), lightScreen(), waterScreen(), comingSoon("screen-maxxfan", "MaxxFan", "icon-fan"), comingSoon("screen-heizung", "Heizung", "icon-flame")],
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
