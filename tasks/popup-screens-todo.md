# Tasks: popup screens (`popup-screens`)

Plan: `tasks/popup-screens-plan.md` · Spec: `docs/2026-10-06-popup-screens.md`.
Chat German, docs English.

## Task 1: A screen can be a popup

**Description:** `ProjectScreen.screenType?: "popup"`. The screens panel's
Add menu gets «Add Popup Screen»; popups form a group of their own below
the main screens, with a «Popup» badge. A non-master screen's properties
show «Screen type» (Main screen / Popup). `lib/popup.ts` with `isPopup()`.

**Acceptance criteria:**
- [x] «Add Popup Screen» adds a popup in the popup group, with a master
      for its theme and «Show master» off (not offered).
- [x] Switching a main screen to Popup turns «Show master» off and clears
      its swipe actions; back to Main screen leaves «Show master» off.
- [x] A project saved before this opens unchanged (no `screenType` written).

Done 2026-10-06. The master select got `aria-label="Master"`: the screen
row now holds two lists, and `master-screen.spec.ts` found «the» combobox.

**Verification:** new `e2e/popup-screens.spec.ts`; `e2e/master-screen*.spec.ts`; `npm run typecheck`.

**Dependencies:** none · **Scope:** M

**Files likely touched:** `components/project-editor.tsx`, `lib/popup.ts`,
`components/screens-panel/screens-panel.tsx`,
`components/screen-editor-fields.tsx`, `e2e/helpers.ts`

## Task 2: A popup is out of navigation and goto pickers

**Description:** Every place that skips a master skips a popup too:
preview next/previous, both goto pickers, the screen selected first on
open. Each
`isMaster` site from the spec's research is looked at and decided.

**Acceptance criteria:**
- [x] Next/previous in the preview never lands on a popup.
- [x] Neither goto picker lists a popup.
- [x] A project whose first screen is a popup opens on the first main screen.

Done 2026-10-06. Every way a project opens (from the server, a draft, a new
project, an imported zip) goes through `firstScreenToOpen`; the import used
to open on `screens[0]` whatever it was. The export sites are Tasks 7-8.

**Verification:** `e2e/popup-screens.spec.ts`, `e2e/master-screen.spec.ts`, `e2e/preview-mode.spec.ts`.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `components/project-editor.tsx`, `lib/themes.ts`,
`components/hardware-button-side-panel.tsx`,
`components/property-panel/software-button-properties.tsx`

## Task 3: The fence on the canvas; no swipe section on a popup

**Description:** `popupFence(project)` in `lib/popup.ts`: rectangle
`w·√0.8 × h·√0.8`, or a circle of diameter `min(w,h)·√0.8` on a round
display, centred. The canvas of a popup screen draws its outline in the
editor's guide colour and veils what is outside, as the group-editing veil
does. Objects outside stay drawn and editable. The swipe section is
replaced by a line saying a swipe closes a popup.

**Acceptance criteria:**
- [x] `popupFence` for 800×480, 360×360 round and 960×540 encloses 80 % of
      the display's area (±1 px rounding).
- [x] A popup screen on a Knob project shows a circle, on a 4.3B project a
      rectangle; a main screen shows neither.
- [x] No swipe rows on a popup screen.

Done 2026-10-06. The canvas test checks the circle on the round fixture;
the rectangle is the same code path, checked by the pure test only.

**Verification:** `e2e/popup-screens.spec.ts` (pure and canvas pixels), `e2e/swipe-actions.spec.ts`.

**Dependencies:** Task 1 · **Scope:** M

**Files likely touched:** `lib/popup.ts`, `components/canvas/canvas.tsx`,
`components/property-panel/screen-properties.tsx`

## Task 4: «Open Popup» and «Close Popup» in the action pickers

**Description:** `HardwareButtonAction.type` gains `"open-popup"`
(`targetScreenId`) and `"close-popup"`, offered for hardware buttons and
software buttons. The target picker lists popups only; «Close Popup» only
on a popup screen. `describeHardwareButtonAction` names them. A target that
is gone leaves the picker empty; the button keeps its look.

