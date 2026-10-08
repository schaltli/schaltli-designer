# Todo: the navigator, designer part

Plan: `tasks/navigator-plan.md`. Spec: `docs/2026-10-08-navigator.md`.

## Task 1: «Hide screen»

**Description:** A checkbox «Hide screen» in a main screen's properties
(`screen.hidden`). The preview's next/previous skip hidden screens, the
preview starts on the first screen that is not hidden, «Go to a screen»
still reaches one. The screen list marks a hidden screen.

**Acceptance criteria:**
- [x] Swiping in the preview passes over a hidden screen; a button with «Go to a screen» opens it.
- [x] A project whose first screen is hidden opens the preview on the next.
- [x] Not offered on a master or a popup.

Done 2026-10-08. `isPagedScreen` (lib/popup.ts) for next/previous;
`firstScreenToOpen` takes the first paged screen, so the editor opens there
too. The screen fields take `onPatch` for the screen's own fields, which
Task 2 uses as well. The screen list marks a hidden screen «Hidden».

**Verification:** `npx playwright test e2e/navigator.spec.ts -g "Hide screen"`; typecheck.

**Dependencies:** None · **Scope:** S

**Files likely touched:** `components/screen-editor-fields.tsx`, `lib/popup.ts`
(`firstScreenToOpen`), `components/project-editor.tsx` (preview actions,
`ProjectScreen`), `components/screens-panel/*`, `e2e/navigator.spec.ts`

## Task 2: The screen icon Fixed / Live

**Description:** The screen icon gets «Fixed / Live» like an icon object;
Live opens `LiveValueEditor` (icon results) stored as `screen.iconLive`,
its Otherwise the fixed icon. The icon picker gets a screen-rule context.
`exportedTopics`, combined-topic dependents and renames include screen
icons. The screen list's icon shows the branch that applies.

**Acceptance criteria:**
- [x] A live screen icon on «any light on» shows the lit bulb with a test value «true» and the dark one with «false».
- [x] A combined topic read by a screen icon cannot be deleted and is renamed in it.
- [x] Its topic is in the exported `topics[]`.

