# Plan: native buttons

From docs/2026-11-04-native-buttons.md (approved 2026-11-04). Branch
`native-buttons` in designer, firmware and android.

## Approach

**The designer computes, the devices draw.** Everything about a button's
look that takes judgement - the colours from one colour and what it stands
on (`buttonLook`: tonal tint, on-colour, the 10 % state layer, the inside-out
rule on 1 bit and grey), the radius and its pressed morph, where the icon and
label go (`buttonContentLayout`) - is worked out at export and written into
the device object as plain numbers and hex, for light and dark. A device then
draws only:

1. a rounded rectangle in `fill` with radius `r` (or none),
2. a 1-px ring in `outline` (or none),
3. the icon, a small picture already in the ink colour (only with an icon),
4. the label in the project's font at `textX`, `baseline`, in `ink`,
   clipped to `clipX … clipX + clipW`.

So no colour logic is ported, and nothing can drift: the firmware and the
app already have the integer rounded rectangle and ring the Switch uses
(Adafruit_GFX's `fillRoundRect`, `lib/switch-shape.ts`, Android's
`render/fillRoundRect`). The designer draws the button with that same
integer rasteriser at every depth - today only 1 bit does - so all three
are the same pixels by construction; the anti-aliased pill goes. Its edges
change by a pixel; the look spec (`e2e/software-button-look.spec.ts`) and
the renders are updated for it.

What a device gets on a `button` (light; each colour also as `…Dark`):

```jsonc
"look": {
  "normal":  { "r": 28, "fill": "#0ea5e9", "outline": null, "ink": "#ffffff" },
  "pressed": { "r": 11, "fill": "#2aaeea", "outline": null, "ink": "#ffffff" },
  "textX": 61, "baseline": 37, "clipX": 14, "clipW": 184,
  "icon": { "x": 40, "y": 26, "size": 11 }          // absent without an icon
},
"lookDark": { "normal": {...}, "pressed": {...} },   // colours only
"iconPath": "assets/…", "iconPathPressed": "assets/…" // + …Dark; only with an icon
```

Positions are relative to the button. `text`, `fontId` are there already.

## Tasks

- **T1 designer: `lib/button-shape.ts`** - pure: the look (normal, pressed)
  and the content layout for a button, its font's metrics and its measured
  label. `drawSoftwareButton` draws from it with the integer rasteriser at
  every depth. Verify: new `e2e/button-shape.spec.ts` (each style × depth,
  with and without icon, pinned); `software-button-look`/`-render` green.
- **T2 designer: export** - no `-button-normal/-active` pictures; the
  device object gets `look`/`lookDark` and, with an icon, the coloured icon
  pictures. Verify: `e2e/` export spec - no button pictures, the fields
  present; the CamperUI rebuild's zip unpacked under 600 KB.
- **T3 firmware: draw a button** - `ProjectLoader` reads `look`;
  `renderSoftwareButton` draws the four steps (light or dark by the theme
  topic), the pressed set while pressed. RGB panel and PaperS3 included.
  Verify: native test of the parse; HIL conformance specimen `button` and
  new specimens (tonal, outlined, with icon, pressed) on every board.
- **T4 android: draw a button** - `SoftwareButtonView` draws the same with
  the existing integer pill and ring. Verify: `hil/android` specimens.
- **T5 `button-radius`** - Settings › Cards gets a button radius in mm,
  empty = pill; `button-shape` uses it (pressed morph stays h/5, capped by
  it). Verify: button-shape spec; specimen with a radius.
- **T6 handbook and the 4"** - `handbuch/objekte/bedienen.md` (radius),
  the settings page; the CamperUI rebuild installed on the 4" again, its
  relay tiles with 1.5 mm corners. `test:quick`.

Releases of firmware and app only on the user's word.

## Risks

- **Pixel change of every button** in the designer (AA edge → integer). Small,
  and what the Switch already does; the user sees it in the comparison.
- **Text clipping and BDF drawing on the board** must match the designer's
  `drawText` - the label code the Text object uses is reused, not rewritten.
- **The icon picture** is one per ink colour; a pressed ink differs only on
  1 bit and grey inside-out, so usually one picture per variant.
