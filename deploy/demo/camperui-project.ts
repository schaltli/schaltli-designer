// CamperUI, rebuilt in Schaltli: the eight main pages of CamperUI v1.9.1
// (github.com/NiklasJester/CamperUI, Niklas Jester) for the Waveshare 4" it
// was made for - Home, Dimmer, Power, Wasser, Klima, Temperaturen, MaxxFan,
// Schalter - as cards, from the device's own description, the way
// deploy/demo/camper-project.ts builds the demo's project. Asked for by the
// user on 2026-11-03, after the cards modules, as proof that Schaltli can
// draw what CamperUI draws. The pictures it is held to are in the artifact
// «CamperUI im Vergleich» (read off the 4" on 2026-11-01).
//
// Every value comes from the VanPi bridge (integrations/vanpi/bridge-logic.js,
// schaltli/state/...), except where the van has no such value yet: the
// chargers (as the author's van has them, ble/charger and ble/orion), what
// draws (van/energy/consumers_watts) and the time of day (van/clock/time) -
// see GAPS below.
//
// Colours are CamperUI's own, written as colours rather than theme roles:
// CamperUI is always dark, so the rebuild is too, whatever light or dark the
// bridge says.

import { parseDeviceDescriptionFile, deviceDescriptionToProjectFields } from "@/lib/device-description"
import { declaresTouch } from "@/lib/object-types"
import { DEFAULT_SEPARATORS } from "@/lib/placeholders"
import { styledFont, textScaleOf, type TextStyle } from "@/lib/size-scale"
import type { Project } from "@/components/project-editor"

const S = "schaltli/state/"
const C = "schaltli/cmnd/"

/** What CamperUI shows that this rebuild cannot, and why - for the comparison. */
export const GAPS = [
  "Uhrzeit oben links: Schaltli hat keinen Platzhalter für die Uhrzeit des Geräts; hier aus dem Topic van/clock/time.",
  "Starterbatterie: die VanPi-Brücke meldet keine Spannung der Starterbatterie.",
  "Min/Max der Temperaturen: ein Text kann das Minimum und Maximum eines Verlaufs nicht zeigen.",
  "Liste mit mehr als vier Dimmern oder acht Relais: ein Screen scrollt nicht.",
  "Auswahlliste «Heizen (Temp)»: Schaltli hat keine Ausklappliste; hier als Knopfgruppe.",
  "Name auf einem Schalter: das Label eines Zustands ist fester Text, der Name aus Pekaway kommt nicht hinein.",
]

// CamperUI's colours (read off its screens).
const BG = "#0f1217"
const HEADER = "#13161c"
const CARD = "#1b1e24"
const EDGE = "#2a2e36"
const TEXT = "#f3f5f7"
const MUTED = "#8b95a5"
const BLUE = "#0ea5e9"
const ORANGE = "#f59e0b"
const GREEN = "#22c55e"
const PURPLE = "#a855f7"
const RED = "#ef4444"
const CYAN = "#14b8d6"
const GREY = "#7d8a9a"
const TRACK = "#121a1c"
const KHAKI = "#b8a27a"

// In the seven text sizes since 2026-11-04 (docs/2026-11-04-text-sizes-and-
// colours.md), set by the designer's own rule (lib/size-scale.ts) in the
// 4"'s Humanist typography, Inter like CamperUI's Montserrat: until then
// Inter by hand at 15, 24, 36 and 55 px.
const F = { mini: "mini", small: "standard", large16: "large", medium: "xl", large: "xxl", huge: "huge" } as const
type Size = (typeof F)[keyof typeof F]
let SIZED: Record<string, { textStyle: string; textBold: false; fontId: string; fontSize: number }> = {}
/** A size's properties, its font resolved on this device. */
const sized = (size: Size) => SIZED[size]