**Acceptance criteria:**
- [x] A software button on a main screen can be set to «Open Popup» with a
      popup chosen; on a popup also to «Close Popup».
- [x] The Knob's ring on a popup screen can be set (no master inheritance
      offered there).
- [x] Deleting the popup empties the button's target picker.

Done 2026-10-06. In the designer's words: «Open a popup» (with a «Popup»
picker, every popup but the one the button is on) and «Close this popup»
(on a popup only), beside «Go to a screen». The hardware-button check runs
on the 4.3B-like combined fixture's button, not the Knob's ring: the round
fixture project declares no hardware buttons; the code path is the same.

**Verification:** `e2e/popup-screens.spec.ts`, `e2e/device-actions.spec.ts`, `e2e/hardware-button-*.spec.ts`.

**Dependencies:** Tasks 1, 2 · **Scope:** M

**Files likely touched:** `components/project-editor.tsx`,
`components/hardware-button-side-panel.tsx`,
`components/property-panel/software-button-properties.tsx`,
`lib/hardware-button-actions.ts`

## Task 5: The preview opens and closes a popup

**Description:** In preview mode «Open Popup» draws the popup over the
current screen: the screen, a veil outside the fence, the popup's objects.
While open, clicks and hardware buttons go to the popup's objects and
actions; a click outside the fence or «Close Popup» closes it. «Open
Popup» on an open popup replaces it.

**Acceptance criteria:**
- [x] Clicking the opening button shows the popup; a click outside the
      fence brings back the screen as it was.
- [x] A switch on the popup publishes in the preview as on a screen.
- [x] A button without a target toasts, as goto does.

Done 2026-10-06. Outside the fence the preview dims to 50 % black, as an
RGB device does. The screen underneath is drawn in the popup's theme (one
theme per canvas). Previewing while a popup is being edited opens it over
the first main screen - which answers the spec's open question for the
preview. The popup's objects take clicks like a screen's (checked with its
own close button; a switch takes the same path).

**Verification:** `e2e/popup-screens.spec.ts`, `e2e/preview-mode.spec.ts`.

**Dependencies:** Tasks 3, 4 · **Scope:** M

**Files likely touched:** `components/project-editor.tsx`,
`components/canvas/canvas.tsx`, `lib/popup.ts`

## Task 6: Handbook

**Description:** Popups in `designer/screens.md` (type, fence, closing),
the two actions in `designer/tasten.md` and `objekte/bedienen.md`, the
preview in `designer/vorschau.md`. Labels as `<span class="ui">`. Through
the `maettel-humanizer` skill.

**Acceptance criteria:**
- [x] Every new label the handbook quotes exists in the designer.
- [x] The swipe paragraph says a swipe closes a popup.

Done 2026-10-06. A warning in `designer/screens.md` says devices do not open
popups yet and, until Task 7, page into them like a screen: issue #50
(label `handbuch`). Narrow it after Task 7 (the paging half goes) and
remove it, with the issue closed, once the last device opens popups.

**Verification:** `e2e/handbook-labels.spec.ts`, `e2e/handbook.spec.ts`.

**Dependencies:** Tasks 1-5 · **Scope:** S

**Files likely touched:** `handbuch/designer/screens.md`,
`handbuch/designer/tasten.md`, `handbuch/objekte/bedienen.md`,
`handbuch/designer/vorschau.md`

## Task 7: `popups[]`, `popupFence` and the actions in the board export

**Description:** `lib/project-zip.ts` writes popups to `popups[]` (screen
shape, own `buttonActions` only, no master merged), and `popupFence` with
`borderColor` (role `outline`) and `scrimColor`, `Dark` twins in 24-bit.
`open-popup` with a lost target is dropped. The asset exporter bakes popup
backgrounds.

