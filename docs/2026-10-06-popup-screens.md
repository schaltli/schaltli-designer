# Popup screens

Idea agreed with the user on 2026-10-06, out of the heater block being still
too much at once (docs/2026-10-05-autoterm-block.md, decisions 9-11): the
mode's dial and the timer's dial side by side. What matters on a heater is
the mode and the control that goes with it; the timer is secondary. It
should show only as a summary until tapped, and then open over the screen.
Spec the same day, after the designer, the three boards and the Android app
were read (findings in «What the code says»).

Status: spec agreed 2026-10-06. Plan: tasks/popup-screens-plan.md.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `popup-designer` | Screen type, the fence on the canvas, «Open Popup» / «Close Popup» in every action picker, the designer's preview | designer | - |
| `popup-export` | The export format and the device contract; `systemGeneration`; both exports (boards, Android) | designer | `popup-designer` |
| `popup-android` | Opening, drawing, closing, the swipe rule | `schaltli-android` | `popup-export` |
| `popup-firmware` | Loader and renderer shared, then dispatch, hit test and drawing per board: 4.3B, Knob, PaperS3 | `schaltli-firmware` | `popup-export` |

Build order: `popup-designer` → `popup-export` → `popup-android` and
`popup-firmware` side by side. On the boards the 4.3B first, then the Knob,
then the PaperS3.

Not in this spec: the heater itself (`heater/timer_text`, the runtime dial
at 15-600 in 15s), the VanPi start project it lives in, and a button whose
label comes from a topic. Until that last one exists the heater's button
just reads «Timer».

## Decisions

1. **Every screen has a type.** «Main screen»: a screen as today, in
   next/previous order. «Popup»: not in next/previous navigation, not a
   «Go to Screen» target, never given a master. Master screens stay what
   they are.
2. **A popup is designed on a screen of its own, at the display's size.**
   The designer shows a **fence** on it: a rectangle on a rectangular
   display, a circle on a round one, centred, with 80 % of the display's
   area inside. Keeping the content inside the fence is the designer's
   care, not enforced. The fence is in the export. Moving or resizing it
   is for later.
3. **Two new actions**, on software buttons, hardware buttons and swipes
   alike, beside `goto-screen`: «Open Popup» (target: a popup screen) and
   «Close Popup». Closing always returns to the screen the popup was opened
   from - a stack one deep. An «Open Popup» while a popup is open replaces
   it; no popup sits on another.
4. **Reuse is allowed.** Any number of buttons on any screens may open the
   same popup.
5. **The device decides how a popup looks and moves.** The frame (border,
   scrim, shadow) and any animation are the device's. Guidance, not
   contract: RGB devices dim what is outside the fence; the PaperS3 draws a
   border and a hard shadow and refreshes only what it must; an animation,
   if any, stays cheap - e.g. the frame growing as a rectangle from the
   button to the fence, the content appearing at the end - no scaling of
   pixels.
6. **Closing:** a tap outside the fence, «Close Popup», or a swipe. A swipe
   that a settable slider or dial owns stays the control's, exactly as it
   does on a screen today. A swipe that closes a popup does nothing else
   (it does not page).
7. **While a popup is open, its own actions apply.** Its hardware buttons
   (the Knob's ring) use the popup screen's `buttonActions` and nothing
   else - no master, no project default. A popup without a ring action
   leaves the ring idle. Swipes always close (decision 6), whatever the
   popup's swipe actions say; the designer offers none on a popup.
8. **Open/closed is the device's own state**, never on MQTT. A screen
   change from outside (the test API, a deploy, setup mode) closes it.
9. **What the popup screen's background is:** its own background colour
   inside the fence. Outside the fence the device shows the screen
   underneath, treated as decision 5 says.

## Behaviour

### The designer (`popup-designer`)

- **Screen type.** The Add menu of the screens panel gets «Add Popup
  Screen» beside «Add Screen» and «Add Master Screen». The screen's
  properties show «Screen type: Main screen / Popup» for a non-master;
  changing it moves the screen between the panel's groups. A popup screen
  in the panel has a «Popup» badge, a group of its own below the main
  screens.
- **Data.** `ProjectScreen.screenType?: "popup"`; absent means a main
  screen, so every existing project reads unchanged. `isMaster` stays as
  it is.
- **Turning a main screen into a popup** clears its `masterScreenId` and
  its swipe actions. Turning it back gives it the project's first master,
  as `ensureEveryScreenHasAMaster` does for a new screen.
- **Excluded wherever a master is excluded**, and from master assignment:
  next/previous in the preview (`handlePreviewButtonAction`), the goto
  pickers of hardware buttons and software buttons, `ensureEveryScreenHasAMaster`,
  the screen selected first when a project opens.
- **The fence** is drawn on the canvas of a popup screen: the outline in
  the editor's own guide colour (not the theme's), and the area outside it
  veiled like the group-editing veil (`canvas.tsx:1333-1350`), so the
  design inside reads as the window. Objects outside are drawn and stay
  editable. Rectangle: `w·√0.8 × h·√0.8`, centred. Circle (`screenShape:
  "round"`): diameter `min(w,h)·√0.8`, centred. Pure function
  `popupFence(project)` in a new `lib/popup.ts`.
