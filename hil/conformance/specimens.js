// One representative object per object type, device-independent.
//
// This is the only place that knows what a control needs to be worth
// photographing: a Switch needs two states and a topic that actually changes
// between them, an arc-level needs a value AND a setpoint, a line needs a
// bend to have a fillet at. Everything geometric is derived from the slot the
// run hands in, so the same table serves a 360x360 round panel and an
// 800x480 one.
//
// Each specimen gets a screen to itself and the screen is named after the
// type, so a failing case names the control rather than a screen number.
//
// The shapes here are lifted from the two fixtures that were hand-built
// before this existed (hil/epaper/fixtures/build-comprehensive-test.js and
// hil/waveshare/fixtures/build-smoke-test.js), because those are the ones
// proven to render identically on both sides. Where they carry a comment
// about why a property is the way it is, that reasoning is repeated here
// rather than lost.
//
// Values, not appearance, drive coverage: a specimen registers topics with
// several examples, and hil/combinations.js turns those into one comparison
// per combination. A specimen with no topic is photographed once.

// Two stencils, inline rather than fetched. A test that reached
// api.iconify.design would fail on a bench with no internet, and this is
// meant to run next to the hardware.
//
// A ring rather than a disc on purpose: the hole is what shows whether a
// tint painted the shape or its bounding box.
const RING_SVG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iY3VycmVudENvbG9yIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMiAxLjVBMTAuNSAxMC41IDAgMSAwIDEyIDIyLjVBMTAuNSAxMC41IDAgMSAwIDEyIDEuNVpNMTIgNkE2IDYgMCAxIDEgMTIgMThBNiA2IDAgMSAxIDEyIDZaIi8+PC9zdmc+";
// Two stacked bars: shares no pixels with the ring, so "the wrong icon
// showed" cannot be mistaken for "the right icon drew slightly wrong".
const BARS_SVG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iY3VycmVudENvbG9yIiBkPSJNNCA0aDE2djVINHptMCAxMWgxNnY1SDR6Ii8+PC9zdmc+";

const RING = { id: "asset-ring", name: "ring", type: "icon", data: RING_SVG };
const BARS = { id: "asset-bars", name: "bars", type: "icon", data: BARS_SVG };

// Calibration that maps a percentage straight through, so a fixture value of
// 37 is a bar at 37% and a reader can check the picture by eye.
const LINEAR = [
  { value: 0, barSizePercent: 0 },
  { value: 100, barSizePercent: 100 },
];

// Deliberately not round numbers next to each other: values that land on
// distinctly different bar widths make an off-by-a-few-pixels bar visible as
// a real difference rather than as rounding.
const LEVELS = ["0", "37", "88"];

// Non-ASCII on purpose. A device drawing from a compiled-in font with fewer
// glyphs than the .bdf it serves renders these blank while the designer draws
// them, and a suite whose every string was ASCII could not see it (reported
// from hardware 2026-08-22). Capital umlauts also reach a pixel above the
// nominal ascent, which is where clipping shows.
const TEXT_SAMPLE = "Grüße Öl 10€";

