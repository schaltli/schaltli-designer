// CamperUI, rebuilt in Schaltli: the eight main pages of CamperUI v1.9.1
// (github.com/NiklasJester/CamperUI, Niklas Jester) for the Waveshare 4" it
// was made for - Home, Dimmer, Power, Wasser, Klima, Temperaturen, MaxxFan,
// Schalter - as cards, from the device's own description, the way
// deploy/demo/camper-project.ts builds the demo's project. Asked for by the
// user on 2026-11-03, after the cards modules, as proof that Schaltli can
// draw what CamperUI draws. The pictures it is held to are in the artifact
// «CamperUI im Vergleich» (read off the 4" on 2026-11-01).
//
// Built anew on 2026-11-04 (the user): every page laid out by tables, the
// cards with the project's card look, every colour a role of the Slate theme.
//
// Every value comes from the VanPi bridge (integrations/vanpi/bridge-logic.js,
// schaltli/state/...), except where the van has no such value yet: the
// chargers (as the author's van has them, ble/charger and ble/orion), what
// draws (van/energy/consumers_watts) and the time of day (van/clock/time) -
// see GAPS below.

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

// ---- Colours: the Slate theme's roles ----

// CamperUI's colours as roles of Slate (lib/themes.ts), the theme made after
// CamperUI's model: its master names Slate, and no colour is a hex. Until
// 2026-11-04 the rebuild wrote CamperUI's hex values and named no theme; the
// designer took it for a project from before themes and matched every hex to
// the nearest role of the old Lavender (migrateColorsToRoles), so it opened
// in Lavender's purples. With roles it is CamperUI's dark on a dark installation
// and Slate's light on a light one.
const BG = "surface"
const CARD = "panel"
const EDGE = "outline"
const TEXT = "text"
const MUTED = "textMuted"
const BLUE = "accent"
const ORANGE = "accentAlt"
const CYAN = "accent3"
const PURPLE = "accent4"
const GREEN = "good"
const RED = "alarm"
const TRACK = "track"

// Pixels on the 4" in mm, for the tables' gaps, widths and rows: set from
// the device's description before any page is built.
let PX_PER_MM = 6.73
const mm = (px: number) => Math.round((px / PX_PER_MM) * 1000) / 1000

const NONE = { kind: "text", parts: ["–"] }
const VALUE = { value: true }

