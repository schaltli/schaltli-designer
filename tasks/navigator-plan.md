# Implementation plan: the navigator, designer part (`navigator`)

Spec: `docs/2026-10-08-navigator.md` (2026-10-08). Issue #54; later #57
(live name). Tasks: `tasks/navigator-todo.md`. Chat German, docs English.

Scope: the spec's modules `screen-live-icon`, `navigator-designer` and
`navigator-export`. **Stops before** `navigator-4v3b`, `navigator-papers3`
and `navigator-android` (drawing, the fixed layer while swiping, tap and
scroll on the devices).

## Overview

A screen gets «Hide screen» and a screen icon that can be live. A master
gets a navigator object: placed on an edge, one entry per screen that is
not hidden, the open screen's entry in the accent. The canvas, thumbnails
and preview draw it; the preview opens a screen on a tap. The export writes
each navigator once, its entries as ordinary icon, text and box objects
(normal and active), and every screen says which navigator it shows.
Devices below 1.5 are warned about.

## Architecture decisions

- **One pure core, `lib/navigator.ts`**, written to be ported like
  `lib/live-value.ts`: the entries for a project (main screens, not
  hidden, in list order), sizes per «Shows», the strip for an edge on a
  screen, each entry's rectangle at a scroll offset, the scroll offset
  that shows an entry, the entry under a point. Its cases go to
  `lib/navigator/vectors.json` from the start, for firmware and app later.
- **One builder for entry objects, `navigatorEntryObjects`**: for an entry
  and normal/active, the icon object (live when the screen icon is live),
  the text object and, for active, the box - with roles for colours. The
  canvas draws through it (via `renderScreenObjects`) and the export writes
  what it returns. What the designer shows is then what a device gets,
  object for object.
- **The navigator's own geometry is derived, never edited.** `x/y/width/
  height` are set from «Edge», «Shows» and the screen size whenever one of
  them changes (`placeNavigator`); the object cannot be dragged or resized.
- **Master only, one per master.** The toolbar gets the current screen and
  offers the tool on a master that has none.
- **The screen icon's live value sits on the screen**: `screen.iconLive?:
  LiveValue` beside `iconAssetId` (which stays the Otherwise icon and what
  the Knob's page icon shows). `LiveValueEditor` is object-agnostic and is
  reused as is; the icon picker gets a context for a screen's rule.
  `exportedTopics`, combined-topic dependents and renames walk screen icons
  too.
- **«Hide screen» is `screen.hidden`.** The preview's next/previous and
  `firstScreenToOpen` skip it; `goto-screen` does not.
- **Export: `navigators[]` and `screen.navigatorId`** - a correction of the
  spec's single `navigator` (two masters can each have one; decision 16).
  The navigator object itself leaves the screens' objects. Icons in entries
  are baked like a live icon's branches (`exportIconUsage`), on the
  navigator's ground for normal and on the accent for active; Android gets
  tinted SVGs via `iconPathFor`.
- **The DDFs of the 4.3B and the PaperS3 list `navigator` in this plan**
  (data only, schaltli-firmware `ddf-source-*/device.json` and the zips in
  `public/ddf`), so the designer offers it before the firmware draws it;
  the deploy dialog's generation warning covers the gap, as it did for
  live values. Android's DDF is built by the app (`navigator-android`).

## Dependency graph

```
lib/navigator.ts (+ vectors) ─┐
screen.hidden ────────────────┼─> navigator object (type, tool, placement, panel)
screen.iconLive ──────────────┘        │
                                        ├─> entry objects + drawing (canvas, thumbnail, hatch)
                                        │        │
                                        │        └─> preview (tap, scroll)
                                        └─> export (board zip, Android, contract, generation, warning)
                                                 └─> handbook
```

## Task list

### Phase 1: screens (`screen-live-icon`)
- Task 1: «Hide screen»
- Task 2: The screen icon Fixed / Live

### Checkpoint: screens
- typecheck, the two specs, the e2e suite's screen and live value specs

### Phase 2: the navigator in the designer (`navigator-designer`)
- Task 3: `lib/navigator.ts` and its vectors
- Task 4: The navigator object: type, tool on a master, placement, panel
- Task 5: Entry objects and drawing, the hatched strip
- Task 6: The preview: tap and scroll

### Checkpoint: designer
- typecheck, e2e green; the user places a navigator and tries it in the preview

### Phase 3: export (`navigator-export`)
- Task 7: Board export, contract §2.7, generation 1.5, deploy warning, DDFs
- Task 8: Android export
- Task 9: Handbook

### Checkpoint: complete
- `npm run test:all`; a project without navigator or hidden screen exports
  byte-identical; spec status updated

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Canvas draws need project context (screens, active screen) inside `renderScreenObjects` | Med | Pass it in the existing options object; thumbnails and test-render go through the same path |
| Baked entry icons on a ground that is not a screen's | Med | Bake on a plain canvas of the navigator's colour; checked by an export test comparing the bitmap's corner pixel |
| Combined-topic dependents/rename miss screen icons | Med | Task 2 extends both, with an e2e case |
| A text in an entry wider than the entry | Low | Clipped by the text box as any text; the sizes come from mockup B1 |
| DDF change in schaltli-firmware offers a type no firmware draws yet | Low | Generation warning; `navigator-4v3b` follows |

## Open questions

- None blocking. The PaperS3 refresh for a live entry icon is settled in
  `navigator-papers3`.
