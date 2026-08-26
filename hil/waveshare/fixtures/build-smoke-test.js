// Builds a device-export project zip for the Waveshare Knob-1.8, used to
// verify the ported project stack (ProjectInstaller -> ProjectLoader ->
// ColorScreenRenderer) on real hardware.
//
// Hand-built rather than exported from the running app, for the same reason
// hil/m5dial/fixtures/build-comprehensive-test.js is: it has to be
// reproducible from a script with no browser in the loop. Deliberately
// narrower than the M5 Dial's comprehensive fixture - this one only needs to
// prove the stack runs end to end on a new board. Object-type coverage grows
// with the HIL orchestrator (step 6 of the port), not here.
//
// Only metadata is written for fonts, never the BDF bytes: the firmware
// resolves fonts through ColorScreenRenderer::getU8g2FontById(), which
// matches `internalName` against compiled-in u8g2 tables and never opens a
// font file. Embedding one would add ~100KB of dead weight to the upload
// that the device would never read.
//
// Colors are picked to be *fixed points* of the RGB565 round trip, so a
// pixel comparison can assert exact values instead of a tolerance. Note that
// "low bits zero" is NOT the right rule and was the first guess here: the
// device expands 5/6-bit channels back by bit replication
// (r8 = (r5<<3)|(r5>>2)), so e.g. #00a8f8 comes back as #00aaff and #808080
// as #848284. A value only survives untouched if it is already the output of
// that expansion - which every constant below is.

// Built through the designer's OWN export (2026-08-25), not by writing
// project.json by hand and zipping it.
//
// Hand-building was fine while every object type was rendered live by the
// firmware - the whole point of this fixture was that a plain Node script
// could produce something the real orchestrator uploads. A SoftwareButton
// broke that assumption: it is the one type nothing renders live. The
// designer's export composites its border, shadow and label into a bitmap
// and ships that; the firmware blits the bitmap or draws nothing at all
// (ColorScreenRenderer.cpp's renderSoftwareButton bails on an empty
// pathNormal). A hand-built fixture therefore described a state no real
// deploy can produce, and the first HIL run to look at it reported 11710
// differing pixels against a device that was behaving perfectly correctly.
//
// Baking that bitmap here would put a second, drifting copy of
// asset-export.ts's compositing next to the first - the same argument the
// m5dial fixture used when it excluded SoftwareButton from coverage
// entirely. Going through the real export instead means everything the
// device receives is exactly what a real deploy produces, for every object
// type, permanently.
//
// The cost: this now needs the designer dev server running (npm run dev),
// because the bake is a canvas operation with no headless path. It is run
// rarely, and every orchestrator already needs that server anyway.
//
// Run: node hil/waveshare/fixtures/build-smoke-test.js
const fs = require("fs")
const path = require("path")
const JSZip = require("jszip")

const { withDdfFontData } = require("../ddf-fonts")

const OUT_PATH = path.join(__dirname, "smoke-test.zip")
const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000"

const WHITE = "#ffffff"
const BLACK = "#000000"
const BOX_FILL = "#00aaff" // fixed point: r5=0, g6=42, b5=31
const LEVEL_FILL = "#00fb00" // fixed point: g6=62
const BORDER = "#848284" // fixed point: r5=16, g6=32, b5=16

const FONTS = [
  { id: "font-helvR12", displayName: "Helvetica 12px", internalName: "u8g2_font_helvR12_tf", size: 18, ascent: 14, descent: 4 },
  { id: "font-helvR18", displayName: "Helvetica 18px", internalName: "u8g2_font_helvR18_tf", size: 27, ascent: 22, descent: 5 },
]