/** A text in one of the sizes, its colour and alignment; `live` binds {live:…} parts. */
function text(width: number, height: number, content: string, font: Size, color: string, align = "left", live: any[] = []) {
  return {
    id: id("text"),
    type: "text",
    x: 0,
    y: 0,
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

function icon(size: number, asset: string, color: string) {
  return { id: id("icon"), type: "icon", x: 0, y: 0, width: size, height: size, zIndex: next, properties: { assetId: asset, iconColor: color, backgroundColor: "transparent" } }
}

function box(x: number, y: number, width: number, height: number, fill: string, radius = 0) {
  return { id: id("box"), type: "box", x, y, width, height, zIndex: next, properties: { fillColor: fill, strokeColor: "transparent", strokeWidth: 0, cornerRadius: radius } }
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
function ring(size: number, path: string, max: number, color: string, thickness: number, font: Size) {
  return {
    id: id("ring"),
    type: "gauge",
    x: 0,
    y: 0,
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
      trackColor: TRACK,
      fillColor: color,
      displayValue: "percentage",
      calibrationPoints: LINEAR(max),
      textColor: color,
      ...sized(font),
    },
  }
}

function bar(width: number, height: number, path: string, direction: string, color: string) {
  return {
    id: id("bar"),
    type: "bar",
    x: 0,
    y: 0,
    width,
    height,
    zIndex: next,
    properties: { topic: path, barDirection: direction, calibrationPoints: LINEAR(100), displayValue: "none", thickness: Math.min(width, height), fillColor: color, trackColor: TRACK },
  }
}

// ---- Tables ----

/*
 * Every page is laid out by tables (the user, 2026-11-04): no coordinate
 * but a page table's own. A page is one table of cards - equal columns
 * across the width, the gap set on the table - and each card holds a table
 * of what it shows, docked to fill its padding. The card's look (padding,
 * corners, edge) comes from the project's Settings › Cards, its colours from
 * the theme. What tables cannot give is in TABLE_GAPS.
 */

/** Where the table layout is not like CamperUI, and why. */
export const TABLE_GAPS = [
  "Kartenhöhe: eine Karte wächst nicht mit ihrem Inhalt, ihre Höhe ist von Hand gesetzt; die Zeile nimmt die höchste.",
  "Innenabstand: ein Wert für alle Karten und alle vier Seiten; CamperUI hat 12 px links und 8 bis 10 px oben.",
  "Ein Abstand pro Tabelle, zwischen Spalten und Zeilen gleich: CamperUI hat auf «Schalter» 16 px zwischen den Spalten und 8 px zwischen den Zeilen.",
  "Linien zwischen den Karten auf «Power»: eine Linie steht in keiner Zelle von selbst; sie liegen in einer Fläche ohne Look, die eine Zeile der Tabelle ist.",
  "Zahlen über dem Regler auf «Klima»: Objekte übereinander gibt es in einer Tabelle nicht; Regler und Texte liegen in einer Fläche in der Zelle.",
]

type Cell = { row: number; column: number; rowSpan?: number; columnSpan?: number; anchor?: Record<string, string> }

/** An object in a table's cell, standing there by `anchor`. */
const at = (obj: any, cell: Cell) => ({ ...obj, properties: { ...obj.properties, cell } })
const STRETCH = { x: "stretch", y: "stretch" }

/**
 * A table: `columns` columns, `gapPx` apart. With `widthPx` it is that wide,
 * its columns equal unless `columnPx` sizes one by hand; `rowPx` sizes rows
 * by hand.
 */
function table(children: any[], options: { columns?: number; gapPx?: number; widthPx?: number; equal?: boolean; columnPx?: (number | undefined)[]; rowPx?: (number | undefined)[]; x?: number; y?: number; dock?: string } = {}) {
  const columns = options.columns ?? 1
  return {
    id: id("table"),
    type: "table",
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.widthPx ?? 1,
    height: 1,
    zIndex: next,
    properties: {
      grid: 1,
      gapMm: mm(options.gapPx ?? 0),
      ...(options.widthPx ? { widthMm: mm(options.widthPx) } : {}),
      ...(options.equal === false ? {} : { equalColumns: true }),
      columns: Array.from({ length: columns }, (_, c) => (options.columnPx?.[c] !== undefined ? { mm: mm(options.columnPx[c]!) } : {})),
      rows: (options.rowPx ?? []).map((h) => (h !== undefined ? { mm: mm(h) } : {})),
      ...(options.dock ? { dock: options.dock } : {}),
    },
    children,
  }
}

/** A card: a free area with the project's card look, its contents in a table filling its padding. */
function card(height: number, inside: any, edge?: string, width = 40) {
  return {
    id: id("card"),
    type: "free",
    x: 0,
    y: 0,
    // Narrow of its own: stretched to its cell, and a table's equal columns
    // are never narrower than the widest thing in them.
    width,
    height,
    zIndex: next,
    // An edge of its own colour (the battery's green) is a card drawn by hand:
    // a look's edge is Outline or Accent.
    properties: edge
      ? { fillColor: CARD, strokeColor: edge, strokeWidth: 2, cornerRadius: CARD_RADIUS_PX, padding: CARD_PADDING_MM, clipContents: true }
      : { look: "card", clipContents: true },
    children: [{ ...inside, properties: { ...inside.properties, dock: "fill" } }],
  }
}

/** A free area without a look: objects placed in it by hand, for what a table cannot hold. */
function area(height: number, children: any[]) {
  return { id: id("area"), type: "free", x: 0, y: 0, width: 40, height, zIndex: next, properties: {}, children }
}

/** A page: its table at the top left of the room between the bar and the navigator. */
const page = (pageId: string, name: string, iconId: string, grid: any) => ({ id: pageId, name, masterScreenId: "master-1", iconAssetId: iconId, backgroundColor: BG, objects: [{ ...grid, x: grid.x || 8, y: grid.y || 48 }] })

// The card look (Settings › Cards): CamperUI's 10 px corners and padding on the 4".
const CARD_RADIUS_PX = 10
const CARD_PADDING_PX = 10
let CARD_PADDING_MM = 1.5

/**
 * A relay as CamperUI's big tile: its name on it, coloured while on, a tap
 * switching it. A switch draws a knob and a button group its segments, so
 * the tile is composed: a switcher on the relay's state, and in each panel a
 * button in that state's colour sending the other state. Its corners are
 * the project's button radius (1.5 mm, CamperUI's 10 px).
 */
function relayTile(width: number, height: number, n: number, onColor = GREEN, words: [string, string] = ["", ""]) {
  const name = RELAYS[n - 1]
  return stateTile(width, height, `${S}relay/${n}/power`, `${C}relay/${n}`, [
    { state: "off", label: `${name}${words[0]}`, color: CARD, send: "on" },
    { state: "on", label: `${name}${words[1]}`, color: onColor, send: "off" },
  ])
}

/**
 * A tile per state of `read`: a button in that state's colour and label,
 * sending what switches it. As wide as its column: a switcher stretched in
 * a cell does not take its panels along.
 */
function stateTile(width: number, height: number, read: string, write: string, states: { state: string; label: string; color: string; send: string }[]) {
  return {
    id: id("tiles"),
    type: "switcher",
    x: 0,
    y: 0,
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
            // On the card's colour the label is the text's, on a colour the one for on it.
            textColor: st.color === CARD ? TEXT : "onAccent",
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
    // CamperUI's model: a neutral ground, four colours of distinct hues.
    themeId: "slate",
    // Inter, as CamperUI's Montserrat: the sizes' fonts are this typography's.
    typography: "Humanist",
    backgroundColor: BG,
    objects: [
      box(0, 0, width, 40, CARD),
      box(0, 39, width, 1, EDGE),
      // The bar's contents in a table: the time, then on the right the
      // heater's flame, the inside temperature and the battery.
      table(
        [
          at(text(120, 26, "{live:clock}", F.small, TEXT, "left", [plain("clock", "van/clock/time")]), { row: 0, column: 0 }),
          at(icon(18, "icon-fire", RED), { row: 0, column: 1 }),
          at(text(80, 26, "IN: {live:inside}", F.small, TEXT, "left", [num("inside", `${S}temp/1/value`, 1, " C")]), { row: 0, column: 2 }),
          at(icon(20, "icon-battery", BLUE), { row: 0, column: 3 }),
          at(text(50, 26, "{live:soc}", F.small, TEXT, "left", [num("soc", `${S}battery/soc`, 0, "%")]), { row: 0, column: 4 }),
        ],
        { columns: 5, equal: false, x: 20, y: 7, widthPx: width - 40, gapPx: 6, columnPx: [width - 40 - 6 * 4 - 18 - 80 - 20 - 50, 18, 80, 20, undefined], rowPx: [26] },
      ),
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
          backgroundColor: CARD,
          borderColor: EDGE,
          textColor: MUTED,
          activeColor: BLUE,
          activeTextColor: "onAccent",
        },
      },
    ],
  }
}

