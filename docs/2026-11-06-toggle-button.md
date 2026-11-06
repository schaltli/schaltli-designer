# Toggle Button

Spec drafted 2026-11-06 from docs/ideas/toggle-button.md. One module: the
plain and the named tile are one form. **Status: approved by the user
on 2026-11-06.** Plan: tasks/toggle-button-plan.md.

## Objective

CamperUI shows a relay as one tile that is its state: its name on it,
coloured while on, a tap switching it. Schaltli can only compose that -
`relayTile` / `stateTile` in deploy/demo/camperui-project.ts build each
tile from a switcher, a panel per state and a button in each, seven
objects a tile, 16 buttons on «Schalter» alone. The composed tile looks
right and knows nothing: no ring for "asked, not confirmed", no «?» when
nothing is reported, no Convert to.

A **Toggle Button** is that tile as one object: a third switch type beside
Switch (`switch`, a knob) and Button Group (`button-group`, segments),
with their states, topics, `switchColor` and `switchStyle`. It is for
whoever builds a screen of relays, pumps, lights and hatches - the
CamperUI rebuild first.

## Decisions

1. **A type of its own**, `toggle-button`, labelled «Toggle Button» - the
   form is the type, as with the other two (the user, 2026-11-06).
2. **One rectangle, the reported state's look.** A state with `showAsOn`
   is filled in the colour, ink by the tone rule; any other state is the
   card colour with its 1-px edge and the text colour as ink -
   CamperUI's look, not the half mixture the knob uses (the user).
   `switchStyle` `tonal` softens the filled face as it does a group's.
3. **A tap sends the next state**, wrapping after the last, for any number
   of states (the user). With nothing reported yet it sends the first
   state that `showAsOn`, or the first state if none does: a grey tile
   tapped is meant to come on.
