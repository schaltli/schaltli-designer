# Instrument styles for gauge and bar

Spec drafted 2026-11-23 from a conversation with the user. The style
proposals live in the artifact «Instrumentenkabinett»
(https://claude.ai/artifact/L7rPDLdoks8N2NQHrffVf2). **Status: approved
by the user, 2026-11-23.**

## Objective

Gauge (`arc-level`, read-only) and bar (`level-indicator`, read-only) today
have one look: flat, one colour, no frame (docs/2026-09-19-slider-look.md,
docs/2026-09-22-arc-look.md). This adds a choice of **styles that copy
physical instruments**: a brass pressure gauge, an art-deco dial, a
moving-coil meter, a 60s roadster, a cockpit instrument, a rally gauge, a
VFD, a truck fuel gauge, a blue/red 90s compact-car cluster, a modern
cluster, an engraving for e-paper. All eleven are built (decision 4).

A style decides the material, the scale decides what is measured. The user
sets the range, the ticks, the labels, the zones; the style draws them in
its own way.

## Decisions

All by the user, 2026-11-23.

1. **The sweep belongs to the style.** A moving-coil meter has its 80°, a
   fuel gauge its 110°, a roadster its 250°. With a style set, `minAngle`,
   `maxAngle` and `direction` of the gauge are ignored.
2. **A style may exceed what a device can hold, for now.** No size limit
   in the designer; a 400 px gauge face of about 312 KB (RGB565) is
   allowed even where there is no PSRAM. To be revisited once it hurts.
3. **Labels can be edited.** Presets such as «E ½ F» or «LEER · HALB ·
   VOLL» fill the labels from the current range; after that each label's
   value and text can be changed by hand.

4. **All eleven styles are built**, not a first selection. No community
   vote beforehand; a forum poll may come later, once styles run on real
   devices.
5. **On a round display a styled gauge may fill the whole display**, case
   included. The case is then the display's edge.
6. **E-paper shows every style, converted to grey.** No style is barred
   from e-paper; the baked face goes through the device's colour depth as
   everything else does. The engraving remains the style made for it.

Taken over from the conversation without a separate decision:

7. **Zones are given by meaning, not by colour:** `danger`, `warning`,
   `ok`. Each style draws them its own way (glowing red, a red line,
   cross-hatching on e-paper), so changing the style needs no new zones.
8. **Damping belongs to the style**, the user only chooses between the
   style's motion and none (`motion: "style" | "direct"`).
9. **Face text is baked, not sent as a font** (see Fonts).

## Data model

Everything that exists stays and keeps its meaning: `topic`,
`setpointTopic`, `calibrationPoints` (range and non-linear mapping),
`displayValue`, and for the bar `direction`; `textColor` and
`fontId`/`fontSize` only for the flat look. New, the same on gauge and bar:

```ts
style?: InstrumentStyle        // missing = today's flat look, old projects unchanged
caption?: string               // «FRESH WATER», printed on the face
unit?: string                  // «°C»
scale?: {
  majorStep?: number           // in value units; missing = automatic
  minorPerMajor?: number       // missing = automatic, by pixel size
  labels?: { value: number; text: string }[]  // missing = numbers at the major ticks
  decimals?: number
  factor?: number              // cockpit «W × 100»: labels 0-4 for 0-400
}
zones?: { from: number; to: number; kind: "danger" | "warning" | "ok" }[]
motion?: "style" | "direct"
readout?: boolean              // digital value, only on styles with a field for it
```

Ticks, labels and zones are in value units and go through
`calibrationPoints`. A tank with a non-linear calibration gets unevenly
spaced ticks, as a real fuel gauge has.

With a style set, `fillColor`, `thickness`, `minAngle`, `maxAngle` and the
gauge's `direction` are ignored and hidden in the property panel.

### Set by the user, fixed by the style

| Set by the user | Fixed by the style |
|---|---|
| range and calibration (existing) | material, face colours, glass |
| topic and setpoint marker (existing) | needle shape, shadow, glow |
| tick step and subdivision | tick length and weight, label position |
| labels, decimals, factor | the face's typefaces |
| caption, unit | where caption and unit sit |
| zones and their kind | what a zone looks like |
| motion: style or direct | the damping itself |
| | whether there is a digital field, and its font |
| size, bar direction (existing) | sweep, smallest sensible size |

Every style has a horizontal and a vertical bar, since the bar's
`direction` stays a setting.

### Automatic ticks

Without `majorStep` the designer picks a round step (1, 2 or 5 × 10ⁿ) from
the range and the pixel size. Each style has a smallest tick spacing in
pixels; below it minor ticks go first, then every second label. Set by
hand, the user's values win and the designer only warns when they get too
dense.

## Two layers

- **Static layer:** case, face, ticks, labels, zones, caption, glass. The
  designer draws it at the object's actual size and bakes it into an image
  that goes into the project zip, through `applyColorDepth` like
  everything else a device shows. Rebaked whenever a property that shows on
  it changes. Images named by content hash, so two identical tank gauges
  share one file.
- **Dynamic layer:** what moves. The device draws it live from a
  description in the project, built from five primitives:
  1. **rotate** polygons and circles about a point (needle)
  2. **translate** polygons along an axis (bar pointer, meniscus)
  3. **fill** a rectangle or an arc up to the value (bar fill, light ring)
  4. **segments** with a threshold each, on or off (VFD)
  5. **text**: the digital value, glyphs from a strip baked in the style's typeface

  plus the style's spring constants. Cap and glass are top layers of the
  same description, not an image (see Spike results).

Every display target draws it: the ESP32 firmwares and the Android app
alike (no device gets a reduced set). The dynamic layer is drawn with
integer arithmetic shared between designer, firmware and Android, as `lib/arc-raster.ts` does for today's arc, so the designer
shows the device's pixels. Since the device only needs the primitives, a
new style needs no firmware release.

## Fonts

- **Face text** - numerals, caption, unit, labels, small print such as
  «Kl. 1,5» - is part of the baked image. The style typefaces ship with the
  designer (OFL faces such as IM Fell English, Playfair Display, Oswald,
  Saira, Share Tech Mono). They cost no flash on a device and work at any
  size.
- **Live text** is only the digital value. The style chooses its font
  (the user, 2026-11-23): the designer bakes the glyphs a readout can show
  in the style's own typeface into a small strip image beside the face,
  and the device places them. No project font and no `fontId` for a styled
  readout.
- **Light and dark:** a styled face looks the same in both themes (the
  user, 2026-11-23); it exports no `…Dark`.

Browsers render type slightly differently per OS. The baked image is what
the device shows, so device and export always agree; only a preview on
another machine can differ by a pixel until it is rebaked.

## Motion

Each style carries a spring: frequency and damping ratio (pressure gauge
1 Hz / 0.32, fuel gauge 0.45 Hz / 1.0, VFD instant). The device simulates
it per control and redraws the needle's region for a second or two after a
change. The slow fuel gauge is a real filter against sloshing, not only a
look. On e-paper motion is always `direct`.

## Out of scope

- Styles that are interactive (dial, slider). Only the read-only controls.
- Colour by value (docs/2026-11-13-colour-by-value.md) on styled
  instruments.
- A size or memory limit per device (decision 2).

## Spike results (2026-11-23, 4.3B)

A throwaway benchmark on the 4.3B (schaltli-firmware branch
`spike/instrument-styles`, `?set=gaugebench=m|n,<px>`) restored a stand-in
face under the needle, blended the needle's layers and a glass/cap overlay,
and presented the dirty rectangle, with the needle swinging. Float
distance-field rasterization, so the cost shape, not the final arithmetic.

Per frame, needle at its widest (45°), rasterizing only the row spans the
needle reaches:

| | 400 px | 300 px | 200 px |
|---|---|---|---|
| pressure gauge (shadow, 4 shapes) | 28.6 ms, 35 fps | 17.4 ms, 57 fps | 8.8 ms, 112 fps |
| night cluster (glow, 1 shape) | 12.4 ms, 81 fps | 8.0 ms, 125 fps | 4.2 ms, 238 fps |

Walking the needle's whole bounding box instead was five times slower
(400 px pressure gauge 84 ms, 12 fps): **spans are a must.** At 400 px the
rest splits into restoring the face (5.4 ms), the overlay (2.9 ms) and the
present (6.5 ms). The first frame of a swing costs about 65 ms (the three
framebuffers each take the whole face once).

The user watched both needles swing at 400 px on the 4.3B (`,show`: a run
of seven values, 3 s each) and found the motion fine.

**Conclusions:**

- Smooth enough on the slowest of our boards, even at 400 px. Several
  gauges swinging at once add up; a screen of four 200 px gauges stays
  around 35 ms.
- The needle body is a polygon, so it uses `PolygonRaster` (designer,
  firmwares, Android already share it, integer, in spans). Glow and shadow
  follow `lib/level-glow.ts`: an alpha table by whole pixels of distance
  from the shape, mixed into what lies beneath, plus an offset for the
  shadow. The designer draws the needle with that shared code, never with
  an SVG filter, so it shows the device's pixels.
- **No overlay image.** The cap and the glass crescent become top layers of
  the dynamic description (a circle, an analytic crescent with an alpha
  ramp), which saves 468 KB of PSRAM per 400 px gauge.
- **Memory is the real limit, not speed.** A 400 px face held in PSRAM is
  312 KB (RGB565), 200 px 78 KB; the 4.3B has about 3.4 MB of PSRAM free
  with a project loaded, 1 MB of it reserved for fonts. Decision 2 stands,
  but four or five 400 px gauges on one screen is where a board runs out.
- **Zip size is no problem.** Faces baked from the style proposals, as
  today's BMP24 asset deflated in the zip: 32-148 KB at 400 px, 14-48 KB at
  200 px; all eleven styles at 400 px together 913 KB (measured with the
  needle still drawn on, so slightly high). On the device's file system,
  stored unpacked, a 400 px BMP24 is 470 KB of a 3.4 MB partition: faces go
  there as RGB565 (312 KB) or stay compressed and are unpacked once into
  PSRAM when a screen is loaded.
- When to bake: at export, from the project; the editor shows the same
  drawing live. Baking time was not measured; with eleven faces drawn as
  SVG it is not expected to matter.

## Testing and handbook

This changes what a device draws and the project format, so per CLAUDE.md
it needs `npm run test:quick`; the dynamic primitives need conformance
specimens (`hil/conformance/specimens.js`) for each, compared pixel by pixel
with the designer. The handbook pages on gauge and bar get the style
choice, the scale settings and the zones.