// ---- Home ----

/** A card of a name over a value, as Home's temperatures. */
function nameValueCard(height: number, nameText: any, valueText: any) {
  return card(height, table([at(nameText, { row: 0, column: 0 }), at(valueText, { row: 1, column: 0 })]))
}

function home() {
  return page(
    "screen-home",
    "Home",
    "icon-home",
    table(
      [
        at(relayTile(228, 56, 1, BLUE, [" AUS", " EIN"]), { row: 0, column: 0, anchor: STRETCH }),
        at(relayTile(228, 56, 3, BLUE, [" AUS", " EIN"]), { row: 0, column: 1, anchor: STRETCH }),
        ...[1, 2].map((n, i) =>
          at(
            nameValueCard(
              70,
              text(200, 18, `{live:hn${n}}`, F.mini, MUTED, "left", [plain(`hn${n}`, `${S}temp/${n}/name`)]),
              text(200, 30, `{live:ht${n}}`, F.medium, TEXT, "left", [num(`ht${n}`, `${S}temp/${n}/value`, 1, " C")]),
            ),
            { row: 1, column: i, anchor: STRETCH },
          ),
        ),
        at(
          card(
            122,
            table([
              at(text(200, 20, "Batterie {live:hbsoc}", F.large16, BLUE, "left", [num("hbsoc", `${S}battery/soc`, 0, "%")]), { row: 0, column: 0 }),
              at(text(200, 40, "{live:hbw}", F.large, ORANGE, "left", [num("hbw", `${S}battery/power`, 1, " W")]), { row: 1, column: 0 }),
              at(text(200, 26, "{live:hbv}  {live:hba}", F.large16, TEXT, "left", [num("hbv", `${S}battery/voltage`, 1, " V"), num("hba", `${S}battery/current`, 1, " A")]), { row: 2, column: 0 }),
            ]),
          ),
          { row: 2, column: 0, anchor: STRETCH },
        ),
        at(
          card(
            122,
            table([
              at(text(200, 20, "Solar", F.large16, TEXT), { row: 0, column: 0 }),
              at(text(200, 38, "{live:hsw}", F.large, ORANGE, "left", [num("hsw", `${S}mppt/pv_watts`, 0, " W")]), { row: 1, column: 0 }),
              at(text(200, 26, "{live:hsv}  {live:hsa}", F.large16, TEXT, "left", [num("hsv", `${S}mppt/pv_volts`, 1, " V"), num("hsa", `${S}mppt/pv_amps`, 1, " A")]), { row: 2, column: 0 }),
              at(text(200, 18, "PV-Leistung", F.mini, MUTED), { row: 3, column: 0 }),
            ]),
          ),
          { row: 2, column: 1, anchor: STRETCH },
        ),
        at(
          card(
            60,
            table(
              [
                at(text(200, 26, "{live:hfn}", F.large16, TEXT, "left", [plain("hfn", `${S}tank/1/name`)]), { row: 0, column: 0 }),
                at(text(120, 26, "{live:hfl}", F.medium, TEXT, "right", [num("hfl", `${S}tank/1/level`, 0, "%")]), { row: 0, column: 1, anchor: { x: "right" } }),
                at(bar(200, 10, `${S}tank/1/level`, "left-to-right", CYAN), { row: 1, column: 0, columnSpan: 2, anchor: { x: "stretch" } }),
              ],
              { columns: 2, equal: false, gapPx: 4 },
            ),
          ),
          { row: 3, column: 0, columnSpan: 2, anchor: STRETCH },
        ),
      ],
      { columns: 2, widthPx: 464, gapPx: 8 },
    ),
  )
}

