# Native buttons

Spec drafted 2026-11-04. Two modules, built in this order: `native-buttons`,
then `button-radius` (moved here from docs/2026-11-04-text-sizes-and-
colours.md, since both change how a device draws a button).
**Status: awaiting approval.**

## Objective

The CamperUI rebuild (eight pages, `deploy/demo/camperui-project.ts`) no
longer fits the 4": the board refuses it - «needs 3149 KB unpacked, the
device has 3039 KB». The user expects projects about five times this size
(2026-11-04).

What it is made of, unpacked:

| What | KB | files |
|---|---|---|
| Buttons, baked as pictures | 2467 | 46 |
| project.json | 216 | 1 |
| Icons and other pictures | 121 | 37 |

Packed, the zip is 125 KB. Every software button is exported twice - normal
and pressed - as an uncompressed 24-bit BMP with the screen's background
composited in (`lib/asset-export.ts` `exportSoftwareButton`): a 212 × 84
relay tile is 53 KB a picture. The Schalter page alone has 32 of them (a
tile is a switcher with a button per state, each in two looks). The 4"
has 3.4 MB for projects (`default_16MB.csv`: spiffs 0x360000); the firmware
is 2.2 MB in each of two 6.25 MB app slots.

Without baked buttons the rebuild is about 350 KB; five times that is about
1.8 MB and fits. So: **a device draws its buttons itself**, as it draws
texts and levels, from the button's properties.

## Module `native-buttons`

### What a button is, drawn

One place for the look, mirrored on the devices to the pixel, the way
`lib/switch-shape.ts` and `lib/level-shape.ts` are:

- **Container:** a pill (today) in the look's container colour, or none.
- **Outline:** 1 px in the look's outline colour, or none.
- **Content:** the label in the button's font (the project's 4-bit fonts,
  which the device has anyway) and the optional icon (the project's icon
  asset, coloured with the content colour), centred as one group, 8 px
  apart - `buttonLayout` today.
- **Styles:** filled, tonal, outlined, and the inside-out rule on grey and
  1-bit (`buttonLook`) - computed from the resolved colours, as the device
  already computes a switch's surfaces.
- **Pressed:** Material's state layer over the container, computed, not a
  second picture.

The look becomes a pure, integer module (`lib/button-shape.ts`): container,
outline, content colour, the pressed colour, and where label and icon go,
for a given button, font metrics and colour depth. The canvas renderer
(`render-software-button.ts`) draws from it; the export writes no button
pictures and the firmware and the app compute the same.

### Devices

- **Firmware** (4", 4.3B, Knob, PaperS3): `ColorScreenRenderer` draws a
  button as LVGL objects - a rounded rectangle, a label in the project's
  font, the icon image tinted - instead of loading
  `…-button-normal/active.bmp`. PaperS3 in its greys.
- **Android app:** `SoftwareButtonView` draws the same with Canvas.
- **An old firmware never gets a project it cannot draw.** How the designer
  knows the installed firmware draws buttons (a version on the board's
  reply, a capability in the DDF) is decided in the plan; until it knows,
  it bakes as today.

### What does not change

- What a button does, its properties in the designer, its size.
- Icons and images that are pictures stay pictures (packing them is a
  later module, if needed).
- The partition table: changing it means flashing every board over USB
  once; only if this is not enough.

### Testing

- `e2e/`: the export of a project with buttons has no
  `-button-normal`/`-active` files; the rebuild's zip unpacked under 600 KB;
  `lib/button-shape.ts` pinned for each style, depth, with and without icon
  (a spec beside `e2e/switch-*.spec.ts`).
- HIL conformance (`hil/conformance/specimens.js`): buttons in every style,
  pressed and not, with an icon, on every board, compared with the
  designer's picture as today's specimens are.
- `hil/android/`: the same specimens in the app.
- The CamperUI rebuild installed on the 4" again
  (`e2e/camperui-rebuild.spec.ts`, CAMPERUI_DEVICE).

## Module `button-radius`

- A button's corner radius, set in millimetres beside the cards' in
  Settings › Cards; unset it stays a pill, so existing projects look as
  today. CamperUI's 10 px on the 4" is 1.5 mm.
- Part of `lib/button-shape.ts`, so every device draws it once
  `native-buttons` is in.
- Handbook: the setting where Settings › Cards is described, and the
  Button's properties.
- Tests: in the button-shape spec and the conformance specimens.

## Handbook

- `handbuch/objekte/bedienen.md` (Button): the corner radius.
- Where the handbook says a project is too large for a device, what takes
  room now. Through `maettel-humanizer`.

## Boundaries

- **Always:** designer, firmware and app agree to the pixel, by one shared
  shape module mirrored; `test:quick` per change; handbook in the same work.
- **Ask first:** changing the partition table; packing pictures; any
  release of firmware or app (only on the user's word).
- **Never:** a project sent to a firmware that cannot draw it.

## Success criteria

- [ ] No button pictures in an export for a device that draws buttons
- [ ] The CamperUI rebuild installs on the 4" and looks as before
- [ ] Buttons on every board and in the app match the designer
      (conformance specimens)
- [ ] Button corner radius in mm, default a pill, drawn everywhere
- [ ] Old firmware still gets baked buttons
- [ ] `test:quick` green apart from known load failures

## Open questions

1. How the designer learns that a board's firmware draws buttons (answered
   in the plan).
2. Switches are drawn by `lib/switch-shape.ts`, its header says «once it
   is ported» to the firmware - whether switches are baked too, and if so,
   whether they belong in this module.