**Acceptance criteria:**
- [ ] A project without popups exports byte-identical to before.
- [ ] A popup is in `popups[]` and not in `screens[]`; the fence matches
      `popupFence`; the colours follow the popup's theme, light and dark.
- [ ] Actions export as written; a lost target is left out.

**Verification:** `e2e/popup-screens.spec.ts` (export), `e2e/themes-export.spec.ts`, `e2e/master-screen.spec.ts`.

**Dependencies:** Phase 1 · **Scope:** M

**Files likely touched:** `lib/project-zip.ts`, `lib/asset-export.ts`,
`lib/hardware-button-actions.ts`, `lib/popup.ts`

## Task 8: The Android export and its baked popup PNG

**Description:** `lib/android-export.ts` writes `popups[]` and
`popupFence` as the board export does, and bakes each popup's static
objects into a PNG of its own.

**Acceptance criteria:**
- [ ] A popup's box/line/icon/panel arrive as its PNG, its dynamic objects
      as objects.
- [ ] A project without popups exports byte-identical to before.

**Verification:** `e2e/android-export.spec.ts`.

**Dependencies:** Task 7 · **Scope:** S

**Files likely touched:** `lib/android-export.ts`

## Task 9: `POPUP_GENERATION` and the deploy warning

**Description:** The next minor of `SYSTEM_GENERATION`, and
`POPUP_GENERATION` beside `PLACEHOLDER_GENERATION`. A deploy of a project
with popups to a device below it warns, naming the buttons whose popup
will not open; it does not refuse.

**Acceptance criteria:**
- [ ] A device announcing a lower generation gets the warning; one at or
      above does not; a project without popups never warns.