// ---- Dimmer ----

function dimmerCard(n: number) {
  const color = n === 1 ? ORANGE : MUTED
  return card(
    78,
    table(
      [
        at(text(120, 30, `{live:dn${n}}`, F.medium, TEXT, "left", [plain(`dn${n}`, `${S}dimmer/${n}/name`)]), { row: 0, column: 0, anchor: { y: "center" } }),
        at(
          {
            ...bar(200, 34, `${S}dimmer/${n}/level`, "left-to-right", color),
            id: id("slider"),
            type: "slider",
            properties: { ...bar(200, 34, `${S}dimmer/${n}/level`, "left-to-right", color).properties, writeTopic: `${C}dimmer/${n}`, step: 5 },
          },
          { row: 0, column: 1, anchor: { x: "stretch", y: "center" } },
        ),
        at(
          text(56, 30, `{live:dl${n}}`, F.medium, color, "right", [
            {
              id: `dl${n}`,
              source: { namespace: "topic", path: `${S}dimmer/${n}/level` },
              format: { kind: "number", decimals: 0, grouped: false },
              rules: [{ op: "==", operand: "0", result: { kind: "text", parts: ["Aus"] } }],
              otherwise: { kind: "text", parts: [VALUE, "%"] },
              noValueYet: NONE,
            },
          ]),
          { row: 0, column: 2, anchor: { y: "center" } },
        ),
      ],
      // The name and the value as wide as CamperUI has them, the slider the rest.
      { columns: 3, equal: false, gapPx: 8, columnPx: [120, 212, 56], rowPx: [78 - 2 * CARD_PADDING_PX] },
    ),
  )
}