Done 2026-10-08. `screen.iconLive` (Otherwise = `iconAssetId`, which the
Knob's page icon keeps showing); `lib/screen-icon.ts` turns a screen's icon
into the icon object it amounts to, so `iconAsDrawn` draws it - checked
there, the canvas draws it from Task 5 on. The screen list keeps showing
the fixed icon. Project Settings' screen list offers only the fixed icon
and says where a live one is set.

**Verification:** `npx playwright test e2e/screen-live-icon.spec.ts`; typecheck.

**Dependencies:** None · **Scope:** M

**Files likely touched:** `components/screen-editor-fields.tsx`,
`components/project-editor.tsx` (icon selector context), `lib/render-screen.ts`
(`exportedTopics`), `lib/combined-topics.ts`, `e2e/screen-live-icon.spec.ts`

## Checkpoint: screens
- [x] typecheck; `e2e/navigator.spec.ts`, `e2e/screen-live-icon.spec.ts`, `e2e/live-value*.spec.ts`, `e2e/combined-topics.spec.ts` green (with popup-screens, property-panel, handbook-labels: 287)

## Task 3: `lib/navigator.ts` and its vectors

**Description:** The pure core: entries of a project, sizes per «Shows»,
the strip for an edge, entry rectangles at a scroll offset, the offset that
shows an entry (last visible cut off), the entry under a point. Cases in
`lib/navigator/vectors.json`.

**Acceptance criteria:**
- [x] Every vector passes; four edges, both «Shows», 3 and 12 screens, hidden screens, masters and popups left out.

Done 2026-10-08: 31 cases, expected values worked out by hand. Decided
here, for the user to see at the designer checkpoint: entries that all fit
share the strip evenly (a bar along the bottom with three screens is three
thirds, as mockup B3); otherwise each is as short as it may be (64 icons,
88 icons and text) and the navigator scrolls. Strip 64 thick for icons, 80
for icons and text.

**Verification:** `npx playwright test e2e/navigator-core.spec.ts`

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `lib/navigator.ts`, `lib/navigator/vectors.json`, `e2e/navigator-core.spec.ts`

## Task 4: The navigator object

**Description:** Type `navigator` (object-types, icon, draw order, label),
the tool offered on a master that has none and listed by the DDF,
placement on its edge (`placeNavigator`), not draggable or resizable, a
panel with «Edge», «Shows», «Font».

**Acceptance criteria:**
- [x] The tool is there on a master, gone on a normal screen and once a navigator exists.
- [x] Changing «Edge» or «Shows» moves and sizes it; dragging does nothing.

Done 2026-10-08. A click places it on the left edge, icons and text, the
smallest font. `staysPut` (lib/navigator.ts) keeps it and locked objects
from dragging, resizing and nudging. Roles: «Surface», «Text», «Accent»,
«Text on accent» on new colour keys `activeColor` / `activeTextColor`.
Drawn from Task 5; until then the canvas shows nothing of it. The tests use
a 4.3B fixture whose DDF declares it (`seedWaveshare4v3bDdf` takes a
change now).

**Verification:** `npx playwright test e2e/navigator.spec.ts -g "object"`; typecheck.

**Dependencies:** Task 3 · **Scope:** M

**Files likely touched:** `lib/object-types.ts`, `components/icons/object-icons.tsx`,
`lib/object-order.ts`, `components/toolbar/toolbar.tsx`, `components/canvas/canvas.tsx`,
`components/property-panel/navigator-properties.tsx`

## Task 5: Entry objects and drawing

**Description:** `navigatorEntryObjects` builds an entry's objects (normal,
active) with theme roles; `render-screen` draws a navigator through them,
the current screen's entry active (on the master: the first screen's). On
a screen using a master with a navigator, the strip is hatched in edit
mode. Thumbnails and test-render draw it.

**Acceptance criteria:**
- [x] The canvas draws exactly what `navigatorEntryObjects` returns (test-render comparison).
- [x] A new screen appears in the navigator; a hidden one disappears; a live screen icon follows its test value.
- [x] The strip is hatched on a screen, not in the preview.

Done 2026-10-08. `lib/navigator-entries.ts` builds an entry (icon 32 px
centred, the name under it, an accent box inset 4 px with 8 px corners for
the open one); `renderNavigator` (lib/render-screen.ts) draws the ground and
the entries through `renderScreenObjects`, nested, clipped to the strip -
for the canvas, thumbnails and test-render alike. Checked by pixels at known
places rather than a second picture, since a picture built by hand would
not take the nested route icons take. 55 rendering specs, 818 tests green.

**Verification:** `npx playwright test e2e/navigator.spec.ts -g "draw"`

**Dependencies:** Tasks 2, 4 · **Scope:** M

**Files likely touched:** `lib/navigator-entries.ts`, `lib/render-screen.ts`,
`components/canvas/renderers/render-navigator.ts`, `components/canvas/canvas.tsx`

## Task 6: The preview

**Description:** In the preview a click on an entry opens its screen; a
drag along the navigator scrolls it, never pages; after a screen change it
scrolls to show the active entry.

**Acceptance criteria:**
- [x] Click opens the screen; a drag on the navigator scrolls and does not page; with 12 screens the active entry stays visible.

Done 2026-10-08. The designer's preview pages only through the device's
swipe buttons, never by a drag on the canvas, so a drag on the navigator
cannot page there by construction. A press on the strip belongs to the
navigator: moved more than 4 px it scrolls, else it opens the entry. The
mouse handlers read the scroll through a ref, being callbacks with fixed
dependencies.

**Verification:** `npx playwright test e2e/navigator.spec.ts -g "preview"`

**Dependencies:** Task 5 · **Scope:** S

**Files likely touched:** `components/canvas/canvas.tsx`, `components/project-editor.tsx`

