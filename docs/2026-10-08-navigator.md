# Navigator

Worked out with the user on 2026-10-07 and 2026-10-08. Issue #54, with the
mockups B1-B3, C and D on 800 × 480 (4.3B, theme Schaltli dark). Builds on
live values and combined topics (#55, `docs/2026-10-07-live-values.md`).
Later: a live name in an entry (#57).

Status: spec, 2026-10-08. Not planned yet.

## Objective

On the 4.3B, the PaperS3 and in the Android app one gets from screen to
screen by swiping or by buttons. With five screens or more one swipes
several times to reach the heating. A bar along one edge with every screen
in it gets there with one tap. Today it can only be built by hand, from
buttons with «Go to a screen» on the master; it then does not show which
screen is open, and every new screen has to be added to it by hand.

The navigator is an object one places on a master. Every screen using that
master shows it. It has one entry per screen, each the screen's icon and,
if wanted, its name. The open screen's entry is highlighted; a tap on an
entry opens that screen. The screen's icon can be live, so the navigator
shows at a glance that a light is on somewhere or the heater runs.

Users: whoever builds a panel for a van in the designer, and whoever uses
that panel. Neither programs.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `screen-live-icon` | The screen icon «Fixed / Live», edited in the screen's properties with the live value editor of #55; «Hide screen» | designer | #55 (done) |
| `navigator-designer` | The object type, its panel, its place on the edge, the hatched strip, the preview | designer | `screen-live-icon` |
| `navigator-export` | `navigator` in project.json, entries as ordinary objects, hidden screens, generation 1.5, the deploy warning, device contract §2.7 | designer | `navigator-designer` |
| `navigator-4v3b` | Drawing, the fixed layer while swiping, tap, scroll, touch ownership, hidden screens out of the paging | `schaltli-firmware` | `navigator-export` |
| `navigator-papers3` | The same on e-ink: scrolling a page of entries at a time | `schaltli-firmware` | `navigator-4v3b` |
| `navigator-android` | The same in the app | `schaltli-android` | `navigator-export` |

Build order: `screen-live-icon` → `navigator-designer` → `navigator-export`
→ `navigator-4v3b` → `navigator-papers3`, `navigator-android`.

## Decisions

1. **An object on a master.** A new object type `navigator`, placed only on
   a master screen, at most one per master. Every screen using that master
   shows it. Not offered on a device whose DDF does not list `navigator` in
   `supportedObjectTypes` - every rectangular device (4.3B, PaperS3,
   Android) lists it; the round Knob does not and keeps its screen menu.
2. **One entry per screen.** In the order of the screen list; masters and
   popups have none. A new screen appears by itself.
3. **«Hide screen».** A screen property. A hidden screen has no entry and
   is skipped by swiping; it is reached only by a button with «Go to a
   screen» (a settings screen, say). It applies whether or not the project
   has a navigator. A device starts on the first screen that is not hidden.
4. **Edge.** Top, bottom, left or right («Edge»). The navigator fills that
   edge entirely; it is not moved or sized by hand. Its thickness follows
   from what an entry shows.
5. **Icon, or icon and text** («Shows»). The icon is the screen's icon
   (`iconAssetId`, today's «Screen icon»); the text is the screen's name,
   fixed in this version (live name: #57). The navigator has a font, as a
   text does.
6. **The screen icon can be live.** «Fixed / Live» on the screen icon, the
   same choice and the same editor as on an icon object (#55): the bulb lit
   while any light is on (a combined topic «any»), the flame filled while
   the heater runs, a bolt in the battery while it charges. It is set on
   the screen, not on the navigator.
7. **Highlight.** The open screen's entry in the theme's accent: its ground
   «Accent», its icon and text «Text on accent». The others on «Surface» in
   «Text». A tap on an entry acts as «Go to a screen».
8. **Entries go out as ordinary objects.** An entry is an icon object
   (fixed or live), a text object and, for the active look, a box - all
   types every device already draws, live values included. A device draws
   no new kind of thing; what is new for it is placing entries, scrolling,
   the fixed layer and the tap. A live name (#57) is then a text with chips,
   with nothing to add on the devices.
9. **Once per project in the export.** Devices do not know masters; the
   export copies a master's objects into every screen. A navigator copied
   so could not stay put while swiping, so it is written once, at the top
   of project.json, and each screen says whether it shows it.
10. **Opaque.** The navigator has its own ground («Surface»). A background
    image may lie under it on a screen, but the navigator covers it, also
    while swiping and scrolling.
11. **The strip is hatched in the designer.** On every screen using that
    master, so that nothing is placed under the navigator by accident. Not
    forbidden: a background image may lie there.
12. **Too many screens: scroll.** If not every entry fits, a swipe along
    the navigator scrolls it. The last visible entry is cut off, which
    shows there is more; no arrows, no scroll bar. After every screen
    change - by swiping, the navigator or a button - it scrolls so far that
    the active entry is visible.
13. **Swiping stays.** A swipe beside the navigator pages as before. A
    swipe that starts on the navigator belongs to it: it scrolls it and
    never pages, even across - as a slider owns its touch from first
    contact today.
14. **The navigator stands still while swiping.** Only the screen follows
    the finger, cut off at the navigator's edge; the highlight jumps to the
    new entry at the end. New for the firmware: today the whole screen
    slides, the master's objects with it.
15. **PaperS3.** Gestures act on release there, so the navigator scrolls a
    page of entries at a time, not smoothly.
16. **Several masters.** Each master's navigator lists every screen that is
    not hidden, not only those using that master.
17. **Under a popup.** An open popup sets the navigator back with the
    screen (halved on an RGB board, left on e-ink), as everything under the
    popup. A tap on it is a tap beside the popup: it closes the popup and
    opens nothing.
18. **Generation 1.5.** `NAVIGATOR_GENERATION`; the deploy dialog warns
    before deploying a project with a navigator or a hidden screen to a
    device below it.

## Behaviour

### In the designer

- The navigator tool is offered on a master only; on another screen it is
  not there, and a second navigator on a master is refused.
- Placed, it snaps to its edge (left by default), full length; changing
  «Edge» moves it. Its thickness: icon only, or icon with the name under
  it. The exact sizes live in one place (`lib/navigator.ts`) and are
  checked against mockups B1-B3.
- Properties: «Edge», «Shows» (Icons / Icons and text), «Font». Colours
  come from the theme's roles (decision 7).
- The canvas draws it with the entries of the current project: on the
  master as it would look with the first screen open, on a screen with that
  screen's entry highlighted. On a screen using that master, the strip is
  hatched in edit mode; in the preview it is the navigator, and a tap on an
  entry opens that screen.
- The screen properties get «Hide screen» and, on the screen icon,
  «Fixed / Live».

### On a device

- The navigator is drawn over the screen at its edge, entries in order,
  scrolled so the active one is visible.
- A tap on an entry opens that screen, as «Go to a screen» does. While a
  popup is open the navigator is set back with the screen, and a tap on it
  only closes the popup (decision 17).
- A device starts on the first screen that is not hidden.
- While swiping, the incoming and outgoing screens slide in the area beside
  the navigator; the navigator is not redrawn until the highlight moves at
  the end.
- A live icon in an entry follows its value as a live icon on a screen
  does, redrawing only its entry.
- Paging (`next-screen` / `previous-screen`, the swipes bound to them)
  skips hidden screens.

## Export and device contract (§2.7)

Corrected 2026-10-08 while building it: two masters can each have a
navigator (decision 16), so the export carries a list, and a screen names
the one it shows (`navigatorId`) rather than saying `navigator: true`.

```json
"navigators": [
  {
    "id": "nav",
    "edge": "left",
    "thickness": 80,
    "entryLength": 88,
    "backgroundColor": "#1c1b1f",
    "entries": [
      {
        "screenId": "s-heizung",
        "normal": [ { "type": "icon", ... }, { "type": "text", ... } ],
        "active": [ { "type": "box", ... }, { "type": "icon", ... }, { "type": "text", ... } ]
      }
    ]
  }
]
```

- Objects in an entry have coordinates relative to the entry's top left.
  An icon object carries `path`/`pathDark` and, when the screen icon is
  live, `liveIconId`/`liveValues` with each result's path, as an icon
  object does since 1.4. Colours are resolved, with `XDark` beside them at
  24 bit, as everywhere.
- A screen that shows one has `"navigatorId": "<id>"`; a hidden screen
  has `"hidden": true` and no entry.
- The navigator's topics (live screen icons) are in `topics[]`, combined
  topics in `combinedTopics[]`.
- A device below 1.5 ignores `navigator` and `hidden`: no navigator,
  hidden screens are paged to, and it starts on the first screen even if
  that one is hidden. The deploy dialog says so before sending.

## What the code says (checked 2026-10-08)

- Masters: `masterScreenId` / `showMaster` (`lib/free-screens.ts`),
  `resolveMasterScreen` (`lib/master-screen.ts`). The export merges a
  master's objects into each screen (`mergeMasterAndScreenObjects`,
  `lib/object-order.ts`; `lib/project-zip.ts`, `lib/android-export.ts`);
  devices never see a master.
- The screen icon is `iconAssetId` (`components/screen-editor-fields.tsx`),
  exported only as a 56 px grey PGM for a DDF with `needsPageIconsInSize`
  (the Knob's screen menu). 4.3B, PaperS3 and Android get no screen icon
  today.
- Theme roles (`lib/themes.ts`): «Surface», «Text», «Accent», «Text on
  accent» exist; a device gets resolved colours only.
- 4.3B swiping: `FollowSwipe` (`src/boards/waveshare4v3b/FollowSwipe.h`)
  renders the incoming screen into a spare canvas and composes both, whole
  width, into the panel's back buffer per frame. A settable level owns its
  touch from first contact (`beginLevelDrag`, main.cpp).
- PaperS3: no animation; gestures act on release (`dispatchSwipeAtRelease`).
- Android: `FollowingScreens` (`ui/SwipeNavigation.kt`), a consumed
  touch-down owns the gesture.
- «Go to a screen» is `goto-screen` with `targetScreenId` on every device
  (`dispatchButtonAction`; Android `ButtonActionDispatcher`).
- No hatch pattern exists on the canvas yet.

## Tech stack

Designer: Next.js / React 19 / TypeScript, Playwright. Boards: PlatformIO,
Arduino-ESP32, `ColorScreenRenderer`. Android: Kotlin, Jetpack Compose. No
new dependency.

## Commands

```
Typecheck:   npm run typecheck
Designer:    npx playwright test e2e/navigator.spec.ts e2e/screen-live-icon.spec.ts
Firmware:    pio test -e native; pio run -e waveshare-touch-lcd-4v3b -e m5stack-papers3
Android:     gradle testDebugUnitTest (JAVA_HOME = ~/.jdks/jbr-21.0.11)
Full:        npm run test:all
```

## Project structure

```
lib/navigator.ts                      → new: entries from the screen list, sizes, layout, scroll offset for an active entry (pure)
lib/object-types.ts                   → navigator
components/property-panel/            → the navigator's panel; screen icon «Fixed / Live», «Hide screen»
components/canvas/renderers/          → render-navigator.ts, the hatched strip
lib/project-zip.ts, lib/android-export.ts → navigator[], screen navigator / hidden
lib/system-generation.ts              → NAVIGATOR_GENERATION
docs/device-contract.md               → §2.7
schaltli-firmware src/project/Navigator.{h,cpp} → layout, scroll, hit test (plain C++, native tests)
schaltli-firmware src/boards/waveshare4v3b/, src/boards/papers3/ → drawing, FollowSwipe beside it, touch
schaltli-android ui/NavigatorView.kt, data/ProjectModels.kt → the same
handbuch/objekte/ (new page or section «Navigator»), handbuch/designer/screens.md («Hide screen», live screen icon)
```

## Testing strategy

- `lib/navigator.ts` layout and scroll as shared cases
  (`lib/navigator/vectors.json`): entries for N screens on each edge and
  size, hidden screens left out, the scroll offset that shows an active
  entry, the entry under a point. Run by the designer, the firmware's
  native tests and the app's unit tests, with the copy check of #55.
- `e2e/navigator.spec.ts`: offered on a master only, one per master; edge
  and «Shows» change the strip; a new screen appears, a hidden one does
  not; the hatch on a screen using the master; the preview highlights and
  navigates; export writes `navigator` once and `navigator: true` on the
  screens that show it.
- `e2e/screen-live-icon.spec.ts`: «Fixed / Live» on the screen icon, the
  rule editor, the navigator drawing the branch that applies.
- HIL: a board script per device (`hil/navigator.js --device`, as
  `hil/live-value-redraw.js`): every entry drawn at 0 px against the
  designer; a tap opens the screen; a swipe beside it pages and the strip
  stays unchanged during the swipe; a swipe on it scrolls and never pages;
  a hidden screen is skipped, and a project whose first screen is hidden
  starts on the next; the navigator is set back under a popup and a tap
  on it only closes the popup; a live screen icon follows its topic,
  redrawing only its entry. Android: the fixture's master gets a navigator,
  checked by the orchestrator.

## Boundaries

- **Always:** entries are ordinary objects; one layout, three
  implementations held to the same cases; handbook in the same piece of
  work.
- **Ask first:** a navigator not on a master; anything drawn behind a
  transparent navigator; a drawer or page dots (later, #54).
- **Never:** a navigator on the Knob; a navigator the user positions by
  hand; text drawn by a device other than through a text object.

## Success criteria

- A project with five screens and a navigator on the master shows on the
  4.3B, the PaperS3 and the phone a bar with five entries, the open one
  highlighted; a tap opens a screen; a swipe beside it pages while the bar
  stands still.
- With twelve screens the bar scrolls with a swipe and keeps the active
  entry visible after every change.
- «Hide screen» takes a screen out of the bar and the paging; a button
  still reaches it.
- A screen icon with «Live» shows the bulb lit while any light is on, on
  every device, redrawing only its entry.
- Every entry 0 px against the designer on the 4.3B and PaperS3; the
  Android orchestrator green.
- A device below 1.5 is warned about before deploying.

## Not doing

- A live name in an entry (#57).
- The Knob's screen menu showing live screen icons.
- A drawer from the edge, page dots (variants C, D).
- Migrating navigation bars built from buttons.

## Open questions

- PaperS3: a live screen icon changing needs a partial refresh of its
  entry. How that fits the panel's refresh rules (the ghosting clean-up
  after a partial) is settled in `navigator-papers3`.