function dimmer() {
  return page("screen-dimmer", "Dimmer", "icon-bulb", table([1, 2, 3, 4].map((n, i) => at(dimmerCard(n), { row: i, column: 0, anchor: STRETCH })), { widthPx: 440, gapPx: 10, x: 20 }))
}

// ---- Power ----

function source(name: string, color: string, watts: string, sub: any[], subText: string, max: number) {
  return card(
    74,
    table(
      [
        at(text(80, 16, name, F.small, color), { row: 0, column: 0 }),
        at(text(80, 22, "{live:w}", F.medium, color, "left", [num("w", watts, 0, " W")]), { row: 1, column: 0 }),
        at(text(80, 14, subText, F.mini, MUTED, "left", sub), { row: 2, column: 0 }),
        at(ring(48, watts, max, color, 6, F.mini), { row: 0, column: 1, rowSpan: 3, anchor: { x: "right", y: "center" } }),
      ],
      { columns: 2, equal: false },
    ),
  )
}

function power() {
  // The lines into the battery and out to what draws, in areas between the
  // card rows: the three sources' centres are 71, 220 and 369 px across.
  const into = area(22, [line(71, 0, 71, 10, GREEN), line(71, 10, 150, 22, GREEN), line(220, 0, 220, 22, GREEN), line(369, 0, 369, 10, GREEN), line(369, 10, 290, 22, GREEN)])
  const out = area(16, [line(220, 0, 220, 16, EDGE)])
  return page(
    "screen-power",
    "Power",
    "icon-battery",
    table(
      [
        at(source("Solar", ORANGE, `${S}mppt/pv_watts`, [num("pv", `${S}mppt/pv_volts`, 1, "V"), num("pa", `${S}mppt/pv_amps`, 1, "A")], "{live:pv} {live:pa}", 250), { row: 0, column: 0, anchor: STRETCH }),
        at(source("Landstrom", BLUE, "ble/charger/watts#value", [], "230V", 500), { row: 0, column: 1, anchor: STRETCH }),
        at(source("Lichtmasch.", PURPLE, "ble/orion/watts#value", [], "14.2V", 300), { row: 0, column: 2, anchor: STRETCH }),
        at(into, { row: 1, column: 0, columnSpan: 3, anchor: { x: "stretch" } }),
        at(
          card(
            128,
            table(
              [
                at(ring(100, `${S}battery/soc`, 100, BLUE, 12, F.large), { row: 0, column: 0, rowSpan: 3, anchor: { y: "center" } }),
                at(icon(18, "icon-battery-flat", MUTED), { row: 0, column: 1 }),
                at(text(200, 22, "Batterie", F.small, MUTED), { row: 0, column: 2 }),
                at(text(240, 40, "{live:bp}  {live:bc}", F.large, GREEN, "left", [signed("bp", `${S}battery/power`, 0, " W"), signed("bc", `${S}battery/current`, 1, " A")]), { row: 1, column: 1, columnSpan: 2 }),
                at(text(200, 22, "{live:bvv}", F.small, MUTED, "left", [num("bvv", `${S}battery/voltage`, 1, " V")]), { row: 2, column: 1, columnSpan: 2 }),
              ],
              { columns: 3, equal: false, gapPx: 8, columnPx: [100, 18, undefined] },
            ),
            GREEN,
          ),
          { row: 2, column: 0, columnSpan: 3, anchor: STRETCH },
        ),
        at(out, { row: 3, column: 0, columnSpan: 3, anchor: { x: "stretch" } }),
        at(
          card(
            70,
            table(
              [
                at(icon(22, "icon-power", ORANGE), { row: 0, column: 0, rowSpan: 2, anchor: { y: "center" } }),
                at(text(150, 28, "Verbraucher", F.medium, TEXT), { row: 0, column: 1, rowSpan: 2, anchor: { y: "center" } }),
                at(text(150, 24, "{live:cw}", F.medium, MUTED, "right", [num("cw", "van/energy/consumers_watts", 0, " W")]), { row: 0, column: 2 }),
                at(
                  text(150, 20, "{live:charging}", F.small, GREEN, "right", [
                    {
                      id: "charging",
                      source: { namespace: "topic", path: `${S}battery/power` },
                      rules: [{ op: ">", operand: "0", result: { kind: "text", parts: ["Wird geladen"] } }],
                      otherwise: { kind: "text", parts: ["Entlädt"] },
                      noValueYet: NONE,
                    },
                  ]),
                  { row: 1, column: 2 },
                ),
              ],
              { columns: 3, equal: false, gapPx: 4, columnPx: [22, 150, undefined] },
            ),
          ),
          { row: 4, column: 0, columnSpan: 3, anchor: STRETCH },
        ),
      ],
      { columns: 3, widthPx: 440, gapPx: 6, x: 20, y: 50 },
    ),
  )
}