const svg = (body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString("base64")}`

// The pages' icons and the few on them, after the Material Design Icons
// CamperUI uses.
export const ASSETS = [
  ["icon-home", "Home", '<path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>'],
  ["icon-bulb", "Bulb", '<path fill="currentColor" d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zM9 21a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9z"/>'],
  ["icon-battery", "Battery", '<path fill="currentColor" d="M16.7 4H15V2H9v2H7.3A1.3 1.3 0 0 0 6 5.3v15.4A1.3 1.3 0 0 0 7.3 22h9.4a1.3 1.3 0 0 0 1.3-1.3V5.3A1.3 1.3 0 0 0 16.7 4z"/>'],
  ["icon-drop", "Drop", '<path fill="currentColor" d="M12 20a6 6 0 0 1-6-6c0-4 6-10.8 6-10.8S18 10 18 14a6 6 0 0 1-6 6z"/>'],
  ["icon-fire", "Fire", '<path fill="currentColor" d="M17.7 11.2c-.2-.3-.5-.6-.7-.9-.7-.6-1.5-1.1-2.2-1.8C13.3 7 13 4.7 13.9 3c-.9.2-1.7.7-2.4 1.3C9 6.2 8 9.4 9.2 12.4l.1.3c0 .1-.1.2-.2.3l-.2.1h-.1a2.7 2.7 0 0 1-.5-.5c-1.1-1.4-1.3-3.4-.6-5.1-1.6 1.3-2.5 3.6-2.4 5.7.1.5.1 1 .3 1.5.1.4.3.9.5 1.3a6.3 6.3 0 0 0 4.4 3.6c1.7.4 3.5.1 4.9-.9a5.5 5.5 0 0 0 2.4-4.9c-.1-.9-.4-1.8-.9-2.6zm-2.8 5.6c-.3.3-.7.5-1.1.6-1.4.5-2.8-.2-3.6-1 1.5-.4 2.4-1.5 2.6-2.6.2-1-.2-1.8-.3-2.8-.2-.9-.1-1.7.2-2.5.2.5.5.9.8 1.3.9 1.2 2.4 1.8 2.7 3.4v.5c0 1-.4 2.1-1.3 2.9z"/>'],
  ["icon-thermometer", "Thermometer", '<path fill="currentColor" d="M15 13V5a3 3 0 0 0-6 0v8a5 5 0 1 0 6 0zm-3-9a1 1 0 0 1 1 1v3h-2V5a1 1 0 0 1 1-1z"/>'],
  ["icon-fan", "Fan", '<path fill="currentColor" d="M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm.5-9C17 2 17.1 5.6 14.7 6.8c-1 .5-1.4 1.4-1.6 2.3.5.2.9.5 1.2.9 3.7-2 7.7-1.2 7.7 2.5 0 4.5-3.6 4.6-4.8 2.2-.5-1-1.4-1.4-2.3-1.6-.2.5-.5.9-.9 1.2 2 3.7 1.2 7.7-2.5 7.7-4.5 0-4.6-3.6-2.2-4.8 1-.5 1.4-1.4 1.6-2.3-.5-.2-.9-.5-1.2-.9-3.7 2-7.7 1.2-7.7-2.5 0-4.5 3.6-4.6 4.8-2.2.5 1 1.4 1.4 2.3 1.6.2-.5.5-.9.9-1.2-2-3.7-1.2-7.7 2.5-7.7z"/>'],
  ["icon-toggle", "Toggle", '<path fill="currentColor" d="M17 7H7a5 5 0 0 0 0 10h10a5 5 0 0 0 0-10zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>'],
  ["icon-bolt", "Bolt", '<path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z"/>'],
  ["icon-power", "Power", '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 3v8M7.5 6.3a7 7 0 1 0 9 0"/>'],
  ["icon-home-small", "Home small", '<path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>'],
  ["icon-battery-flat", "Battery flat", '<path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 8h16v8H3z"/><path fill="currentColor" d="M20 10.5h2v3h-2zM5 10h9v4H5z"/>'],
  ["icon-stethoscope", "Diagnosis", '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 3H5v6a4 4 0 0 0 8 0V3h-1M9 13v2a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="11" r="2" fill="currentColor"/>'],
  ["icon-roof", "Roof vent", '<path fill="none" stroke="currentColor" stroke-width="1.4" d="M2 17h20v2H2zM4 14l2-3h12l2 3z"/><path stroke="currentColor" stroke-width="1" d="M8 11.5l-.6 2.2M11 11.5l-.3 2.2M14 11.5v2.2M17 11.5l.4 2.2"/>'],
].map(([id, name, body]) => ({ id, name, type: "icon", data: svg(body) }))

const topic = (t: string, type: "numeric" | "text", examples: string[]) => ({ id: `t-${t.replace(/[^a-z0-9]+/gi, "-")}`, topic: t, type, examples })
const jsonTopic = (t: string, values: string[]) => ({
  ...topic(t, "text", values.map((v) => JSON.stringify({ value: Number(v) }))),
  type: "json" as const,
  subtopics: [{ id: `${topic(t, "text", []).id}-value`, path: "value", type: "numeric" }],
})

// The values CamperUI's demo shows, first, so the designer draws the same.
const DIMMERS = [
  ["Deckenlampe", "75"],
  ["Kueche", "40"],
  ["Leselicht", "0"],
  ["Dimmer 4", "0"],
]
const RELAYS = ["Licht Bank", "Kuehlschrank", "Wasserpumpe", "Abwasserventil", "Relais 5", "Relais 6", "Relais 7", "Relais 8"]
const RELAYS_ON = new Set([1, 3])

const TOPICS = [
  topic("van/clock/time", "text", ["18:30"]),
  topic(`${S}battery/soc`, "numeric", ["92", "40"]),
  topic(`${S}battery/voltage`, "numeric", ["13.5", "12.6"]),
  topic(`${S}battery/current`, "numeric", ["19.3", "-4.1"]),
  topic(`${S}battery/power`, "numeric", ["261.5", "-52"]),
  topic(`${S}mppt/pv_watts`, "numeric", ["220", "0"]),
  topic(`${S}mppt/pv_volts`, "numeric", ["18.3", "0"]),
  topic(`${S}mppt/pv_amps`, "numeric", ["12.0", "0"]),
  jsonTopic("ble/charger/watts", ["326", "0"]),
  jsonTopic("ble/orion/watts", ["216", "0"]),
  topic("van/energy/consumers_watts", "numeric", ["0", "92"]),
  ...[1, 2].flatMap((n) => [
    topic(`${S}temp/${n}/value`, "numeric", n === 1 ? ["22.4", "21.0"] : ["14.6", "9.0"]),
    topic(`${S}temp/${n}/name`, "text", [n === 1 ? "Innen" : "Aussen"]),
  ]),
  ...[1, 2].flatMap((n) => [
    topic(`${S}tank/${n}/level`, "numeric", n === 1 ? ["68", "20"] : ["32", "85"]),
    topic(`${S}tank/${n}/name`, "text", [n === 1 ? "Frischwasser" : "Grauwasser"]),
  ]),
  ...DIMMERS.flatMap(([name, level], i) => [
    topic(`${S}dimmer/${i + 1}/level`, "numeric", [level, "100"]),
    topic(`${S}dimmer/${i + 1}/name`, "text", [name]),
    topic(`${C}dimmer/${i + 1}`, "text", ["50"]),
  ]),
  ...RELAYS.flatMap((name, i) => [
    topic(`${S}relay/${i + 1}/power`, "text", [RELAYS_ON.has(i + 1) ? "on" : "off", RELAYS_ON.has(i + 1) ? "off" : "on"]),
    topic(`${S}relay/${i + 1}/name`, "text", [name]),
    topic(`${C}relay/${i + 1}`, "text", ["on", "off"]),
  ]),
  topic(`${S}heater/power`, "text", ["on", "off"]),
  topic(`${S}heater/view`, "text", ["heat_temperature", "off"]),
  topic(`${S}heater/target`, "numeric", ["22"]),
  topic(`${S}heater/state_text`, "text", ["Heizt", "Aus"]),
  topic(`${C}heater`, "text", ["off", "heat"]),
  topic(`${C}heater/target`, "numeric", ["22"]),
  topic(`${S}maxxfan/mode`, "text", ["off", "manual", "auto"]),
  topic(`${S}maxxfan/cover`, "text", ["closed", "open"]),
  topic(`${C}maxxfan/mode`, "text", ["off", "fan_only", "auto"]),
  topic(`${C}maxxfan/cover`, "text", ["open", "closed"]),
]

let next = 1
const id = (what: string) => `obj-${what}-${next++}`

const NONE = { kind: "text", parts: ["–"] }
const VALUE = { value: true }

/** A text, in one of the four sizes, its colour and alignment; `live` binds {live:…} parts. */
function text(x: number, y: number, width: number, height: number, content: string, font: Size, color: string, align = "left", live: any[] = []) {
  return {
    id: id("text"),
    type: "text",
    x,
    y,
    width,
    height,
    zIndex: next,
    properties: {
      text: content,
      ...(live.length ? { liveValues: live } : {}),
      ...sized(font),
      color,
      textAlign: align,
      backgroundColor: "transparent",
      borderColor: "transparent",
    },
  }
}

/** A live value: a topic's number with `places` decimals, and what follows it. */
function num(lvId: string, path: string, places: number, after = "") {
  return { id: lvId, source: { namespace: "topic", path }, format: { kind: "number", decimals: places, grouped: false }, rules: [], otherwise: { kind: "text", parts: [VALUE, after] }, noValueYet: NONE }
}
/** A number with its sign, + while positive, as CamperUI writes the battery's flow. */
function signed(lvId: string, path: string, places: number, after: string) {
  return { ...num(lvId, path, places, after), rules: [{ op: ">", operand: "0", result: { kind: "text", parts: ["+", VALUE, after] } }] }
}
/** A live value shown as it comes. */
function plain(lvId: string, path: string) {
  return { id: lvId, source: { namespace: "topic", path }, rules: [], noValueYet: NONE }
}

/** A card: CamperUI's panel - a shade off the screen, a thin edge, round corners - holding `children` at its own 0,0. */
function card(x: number, y: number, width: number, height: number, children: any[], edge = EDGE, radius = 10) {
  return {
    id: id("card"),
    type: "free",
    x,
    y,
    width,
    height,
    zIndex: next,
    properties: { fillColor: CARD, strokeColor: edge, strokeWidth: 1, cornerRadius: radius, clipContents: true },
    children,
  }
}

function icon(x: number, y: number, size: number, asset: string, color: string) {
  return { id: id("icon"), type: "icon", x, y, width: size, height: size, zIndex: next, properties: { assetId: asset, iconColor: color, backgroundColor: "transparent" } }
}

function box(x: number, y: number, width: number, height: number, fill: string, radius = 0) {
  return { id: id("box"), type: "box", x, y, width, height, zIndex: next, properties: { fillColor: fill, strokeColor: "", strokeWidth: 0, cornerRadius: radius } }
}

function line(x1: number, y1: number, x2: number, y2: number, color: string, width = 2) {
  return {
    id: id("line"),
    type: "line",
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(1, Math.abs(x2 - x1)),
    height: Math.max(1, Math.abs(y2 - y1)),
    zIndex: next,
    properties: { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color, strokeWidth: width, strokeStyle: "solid" },
  }
}

const LINEAR = (max: number) => [
  { value: 0, barSizePercent: 0 },
  { value: max, barSizePercent: 100 },
]

/** A ring with its percentage inside: CamperUI's gauges on Power. */
function ring(x: number, y: number, size: number, path: string, max: number, color: string, thickness: number, font: Size) {
  return {
    id: id("ring"),
    type: "gauge",
    x,
    y,
    width: size,
    height: size,
    zIndex: next,
    properties: {
      topic: path,
      minAngle: 225,
      maxAngle: 135,
      direction: "cw",
      thickness,
      backgroundColor: "transparent",
      trackColor: "#2a2e36",
      fillColor: color,
      displayValue: "percentage",
      calibrationPoints: LINEAR(max),
      textColor: color,
      ...sized(font),
    },
  }
}

/**
 * A relay as CamperUI's big tile: its name on it, coloured while on, a tap
 * switching it. A switch draws a knob and a button group its segments, so
 * the tile is composed: a switcher on the relay's state, and in each panel a
 * button in that state's colour sending the other state. Its corners are
 * the project's button radius (1.5 mm, CamperUI's 10 px).
 */
function relayTile(x: number, y: number, width: number, height: number, n: number, onColor = GREEN, words: [string, string] = ["", ""]) {
  const name = RELAYS[n - 1]
  return stateTile(x, y, width, height, `${S}relay/${n}/power`, `${C}relay/${n}`, [
    { state: "off", label: `${name}${words[0]}`, color: CARD, send: "on" },
    { state: "on", label: `${name}${words[1]}`, color: onColor, send: "off" },
  ])
}

/** A tile per state of `read`: a button in that state's colour and label, sending what switches it. */
function stateTile(x: number, y: number, width: number, height: number, read: string, write: string, states: { state: string; label: string; color: string; send: string }[]) {
  return {
    id: id("tiles"),
    type: "switcher",
    x,
    y,
    width,
    height,
    zIndex: next,
    properties: { topic: read },
    children: states.map((st) => ({
      id: id(`panel-${st.state}`),
      type: "panel",
      x: 0,
      y: 0,
      width,
      height,
      zIndex: 0,
      properties: { comparisonOperator: "==", comparisonValue: st.state },
      children: [
        {
          id: id("tile"),
          type: "button",
          x: 0,
          y: 0,
          width,
          height,
          zIndex: 1,
          properties: {
            text: st.label,
            buttonStyle: "filled",
            buttonColor: st.color,
            ...sized(F.medium),
            action: { type: "send-mqtt", mqttTopic: write, mqttMessage: st.send },
          },
        },
      ],
    })),
  }
}

// ---- The master: the bar at the top, the navigator at the bottom ----

function master(width: number, height: number) {
  return {
    id: "master-1",
    name: "Master",
    isMaster: true,
    // Inter, as CamperUI's Montserrat: the sizes' fonts are this typography's.
    typography: "Humanist",
    backgroundColor: BG,
    objects: [
      box(0, 0, width, 40, HEADER),
      box(0, 39, width, 1, "#22262d"),
      text(20, 8, 90, 26, "{live:clock}", F.small, TEXT, "left", [plain("clock", "van/clock/time")]),
      icon(272, 10, 18, "icon-fire", RED),
      text(304, 8, 82, 26, "IN: {live:inside}", F.small, TEXT, "left", [num("inside", `${S}temp/1/value`, 1, " C")]),
      icon(386, 9, 20, "icon-battery", BLUE),
      text(410, 8, 60, 26, "{live:soc}", F.small, TEXT, "left", [num("soc", `${S}battery/soc`, 0, "%")]),
      {
        id: "obj-navigator",
        type: "navigator",
        x: 0,
        y: height - 64,
        width,
        height: 64,
        zIndex: 100,
        properties: {
          edge: "bottom",
          shows: "icons",
          fontId: sized(F.small).fontId,
          backgroundColor: HEADER,
          borderColor: "#22262d",
          textColor: GREY,
          activeColor: BLUE,
          activeTextColor: "#ffffff",
        },
      },
    ],
  }
}

const page = (pageId: string, name: string, icon: string, objects: any[]) => ({ id: pageId, name, masterScreenId: "master-1", iconAssetId: icon, backgroundColor: BG, objects })

// ---- Home ----

function home() {
  return page("screen-home", "Home", "icon-home", [
    relayTile(8, 48, 228, 56, 1, BLUE, [" AUS", " EIN"]),
    relayTile(244, 48, 228, 56, 3, BLUE, [" AUS", " EIN"]),
    card(8, 112, 228, 70, [text(12, 8, 200, 20, "{live:n1}", F.mini, TEXT, "left", [plain("n1", `${S}temp/1/name`)]), text(12, 30, 200, 30, "{live:t1}", F.medium, TEXT, "left", [num("t1", `${S}temp/1/value`, 1, " C")])]),
    card(244, 112, 228, 70, [text(12, 8, 200, 20, "{live:n2}", F.mini, TEXT, "left", [plain("n2", `${S}temp/2/name`)]), text(12, 30, 200, 30, "{live:t2}", F.medium, TEXT, "left", [num("t2", `${S}temp/2/value`, 1, " C")])]),
    card(8, 190, 228, 122, [
      text(12, 10, 200, 22, "Batterie {live:bsoc}", F.large16, BLUE, "left", [num("bsoc", `${S}battery/soc`, 0, "%")]),
      text(12, 34, 210, 42, "{live:bw}", F.large, ORANGE, "left", [num("bw", `${S}battery/power`, 1, " W")]),
      text(12, 74, 210, 28, "{live:bv}  {live:ba}", F.large16, TEXT, "left", [num("bv", `${S}battery/voltage`, 1, " V"), num("ba", `${S}battery/current`, 1, " A")]),
    ]),
    card(244, 190, 228, 122, [
      text(12, 10, 200, 22, "Solar", F.large16, TEXT),
      text(12, 34, 210, 42, "{live:sw}", F.large, ORANGE, "left", [num("sw", `${S}mppt/pv_watts`, 0, " W")]),
      text(12, 74, 210, 28, "{live:sv}  {live:sa}", F.large16, TEXT, "left", [num("sv", `${S}mppt/pv_volts`, 1, " V"), num("sa", `${S}mppt/pv_amps`, 1, " A")]),
      text(12, 98, 210, 20, "PV-Leistung", F.mini, TEXT),
    ]),
    card(8, 320, 464, 60, [
      text(12, 6, 280, 26, "{live:fn}", F.large16, TEXT, "left", [plain("fn", `${S}tank/1/name`)]),
      text(330, 6, 120, 26, "{live:fl}", F.medium, TEXT, "right", [num("fl", `${S}tank/1/level`, 0, "%")]),
      {
        id: id("bar"),
        type: "bar",
        x: 12,
        y: 38,
        width: 440,
        height: 10,
        zIndex: next,
        properties: { topic: `${S}tank/1/level`, barDirection: "left-to-right", calibrationPoints: LINEAR(100), displayValue: "none", thickness: 10, fillColor: CYAN, trackColor: TRACK },
      },
    ]),
  ])
}

// ---- Home again, with tables: no coordinate but the table's own ----

/*
 * The same Home as home(), asked for by the user on 2026-11-04 to see how
 * near Schaltli's tables come: CamperUI places its cards by a computed grid
 * (column × (width + 8), 8 px margins) and the texts inside them by hand.
 * Here one table holds the cards - two equal columns across 464 px, an
 * 8 px gap - and each card a one-column table of its texts, docked to fill
 * its padding. What this needs that tables do not give is listed in
 * TABLE_GAPS.
 */

/** Where the table version of Home is not like the hand-placed one, and why. */
export const TABLE_GAPS = [
  "Kartenhöhe: eine Karte wächst nicht mit ihrem Inhalt, ihre Höhe ist von Hand gesetzt; die Zeile nimmt die höchste.",
  "Innenabstand: ein Wert für alle vier Seiten; CamperUI hat 12 px links und 8 bis 10 px oben.",
  "Abstand zwischen angedockten Objekten: fest 1,5 mm; darum steht in der Karte eine Tabelle mit eigenem Abstand statt gedockter Texte.",
  "Zu wenig Platz: ist die Tabelle in einer Karte auch nur 2 px höher als ihr Inneres, fällt sie ganz weg (dockedOut) und die Karte ist leer.",
]

/** An object in a table's cell, standing there by `anchor`. */
const inCell = (obj: any, row: number, column: number, extra: Record<string, unknown> = {}) => ({
  ...obj,
  properties: { ...obj.properties, cell: { row, column, ...extra } },
})

/** A text for a cell: no position, its height the line's, its width what it may take. */
const cellText = (row: number, column: number, height: number, content: string, font: Size, color: string, live: any[] = [], align = "left", anchor?: Record<string, string>) =>
  inCell(text(0, 0, 200, height, content, font, color, align, live), row, column, anchor ? { anchor } : {})

/** A card with its contents in a table of rows: padding `padMm`, the rows `gapMm` apart. */
function tableCard(height: number, rows: any[], padMm: number, gapMm: number, columns = 1) {
  const c = card(0, 0, 200, height, [
    {
      id: id("rows"),
      type: "table",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      zIndex: next,
      properties: { grid: 1, columns: Array.from({ length: columns }, () => ({})), rows: [], gapMm, dock: "fill" },
      children: rows,
    },
  ])
  return { ...c, properties: { ...c.properties, padding: padMm } }
}

function homeWithTables(pixelsPerMm: number) {
  const mm = (px: number) => px / pixelsPerMm
  const PAD = mm(10)
  const ROW_GAP = 0
  const stretch = { anchor: { x: "stretch", y: "stretch" } }
  const tank = {
    id: id("bar"),
    type: "bar",
    x: 0,
    y: 0,
    width: 200,
    height: 10,
    zIndex: next,
    properties: { topic: `${S}tank/1/level`, barDirection: "left-to-right", calibrationPoints: LINEAR(100), displayValue: "none", thickness: 10, fillColor: CYAN, trackColor: TRACK },
  }
  const grid = {
    id: id("home-grid"),
    type: "table",
    x: 8,
    y: 48,
    width: 464,
    height: 1,
    zIndex: next,
    properties: { grid: 1, gapMm: mm(8), widthMm: mm(464), equalColumns: true, columns: [{}, {}], rows: [] },
    children: [
      inCell(relayTile(0, 0, 228, 56, 1, BLUE, [" AUS", " EIN"]), 0, 0, { anchor: { x: "stretch" } }),
      inCell(relayTile(0, 0, 228, 56, 3, BLUE, [" AUS", " EIN"]), 0, 1, { anchor: { x: "stretch" } }),
      ...[1, 2].map((n, i) =>
        inCell(
          tableCard(
            70,
            [
              cellText(0, 0, 18, `{live:hn${n}}`, F.mini, TEXT, [plain(`hn${n}`, `${S}temp/${n}/name`)]),
              cellText(1, 0, 30, `{live:ht${n}}`, F.medium, TEXT, [num(`ht${n}`, `${S}temp/${n}/value`, 1, " C")]),
            ],
            PAD,
            ROW_GAP,
          ),
          1,
          i,
          stretch,
        ),
      ),
      inCell(
        tableCard(
          122,
          [
            cellText(0, 0, 20, "Batterie {live:hbsoc}", F.large16, BLUE, [num("hbsoc", `${S}battery/soc`, 0, "%")]),
            cellText(1, 0, 40, "{live:hbw}", F.large, ORANGE, [num("hbw", `${S}battery/power`, 1, " W")]),
            cellText(2, 0, 26, "{live:hbv}  {live:hba}", F.large16, TEXT, [num("hbv", `${S}battery/voltage`, 1, " V"), num("hba", `${S}battery/current`, 1, " A")]),
          ],
          PAD,
          ROW_GAP,
        ),
        2,
        0,
        stretch,
      ),
      inCell(
        tableCard(
          122,
          [
            cellText(0, 0, 20, "Solar", F.large16, TEXT),
            cellText(1, 0, 38, "{live:hsw}", F.large, ORANGE, [num("hsw", `${S}mppt/pv_watts`, 0, " W")]),
            cellText(2, 0, 26, "{live:hsv}  {live:hsa}", F.large16, TEXT, [num("hsv", `${S}mppt/pv_volts`, 1, " V"), num("hsa", `${S}mppt/pv_amps`, 1, " A")]),
            cellText(3, 0, 18, "PV-Leistung", F.mini, TEXT),
          ],
          PAD,
          ROW_GAP,
        ),
        2,
        1,
        stretch,
      ),
      inCell(
        tableCard(
          60,
          [
            cellText(0, 0, 26, "{live:hfn}", F.large16, TEXT, [plain("hfn", `${S}tank/1/name`)]),
            cellText(0, 1, 26, "{live:hfl}", F.medium, TEXT, [num("hfl", `${S}tank/1/level`, 0, "%")], "right", { x: "right" }),
            inCell(tank, 1, 0, { columnSpan: 2, anchor: { x: "stretch" } }),
          ],
          PAD,
          mm(4),
          2,
        ),
        3,
        0,
        { columnSpan: 2, ...stretch },
      ),
    ],
  }
  return page("screen-home", "Home", "icon-home", [grid])
}

// ---- Dimmer ----

function dimmerRow(y: number, n: number) {
  return card(20, y, 440, 78, [
    text(16, 24, 128, 30, `{live:dn${n}}`, F.medium, TEXT, "left", [plain(`dn${n}`, `${S}dimmer/${n}/name`)]),
    {
      id: id("slider"),
      type: "slider",
      x: 146,
      y: 22,
      width: 226,
      height: 34,
      zIndex: next,
      properties: {
        topic: `${S}dimmer/${n}/level`,
        writeTopic: `${C}dimmer/${n}`,
        step: 5,
        barDirection: "left-to-right",
        calibrationPoints: LINEAR(100),
        displayValue: "none",
        thickness: 34,
        fillColor: n === 1 ? ORANGE : KHAKI,
        trackColor: TRACK,
      },
    },
    text(380, 24, 52, 30, `{live:dl${n}}`, F.medium, n === 1 ? ORANGE : KHAKI, "right", [
      {
        id: `dl${n}`,
        source: { namespace: "topic", path: `${S}dimmer/${n}/level` },
        format: { kind: "number", decimals: 0, grouped: false },
        rules: [{ op: "==", operand: "0", result: { kind: "text", parts: ["Aus"] } }],
        otherwise: { kind: "text", parts: [VALUE, "%"] },
        noValueYet: NONE,
      },
    ]),
  ])
}

function dimmer() {
  return page("screen-dimmer", "Dimmer", "icon-bulb", [dimmerRow(48, 1), dimmerRow(136, 2), dimmerRow(224, 3), dimmerRow(312, 4)])
}

// ---- Power ----

function source(x: number, name: string, color: string, watts: string, sub: any[], subText: string, max: number) {
  return card(x, 50, 140, 74, [
    text(8, 6, 92, 20, name, F.small, color),
    text(8, 26, 92, 30, "{live:w}", F.medium, color, "left", [num("w", watts, 0, " W")]),
    text(8, 54, 96, 18, subText, F.small, MUTED, "left", sub),
    ring(86, 12, 50, watts, max, color, 6, F.small),
  ])
}

function power() {
  return page("screen-power", "Power", "icon-battery", [
    source(20, "Solar", ORANGE, `${S}mppt/pv_watts`, [num("pv", `${S}mppt/pv_volts`, 1, "V"), num("pa", `${S}mppt/pv_amps`, 1, "A")], "{live:pv}  {live:pa}", 250),
    source(170, "Landstrom", BLUE, "ble/charger/watts#value", [], "230V", 500),
    source(320, "Lichtmasch.", PURPLE, "ble/orion/watts#value", [], "14.2V", 300),
    // The lines into the battery.
    line(90, 124, 90, 146, GREEN),
    line(90, 146, 170, 164, GREEN),
    line(240, 124, 240, 164, GREEN),
    line(390, 124, 390, 146, GREEN),
    line(390, 146, 310, 164, GREEN),
    card(46, 164, 388, 132, [
      ring(14, 14, 104, `${S}battery/soc`, 100, BLUE, 12, F.large),
      icon(134, 18, 18, "icon-battery-flat", MUTED),
      text(158, 16, 200, 22, "Batterie", F.small, MUTED),
      text(134, 42, 250, 42, "{live:bp}  {live:bc}", F.large, GREEN, "left", [signed("bp", `${S}battery/power`, 0, " W"), signed("bc", `${S}battery/current`, 1, " A")]),
      text(134, 88, 200, 22, "{live:bvv}", F.small, MUTED, "left", [num("bvv", `${S}battery/voltage`, 1, " V")]),
    ], GREEN, 14),
    line(240, 296, 240, 336, "#3a3f48"),
    card(60, 336, 360, 74, [
      icon(16, 26, 22, "icon-power", ORANGE),
      text(46, 24, 160, 28, "Verbraucher", F.medium, TEXT),
      text(220, 10, 124, 30, "{live:cw}", F.medium, MUTED, "right", [num("cw", "van/energy/consumers_watts", 0, " W")]),
      text(150, 44, 194, 22, "{live:charging}", F.small, GREEN, "right", [
        {
          id: "charging",
          source: { namespace: "topic", path: `${S}battery/power` },
          rules: [{ op: ">", operand: "0", result: { kind: "text", parts: ["Wird geladen"] } }],
          otherwise: { kind: "text", parts: ["Entlädt"] },
          noValueYet: NONE,
        },
      ]),
    ], EDGE, 12),
  ])
}

// ---- Wasser ----

function tankColumn(x: number, n: number, color: string) {
  return [
    text(x - 40, 22, 160, 26, `{live:tn${n}}`, F.medium, TEXT, "center", [plain(`tn${n}`, `${S}tank/${n}/name`)]),
    {
      id: id("tank"),
      type: "bar",
      x,
      y: 56,
      width: 80,
      height: 200,
      zIndex: next,
      properties: { topic: `${S}tank/${n}/level`, barDirection: "bottom-to-top", calibrationPoints: LINEAR(100), displayValue: "none", thickness: 80, fillColor: color, trackColor: "#0f1514" },
    },
    text(x - 40, 262, 160, 26, `{live:tl${n}}`, F.medium, TEXT, "center", [num(`tl${n}`, `${S}tank/${n}/level`, 0, "%")]),
    text(x - 40, 288, 160, 22, `{live:tli${n}}`, F.small, MUTED, "center", [num(`tli${n}`, `${S}tank/${n}/level`, 0, " / 100 L")]),
  ]
}

function water() {
  return page("screen-wasser", "Wasser", "icon-drop", [card(20, 50, 440, 356, [...tankColumn(76, 1, CYAN), ...tankColumn(284, 2, GREY)], EDGE, 14)])
}

// ---- Klima (Autoterm) ----

function climate() {
  return page("screen-klima", "Klima", "icon-fire", [
    card(20, 50, 150, 58, [icon(12, 8, 14, "icon-home-small", MUTED), text(30, 5, 100, 20, "Außen", F.small, MUTED), text(12, 26, 130, 28, "{live:ka}", F.medium, TEXT, "left", [num("ka", `${S}temp/2/value`, 1, " C")])]),
    {
      id: id("modes"),
      type: "button-group",
      x: 236,
      y: 50,
      width: 224,
      height: 58,
      zIndex: next,
      properties: {
        topic: `${S}heater/power`,
        writeTopic: `${C}heater`,
        states: [
          { id: "off", label: "Aus", readValue: "off", writeValue: "off" },
          { id: "heat", label: "Heizen", readValue: "on", writeValue: "heat" },
        ],
        switchStyle: "filled",
        switchColor: BLUE,
        ...sized(F.small),
      },
    },
    {
      id: id("target"),
      type: "dial",
      x: 120,
      y: 108,
      width: 240,
      height: 240,
      zIndex: next,
      properties: {
        topic: `${S}heater/target`,
        writeTopic: `${C}heater/target`,
        step: 1,
        minAngle: 225,
        maxAngle: 135,
        direction: "cw",
        thickness: 16,
        backgroundColor: "transparent",
        trackColor: "#1a1d22",
        fillColor: "#7b7fa6",
        displayValue: "none",
        calibrationPoints: [
          { value: 12, barSizePercent: 0 },
          { value: 30, barSizePercent: 100 },
        ],
        textColor: TEXT,
        ...sized(F.large),
      },
    },
    text(140, 186, 200, 44, "{live:ki}", F.large, TEXT, "center", [num("ki", `${S}temp/1/value`, 1, " C")]),
    text(140, 232, 200, 24, "Ziel: {live:kz}", F.small, MUTED, "center", [num("kz", `${S}heater/target`, 0, " C")]),
    text(140, 318, 200, 24, "{live:ks}", F.small, ORANGE, "center", [plain("ks", `${S}heater/state_text`)]),
    {
      id: id("stop"),
      type: "button",
      x: 110,
      y: 352,
      width: 260,
      height: 54,
      zIndex: next,
      properties: { text: "Stop", buttonStyle: "filled", buttonColor: RED, ...sized(F.medium), action: { type: "send-mqtt", mqttTopic: `${C}heater`, mqttMessage: "off" } },
    },
    card(382, 352, 54, 54, [icon(13, 13, 28, "icon-stethoscope", BLUE)], EDGE, 10),
  ])
}

// ---- Temperaturen ----

function tempCard(x: number, n: number, color: string) {
  return card(x, 50, 212, 58, [
    box(8, 8, 4, 42, color, 2),
    text(20, 4, 120, 22, `{live:tn${n}}`, F.small, TEXT, "left", [plain(`tn${n}`, `${S}temp/${n}/name`)]),
    text(20, 24, 140, 32, `{live:tv${n}}`, F.medium, color, "left", [num(`tv${n}`, `${S}temp/${n}/value`, 1, " C")]),
  ])
}

function temps() {
  return { ...page("screen-temps", "Temperaturen", "icon-thermometer", [
    tempCard(20, 2, BLUE),
    tempCard(244, 1, GREEN),
    card(20, 118, 440, 290, [
      {
        id: id("chart"),
        type: "chart",
        x: 8,
        y: 10,
        width: 424,
        height: 270,
        zIndex: next,
        properties: {
          mode: "time",
          scroll: false,
          legend: "none",
          fontId: sized(F.small).fontId,
          dateFontId: sized(F.small).fontId,
          textColor: MUTED,
          mutedColor: MUTED,
          lineColor: "#2a2e36",
          nowColor: "#2a2e36",
          left: { scale: "fixed", min: 12, max: 24, unit: "C" },
          series: [
            { id: "s-in", source: { kind: "topic", topic: `${S}temp/1/value` }, name: "Innen", valueKind: "level", unit: "C", draw: "line", color: GREEN },
            { id: "s-out", source: { kind: "topic", topic: `${S}temp/2/value` }, name: "Außen", valueKind: "level", unit: "C", draw: "line", color: BLUE },
          ],
        },
      },
    ], EDGE, 12),
  ]), timeRange: "1h" }
}

// ---- MaxxFan ----

function maxxfan() {
  return page("screen-maxxfan", "MaxxFan", "icon-fan", [
    {
      id: id("fanmodes"),
      type: "button-group",
      x: 8,
      y: 48,
      width: 464,
      height: 72,
      zIndex: next,
      properties: {
        topic: `${S}maxxfan/mode`,
        writeTopic: `${C}maxxfan/mode`,
        states: [
          { id: "off", label: "Aus", readValue: "off", writeValue: "off" },
          { id: "manual", label: "Manuell", readValue: "manual", writeValue: "fan_only" },
          { id: "auto", label: "Auto", readValue: "auto", writeValue: "auto" },
        ],
        switchStyle: "filled",
        switchColor: RED,
        ...sized(F.medium),
      },
    },
    stateTile(8, 144, 464, 76, `${S}maxxfan/cover`, `${C}maxxfan/cover`, [
      { state: "closed", label: "Dachhaube Zu", color: CARD, send: "open" },
      { state: "open", label: "Dachhaube Offen", color: BLUE, send: "closed" },
    ]),
    icon(176, 248, 128, "icon-roof", "#9fb3c8"),
  ])
}

// ---- Schalter ----

function switches() {
  const tiles = []
  for (let i = 0; i < 8; i++) tiles.push(relayTile(i % 2 === 0 ? 20 : 248, 48 + Math.floor(i / 2) * 92, 212, 84, i + 1))
  return page("screen-schalter", "Schalter", "icon-toggle", tiles)
}

/** The project, from the 4"'s description (a DDF zip); `homeWithTables` puts in the Home laid out by tables. */
export async function buildCamperUiProject(ddfZip: Uint8Array, options: { homeWithTables?: boolean } = {}) {
  next = 1
  const parsed = await parseDeviceDescriptionFile(Buffer.from(ddfZip))
  const fields = deviceDescriptionToProjectFields(parsed, Buffer.from(ddfZip).toString("base64"))
  // Each size's font on this device, in Humanist (Inter) as CamperUI's
  // Montserrat; resolved once, before any page is built.
  const scale = textScaleOf({ pixelsPerMm: fields.pixelsPerMm, typographies: fields.typographies }, "Humanist")!
  SIZED = Object.fromEntries(
    Object.values(F).map((size) => {
      const f = styledFont(size as TextStyle, false, scale, fields.fonts)!
      return [size, { textStyle: size, textBold: false as const, fontId: f.fontId, fontSize: f.fontSize }]
    }),
  )
  const homePage = options.homeWithTables ? homeWithTables(fields.pixelsPerMm ?? 6.73) : home()
  const project = {
    name: "CamperUI nachgebaut",
    screenWidth: fields.screenWidth,
    screenHeight: fields.screenHeight,
    screens: [master(fields.screenWidth, fields.screenHeight), homePage, dimmer(), power(), water(), climate(), temps(), maxxfan(), switches()],
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
      // CamperUI's tiles have 10 px corners on the 4": 1.5 mm
      // (docs/2026-11-04-native-buttons.md, module button-radius).
      cards: { buttonRadiusMm: 1.5 },
    },
    topics: TOPICS,
    combinedTopics: [],
    nextId: next + 1,
  }
  return project as unknown as Project
}