4. **Content from what a state has, plus a name.** The object's `text` is
   its name (optional, the property a button's label already uses).
   - Without a name: the state's icon and label centred, side by side in
     a strip, stacked in a tile - `switchContent` as for a segment.
   - With a name: the state's icon in a disc on the left, the name in the
     object's text size, the state's label below it **one size smaller**
     (`TEXT_STYLES`, e.g. Large -> Standard; Micro stays Micro) (the user).
5. **Pressed is the button's**: Material's state layer over the face, as
   the native button draws it (the user).
6. **Asked and reported, as on a group.** The face is always the reported
   state's; a request not yet confirmed puts the group's ring round the
   tile. Nothing reported: the quiet face, the name if there is one, «?»
   as the label.
7. **Devices draw exported looks, they compute nothing** (the user). The
   export writes, per state, the native button's look
   (`DeviceButtonLook`, docs/2026-11-04-native-buttons.md) plus what a
   named tile adds; the device picks the reported state's look and draws
   it with the button code it has. No geometry is ported to
   SwitchShape.h / SwitchShape.kt. Tapping reuses `stateIndexForTap`'s
   "next".
8. **Convert to becomes a family of three.** Toggle Button <-> Button
   Group always; Toggle Button -> Switch only with two states (the
   group's existing refusal). Properties carry over; `text` is dropped
   going to a type without a name and is empty coming from one.

## What it is, drawn

`lib/toggle-button-shape.ts`, pure and integer like `lib/button-shape.ts`,
which it builds on:

```ts
/** One state's face set, as the designer draws it and a device is told to. */
export interface ToggleLook extends DeviceButtonLook {
  /** The state's label under the name; absent without a name. */
  second?: { textX: number; baseline: number; fontId: string }
  /** The disc behind the icon in a named tile, per face. */
  disc?: { cx: number; cy: number; r: number; normal: string; pressed: string }
}

export function toggleLooks(obj: ScreenObject, background: string, colorDepth: string | undefined,
  fonts: readonly ProjectFont[]): { states: ToggleLook[]; none: ToggleLook; ring: string }
```

The canvas renderer (`render-toggle-button.ts`, beside
`render-software-button.ts`) draws only from this.

## Export

A Toggle Button in project.json carries its states as a switch does, and
`looks: ToggleLook[]` (one per state, same order), `noneLook` and `ring`.
The state icons are baked per face as a button's icon is. The smaller
font of a named tile's second line is exported like any font in use.
Devices declare `toggle-button` in `supportedObjectTypes` (every
ddf-source*/device.json and the Android DDF), and the designer offers the
tool only where the device declares it, as for every type.

## Devices

- **Firmware** (4", 4.3B, Knob, PaperS3): `ProjectLoader` reads the looks;
  `ColorScreenRenderer` draws the reported state's look with the native
  button's drawing, plus the second line, the disc and the ring; a state
  change redraws the face. PaperS3 in its greys from the exported colours.
- **Android**: a `ToggleButtonView` on `SoftwareButtonView`'s drawing, the
  same additions.
- No transition: older firmware is updated, not served (as in
  native-buttons).

## Designer

- Ribbon tool «Toggle Button» beside «Switch» and «Button Group», with an
  icon of its own in `components/icons/object-icons.tsx`.
- Property panel: the switch's states, topics, colour and style, plus
  «Name» (`text`) and the text size; no form-specific extras.
- Size and layout rules as for a button (`lib/layout.ts`, `size-scale`,
  `free-min-size`): never smaller than its content.
- Preview: tap = next, the ring while waiting, the state layer under the
  finger, «?» with no value.
- The CamperUI rebuild replaces `stateTile` with Toggle Buttons; the
  composed tiles go.

## Not doing

- A colour per state - one per object covers CamperUI.
- The name from Pekaway (GAPS line 6) - needs placeholders in `text`.
- Changing what the Block menu or Prebuilt place for on/off - buttons stay
  the default (prebuilt decision 9).
- `outlined` for switches, a vertical group, a project-wide form, a rocker
  (docs/ideas/toggle-button.md).

## Commands

```
npm run typecheck                 # includes e2e/
npm run test:quick                # every change (~7 min, see hil/README.md)
npm run test:all                  # before a release
npm run dev                       # one dev server per checkout, port 3000
npm run dev --prefix handbuch     # handbook preview
```

Firmware and app are built and flashed as in the memory notes
(schaltli-arbeitsplatz); `test:quick`'s lanes run each device's core
checks.

## Project structure

```
lib/toggle-button-shape.ts                 the look, pure
lib/render-toggle-button.ts                canvas drawing from it
lib/object-types.ts, convert-object.ts     the type, its family
lib/asset-export.ts                        looks into the export
components/toolbar, property-panel, icons  the designer's side
deploy/demo/camperui-project.ts            the rebuild uses it
../schaltli-firmware/src/project/          ProjectLoader, ColorScreenRenderer, ObjectTypes.h
../schaltli-firmware/ddf-source*/          supportedObjectTypes
../schaltli-android/.../ui/objects/        ToggleButtonView
handbuch/objekte/bedienen.md               the handbook page
```

## Code style

As lib/button-shape.ts and lib/switch-shape.ts: integer arithmetic with
`Math.trunc`, comments that say why and date decisions, English
identifiers and UI labels, every judgement in the shape module and none
in a renderer.

## Testing

- `e2e/toggle-button-shape.spec.ts`: `toggleLooks` pinned - on, off, none,
  pressed; plain and named; filled and tonal; 24 bit, grey, 1 bit; the
  second line one size smaller; Micro stays Micro.
- `e2e/toggle-button.spec.ts`: placing from the ribbon, the property
  panel, the preview's tap = next (wrapping, from none), the ring while
  waiting.
- `e2e/convert.spec.ts` extended: the family of three, the refusal.
- Export: a project with a Toggle Button exports its looks and no
  composed panels; the CamperUI rebuild has no `stateTile` switchers.
- HIL conformance (`hil/conformance/specimens.js`): Toggle Buttons plain
  and named, on and off and none, pressed, on every board, compared with
  the designer's picture; Android golden beside `SwitchShapeGoldenTest`.
- `e2e/handbook-labels.spec.ts` covers the new labels the handbook quotes.

## Boundaries

- **Always:** `npm run typecheck` then `npm run test:quick` for every
  change; turn every live check into a permanent test; the handbook page
  in the same piece of work; stage single files only.
- **Ask first:** changing the exported format of switches or buttons
  beyond adding fields; anything in the Block menu or Prebuilt defaults;
  flashing or deploying to the van.
- **Never:** porting geometry to the devices (decision 7); a second
  `next dev` in this checkout; Playwright runs beside a running
  `test:quick`.

## Success criteria

- One Toggle Button replaces a composed relay tile and looks the same on
  the 4" as the composed one does today, in the CamperUI rebuild.
- Designer, firmware on every board and the app agree to the pixel in
  conformance, nothing excused.
- A tap sends the next state; a pending request shows the ring; nothing
  reported shows «?».
- Convert to moves between all three types with the stated refusal.
- The handbook describes the Toggle Button with its labels checked.

## Open questions

- The disc behind the icon: the card's surface colour off, white at 22 %
  on the colour on (the variant page) - or no disc in 1 bit?
- Does a Toggle Button need its own minimum height for the named layout,
  or is "never smaller than its content" enough?