- **Actions.** `HardwareButtonAction.type` gains `"open-popup"` (with
  `targetScreenId`) and `"close-popup"`. Offered in
  `hardware-button-side-panel.tsx` and `software-button-properties.tsx`;
  the target picker lists popup screens only. «Close Popup» is offered
  only on a popup screen. `describeHardwareButtonAction` names them «Open
  Popup: <name>» and «Close Popup».
- **Swipe section** (`screen-properties.tsx`) is hidden on a popup screen,
  with one line saying a swipe closes a popup.
- **Preview.** «Open Popup» shows the popup over the current screen: the
  screen underneath, then a veil outside the fence, then the popup's
  objects. A click outside the fence or «Close Popup» returns. While open,
  clicks and hardware buttons go to the popup. Without a target the
  preview toasts, as goto does.
- **Deleting a popup** that buttons still open is allowed. Those buttons
  keep their look - what a button shows is its template's business, not
  its action's - and do nothing: the action is dropped from the export (as
  `adjust-level` with a lost target is), and the target picker in the
  button's properties is empty again.

### The export (`popup-export`)

- **Popups do not go into `screens[]`.** They go into a new top-level
  `popups[]`, each `{ id, name, backgroundColor, backgroundColorDark?,
  objects, buttonActions }` - the same shape as a screen, so the loaders
  reuse their screen parser. A reader that does not know `popups` skips it
  and keeps its next/previous order right; that is what makes this minor.
- **The fence:** top level `popupFence: { shape: "rect" | "circle", x, y,
  width, height }` in display pixels (a circle as its bounding square).
  One per project, as long as fences cannot move (decision 2).
- **Frame colours,** resolved from the popup's theme like any colour,
  `XDark` beside: `popupFence.borderColor` (role `outline`) and
  `popupFence.scrimColor` (black for every theme; a field so a theme may
  differ later). Devices may ignore them (decision 5).
- **Actions** export as written: `{ "type": "open-popup",
  "targetScreenId": "<popup id>" }`, `{ "type": "close-popup" }`.
  An `open-popup` whose target is gone is dropped.
- **Popups have no master**, so nothing is merged into them; their
  `buttonActions` are their own only (decision 7). The asset exporter
  bakes their backgrounds like a screen's; the Android export bakes their
  static objects into a PNG of their own, like a screen's.
- **Generation.** `SYSTEM_GENERATION` takes the next minor;
  `POPUP_GENERATION` beside `PLACEHOLDER_GENERATION`. A deploy to a device
  below it warns, naming the buttons whose popups will not open; it never
  refuses.
- **The device contract** (`docs/device-contract.md`) gets: §2 the
  `popups[]` and `popupFence` fields; §5 the two action types and
  decisions 3, 6, 7, 8; a section «Popups» with decision 5's guidance.

### Android (`popup-android`)

- Model: `Project.popups`, `Project.popupFence` (ProjectModels.kt).
- State `popupId` and the opening button's rect beside `currentScreenId`
  (MainActivity.kt:229). The popup is drawn after `FollowingScreens`, the
  way `ScreenMenuOverlay` is, with a scrim outside the fence and a zoom out
  of the button's rect into the fence (Compose can scale; the boards
  cannot, decision 5).
- `ButtonActionDispatcher` gains `open-popup` and `close-popup`; while a
  popup is open, actions dispatch with the popup's id.
- Swipe: `FollowingScreens` neither pages nor follows the finger while a
  popup is open; any swipe it names closes it. It must skip a gesture a
  level has consumed (`SwipeNavigation.kt:183` takes the first down
  without `requireUnconsumed` and never checks it - the gap decision 6
  needs closed, on popups and on screens alike).