// ---- Wasser ----

function tankColumn(n: number, color: string, column: number) {
  const centre = { x: "center" }
  return [
    at(text(160, 26, `{live:tn${n}}`, F.medium, TEXT, "center", [plain(`tn${n}`, `${S}tank/${n}/name`)]), { row: 0, column }),
    at(bar(80, 200, `${S}tank/${n}/level`, "bottom-to-top", color), { row: 1, column, anchor: centre }),
    at(text(160, 26, `{live:tl${n}}`, F.medium, TEXT, "center", [num(`tl${n}`, `${S}tank/${n}/level`, 0, "%")]), { row: 2, column }),
    at(text(160, 20, `{live:tli${n}}`, F.small, MUTED, "center", [num(`tli${n}`, `${S}tank/${n}/level`, 0, " / 100 L")]), { row: 3, column }),
  ]
}

function water() {
  return page(
    "screen-wasser",
    "Wasser",
    "icon-drop",
    table([at(card(340, table([...tankColumn(1, CYAN, 0), ...tankColumn(2, MUTED, 1)], { columns: 2, gapPx: 8 })), { row: 0, column: 0, anchor: STRETCH })], { widthPx: 440, x: 20, y: 56 }),
  )
}

// ---- Klima (Autoterm) ----

function climate() {
  // The dial with the temperatures over it: objects over each other, which
  // a table does not hold, so in an area of its own (TABLE_GAPS).
  const dialArea = area(226, [
    {
      id: id("target"),
      type: "dial",
      x: 107,
      y: 0,
      width: 226,
      height: 226,
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
        trackColor: TRACK,
        fillColor: PURPLE,
        displayValue: "none",
        calibrationPoints: [
          { value: 12, barSizePercent: 0 },
          { value: 30, barSizePercent: 100 },
        ],
        textColor: TEXT,
        ...sized(F.large),
      },
    },
    { ...text(200, 44, "{live:ki}", F.large, TEXT, "center", [num("ki", `${S}temp/1/value`, 1, " C")]), x: 120, y: 74 },
    { ...text(200, 24, "Ziel: {live:kz}", F.small, MUTED, "center", [num("kz", `${S}heater/target`, 0, " C")]), x: 120, y: 120 },
    { ...text(200, 24, "{live:ks}", F.small, ORANGE, "center", [plain("ks", `${S}heater/state_text`)]), x: 120, y: 198 },
  ])
  return page(
    "screen-klima",
    "Klima",
    "icon-fire",
    table(
      [
        at(
          card(
            58,
            table(
              [
                at(icon(14, "icon-home-small", MUTED), { row: 0, column: 0, anchor: { y: "center" } }),
                at(text(100, 16, "Aussen", F.small, MUTED), { row: 0, column: 1 }),
                at(text(130, 22, "{live:ka}", F.medium, TEXT, "left", [num("ka", `${S}temp/2/value`, 1, " C")]), { row: 1, column: 0, columnSpan: 2 }),
              ],
              { columns: 2, equal: false, gapPx: 0, columnPx: [18, undefined] },
            ),
          ),
          { row: 0, column: 0, anchor: STRETCH },
        ),
        at(
          {
            id: id("modes"),
            type: "button-group",
            x: 0,
            y: 0,
            width: 200,
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
          { row: 0, column: 1, anchor: STRETCH },
        ),
        at(dialArea, { row: 1, column: 0, columnSpan: 2, anchor: { x: "stretch" } }),
        at(
          {
            id: id("stop"),
            type: "button",
            x: 0,
            y: 0,
            width: 200,
            height: 54,
            zIndex: next,
            properties: { text: "Stop", buttonStyle: "filled", buttonColor: RED, textColor: "onAccent", ...sized(F.medium), action: { type: "send-mqtt", mqttTopic: `${C}heater`, mqttMessage: "off" } },
          },
          { row: 2, column: 0, anchor: STRETCH },
        ),
        at(card(54, table([at(icon(28, "icon-stethoscope", BLUE), { row: 0, column: 0, anchor: { x: "center", y: "center" } })], { rowPx: [54 - 2 * CARD_PADDING_PX] }), undefined, 54), { row: 2, column: 1, anchor: { x: "right", y: "stretch" } }),
      ],
      { columns: 2, widthPx: 440, gapPx: 8, x: 20, y: 50 },
    ),
  )
}