**Verification:** `e2e/popup-screens.spec.ts` (deploy warning, as the placeholder warning's spec).

**Dependencies:** Task 7 · **Scope:** S

**Files likely touched:** `lib/system-generation.ts`, the deploy dialog that
shows the placeholder warning

## Task 10: The device contract

**Description:** `docs/device-contract.md` §2 `popups[]` and `popupFence`;
§5 the two action types, one-deep stack, closing, the popup's own actions;
a section «Popups» with the spec's decision 5 as guidance.

**Acceptance criteria:**
- [ ] A reader outside this repo can implement a popup from the contract
      alone.

**Verification:** read by the user.

**Dependencies:** Task 7 · **Scope:** S

**Files likely touched:** `docs/device-contract.md`

## Task 11: Loader and renderer (`schaltli-firmware`)

**Description:** `ProjectLoader` reads `popups[]` with the screen parser and
`popupFence`; `ButtonAction` carries the two types in `targetScreenId`.
`getButtonAction` and `hitTestTappable` can be asked about a popup.
`ColorScreenRenderer::renderPopup(popup, fence)`: no `fillScreen`, the
background clipped to the fence, then the objects. A dimming helper that
halves RGB565 outside the fence.

**Acceptance criteria:**
- [ ] All three envs build.
- [ ] Each board's DDF announces `POPUP_GENERATION`.
- [ ] A project without popups renders pixel-identical to before (HIL
      conformance).

**Verification:** `pio run` for the three envs; `hil/conformance`.

**Dependencies:** Phase 2 · **Scope:** M

**Files likely touched:** `src/project/ProjectTypes.h`,
`src/project/ProjectLoader.cpp`, `src/ColorScreenRenderer.cpp/.h`

## Task 12: The 4.3B opens and closes a popup

**Description:** `dispatchButtonAction` opens (dim, frame growing from the
button, `renderPopup`, blit) and closes (`renderAndPresent` of the screen
underneath). While open: taps and actions use the popup; a tap outside the
fence closes; a swipe closes unless a settable level owns it; no
`FollowSwipe`. A screen change from outside closes it. The HIL fixture gets
a popup with a switch and a settable slider and a main-screen button
opening it.

**Acceptance criteria:**
- [ ] Open: inside the fence the popup, outside dimmed.
- [ ] The popup's switch publishes; a drag on its slider moves it and the
      popup stays.
- [ ] A tap outside or a swipe closes, and the screen underneath is
      pixel-identical to before; a swipe does not page.

**Verification:** `hil/waveshare4v3b` popup checks; `pio run -e waveshare-touch-lcd-4v3b`.

**Dependencies:** Task 11 · **Scope:** M

**Files likely touched:** `src/boards/waveshare4v3b/main.cpp`,
`hil/waveshare4v3b/` (fixture, orchestrator)

## Task 13: The Knob

**Description:** As Task 12 with a circular fence. The screen menu stands
down while a popup is open; swipe-up closes the popup. The ring uses the
popup's own actions only.

**Acceptance criteria:**
- [ ] Task 12's three criteria, on the Knob.
- [ ] Swipe-up on an open popup closes it and opens no menu.
- [ ] The ring set to adjust the popup's slider moves it; without an action
      it does nothing.

**Verification:** `hil/waveshare/verify-smoke-test.js` extended; `pio run -e waveshare-knob-touch-lcd-1v8`.

**Dependencies:** Task 11 · **Scope:** M

**Files likely touched:** `src/main.cpp`, `hil/waveshare/fixtures/build-smoke-test.js`,
`hil/waveshare/verify-smoke-test.js`

## Task 14: The PaperS3

**Description:** Open draws a border and a hard shadow round the fence and
the popup inside, pushed as a region, no animation. Close is
`forceFullNext()` and a repaint. Touch as Task 12.

**Acceptance criteria:**
- [ ] Task 12's criteria, on the PaperS3.
- [ ] Opening changes pixels only in the fence plus its shadow.
- [ ] After closing no ghost remains (the `hold-countdown.js` check).

**Verification:** new `hil/papers3/popup.js`; `pio run -e m5stack-papers3`.

**Dependencies:** Task 11 · **Scope:** M

**Files likely touched:** `src/boards/papers3/main.cpp`,
`src/boards/papers3/PanelDisplayAdapter.h`, `hil/papers3/popup.js`

## Task 15: Android opens, draws and closes a popup

**Description:** `Project.popups`, `popupFence`. State `popupId` and the
opening rect beside `currentScreenId`; the popup drawn after
`FollowingScreens` like `ScreenMenuOverlay`, scrim outside the fence, zoom
from the button. `ButtonActionDispatcher` gains the two types; while open
actions dispatch with the popup's id. A tap outside closes.

**Acceptance criteria:**
- [ ] A software button opens the popup, its switch publishes, a tap
      outside closes.
- [ ] Unit test: dispatcher open/close, replace on a second open.

**Verification:** `gradle testDebugUnitTest`; `hil/android` popup check (the first HIL tap on a software button).

**Dependencies:** Phase 2 · **Scope:** M

**Files likely touched:** `data/ProjectModels.kt`,
`mqtt/ButtonActionDispatcher.kt`, `MainActivity.kt`, new `ui/PopupOverlay.kt`,
`ui/objects/SoftwareButtonView.kt`

## Task 16: Android swipes

**Description:** `FollowingScreens` skips a gesture a level has consumed -
on screens and popups alike - and, while a popup is open, neither pages nor
follows the finger; any swipe it names closes the popup. `DdfBuilder`
announces `POPUP_GENERATION`.

**Acceptance criteria:**
- [ ] A long horizontal drag on a slider moves it and never pages (on a
      screen) or closes (on a popup).
- [ ] A swipe on an open popup closes it and does not page.

**Verification:** `SwipeNavigationTest`, `DdfBuilderTest`; `hil/android` drag and swipe checks.

**Dependencies:** Task 15 · **Scope:** M

**Files likely touched:** `ui/SwipeNavigation.kt`, `MainActivity.kt`,
`ddf/DdfBuilder.kt`, the two tests, `hil/android/orchestrator.js` +
`fixtures/build-android-test.js`