- Tap outside the fence closes; the popup's own objects take their taps.
- `DdfBuilder` announces `POPUP_GENERATION`.

### The boards (`popup-firmware`)

Shared (`src/project/`):
- `ProjectLoader` reads `popups[]` with the screen parser into a list of
  their own, and `popupFence`. `ButtonAction` takes the two types; the
  existing `targetScreenId` field carries the target.
- `getButtonAction` and `hitTestTappable` take the popup while one is open
  (the call sites the research listed: Knob main.cpp :1168 :1311 :1438
  :2202 :2212, 4.3B :1357 :1653 :1686 :1795 :1873, PaperS3 :241 :328
  :372).
- `ColorScreenRenderer` gains `renderPopup(popup, fence)`: no
  `fillScreen`; the background colour inside the fence (clipped to the
  rectangle or circle), then the popup's objects at their absolute
  coordinates. What lies outside the fence and the frame are drawn by the
  board.

Per board, in `dispatchButtonAction` and the touch handling:
- **4.3B:** open = dim the current canvas outside the fence (a halving of
  each RGB565 channel, no blending table), `renderPopup`, blit. Animation:
  the frame rectangle growing from the button over a few frames, then the
  content. Close = `renderAndPresent` of the screen underneath. A
  horizontal drag while a popup is open never starts `FollowSwipe`.
- **Knob:** as the 4.3B, a circle fence. The screen-menu overlay stands
  down while a popup is open (and a popup's swipe-up closes rather than
  opening the menu). The ring uses the popup's actions only.
- **PaperS3:** open = border and hard shadow round the fence, popup
  inside, pushed as a region (`renderScreenRegion` precedent; M5GFX
  `display(x,y,w,h)`), no animation. Close = `forceFullNext()` and repaint,
  as a screen change does.
- Each board's DDF announces `POPUP_GENERATION`.

## What the code says (checked 2026-10-06)

- Only settable sliders and dials claim a touch on any board; buttons and
  switches do not. Android does not check consumption at all.
- No board renderer can draw at an offset or scale; `renderScreen` always
  fills the whole canvas. The fence model needs neither.
- Theme roles never reach a device (`device-contract.md:554`); colours go
  out resolved, with `XDark` twins.
- The «largest square in a circle» content area was dropped on 2026-10-03
  (docs/2026-10-03-free-screens.md); the firmware ignores `shape`. The
  fence is new and independent of it.
- The Knob's screen menu (`ScreenNavigatorOverlay`) is the only overlay on
  a board, drawn into the canvas over a backdrop slot; a tap outside it
  keeps it open - the opposite of a popup.
- LVGL is linked on the Knob only, as a compositor; nothing uses its
  widgets, animations or layers. The 4.3B and the PaperS3 have none.
- No HIL test covers `goto-screen` on any board, and Android's HIL never
  taps a software button.

## Tech stack

Designer: Next.js / React 19 / TypeScript, Playwright. Boards: PlatformIO,
Arduino-ESP32, the shared `ColorScreenRenderer`. Android: Kotlin, Jetpack
Compose. No new dependency anywhere.

## Commands

```
Typecheck:   npm run typecheck
Designer:    npx playwright test e2e/popup-screens.spec.ts e2e/master-screen.spec.ts e2e/swipe-actions.spec.ts
Boards:      pio run -e waveshare-touch-lcd-4v3b | -e waveshare-knob-touch-lcd-1v8 | -e m5stack-papers3   (in schaltli-firmware)
Board HIL:   node hil/waveshare4v3b/... , node hil/waveshare/verify-smoke-test.js , node hil/papers3/popup.js
Android:     gradle testDebugUnitTest (JAVA_HOME jbr-21), node hil/android/orchestrator.js
Full:        npm run test:all
```

## Project structure

```
lib/popup.ts                          → new: popupFence(), isPopup(), the screens a popup can be opened from (pure)
components/project-editor.tsx         → ProjectScreen.screenType, the two action types, preview
components/screens-panel/screens-panel.tsx, components/screen-editor-fields.tsx → type, group, badge
components/hardware-button-side-panel.tsx, components/property-panel/software-button-properties.tsx → pickers
components/property-panel/screen-properties.tsx → swipe section hidden
components/canvas/canvas.tsx           → fence, popup over a screen in the preview
lib/themes.ts                         → ensureEveryScreenHasAMaster skips popups
lib/project-zip.ts, lib/android-export.ts, lib/asset-export.ts → popups[], popupFence
lib/system-generation.ts              → POPUP_GENERATION
docs/device-contract.md               → §2, §5, «Popups»
e2e/popup-screens.spec.ts             → new
hil/waveshare4v3b/, hil/waveshare/, hil/papers3/, hil/android/ fixtures → a popup screen and its button
handbuch/designer/screens.md, handbuch/designer/tasten.md, handbuch/objekte/bedienen.md, handbuch/designer/vorschau.md
```

