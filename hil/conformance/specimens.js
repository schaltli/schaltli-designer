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
          type: "text",
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
            type: "live-text",
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
            type: "live-icon",
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

  slider: {
    build: (c) => {
      const topic = c.topic("level", "numeric", LEVELS);
      // Settable: a write topic makes a bar operable, and a drag on it has to
      // publish what the finger set (designer
      // docs/2026-09-17-settable-level.md).
      const writeTopic = `${topic}/set`;
      const step = 5;
      // The marker: what was asked for, beside what is measured. Its own
      // examples differ from the level's, so the two never sit on top of each
      // other and "the handle is drawn where the handle belongs" is actually
      // checked (the arc specimen argues the same for its own).
      const setpointTopic = c.topic("setpoint", "numeric", ["10", "55", "95"]);

      // Two bars. Three stood here until 2026-09-19, differing only by
      // `markerStyle` - a property that no longer exists, because the shape
      // follows from what the object can do rather than from a menu
      // (docs/2026-09-19-slider-look.md, decision 4).
      //
      // The first carries a name, an icon and two numbers: that is the header
      // line, and it is the only thing on any device that exercises it - the
      // room it takes off the top, the column the numbers take off the end, and
      // the icon, which arrives as its own baked bitmap for the bar's own
      // renderer to blit rather than as part of the screen background.
      //
      // Stacked inside the wide slot rather than beside it, because that slot
      // is the one rectangle known to be clear of the bezel on a round screen.
      const gap = 6;
      const barHeight = Math.floor((c.wide.height - gap) / 2);
      const withHeader = {
        id: c.id("level-header"),
        type: "slider",
        zIndex: 1,
        x: c.wide.x,
        y: c.wide.y,
        width: c.wide.width,
        height: barHeight,
        properties: {
          topic,
          writeTopic,
          step,
          setpointTopic,
          label: "Tank",
          iconAssetId: BARS.id,
          iconColor: c.colors.fg,
          // The designer no longer reads these three: the bar has no box, and
          // its track is mixed from the fill and the screen's background
          // (docs/2026-09-19-slider-look.md, decision 12). They are still
          // written because the firmware on the boards has not followed yet
          // (run.js, PENDING_FIRMWARE) - delete them with that port.
          backgroundColor: c.colors.bg,
          borderColor: c.colors.border,
          trackColor: c.colors.track,
          fillColor: c.colors.accent,
          barDirection: "left-to-right",
          displayValue: "percentage",
          calibrationPoints: LINEAR,
          textColor: c.colors.fg,
          fontId: c.font("medium"),
          fontSize: c.fontSize("medium"),
        },
      };

      // The second is the plain form, and it is the one the drag aims at - on
      // purpose. With no name, no icon and no number its track is the object
      // inset by the 4 it has always been inset by, which is arithmetic this
      // file can do without knowing the header's layout rule. Working that rule
      // out a second time here is exactly the drift the shared geometry exists
      // to prevent (lib/level-shape.ts).
      const plain = {
        ...withHeader,
        id: c.id("level-plain"),
        y: c.wide.y + barHeight + gap,
        properties: {
          ...withHeader.properties,
          label: undefined,
          iconAssetId: undefined,
          displayValue: "none",
        },
      };

      const at = (fraction) => plain.x + 4 + Math.round((plain.width - 8) * fraction);
      const midPlain = plain.y + Math.round(barHeight / 2);
      return {
        assets: [BARS],
        drags: [
          {
            what: "the bar, to four fifths",
            from: { x: at(0.2), y: midPlain },
            to: { x: at(0.8), y: midPlain },
            topic: writeTopic,
            value: "80",
            // And what the glass then shows: the handle at what was asked for,
            // the fill still at what the installation last reported.
            // Photographed against the designer rendering exactly that, so
            // "the finger moves the handle, not the fill" is a picture and not
            // a promise (decision 6c).
            marker: { topic: setpointTopic, value: "80" },
          },
        ],
        objects: [withHeader, plain],
      };
    },
  },

  dial: {
    build: (c) => {
      const topic = c.topic("level", "numeric", LEVELS);
      // The marker's own value, and a second binding on the same object.
      // It was once invisible to combination generation, so the device kept
      // whatever the broker last held while the designer drew the first
      // example - a constant difference that reads as a rendering bug.
      const setpointTopic = c.topic("setpoint", "numeric", ["10", "55", "95"]);
      const thickness = Math.max(6, Math.round(c.square.width / 12));
      // Settable, like the bar: a finger on the ring moves the setpoint
      // marker and publishes it (docs/2026-09-17-settable-level.md). The
      // drag below runs across the top of the dial, from about a fifth of
      // the sector to about four fifths, and the value it must produce is
      // read off the same arithmetic both sides do - so it is asserted as a
      // range rather than one number, because a ring's angle to a pixel is
      // not the bar's exact percentage.
      const writeTopic = `${topic}/set`;
      const step = 5;
      const cx = c.square.x + Math.round(c.square.width / 2);
      const cy = c.square.y + Math.round(c.square.height / 2);
      const radius = Math.round(c.square.width / 2) - Math.round(thickness / 2) - 1;
      // 225 deg is the sector's start (7:30), 135 its end (4:30), clockwise
      // through twelve. A point at angle a sits at (sin a, -cos a) from the
      // centre.
      const onRing = (deg) => ({
        x: cx + Math.round(radius * Math.sin((deg * Math.PI) / 180)),
        y: cy - Math.round(radius * Math.cos((deg * Math.PI) / 180)),
      });
      return {
        drags: [
          {
            what: "the ring, a fifth of the way round to four fifths",
            from: onRing(279),
            to: onRing(81),
            topic: writeTopic,
            value: "80",
            marker: { topic: setpointTopic, value: "80" },
          },
        ],
        objects: [
          {
            id: c.id("arc"),
            type: "dial",
            zIndex: 1,
            ...c.square,
            properties: {
              topic,
              setpointTopic,
              writeTopic,
              step,
              minAngle: 225,
              maxAngle: 135,
              direction: "cw",
              thickness,
              markerWidth: 4,
              backgroundColor: "transparent",
              trackColor: c.colors.track,
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
            type: "live-line",
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

  // The only two types whose point is being pressed. Everything else in this
  // file is proven by being photographed; these two draw identically whether
  // or not a finger does anything, so a picture says nothing about them.
  //
  // A tap is checked by what the device sends, not by what it then draws:
  // pressing a Switch publishes a command and the state comes back later on
  // the read topic, so there is nothing to photograph at the moment of the
  // press. What is worth knowing is that the press was understood - that the
  // device found the object under the finger, worked out which segment, and
  // sent that segment's value.
  SoftwareButton: {
    build: (c) => ({
      taps: [
        {
          what: "the button",
          x: c.wide.x + Math.round(c.wide.width / 2),
          y: c.wide.y + Math.round(c.wide.height / 2),
          topic: "hil-conformance/button",
          value: "pressed",
        },
      ],
      objects: [
        {
          id: c.id("button"),
          type: "button",
          zIndex: 1,
          ...c.wide,
          properties: {
            text: "SENDEN",
            // A Material 3 button since 2026-09-19 (designer
            // docs/2026-09-19-button-look.md): a pill in one colour. Filled,
            // so the label is the only thing on it besides the container.
            // The square corners this specimen used to insist on - an
            // anti-aliased curve surviving the bake differently on each side -
            // are gone with the box; the bake is now drawn by the preview's own
            // function (e2e/software-button-look.spec.ts holds the two equal),
            // and the first run on glass says whether the 565 step agrees.
            buttonStyle: "filled",
            buttonColor: c.colors.accent,
            fontId: c.font("medium"),
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
      // A quarter and three quarters across: the middle of each of the two
      // segments, which is also the arithmetic the firmware does in reverse.
      const taps = [
        {
          what: "segment 0",
          x: c.wide.x + Math.round(c.wide.width / 4),
          y: c.wide.y + Math.round(c.wide.height / 2),
          topic: `${topic}/set`,
          value: "aus",
        },
        {
          what: "segment 1",
          x: c.wide.x + Math.round((c.wide.width * 3) / 4),
          y: c.wide.y + Math.round(c.wide.height / 2),
          topic: `${topic}/set`,
          value: "an",
        },
      ];
      return {
        taps,
        objects: [
          {
            id: c.id("switch"),
            type: "button-group",
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
              // A Material 3 connected button group since 2026-09-20
              // (designer docs/2026-09-20-switch-look.md): one colour, and how
              // loud the chosen state is. The firmware still draws the old box
              // with its marker bar, so this type is on run.js's
              // PENDING_FIRMWARE list until it is ported.
              switchStyle: "filled",
              switchColor: c.colors.accent,
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

  "switcher": {
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
          type: "text",
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
        type: "switcher",
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