const project = {
  name: "Waveshare Knob Smoke Test",
  // Must match ddf-source/device.json's device.id, or the firmware's own
  // DEVICE_ID check rejects the upload before touching /PROJECT.
  deviceId: "waveshare-knob-1v8",
  // The single version number shared by project file, export and DDF
  // (lib/system-generation.ts). The firmware peeks its major before
  // installing.
  systemGeneration: "1.0",
  screenWidth: 360,
  screenHeight: 360,
  settings: { colorDepth: "24bit" },
  // Several examples per topic, because the orchestrator runs one comparison
  // per combination (hil/combinations.js) - a single example would only ever
  // exercise one appearance of each MQTT-bound object. The level values are
  // chosen to land on distinctly different bar widths rather than adjacent
  // ones, so an off-by-a-few-pixels bar is visible as a real diff.
  topics: [
    { id: "topic-temp", topic: "hil-test/temperature", type: "numeric", examples: ["21.5", "-4.0", "100.0"] },
    { id: "topic-level", topic: "hil-test/level", type: "numeric", examples: ["0", "37", "100"] },
    // obj-tap-switch has bound this since it was added, but the topic was
    // never registered here - so no value was ever published for it during a
    // run and no Switch ever had an active state on either side. Both sides
    // agreed on "nothing active", so the pixel diff stayed at zero and the
    // gap was invisible: the entire active-marker path went uncovered
    // (2026-08-25). Two examples, one per state, so the marker actually
    // moves. Costs no extra combinations - a screen runs max(examples)
    // times, not the product, and the other screens already have three.
    { id: "topic-schalter", topic: "hil-test/schalter", type: "string", examples: ["0", "1"] },
  ],
  assets: [
    {
      // A stencil icon, written the way the icon libraries write them
      // (fill="currentColor"), so obj-icon-tinted on the black screen has
      // something to paint white. Inline rather than fetched: a fixture that
      // reaches api.iconify.design would fail on a bench with no internet,
      // and this is meant to run next to the hardware.
      //
      // A ring rather than a disc on purpose - the hole is what shows
      // whether the tint painted the shape or the bounding box. Filled, the
      // difference against a black screen would be roughly 1200 pixels.
      id: "asset-ring",
      name: "ring",
      type: "icon",
      data: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iY3VycmVudENvbG9yIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMiAxLjVBMTAuNSAxMC41IDAgMSAwIDEyIDIyLjVBMTAuNSAxMC41IDAgMSAwIDEyIDEuNVpNMTIgNkE2IDYgMCAxIDEgMTIgMThBNiA2IDAgMSAxIDEyIDZaIi8+PC9zdmc+",
    },
  ],
  // Filled in below from the screens themselves - see collectButtonIds().
  hardwareButtons: [],
  fonts: FONTS.map(({ id, displayName, internalName, size, ascent, descent }) => ({
    id,
    name: displayName,
    displayName,
    internalName,
    size,
    ascent,
    descent,
  })),
  screens: [
    {
      id: "screen-1",
      name: "Screen 1",
      backgroundColor: WHITE,
      // Exercises all three interesting action kinds on this board:
      // swipe-up opens the device's own screen menu, and the knob's two
      // directions adjust a value - which is what the knob is *for* here,
      // rather than paging through screens the way the M5 Dial's does.
      buttonActions: {
        "swipe-up": { type: "device-action", deviceActionId: "showScreenMenu" },
        "button-1": { type: "send-mqtt", mqttTopic: "hil-test/knob", mqttMessage: "up" },
        "button-0": { type: "send-mqtt", mqttTopic: "hil-test/knob", mqttMessage: "down" },
        // Paging, bound to the swipes because the knob is already spoken
        // for above. The verifier bursts these to check the navigation rate
        // limit, which is why they are bound on every screen: a burst walks
        // the screens one at a time and resolves its next action on
        // whichever one it has reached, so a screen without the binding
        // would silently stop the burst dead.
        "swipe-left": { type: "next-screen" },
        "swipe-right": { type: "previous-screen" },
        // Vertical paging as well, so the follow-the-finger transition is
        // covered on both axes. Bound downward only, deliberately: swipe-up
        // stays the screen menu, which makes this screen a pair of opposite
        // gestures on one axis where one animates and the other does not -
        // exactly the case that proves the drag is opt-in per binding.
        "swipe-down": { type: "next-screen" },
      },
      objects: [
        // Everything sits inside the r=180 inscribed circle - this panel is
        // round, so anything in the square's corners is unobservable and
        // would make a snapshot assertion untestable.
        {
          id: "obj-box",
          type: "box",
          zIndex: 1,
          x: 100,
          y: 60,
          width: 160,
          height: 60,
          properties: { fillColor: BOX_FILL, strokeColor: BLACK, strokeWidth: 3, cornerRadius: 8 },
        },
        {
          id: "obj-label",
          type: "label",
          zIndex: 2,
          x: 100,
          y: 140,
          width: 160,
          height: 27,
          properties: {
            text: "Waveshare",
            fontId: "font-helvR18",
            fontSize: 18,
            color: BLACK,
            textAlign: "left",
            fontWeight: "normal",
            backgroundColor: WHITE,
            borderColor: BORDER,
          },
        },
        {
          // Non-ASCII, deliberately. The device used to draw from a
          // compiled-in u8g2 font with 191 glyphs while serving the
          // designer a .bdf with 754, so a euro sign or an em dash
          // rendered in the designer and came out blank on the glass -
          // and no test could see it, because every string in this
          // fixture was pure ASCII. Reported from hardware 2026-08-22.
          //
          // Capital umlauts cover the other half of the same report: their
          // dots reach one pixel above the nominal ascent, and the text
          // box clipped them off on both sides at once - identically, so
          // the pixel diff stayed at zero while both were wrong.
          id: "obj-label-glyphs",
          type: "label",
          zIndex: 2,
          x: 20,
          y: 200,
          width: 320,
          height: 27,
          properties: {
            text: "ÄÖÜ ä 9€ — … •",
            fontId: "font-helvR18",
            fontSize: 18,
            color: BLACK,
            textAlign: "left",
            fontWeight: "normal",
            backgroundColor: WHITE,
            borderColor: BORDER,
          },
        },
        {
          id: "obj-mqtt-temp",
          type: "MqttDataField",
          zIndex: 3,
          x: 100,
          y: 180,
          width: 160,
          height: 18,
          properties: {
            topic: "hil-test/temperature",
            displayAs: "Display as-is",
            fontId: "font-helvR12",
            backgroundColor: WHITE,
            borderColor: BORDER,
            textColor: BLACK,
            textAlign: "left",
            prefix: "",
            postfix: " C",
          },
        },
        {
          // fontId is required, not optional: the level indicator only takes
          // the pixel-exact BDF path when it resolves to a real font.
          id: "obj-level",
          type: "level-indicator",
          zIndex: 4,
          x: 90,
          y: 220,
          width: 180,
          height: 30,
          properties: {
            topic: "hil-test/level",
            backgroundColor: WHITE,
            borderColor: BORDER,
            fillColor: LEVEL_FILL,
            barDirection: "left-to-right",
            displayValue: "percentage",
            calibrationPoints: [
              { value: 0, barSizePercent: 0 },
              { value: 100, barSizePercent: 100 },
            ],
            textColor: BLACK,
            fontId: "font-helvR12",
          },
        },
        {
          // The arc-level, on the rim - the geometry the object exists for.
          // zIndex 0 so it is drawn first, under everything else; its
          // background is transparent, so it paints only its own annulus and
          // the objects above it are untouched.
          //
          // Bound to the same level topic as the bar above, which the
          // orchestrator publishes at 0, 37 and 100 - so the pixel
          // comparison covers an empty arc, a part-filled one and a full
          // one, including both ends where the fill edge coincides with the
          // track's own. The setpoint marker follows the temperature topic,
          // whose -4.0 case clamps below zero and whose 100.0 case sits at
          // the very end of the scale.
          //
          // This is the object whose anti-aliased edges the exact pixel
          // comparison is really here to check: they are computed by an
          // integer rasterizer that exists twice, once in the designer and
          // once in the firmware, and nothing else would catch the two
          // drifting apart.
          id: "obj-arc-rim",
          type: "arc-level",
          zIndex: 0,
          x: 10,
          y: 10,
          width: 340,
          height: 340,
          properties: {
            topic: "hil-test/level",
            setpointTopic: "hil-test/temperature",
            minAngle: 225,
            maxAngle: 135,
            direction: "cw",
            thickness: 20,
            markerWidth: 4,
            backgroundColor: "transparent",
            trackColor: BORDER,
            fillColor: LEVEL_FILL,
            markerColor: BLACK,
            displayValue: "none",
            calibrationPoints: [
              { value: 0, barSizePercent: 0 },
              { value: 100, barSizePercent: 100 },
            ],
          },
        },
      ],
    },
    {
      // A second screen exists purely so POST /api/screen has somewhere to
      // switch to - a one-screen project cannot prove the switch worked.
      id: "screen-2",
      name: "Screen 2",
      backgroundColor: BLACK,
      // Deliberately also bound here: a menu that only opens on one screen
      // would leave no way back, and it is the second screen that proves the
      // action is resolved per-screen rather than captured once at load.
      buttonActions: {
        "swipe-up": { type: "device-action", deviceActionId: "showScreenMenu" },
        "swipe-left": { type: "next-screen" },
        "swipe-right": { type: "previous-screen" },
        "swipe-down": { type: "next-screen" },
      },
      objects: [
        {
          // A full ring - min and max on the same position, the ambiguous
          // case that is deliberately read as 360 degrees rather than as an
          // arc of zero length. Carries its own centred value, so the arc's
          // text centring is compared too and not only the ring.
          //
          // On the black screen rather than the white one on purpose: a
          // transparent background means the anti-aliased edges mix into the
          // screen's own colour, and doing that against both black and white
          // catches a blend that is right in one direction only.
          // Ein Switch und ein SoftwareButton - die beiden bedienbaren
          // Objekttypen. Bis 2026-08-24 wertete diese Firmware ein Antippen
          // gar nicht aus (die einzige Erwaehnung von SoftwareButton in
          // main.cpp war ein Kommentar "(later)"): sie wurden gezeichnet und
          // zeigten ihren Zustand richtig, aber ein Tipp verpuffte. Ohne ein
          // bedienbares Objekt in dieser Vorlage konnte das auch niemandem
          // auffallen.
          id: "obj-tap-switch",
          type: "Switch",
          zIndex: 1,
          x: 40,
          y: 180,
          width: 280,
          height: 46,
          properties: {
            topic: "hil-test/schalter",
            writeTopic: "hil-test/schalter/set",
            states: [
              { id: "st-aus", label: "AUS", readValue: "0", writeValue: "aus" },
              { id: "st-an", label: "AN", readValue: "1", writeValue: "an" },
            ],
            backgroundColor: WHITE,
            // The marker bar's colour since 2026-08-25, when the active
            // segment stopped being filled. Key deliberately not renamed -
            // the value every saved project already holds is the right
            // colour for the new job.
            activeBackgroundColor: BORDER,
            borderColor: BORDER,
            textColor: BLACK,
            // Deliberately left in place although nothing reads it any more.
            // Real user projects exported before 2026-08-25 all carry this
            // key, and a stray property has to stay harmless - the firmware
            // ignoring it is worth one fixture object proving it rather than
            // an assumption.
            activeTextColor: WHITE,
            fontId: "font-helvR12",
          },
        },
        {
          id: "obj-tap-button",
          type: "SoftwareButton",
          zIndex: 1,
          x: 40,
          y: 240,
          width: 280,
          height: 46,
          properties: {
            text: "SENDEN",
            backgroundColor: WHITE,
            borderColor: BORDER,
            textColor: BLACK,
            fontId: "font-helvR12",
            fontWeight: "normal",
            borderWidth: 1,
            // Eckige Ecken, und das ist kein Geschmack, sondern die Regel
            // dieser Vorlage: exakte Vergleiche, niemals Toleranzen - siehe
            // den Kopfkommentar zu den RGB565-Fixpunkten. Erreicht wird das,
            // indem hier nur Inhalte stehen, die ueberhaupt exakt
            // uebereinstimmen KOENNEN.
            //
            // Eine abgerundete Ecke kann das durch diese Kette nicht. Der
            // Knopf wird vom Export einmal in ein Bitmap gebacken und vom
            // Geraet in einen RGB565-Puffer geblittet; die Referenz zeichnet
            // einmal in voller Praezision und quantisiert danach. Zwei
            // Rundungen an verschiedenen Stellen, Unterschied unterhalb einer
            // Farbstufe - den die Quantisierung dann ueber eine Eimergrenze
            // schiebt. Gemessen am 2026-08-25: exakt 6 Pixel, je einer bis
            // zwei pro Ecke, jeder genau eine Stufe daneben. Nach dem
            // Zusammenlegen der beiden Zeichenroutinen unveraendert 6 - es
            // liegt nicht an ihnen.
            //
            // Rahmen, Fuellung, Schatten und Beschriftung des Knopfs bleiben
            // damit voll geprueft. Die waren vorher gar nicht geprueft: bis
            // diese Vorlage durch den echten Export ging, zeichnete das
            // Geraet den Knopf ueberhaupt nicht.
            cornerRadius: 0,
            action: { type: "send-mqtt", mqttTopic: "hil-test/knopf", mqttMessage: "gedrueckt" },
          },
        },
        {
          id: "obj-arc-full",
          type: "arc-level",
          zIndex: 0,
          x: 105,
          y: 20,
          width: 140,
          height: 140,
          properties: {
            topic: "hil-test/level",
            setpointTopic: "hil-test/temperature",
            minAngle: 0,
            maxAngle: 0,
            direction: "cw",
            thickness: 14,
            markerWidth: 6,
            backgroundColor: "transparent",
            trackColor: BORDER,
            fillColor: BOX_FILL,
            markerColor: WHITE,
            displayValue: "value",
            textColor: WHITE,
            fontId: "font-helvR12",
            calibrationPoints: [
              { value: 0, barSizePercent: 0 },
              { value: 100, barSizePercent: 100 },
            ],
          },
        },
        {
          id: "obj-label-2",
          type: "label",
          zIndex: 1,
          x: 110,
          y: 165,
          width: 140,
          height: 27,
          properties: {
            text: "Screen Two",
            fontId: "font-helvR18",
            fontSize: 18,
            color: WHITE,
            textAlign: "left",
            fontWeight: "normal",
            backgroundColor: BLACK,
            borderColor: BLACK,
          },
        },
        {
          // Icon tinting on real hardware (2026-08-25). The icon is black in
          // its own SVG and this screen is black, so without iconColor the
          // device would draw an invisible icon - which is the complaint
          // that started the feature and, more usefully here, a state the
          // pixel diff cannot tell apart from "no icon at all".
          //
          // The whole point is that the firmware knows nothing about this:
          // the designer bakes the white ring into the bitmap and the device
          // blits it. If designer and device ever disagreed about what the
          // colour did, this is where it shows up as a pixel count.
          id: "obj-icon-tinted",
          type: "icon",
          zIndex: 1,
          x: 150,
          y: 205,
          width: 60,
          height: 60,
          properties: {
            assetId: "asset-ring",
            iconColor: WHITE,
            backgroundColor: "transparent",
          },
        },
      ],
    },
    {
      // Screen three exists for the 2026-08-25 marker rebuild, as its own
      // screen rather than as edits to the switch on screen one: that one
      // stays exactly as it was, so its pixel diff remains comparable
      // against every previous run and a regression there cannot be
      // confused with a deliberate change here.
      //
      // The three cases sit apart from each other on purpose. Several
      // things changed at once - marker shape, draw order, icon bake, a
      // whole new mode - so when a diff is not zero, WHERE it is has to be
      // enough to say WHICH of them moved.
      id: "screen-3",
      name: "Screen 3",
      backgroundColor: WHITE,
      buttonActions: {
        "swipe-up": { type: "device-action", deviceActionId: "showScreenMenu" },
        "swipe-left": { type: "next-screen" },
        "swipe-right": { type: "previous-screen" },
        "swipe-down": { type: "next-screen" },
      },
      objects: [
        {
          // Segmented, three states across two published values: the marker
          // sits on "AUS" in one combination and on "AN" in the other, so
          // the bar is proven to move rather than merely to exist. The third
          // state is never active in either, which is the case that proves
          // an unmarked segment draws nothing at all.
          //
          // This object is also what covers the overpainted border: until
          // this change the outer rectangle was stroked first and then
          // erased by the per-segment fills. On a white screen with a grey
          // border, its absence is a difference on all 2*240 + 2*46 pixels
          // of the perimeter.
          id: "obj-marker-segmented",
          type: "Switch",
          zIndex: 0,
          x: 60,
          y: 60,
          width: 240,
          height: 46,
          properties: {
            topic: "hil-test/schalter",
            writeTopic: "hil-test/schalter/set",
            mode: "segmented",
            states: [
              { id: "ms-aus", label: "AUS", readValue: "0", writeValue: "0" },
              { id: "ms-an", label: "AN", readValue: "1", writeValue: "1" },
              { id: "ms-auto", label: "AUTO", readValue: "2", writeValue: "2" },
            ],
            backgroundColor: WHITE,
            activeBackgroundColor: BOX_FILL,
            borderColor: BORDER,
            textColor: BLACK,
            fontId: "font-helvR12",
          },
        },
        {
          // Single area, both halves of showMarker in one object: "1" is
          // marked, "0" is not, and the two published values walk through
          // both. The unmarked half is the one a positional convention
          // ("states[0] carries the bar") would have got wrong for anyone
          // who added their off state first.
          id: "obj-marker-single",
          type: "Switch",
          zIndex: 0,
          x: 60,
          y: 130,
          width: 115,
          height: 76,
          properties: {
            topic: "hil-test/schalter",
            writeTopic: "hil-test/schalter/set",
            mode: "single",
            states: [
              { id: "sg-an", label: "AN", readValue: "1", writeValue: "1", showMarker: true },
              { id: "sg-aus", label: "AUS", readValue: "0", writeValue: "0", showMarker: false },
            ],
            backgroundColor: WHITE,
            activeBackgroundColor: BOX_FILL,
            borderColor: BORDER,
            textColor: BLACK,
            // Der einzige gerundete Switch der Vorlage (2026-08-25). Nur
            // dieser eine: so stehen eckig und gerundet auf demselben Screen
            // nebeneinander, und ein Pixeldiff sagt sofort, welcher der
            // beiden Zeichenpfade sich bewegt hat. Der Rahmen wird dabei
            // nicht gestrichelt, sondern als groessere gefuellte Form mit
            // dem Hintergrund obendrauf gezeichnet - Adafruits
            // Ganzzahl-Primitiv, harte Kanten, kein Antialiasing. Genau
            // deshalb ist das hier pixelvergleichbar, waehrend die
            // antialiasten Ecken des gebackenen SoftwareButtons es nicht
            // waren.
            cornerRadius: 10,
            fontId: "font-helvR12",
          },
        },
        {
          // Single area bound to values that match no state in either
          // combination: the "?" case. On a device this is what every tile
          // shows between boot and its first retained value, and it has to
          // be distinguishable from "off" rather than looking like a state
          // that was configured without an icon.
          id: "obj-marker-unknown",
          type: "Switch",
          zIndex: 0,
          x: 185,
          y: 130,
          width: 115,
          height: 76,
          properties: {
            topic: "hil-test/schalter",
            writeTopic: "hil-test/schalter/set",
            mode: "single",
            states: [
              { id: "su-a", label: "NIE", readValue: "7", writeValue: "7", showMarker: true },
              { id: "su-b", label: "AUCH NIE", readValue: "8", writeValue: "8", showMarker: false },
            ],
            backgroundColor: WHITE,
            activeBackgroundColor: BOX_FILL,
            borderColor: BORDER,
            textColor: BLACK,
            fontId: "font-helvR12",
          },
        },
        {
          id: "obj-label-3",
          type: "label",
          zIndex: 1,
          x: 110,
          y: 230,
          width: 140,
          height: 27,
          properties: {
            text: "Marker",
            fontId: "font-helvR18",
            fontSize: 18,
            color: BLACK,
            textAlign: "left",
            fontWeight: "normal",
            backgroundColor: WHITE,
            borderColor: WHITE,
          },
        },
      ],
    },
  ],
}