## Checkpoint: designer
- [x] typecheck; e2e green

2026-10-08: the full e2e run 1331 passed, 3 failed: font-select (the
navigator's panel picks a font and was missing from its list; it uses
FontField now and is listed), mock-simulator and project-persistence-api
(both pass on their own, 6/6).
- [ ] The user places a navigator on a master and tries it in the preview

## Task 7: Board export, contract, generation

**Description:** The device export writes `navigators[]` (edge, thickness,
entry length, colours, entries with `normal`/`active` objects, icons baked
on their grounds including live branches) and `screen.navigatorId`,
`screen.hidden`; the navigator leaves the screens' objects. Device contract
§2.7, spec's export section corrected (`navigators[]`). `NAVIGATOR_GENERATION`
1.5 and its deploy warning. `navigator` in the 4.3B's and PaperS3's DDF
sources and `public/ddf` zips.

**Acceptance criteria:**
- [x] A project with a navigator exports it once, with every entry's bitmaps in the zip.
- [x] A project without navigator or hidden screen exports byte-identical.
- [x] The warning names the navigator / hidden screens below 1.5, not at 1.5.

Done 2026-10-08. `deviceObject` (lib/project-zip.ts) is the one mapping
from object to device object, for screens and navigator entries alike;
entries' icons are baked on their own ground (lib/asset-export.ts
bakeNavigators), keyed `nav-<master>-<screen>-normal|active`. «Byte-
identical» is checked as «no new key» - the export carries a timestamp. The
spec's export section is corrected to `navigators[]` / `navigatorId`;
device contract §2.7. DDFs: schaltli-firmware 34d48a9, `public/ddf` zips regenerated from them.

**Verification:** `npx playwright test e2e/navigator-export.spec.ts e2e/placeholders.spec.ts`; typecheck.

**Dependencies:** Task 5 · **Scope:** M

**Files likely touched:** `lib/project-zip.ts`, `lib/asset-export.ts`,
`lib/system-generation.ts`, `components/deploy-dialog.tsx`, `docs/device-contract.md`,
`docs/2026-10-08-navigator.md`, schaltli-firmware `ddf-source-*/device.json`, `public/ddf/*.zip`

## Task 8: Android export

**Description:** The same in `lib/android-export.ts`, icons as tinted SVGs.

**Acceptance criteria:**
- [x] The Android bundle carries `navigators[]` with icon paths that exist in it.

Done 2026-10-08. `appObject` (lib/android-export.ts) maps screens' and
entries' objects alike; entry icons and live results as tinted SVGs, light
and dark. Android's DDF is built by the app, which declares the navigator
in `navigator-android`.

**Verification:** `npx playwright test e2e/navigator-export.spec.ts -g "Android"`

**Dependencies:** Task 7 · **Scope:** S

**Files likely touched:** `lib/android-export.ts`, `e2e/navigator-export.spec.ts`

## Task 9: Handbook

**Description:** A «Navigator» section, «Hide screen» and the live screen
icon on the screens page, with a warning that devices draw it from 1.5
(`handbuch-macke` with the device issue). Through `maettel-humanizer`.

**Acceptance criteria:**
- [x] `e2e/handbook-labels.spec.ts` green; every new label quoted exists.

Done 2026-10-08: objekte/anordnen.md «Navigator», objekte/index.md (17
types, the Knob has none), designer/screens.md («Hide screen», the live
screen icon). Both warnings carry `handbuch-macke #54`; #54 is labelled
handbuch. The handbook builds, the warnings render as blocks.

**Verification:** `npx playwright test e2e/handbook-labels.spec.ts`; `npm run dev --prefix handbuch` looks right.

**Dependencies:** Tasks 1-8 · **Scope:** S

**Files likely touched:** `handbuch/objekte/*.md`, `handbuch/designer/screens.md`

## Checkpoint: complete
- [ ] `npm run test:all` with what is connected
- [ ] Spec status updated
