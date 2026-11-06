# Plan: Toggle Button

From docs/2026-11-06-toggle-button.md (approved 2026-11-06). Branch
`toggle-button` in the designer, from `prebuilt` (it needs prebuilt's
Convert to); `toggle-button` in firmware and android from master.

## Approach

**The designer computes, the devices draw** - native-buttons' rule, taken
one step further: a Toggle Button is a native button with a look per
state. `lib/toggle-button-shape.ts` builds on `lib/button-shape.ts` and
works out, for every state and for «none», the faces (normal, pressed),
where icon and label go, and for a named tile the second line and the
disc. The export writes that as numbers and hex, light and dark. A device
draws the reported state's look with its button code and adds three
things only: the second line, the disc, the ring.

**Switch semantics for free where they are generic.** `isSwitchType` (9
call sites in 6 files: property panel, canvas, export, android export,
zip) decides states, topics, the ring and the bake of state icons. The
Toggle Button joins it where the meaning is "has states", and is split off
where it means "has a knob or segments". T1 reads each call site and
decides; nothing joins blindly.

What a device gets on a `toggle-button` (light; colours also `…Dark`):

```jsonc
"states": [ ... as on a switch ... ],
"looks": [                                     // one per state, same order
  { "normal": {...}, "pressed": {...}, "textX": 61, "baseline": 37,
    "clipX": 14, "clipW": 184, "icon": {...},
    "second": { "textX": 61, "baseline": 58, "fontId": "standard-…" },
    "disc": { "cx": 30, "cy": 42, "r": 18, "normal": "#…", "pressed": "#…" } }
],
"noneLook": { ... },                           // nothing reported: «?»
"ring": "#…",
"text": "Wasserpumpe"                          // the name, may be empty
```

## Tasks

- **T1 designer: the type and its look** - `toggle-button` in
  `lib/object-types.ts` (label, operate type, family); every
  `isSwitchType` call site decided; `lib/toggle-button-shape.ts` pure:
  `toggleLooks` for plain and named, filled and tonal, every depth, none,
  the second line one size smaller. Verify: new
  `e2e/toggle-button-shape.spec.ts` pinned; existing switch and button
  specs green.
- **T2 designer: drawn, placed, operated** - `render-toggle-button.ts`
  from the looks; ribbon tool and icon; property panel with «Name»; size
  rules (`layout`, `size-scale`, `free-min-size`); preview: tap = next
  (wrapping, from none the first `showAsOn`), the ring while waiting, the
  state layer, «?». Verify: new `e2e/toggle-button.spec.ts`.
- **Checkpoint A** - `test:quick` green; the user looks at plain and named
  tiles in light, dark, grey and 1 bit and decides the two open
  questions (the disc's colours and whether 1 bit has one; a minimum
  height for named).
- **T3 designer: Convert to, a family of three** - `convert-object.ts`
  from pairs to families; Toggle -> Switch only with two states; `text`
  dropped or empty across. Verify: `e2e/convert.spec.ts` extended.
- **T4 designer: export** - `looks`, `noneLook`, `ring` in project.json
  and the Android export; state icons baked per face; the second line's
  font exported. Verify: an export spec - fields present, the fonts in
  the zip, no panels composed.
- **T5 firmware** - `ObjectTypes.h`, `ProjectLoader` reads the looks;
  `ColorScreenRenderer` draws the reported look with the button's code,
  plus second line, disc and ring; tap = `stateIndexForTap`'s next; RGB
  panel, 4.3B, Knob, PaperS3. `toggle-button` in every
  `ddf-source*/device.json`. Verify: native test of the parse; conformance
  specimens (plain, named, on/off/none, pressed, pending) on every board.
- **T6 android** - `ToggleButtonView` on `SoftwareButtonView`'s drawing,
  same additions; the DDF. Verify: golden beside `SwitchShapeGoldenTest`,
  `hil/android` specimens.
- **Checkpoint B** - conformance passes on every board and the app,
  nothing excused.
- **T7 the CamperUI rebuild** - `stateTile` replaced by Toggle Buttons,
  named where CamperUI shows a name; the composed-tile comment and its
  GAPS wording go; installed on the 4" and compared with today's picture.
  Verify: the rebuild's export spec; a photo or screenshot side by side.
- **T8 handbook** - `handbuch/objekte/bedienen.md`: the Toggle Button,
  its name, tap = next, ring and «?»; Convert to's family; labels marked
  `ui`. Verify: `e2e/handbook-labels.spec.ts`; `test:quick`; humanizer.

Every task: `npm run typecheck`, its spec, `npm run test:quick`, single
files staged, a commit. Releases of firmware and app only on the user's
word.

## Risks

- **`isSwitchType` is wide.** Joining it carelessly gives the Toggle
  Button a knob's hit test or a group's segments. Mitigation: T1 decides
  each call site and the specs of both existing types stay green.
- **A second text line on the device.** The button draws one label; the
  second must clip and baseline exactly as the designer's. Reuse the
  label code with a second position rather than writing new text code.
- **Two fonts per object.** The font export collects sizes in use; the
  smaller one must be counted, or a device draws a fallback. T4's spec
  checks the zip.
- **The working tree is shared.** Another session works on `prebuilt` in
  this checkout. The branch is made only once that work is committed;
  no `git add` on folders.