// ---- Temperaturen ----

function tempCard(n: number, color: string) {
  return card(
    58,
    table(
      [
        at(box(0, 0, 4, 38, color, 2), { row: 0, column: 0, rowSpan: 2 }),
        at(text(150, 16, `{live:tn${n}}`, F.small, TEXT, "left", [plain(`tn${n}`, `${S}temp/${n}/name`)]), { row: 0, column: 1 }),
        at(text(150, 22, `{live:tv${n}}`, F.medium, color, "left", [num(`tv${n}`, `${S}temp/${n}/value`, 1, " C")]), { row: 1, column: 1 }),
      ],
      { columns: 2, equal: false, gapPx: 0, columnPx: [12, undefined] },
    ),
  )
}

function temps() {
  const chart = {
    id: id("chart"),
    type: "chart",
    x: 0,
    y: 0,
    width: 400,
    height: 262,
    zIndex: next,
    properties: {
      mode: "time",
      scroll: false,
      legend: "none",
      fontId: sized(F.small).fontId,
      dateFontId: sized(F.small).fontId,
      textColor: MUTED,
      mutedColor: MUTED,
      lineColor: EDGE,
      nowColor: EDGE,
      left: { scale: "fixed", min: 12, max: 24, unit: "C" },
      series: [
        { id: "s-in", source: { kind: "topic", topic: `${S}temp/1/value` }, name: "Innen", valueKind: "level", unit: "C", draw: "line", color: GREEN },
        { id: "s-out", source: { kind: "topic", topic: `${S}temp/2/value` }, name: "Aussen", valueKind: "level", unit: "C", draw: "line", color: BLUE },
      ],
    },
  }
  return {
    ...page(
      "screen-temps",
      "Temperaturen",
      "icon-thermometer",
      table(
        [
          at(tempCard(2, BLUE), { row: 0, column: 0, anchor: STRETCH }),
          at(tempCard(1, GREEN), { row: 0, column: 1, anchor: STRETCH }),
          at(card(286, table([at(chart, { row: 0, column: 0, anchor: STRETCH })], { rowPx: [286 - 2 * CARD_PADDING_PX] })), { row: 1, column: 0, columnSpan: 2, anchor: STRETCH }),
        ],
        { columns: 2, widthPx: 440, gapPx: 10, x: 20, y: 50 },
      ),
    ),
    timeRange: "1h",
  }
}