## Code style

As `lib/master-screen.ts`: small pure functions in `lib/`, the components
only call them; comments say why.

```ts
/** The fence a popup's content is designed inside: 80 % of the display's area, centred. */
export function popupFence(p: { screenWidth: number; screenHeight: number; screenShape?: "rect" | "round" }): Fence {
  const k = Math.sqrt(0.8)
  if (p.screenShape === "round") { ... }
  ...
}
```

## Testing strategy

- `e2e/popup-screens.spec.ts`:
  - pure: `popupFence` for the 4.3B (800×480), the Knob (360×360 round),
    the PaperS3 (960×540) - 80 % of the area each;
  - «Add Popup Screen» puts it in its own group; it is in no goto picker,
    has no master select and no swipe section; turning it into a main
    screen gives it a master;
  - «Open Popup» lists popup screens only; «Close Popup» only on a popup;
  - preview: open shows the popup over the screen with the veil outside
    the fence, a click outside closes, «Close Popup» closes, next/previous
    never reaches a popup;
  - export: popups in `popups[]` not `screens[]`, the fence and its
    colours with `Dark`, actions as written, a lost target dropped; the
    Android export bakes a PNG per popup.
- Extended: `master-screen.spec.ts` (a popup is not a goto target),
  `swipe-actions.spec.ts`, `android-export.spec.ts`,
  `themes-export.spec.ts`, `handbook-labels.spec.ts` (new labels).
- HIL, each board fixture gets a popup screen with a button and a
  settable slider, and a main-screen button that opens it:
  - open by tapping the button: pixels inside the fence are the popup's,
    outside are changed (dimmed / shadowed);
  - a tap on the popup's switch publishes; a drag on its slider moves the
    slider and leaves the popup open;
  - a tap outside the fence closes, and the screen underneath is
    pixel-identical to before;
  - a swipe closes and does not page;
  - next/previous never reaches the popup;
  - PaperS3: closing leaves no ghost (the `hold-countdown.js` check).
  - Android: the same through `adb input`, which also is the first HIL
    tap on a software button.
- Unit (Android): `ButtonActionDispatcher` open/close; the swipe skipping
  a consumed gesture.

## Boundaries

- **Always:** a project without popups exports byte-identical to today;
  handbook updated in the same piece of work; every check a HIL fixture
  addition, not a scratch script.
- **Ask first:** a major generation bump; moving `isMaster` into the
  screen type; anything on the van.
- **Never:** popup state on MQTT; popups in blocks; a fence the designer
  enforces by moving objects.

## Success criteria

- [ ] In the designer a popup screen is made with «Add Popup Screen»,
      shows its fence, is in no navigation and no goto picker.
- [ ] A software button on a main screen opens it in the preview, a click
      outside closes it.
- [ ] On the 4.3B, the Knob, the PaperS3 and Android the same project
      opens the popup by a tap, the popup's controls work, and a tap
      outside or a swipe brings back the screen underneath unchanged.
- [ ] A slider on the popup is dragged without closing it, on every
      device.
- [ ] A project without popups is unchanged on every device, and an
      older device given a project with popups pages exactly as before.

## Not doing

- **A slide-in:** it only looks right when the button sits at the edge
  the popup slides from.
- **A popup element with an embedded fragment** (the first idea): a popup
  screen brings its own button actions, a fragment would not.
- **A directed graph of screens:** per-screen swipe actions with
  `goto-screen` already make a second dimension.
- **A movable or resizable fence**, a fence per popup - later.
- **Clipping to the fence** in the designer or forcing content into it.
- **Scaling pixels for a zoom on the boards.**
- **Popups in popups, a timeout, popups in blocks.**
- **Theme roles on the device.**

## Open questions

- Which screen does the designer's canvas show behind a popup while
  *editing* it? The spec says: none - the veil over the popup's own
  background. The preview shows the real one.
- The 4.3B's 15 fps for a growing frame: enough, or straight to open?
  Judged on the board.