// The export emits a screen's buttonActions only for ids listed in
// project.hardwareButtons (project-zip.ts loops it and resolves each id
// against the screen). Restating the list by hand got the knob dropped on
// the first try: the four swipes were declared, button-0 and button-1 were
// not, and the fixture still built and still uploaded - the loss only
// surfaced as "knob actions: FAIL (published [])" on hardware. Derived from
// the bindings instead, so a new binding can never be silently discarded.
function collectButtonIds(project) {
  const ids = new Set()
  for (const screen of project.screens) {
    for (const id of Object.keys(screen.buttonActions || {})) ids.add(id)
  }
  return [...ids].sort()
}

async function main() {
  // The export bakes a SoftwareButton's label into a bitmap, so it needs the
  // real font - not the metrics the project carries. Without the bytes it
  // falls back to a generic canvas font, and the device then faithfully
  // shows a button whose text is not the text the designer previews.
  // `path` stays unset on purpose, so no font file ends up in the zip: the
  // device already has these from its own DDF.
  project.fonts = withDdfFontData(project.fonts)

  project.hardwareButtons = collectButtonIds(project).map((id) => ({ id, name: id }))
  console.log(`binding ${project.hardwareButtons.length} button id(s): ${project.hardwareButtons.map((b) => b.id).join(", ")}`)

  const { chromium } = require("playwright")

  // A clear message beats a Playwright navigation timeout: this is the one
  // new prerequisite compared to the old hand-built builder.
  try {
    const probe = await fetch(`${DESIGNER_URL}/test-render`, { signal: AbortSignal.timeout(5000) })
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`)
  } catch (e) {
    console.error(`the designer dev server is not answering at ${DESIGNER_URL} (${e.message})`)
    console.error("start it with `npm run dev`, or set DESIGNER_URL - the export bakes bitmaps")
    console.error("on a canvas, so there is no headless path that skips the browser.")
    process.exit(1)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.error("[page error]", e.message))
  await page.goto(`${DESIGNER_URL}/test-render`, { waitUntil: "domcontentloaded" })
  await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 180000 })

  // buildDeviceProjectZip is the same function the Deploy and Export
  // dialogs call - DEFLATE compression, flattened backgrounds, baked
  // SoftwareButton and Switch-icon bitmaps and all.
  const base64 = await page.evaluate((p) => window.__buildDeviceZipForTest(p), project)
  await browser.close()

  const buf = Buffer.from(base64, "base64")
  fs.writeFileSync(OUT_PATH, buf)

  // Report what the export actually produced rather than trusting it. The
  // baked button bitmap is the entire reason this builder changed shape, so
  // its absence has to be loud rather than showing up as a pixel diff on
  // hardware three steps later.
  const zip = await JSZip.loadAsync(buf)
  const exported = JSON.parse(await zip.file("project.json").async("string"))
  const objects = exported.screens.flatMap((s) => s.objects || [])
  const buttons = objects.filter((o) => o.type === "SoftwareButton")
  const baked = buttons.filter((o) => o.pathNormal && o.pathActive)
  console.log(`Wrote ${OUT_PATH} (${buf.length} bytes)`)
  console.log(`  ${exported.screens.length} screen(s), ${objects.length} object(s)`)
  console.log(`  ${baked.length}/${buttons.length} SoftwareButton(s) carry a baked bitmap`)
  const shippedFonts = Object.keys(zip.files).filter((n) => n.startsWith("fonts/") && !zip.files[n].dir)
  console.log(`  ${shippedFonts.length} font file(s) in the zip (expected 0 - the device has its own)`)
  for (const s of exported.screens) {
    const actions = Object.keys(s.buttonActions || {})
    console.log(`  ${s.id}: ${actions.length} button action(s)${actions.length ? " - " + actions.join(", ") : ""}`)
  }
  if (baked.length !== buttons.length) {
    console.error("a SoftwareButton came out without its bitmap - the device would draw nothing there")
    process.exit(1)
  }

  const icons = objects.filter((o) => o.type === "icon")
  const bakedIcons = icons.filter((o) => o.path)
  console.log(`  ${bakedIcons.length}/${icons.length} icon(s) carry a baked bitmap`)
  if (bakedIcons.length !== icons.length) {
    console.error("an icon came out without its bitmap - the device would draw an empty box there")
    process.exit(1)
  }

  // Every id the fixture binds has to survive into the export. It did not,
  // the first time this builder went through the real pipeline.
  const wanted = collectButtonIds(project)
  for (const screen of exported.screens) {
    const got = Object.keys(screen.buttonActions || {}).sort()
    const source = project.screens.find((s) => s.id === screen.id)
    const expected = Object.keys(source.buttonActions || {}).sort()
    if (got.join(",") !== expected.join(",")) {
      console.error(`${screen.id}: expected actions [${expected}], export produced [${got}]`)
      process.exit(1)
    }
  }
  console.log(`  all ${wanted.length} bound button id(s) survived the export`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