// ---- MaxxFan ----

function maxxfan() {
  return page(
    "screen-maxxfan",
    "MaxxFan",
    "icon-fan",
    table(
      [
        at(
          {
            id: id("fanmodes"),
            type: "button-group",
            x: 0,
            y: 0,
            width: 200,
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
          { row: 0, column: 0, anchor: { x: "stretch" } },
        ),
        at(
          stateTile(464, 76, `${S}maxxfan/cover`, `${C}maxxfan/cover`, [
            { state: "closed", label: "Dachhaube Zu", color: CARD, send: "open" },
            { state: "open", label: "Dachhaube Offen", color: BLUE, send: "closed" },
          ]),
          { row: 1, column: 0, anchor: { x: "stretch" } },
        ),
        at(icon(128, "icon-roof", MUTED), { row: 2, column: 0, anchor: { x: "center" } }),
      ],
      { widthPx: 464, gapPx: 24 },
    ),
  )
}

// ---- Schalter ----

function switches() {
  return page(
    "screen-schalter",
    "Schalter",
    "icon-toggle",
    table(
      Array.from({ length: 8 }, (_, i) => at(relayTile(216, 84, i + 1), { row: Math.floor(i / 2), column: i % 2, anchor: STRETCH })),
      { columns: 2, widthPx: 440, gapPx: 8, x: 20 },
    ),
  )
}

/** The project, from the 4"'s description (a DDF zip). */
export async function buildCamperUiProject(ddfZip: Uint8Array) {
  next = 1
  const parsed = await parseDeviceDescriptionFile(Buffer.from(ddfZip))
  const fields = deviceDescriptionToProjectFields(parsed, Buffer.from(ddfZip).toString("base64"))
  PX_PER_MM = fields.pixelsPerMm ?? 6.73
  CARD_PADDING_MM = mm(CARD_PADDING_PX)
  // Each size's font on this device, in Humanist (Inter) as CamperUI's
  // Montserrat; resolved once, before any page is built.
  const scale = textScaleOf({ pixelsPerMm: fields.pixelsPerMm, typographies: fields.typographies }, "Humanist")!
  SIZED = Object.fromEntries(
    Object.values(F).map((size) => {
      const f = styledFont(size as TextStyle, false, scale, fields.fonts)!
      return [size, { textStyle: size, textBold: false as const, fontId: f.fontId, fontSize: f.fontSize }]
    }),
  )
  const project = {
    name: "CamperUI",
    screenWidth: fields.screenWidth,
    screenHeight: fields.screenHeight,
    screens: [master(fields.screenWidth, fields.screenHeight), home(), dimmer(), power(), water(), climate(), temps(), maxxfan(), switches()],
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
      themeId: "slate",
      // CamperUI's cards and tiles on the 4": 10 px corners and padding, a
      // 1 px edge (docs/2026-11-03-card.md; buttons: docs/2026-11-04-native-
      // buttons.md, module button-radius).
      cards: { radiusMm: mm(CARD_RADIUS_PX), edgePx: 1, accentEdgePx: 2, paddingMm: CARD_PADDING_MM, buttonRadiusMm: mm(CARD_RADIUS_PX) },
    },
    topics: TOPICS,
    combinedTopics: [],
    nextId: next + 1,
  }
  return project as unknown as Project
}
