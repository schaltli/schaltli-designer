# Sizes and fonts from a physical scale

Agreed 2026-09-30, from an interview with the user. Comes before
docs/2026-09-30-block-discovery.md, whose blocks will place objects in
these sizes.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `ddf-physical` | A device description says how large its screen is in millimetres, what family and weight each font is, and offers one or more typographies - which family each text style uses | DDF schema, designer, the three firmware DDFs, Android's `DdfBuilder` | - |
| `text-styles` | Text is set in a style - Caption, Label, Title, Display - and a bold switch, not in a font | designer | `ddf-physical` |
| `size-steps` | The dimension that makes an object's look - a bar's thickness, a dial's diameter, a switch's height - comes in steps S, M, L | designer | `ddf-physical` |

## Objective

A screen looks consistent only if its user sizes every object and picks
every font by hand, the same way each time. Dragging a block's rectangle
gives it whatever size the gesture happened to have. That is work, and it
is not a pit of success.

The themes solved the same problem for colour: an object has a role, not a
hex value, and the theme says what the role looks like. Sizes and fonts get
the same treatment: an object has a style or a step, and the scale says
how large that is - in millimetres, so that a label reads the same on the
1.8" Knob as on the 4.3" panel, and the larger screen simply has more room.

The work is split by who knows what:

- **The device** knows facts and taste: how large its screen is, which
  fonts it has, and which of its font families suits which style - a
  decorative family for titles, a plain one for small text. The designer
  cannot judge a typeface; it only sees line heights.
- **The project** picks one of the device's typographies, if it offers
  more than one.
- **Schaltli** knows the scale: how many millimetres a Label or an M
  switch is. That is a design decision, like a theme's roles, kept in one
  place in the designer so that it can be tuned without touching any
  device description.
- **The designer** puts the two together: the style's millimetres, in the
  device's pixels, in the size of the style's family that comes closest.

Decided with the user 2026-09-30:

- The scale is **physical, in millimetres**, converted to pixels through
  the screen's size, which the device description gives.
- **Fixed in steps, free in length:** fonts are styles only; the dimension
  that carries an object's look comes in steps S/M/L; a length or width,
  where the object has one, stays free.
- **Existing projects stay as they are until an object is touched.** An
  object off the scale shows "Custom" with a button that snaps it.
- **Four text styles and bold:** Caption, Label, Title, Display, and a bold
  switch beside them.
- **The device names one font family per style;** the designer picks only
  the size within it.
- **A device may offer several typographies** - named sets of style →
  family, say «Standard» with Helvetica throughout and «Playful» with a
  rounder face. The project picks one. **Every device offers «Standard»**,
  and it is the fallback whenever a project's typography is not on its
  device - after switching the project to another device, for one.
  Typographies are chosen in the designer; a device does not switch them
  at run time.
- **The millimetres are Schaltli's,** fixed; no factor per project (for
  now).
- **Fonts are best effort:** the family's size that comes closest, with no
  warning when none fits well; bold only where the family has it.
- **Android reports its own size:** the app writes its screen's
  millimetres into the device description it builds, from the display's
  real density. Before it has, its project has no scale and behaves as
  today.

## Behaviour

### What a device description says (`ddf-physical`)

```json
"screen": { "width": 800, "height": 480, "widthMm": 95.0, "heightMm": 57.0 },
"fonts": [
  { "id": "font-helvR18", "family": "Helvetica", "weight": "regular", "size": 27, … },
  { "id": "font-helvB18", "family": "Helvetica", "weight": "bold",    "size": 27, … },
  { "id": "font-hallo45", "family": "Halloween", "weight": "regular", "size": 45, … }
],
"typography": [
  { "name": "Standard", "styles": { "caption": "Helvetica", "label": "Helvetica", "title": "Helvetica", "display": "Helvetica" } },
  { "name": "Spooky",   "styles": { "caption": "Helvetica", "label": "Helvetica", "title": "Halloween", "display": "Helvetica" } }
]
```

1. `screen.widthMm` / `heightMm`: the active area. From them the designer
   takes pixels per millimetre.
2. Every font gains `family` and `weight` (`regular` or `bold`). `size` is
   its line height in pixels, as today.
3. `typography` is a list of named sets, each naming one family per style.
   One of them must be called «Standard»; a device description without it
   is treated as one without typography (point 6). A family may be a
   single size (a decorative title face, a digits-only face for Display):
   that is the device's choice.
4. The firmware DDFs get the millimetres from the panels' data sheets (Knob
   1.8, 360 × 360 round; Waveshare 4.3B, 800 × 480; PaperS3, 960 × 540), and
   `family`, `weight` and a «Standard» typography for the fonts they carry.
   Further typographies need further fonts in the firmware and are a
   decision of their own, later.
5. The Android app computes the millimetres from
   `DisplayMetrics.xdpi/ydpi` when it builds its DDF, and names its own
   families.