const SPECIMENS = {
  label: {
    build: (c) => ({
      objects: [
        {
          id: c.id("label"),
          type: "label",
          zIndex: 1,
          ...c.wide,
          properties: {
            text: TEXT_SAMPLE,
            fontId: c.font("large"),
            fontSize: c.fontSize("large"),
            color: c.colors.fg,
            textAlign: "left",
            fontWeight: "normal",
            backgroundColor: c.colors.bg,
            borderColor: c.colors.border,
          },
        },
      ],
    }),
  },

  box: {
    build: (c) => ({
      objects: [
        {
          id: c.id("box"),
          type: "box",
          zIndex: 1,
          ...c.wide,
          properties: {
            fillColor: c.colors.accent,
            strokeColor: c.colors.fg,
            strokeWidth: 3,
            cornerRadius: 8,
          },
        },
      ],
    }),
  },

  line: {
    build: (c) => {
      // An acute spike, not a straight segment: the fillet radius and both
      // arrowheads only have something to do at a bend, and the arrowhead
      // primitive is drawn on top of the fillet geometry rather than beside
      // it, so a plain segment would exercise neither.
      const { x, y, width, height } = c.wide;
      // Integers, deliberately, and the midpoint of an odd width is where
      // that stops being automatic.
      //
      // A fractional coordinate used to be read by the firmware as 0 rather
      // than rounded - ArduinoJson returns the fallback when a float is asked
      // for as an int - which put the apex in the screen corner and was worth
      // 2669 differing pixels. That is fixed in parseLinePoints now, and
      // rounding a half pixel is all it can do: the designer rasterises the
      // vertex at 400.5 and the firmware at 401, which still leaves 97
      // pixels along one leg. Real, small, and not something either side is
      // getting wrong - so the specimen stays on whole pixels and the suite
      // keeps its zero tolerance.
      const points = [
        { x, y: y + height },
        { x: Math.round(x + width / 2), y },
        { x: x + width, y: y + height },
      ];
      return {
        objects: [
          {
            id: c.id("line"),
            type: "line",
            zIndex: 1,
            x,
            y,
            width,
            height,
            properties: {
              color: c.colors.fg,
              strokeWidth: 2,
              strokeStyle: "solid",
              filletRadius: Math.max(4, Math.round(height / 4)),
              points,
              arrowStart: true,
              arrowEnd: true,
            },
          },
        ],
      };
    },
  },

  icon: {
    build: (c) => ({
      assets: [RING],
      objects: [
        {
          id: c.id("icon"),
          type: "icon",
          zIndex: 1,
          ...c.square,
          properties: {
            assetId: RING.id,
            // Tinted rather than left at its authored colour: the designer
            // recolours the stencil and the device blits what it was handed,
            // so a disagreement about what the tint did shows up here as a
            // pixel count.
            iconColor: c.colors.fg,
            backgroundColor: "transparent",
          },
        },
      ],
    }),
  },

  MqttDataField: {
    build: (c) => {
      const topic = c.topic("temperature", "numeric", [
        "21.5",
        "-4.0",
        "100.0",
      ]);
      return {
        objects: [
          {
            id: c.id("mqttfield"),
            type: "MqttDataField",
            zIndex: 1,
            ...c.wide,
            properties: {
              topic,
              displayAs: "Display as-is",
              // Required, not optional: without a resolvable fontId the
              // designer silently falls back to a generic canvas font while
              // the firmware always resolves some compiled-in font, and the
              // two then draw different glyphs for a reason that belongs to
              // neither.
              fontId: c.font("medium"),
              backgroundColor: c.colors.bg,
              borderColor: c.colors.border,
              textColor: c.colors.fg,
              textAlign: "left",
              prefix: "",
              postfix: " °C",
            },
          },
        ],
      };
    },
  },

  MQTTIconField: {
    build: (c) => {
      const topic = c.topic("lock", "string", ["00", "01"]);
      return {
        assets: [RING, BARS],
        objects: [
          {
            id: c.id("mqtticon"),
            type: "MQTTIconField",
            zIndex: 1,
            ...c.square,
            properties: {
              topic,
              backgroundColor: "transparent",
              iconColor: c.colors.fg,
              valueIconPairs: [
                {
                  id: "pair-locked",
                  comparisonOperator: "=",
                  value: "01",
                  thenShowIcon: RING.id,
                },
                {
                  id: "pair-unlocked",
                  comparisonOperator: "=",
                  value: "00",
                  thenShowIcon: BARS.id,
                },
              ],
            },
          },
        ],
      };
    },
  },

  "level-indicator": {
    build: (c) => {
      const topic = c.topic("level", "numeric", LEVELS);
      return {
        objects: [
          {
            id: c.id("level"),
            type: "level-indicator",
            zIndex: 1,
            ...c.wide,
            properties: {
              topic,
              backgroundColor: c.colors.bg,
              borderColor: c.colors.border,
              fillColor: c.colors.accent,
              barDirection: "left-to-right",
              displayValue: "percentage",
              calibrationPoints: LINEAR,
              textColor: c.colors.fg,
              fontId: c.font("medium"),
            },
          },
        ],
      };
    },
  },

  "arc-level": {
    build: (c) => {
      const topic = c.topic("level", "numeric", LEVELS);
      // The marker's own value, and a second binding on the same object.
      // It was once invisible to combination generation, so the device kept
      // whatever the broker last held while the designer drew the first
      // example - a constant difference that reads as a rendering bug.
      const setpointTopic = c.topic("setpoint", "numeric", ["10", "55", "95"]);
      const thickness = Math.max(6, Math.round(c.square.width / 12));
      return {
        objects: [
          {
            id: c.id("arc"),
            type: "arc-level",
            zIndex: 1,
            ...c.square,
            properties: {
              topic,
              setpointTopic,
              minAngle: 225,
              maxAngle: 135,
              direction: "cw",
              thickness,
              markerWidth: 4,
              backgroundColor: "transparent",
              trackColor: c.colors.border,
              fillColor: c.colors.accent,
              markerColor: c.colors.fg,
              displayValue: "none",
              calibrationPoints: LINEAR,
            },
          },
        ],
      };
    },
  },

  MqttDataLine: {
    build: (c) => {
      // Signed values: the magnitude drives stroke width and the sign drives
      // which end shows an arrow, so both arrow directions and a range of
      // widths get exercised rather than one static appearance.
      const topic = c.topic("current", "numeric", ["-60", "0", "72"]);
      const { x, y, width, height } = c.wide;
      const midY = y + Math.round(height / 2);
      const points = [
        { x, y: midY },
        { x: x + width, y: midY },
      ];
      return {
        objects: [
          {
            id: c.id("dataline"),
            type: "MqttDataLine",
            zIndex: 1,
            x,
            y: midY,
            width,
            height: 1,
            properties: {
              topic,
              color: c.colors.fg,
              filletRadius: 0,
              points,
              calibrationPoints: [
                { value: 0, barSizePercent: 1 },
                { value: 80, barSizePercent: 16 },
              ],
              arrowStartOperator: "<",
              arrowStartValue: "0",
              arrowEndOperator: ">",
              arrowEndValue: "0",
            },
          },
        ],
      };
    },
  },

  SoftwareButton: {
    build: (c) => ({
      objects: [
        {
          id: c.id("button"),
          type: "SoftwareButton",
          zIndex: 1,
          ...c.wide,
          properties: {
            text: "SENDEN",
            backgroundColor: c.colors.bg,
            borderColor: c.colors.border,
            textColor: c.colors.fg,
            fontId: c.font("medium"),
            fontWeight: "normal",
            borderWidth: 1,
            // Square corners, and that is a rule rather than a taste. This
            // object's appearance reaches the device as a bitmap the export
            // bakes, and a rounded corner's anti-aliasing survives that chain
            // differently on each side. Everything else here is chosen so an
            // exact comparison is achievable at all.
            cornerRadius: 0,
            action: {
              type: "send-mqtt",
              mqttTopic: "hil-conformance/button",
              mqttMessage: "pressed",
            },
          },
        },
      ],
    }),
  },

  Switch: {
    build: (c) => {
      // Two examples, one per state, so the active marker actually moves.
      // A Switch whose topic is never published looks identical on both sides
      // with nothing active, and the entire active-marker path goes
      // uncovered while the pixel diff stays at zero.
      const topic = c.topic("schalter", "string", ["0", "1"]);
      return {
        objects: [
          {
            id: c.id("switch"),
            type: "Switch",
            zIndex: 1,
            ...c.wide,
            properties: {
              topic,
              writeTopic: `${topic}/set`,
              states: [
                {
                  id: "st-off",
                  label: "AUS",
                  readValue: "0",
                  writeValue: "aus",
                },
                { id: "st-on", label: "AN", readValue: "1", writeValue: "an" },
              ],
              backgroundColor: c.colors.bg,
              activeBackgroundColor: c.colors.border,
              borderColor: c.colors.border,
              textColor: c.colors.fg,
              activeTextColor: c.colors.bg,
              fontId: c.font("medium"),
            },
          },
        ],
      };
    },
  },

  // A panel is only ever meaningful as a tab-control's child: both renderers
  // treat a stray top-level one as a deliberate no-op. So the panel specimen
  // still builds a tab-control - what it exercises is the panel's own
  // condition deciding what shows, with two children that share no pixels so
  // "the wrong panel showed" cannot look like "the right one drew wrong".
  panel: {
    build: (c) => tabbed(c, "panel"),
  },

  "tab-control": {
    build: (c) => tabbed(c, "tab"),
  },
};

