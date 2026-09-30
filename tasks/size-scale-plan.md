# Implementation plan: size-scale

Spec: `docs/2026-09-30-size-scale.md` (agreed 2026-09-30).
Task checklist: `tasks/size-scale-todo.md`.

Comes before `tasks/block-discovery-*`, whose Tasks 6, 7 and 13 wait for
it. Kept in files of its own because `tasks/plan.md` and `tasks/todo.md`
hold another session's plan.

## Overview

Device descriptions say how large their screen is in millimetres, what
family and weight each font is, and offer named typographies («Standard»
required). The designer keeps the millimetres of four text styles and of
S/M/L steps, and resolves them per device: text gets a Style and Bold
instead of a font, the dimension that makes an object's look snaps to a
step. Old projects stay as they are until an object is touched.

## What the code looks like today (surveyed 2026-09-30)

- **DDF:** `lib/device-description.ts` - `DeviceDescriptionFontEntry`
  (:17-32, no family or weight), `screen` (:53-65, no mm),
  `parseDeviceDescriptionFile` (:283-312), `deviceDescriptionToProjectFields`
  (:388-433). No JSON schema; the type is the contract
  (`docs/device-contract.md` §1, :23-95).
- **Project fonts:** `ProjectFont` (`components/project-editor.tsx`:230-250),
  filled from the DDF on a new project (:2495), on opening (:2752-2814) and
  on "Load device" (`project-settings-dialog.tsx`:566-626). A device change
  replaces `project.fonts` but never an object's `fontId`, `fontSize` or
  geometry.
- **Font pickers:** the shared `FontField` in six panels - text, live-text
  (these also set `fontSize` and height), bar/slider, gauge/dial, button,
  switch/switcher.
- **New objects:** `canvas.tsx` `handleMouseUp` (:2896-3215), mostly
  `fonts[0]` or the smallest font. `project-editor.tsx` `handleCreateObject`
  (:2056-2300) duplicates it and has no caller.
- **Resize:** `canvas.tsx` :2643-2830 - squares for icon/arc (:2652-2700),
  minimum clamps (:2805-2820), guide snapping; the hook for steps is after
  the clamps, before `updateInteractionObject` (:2823).
- **Export:** objects go out as they are; every `fontId` must be in
  `project.fonts` with size, ascent, descent (`lib/project-zip.ts`:470-478,
  `lib/asset-export.ts`, `lib/android-export.ts`).
- **Firmware DDFs:** Knob (360×360; Helvetica R/B 12-35, Courier 15/22),
  4.3B (800×480) and PaperS3 (960×540; Helvetica R/B 12-35, FreeUniversal
  R/B ~43, LogiSoSo 63 digits). Family and weight only in `internalName`.
- **Android:** `DdfBuilder.kt` (:55-120) - Roboto 12/16/20/24 from one TTF,
  screen in dp (`MainActivity.kt`:272-279), with a unit test.

## Architecture decisions

1. **An object keeps the style and the resolved result.** `textStyle` +
   `bold` next to `fontId`/`fontSize`; `sizeStep` next to width/height. The
   designer resolves on every change of style, step, typography or device
   and writes the result into the object, so renderers, export, the
   firmware and the app read what they read today. An object without
   `textStyle` / `sizeStep` is "Custom".
2. **`lib/size-scale.ts` is pure and holds the millimetres:** text styles,
   steps per object kind, gaps for blocks later; `pxPerMm(screen)`,
   `fontFor(style, bold, typography, fonts, pxPerMm)`,
   `stepPx(kind, step, pxPerMm)`, `nearestStep`, `isOnScale`. No React.
3. **Resolving is one function over the project:**
   `resolveScale(project) → project`, run after a device load, a typography
   change, and on the objects a style or step change touches. It never
   touches a Custom object.
4. **Android's millimetres come from dp:** 160 dp = 1 inch, which is what
   Android's dp means; `widthMm = widthDp / 160 * 25.4`. More Roboto sizes
   in its DDF, as the TTF scales freely.
5. **The firmware DDFs get the new fields by hand** from the panels' data
   sheets; the designer's e2e reads them from `../schaltli-firmware` as it
   already does (`e2e/ddf-seed.ts`).
6. **The dead `handleCreateObject` is not touched** by this plan; its
   removal is mentioned to the user, not done in passing.

## Task list

See `tasks/size-scale-todo.md`.

Phase 1 - what devices say
1. The designer reads millimetres, family/weight and typographies
2. The firmware DDFs say them (schaltli-firmware)
3. The Android app says them (schaltli-android)
   - Checkpoint A: every real DDF parses with a scale

Phase 2 - the scale
4. `lib/size-scale.ts`: millimetres, fonts within a family, steps

Phase 3 - text styles
5. Style and Bold on text and live text; Custom and Snap
6. a) Style and Bold on levels; b) on buttons and switches
   - Checkpoint B1: every font is a style, reviewed with the user
7. New objects start in Label / Display; blocks use the style
8. a) A device change gives styled text the new device's fonts;
   b) Typography in Project Properties
   - Checkpoint B: text on Knob, 4.3B and PaperS3, checked by eye

Phase 4 - size steps

9. a) Size S/M/L on levels; b) on switches, buttons and icons
10. Resizing and drawing snap the fixed dimension
    - Checkpoint C: steps on the devices, full e2e

11. Handbook pictures, device-contract guide, humanizer pass

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The start millimetres look wrong on a device | Med | Checkpoints B and C on the real devices before the values count; they live in one file |
| Re-resolving on device change moves objects the user placed | Med | Only the fixed dimension changes; position and free length stay; Custom objects are never touched |
| Six panels change their font field at once | Med | Split in Tasks 5, 6a and 6b; `font-select.spec.ts` already checks every panel uses the shared field - it becomes the check for the Style field |
| A text grows wider after a font change and is clipped | Low | Same as today after a device change; text width is free and shown in the canvas |
| Two other repos (firmware, Android) | Med | Only DDF fields; asked first; the designer works without them (no scale) |
| Old DDFs embedded in projects lack the fields | Low | No scale, as today, until "Load device" brings a new DDF |

## Open questions

None in the spec. For the user: remove the unused `handleCreateObject` in a
separate change?