6. A device description without these fields (an old one, a third
   party's, an Android app that has not connected yet) has no scale: its
   projects behave as today, every object "Custom", fonts picked by hand.
   Screen size without a typography: size steps work, text stays as today.

The millimetres below are also written into `docs/device-contract.md` as a
guide for whoever chooses a device's fonts: a family for Label should have
sizes around 3 mm on that screen, and so on.

### Text styles (`text-styles`)

| Style | Line height | For |
|---|---|---|
| Caption | 2.0 mm | the smallest text, alongside: a unit, a hint, a time - «V», «%» |
| Label | 3.0 mm | the ordinary text that names a control: «Frischwasser» |
| Title | 4.5 mm | a heading, of a screen or a section: «Wohnraum» - the first thing seen |
| Display | 7.0 mm | a big value, a reading more than text: «21.5» |

- Every object with a font - Text, Live Text, a level's value, a switch's
  and a button group's labels, a button - has a **Style** and **Bold**
  instead of a font picker.
- The style's millimetres become pixels on the project's device; the font
  used is the one of the style's family, in the chosen weight, whose line
  height comes closest. No bold in that family: regular. Worked through on
  the 4.3B (about 8.4 px/mm) with the example above: Caption 17 px →
  Helvetica 18; Label 25 px → 25; Title 38 px → Halloween 45, its only
  size; Display 59 px → Helvetica 35, its largest.
- New objects start in Label (Display for a level's value where it stands
  alone), regular.
- The exported project names a concrete font as today, so **devices need
  no change** beyond their DDF.

The millimetres are a starting point, to be checked on the three devices
before the module is done.

### Choosing a typography

- **Project Properties** show **Typography** with the device's
  typographies, only when it offers more than one. A new project starts
  in «Standard».
- The project keeps the name. On a device that has a typography of that
  name it is used; on one that has not, «Standard» is.
- Changing it keeps every object's style and bold, and the fonts are
  picked anew - as after a change of device. A text can come out wider.

### Size steps (`size-steps`)

| Object | The step sets | Stays free | S / M / L (start values) |
|---|---|---|---|
| Bar, Slider | thickness (height if horizontal, width if vertical) | length | 4 / 6 / 9 mm |
| Gauge, Dial | diameter | - | 15 / 25 / 35 mm |
| Switch, Button Group | height | width, at least what its labels need | 6 / 8 / 11 mm |
| Button | height | width | 6 / 8 / 11 mm |
| Icon, Live Icon | edge | - | 4 / 6 / 9 mm |

- The properties show **Size [S | M | L]**. Resizing on the canvas snaps
  the fixed dimension to the nearest step; the free one follows the mouse.
- New objects start at M; drawing one drags only its free dimension.
- The values are a starting point, to be checked on the devices; a
  finger-sized M is the one that matters (about 8 mm).
- Further measures the blocks will need (the gap between icon and label,
  between parts) are millimetres in the same place, with no change to any
  device description.

### Existing projects

- Loading changes nothing. An object whose fixed dimension or font is not
  a step or style shows **Custom (37 px)** and a **Snap** button that
  moves it to the nearest step or style.
- Resizing it or choosing a step or style puts it on the scale; from then
  on it stays there.
- Nothing snaps by itself: no layout breaks on opening.

### Switching a project to another device

The steps and styles are what an object keeps; the pixels and fonts follow
the device. A project moved from the 4.3B to the Knob keeps «Label, M» and
gets the Knob's font and pixels for it. Free lengths are kept in pixels,
as today.

## Tech stack

Next.js / React 19 / TypeScript, Playwright; Kotlin for the Android DDF;
the firmware DDF sources are JSON. No new dependency.

## Commands

```
Typecheck:  npm run typecheck
This spec:  npx playwright test e2e/size-scale.spec.ts (new)
Full:       npm run test:all
```

## Project structure

```
lib/size-scale.ts                         → styles, steps, mm → px, font within a family (pure)
lib/device-description.ts                 → reads widthMm/heightMm, family/weight, typography
components/property-panel/fields/*        → Style + Bold, Size, Custom + Snap; Typography in Project Properties
components/canvas/interactions/*          → resize snaps the fixed dimension
components/project-editor.tsx             → new objects at Label / M
docs/device-contract.md                   → the new DDF fields, the millimetres as a guide
../schaltli-firmware/ddf-source*/device.json → the new fields
../schaltli-android/…/ddf/DdfBuilder.kt   → the new fields
e2e/size-scale.spec.ts                    → the tests
handbuch/…                                → the pages on objects and properties
```

## Testing strategy

- Pure (`e2e/size-scale.spec.ts`): mm → px per device; the font within a
  family per style on each firmware DDF, including a single-size family and
  a family without bold; a second typography, and «Standard» as the
  fallback for a name the device lacks; a DDF without «Standard» has no
  typography; steps per object type; Custom detection with the
  tolerance of a pixel; a DDF without the fields gives no scale.
- Browser: a new slider is M; resizing snaps its thickness and not its
  length; a text's Style picks the expected font on the 4.3B and on the
  Knob; an old project opens unchanged, shows Custom, and Snap moves it.
- Export: the exported fonts and pixel sizes are what the devices already
  understand (the existing export and HIL specs stay green).
- On the devices: the start values checked by eye on Knob, 4.3B and
  PaperS3, and a picture of each kept for the handbook.

## Boundaries

- **Always:** devices get what they get today (concrete fonts and pixels);
  an old project opens unchanged; handbook updated with each module.
- **Ask first:** changing the firmware repo and the Android repo (DDF
  fields only); tuning the start values.
- **Never:** snap anything on load; let the designer choose a font family;
  accept a device description's typographies without a «Standard».

## Success criteria

- [ ] A Label and an M switch measure the same in millimetres on the Knob
      and on the 4.3B (measured on the devices, within a font step).
- [ ] Nothing in a new project needs a font picked or a size typed to look
      consistent.
- [ ] An existing project opens and exports byte-for-byte as before until
      an object is touched.
- [ ] Changing a style's or a step's millimetres in the designer changes
      every device's result, with no device description touched.

## Open questions

None. Decided 2026-09-30: an Android app that has not connected has no
DDF and so no scale; whether Display uses a digits-only face is the
device's choice of family.