// A tab-control holding two panels, each with one child, for both the
// tab-control and the panel specimens.
//
// The child's type is chosen from what the device declares, which is not a
// detail. An icon is the better test - a nested one is not flattened into
// the exported background the way a top-level one is, which is the case that
// once shipped blank - but the e-paper supports no "icon" type at all, and
// handing it one asked the board to draw a control it never claimed. It
// rendered its unknown-type placeholder, the comparison called it 24000
// differing pixels, and the fault was here rather than on the device
// (2026-09-12).
//
// Whatever the child is, the two panels must share no pixels, so that "the
// wrong panel showed" can never be mistaken for "the right one drew wrong".
function tabbed(c, prefix) {
  const topic = c.topic("doorman", "string", ["LOCKED", "OPEN"]);
  const { x, y, width, height } = c.square;
  const inner = { x: 0, y: 0, width, height };
  const useIcons = c.supports("icon");

  const child = (name, asset, text) =>
    useIcons
      ? {
          id: c.id(name),
          type: "icon",
          zIndex: 0,
          ...inner,
          properties: {
            assetId: asset.id,
            iconColor: c.colors.fg,
            backgroundColor: "transparent",
          },
        }
      : {
          // The fallback, for a device without icons. Two words that share
          // no glyph, so the two panels still cannot be confused.
          id: c.id(name),
          type: "label",
          zIndex: 0,
          ...inner,
          properties: {
            text,
            fontId: c.font("large"),
            fontSize: c.fontSize("large"),
            color: c.colors.fg,
            textAlign: "left",
            fontWeight: "normal",
            backgroundColor: c.colors.bg,
            borderColor: c.colors.border,
          },
        };

  return {
    assets: useIcons ? [RING, BARS] : [],
    objects: [
      {
        id: c.id(prefix),
        type: "tab-control",
        zIndex: 1,
        x,
        y,
        width,
        height,
        properties: { topic },
        children: [
          {
            id: c.id(`${prefix}-locked`),
            type: "panel",
            zIndex: 0,
            ...inner,
            properties: { comparisonOperator: "==", comparisonValue: "LOCKED" },
            children: [child(`${prefix}-locked-child`, RING, "ZU")],
          },
          {
            id: c.id(`${prefix}-open`),
            type: "panel",
            zIndex: 1,
            ...inner,
            properties: { comparisonOperator: "==", comparisonValue: "OPEN" },
            children: [child(`${prefix}-open-child`, BARS, "AUF")],
          },
        ],
      },
    ],
  };
}

module.exports = { SPECIMENS };
