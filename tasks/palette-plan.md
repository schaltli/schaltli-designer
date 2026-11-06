# Implementation plan: the palette

Spec: `docs/2026-11-06-palette.md` (approved by the user 2026-11-06). Preview:
https://claude.ai/artifact/Ek4DRsYz3imBFcs185eW1g. Todo: `tasks/palette-todo.md`.

## Overview

The ribbon goes; a palette with the tabs «Parts» and «Prebuilt», a search
and rows in groups takes its tools and its tiles. It floats, docks on the
left or is minimized to a rail. The Select and Row tools go with the ribbon.

## Architecture decisions

- **Beside the ribbon first, then the ribbon out.** T1-T4 build the palette
  while the ribbon still stands, so every spec stays green while they are
  moved over; T5 takes the ribbon out once nothing needs it.
- **The rows are the tiles' logic, re-rendered.** The tool definitions and
  `offered` (`components/toolbar/toolbar.tsx`), the catalog, the armed entry
  and the reasons (`components/toolbar/block-tiles.tsx`) move into shared
  modules; the palette renders them as rows. Placing calls the same
  `onToolPress` / `onToolChange` / `onCatalogEntrySelect` the ribbon calls,
  so the carry, Alt, Ctrl and Esc need no change.
- **Rows keep the tiles' hooks for tests:** `data-tool="<type>"` on a part's
  row, a button named after the entry, `data-armed`. A helper
  `pickPart(page, type)` / `pickPrebuilt(page, name)` in `e2e/helpers.ts`
  opens the tab and the group first.
- **The e2e suite starts with the palette docked and every group open:**
  `e2e/palette-state.json` as `storageState` in `playwright.config.ts`, so a
  floating palette never lies over a point a spec clicks on the canvas.
  `e2e/palette.spec.ts` starts from nothing, as a new user does.
- **State in one localStorage key** (`schaltli-palette`), read and written in
  try/catch; the old `RIBBON_TAB_KEY` read once as the first tab.

## Dependency graph

```
T1 window (float/dock/minimize, remembered, Ctrl+K)
 ├── T2 Prebuilt tab (groups, search, rows, placing)
 └── T3 Parts tab (groups, rows, placing)
        └── T4 helper + specs moved to the palette (ribbon still there)
               └── T5 ribbon, Select tool out
                      └── T6 Row tool out
                             └── T7 handbook + screenshots
                                    └── T8 release run
```

## Tasks

### T1 The palette window (M, highest risk)
`components/palette/palette.tsx`: title bar with grip, dock/float and
minimize; tabs with the brick icons (empty lists for now); search field;
footer. Floating: moved by the title bar, resized at its edges, kept inside
the window. Docked: a column after Screens, the canvas narrower. Minimized:
the rail of two icons at the canvas's left edge, a click opening that tab.
Ctrl+K opens and focuses the search. All of it remembered.
- Accept: each state reached and left; moved and resized, still so after a
  reload; kept on screen when the window shrinks; Ctrl+K from minimized;
  keys typed in the search do not reach the canvas.
- Verify: `e2e/palette.spec.ts` (window part); `npm run typecheck`.

### T2 The Prebuilt tab (M)
Groups by device, alphabetical, the first open the first time; a row per
thing with its icon and name; greyed with its reason; the search over name
and device, groups opening while typing, «Nothing matches»; footer count and
Refresh; «Listen to Broker» opening it. Click and drag place as the tiles.
- Accept: with all 54 fixtures announced, «licht» shows the lights only; a
  row clicked then the screen clicked places the card; a row dragged places
  it; let go over the palette, nothing; the search kept over a tab change.
- Verify: `e2e/palette.spec.ts` (Prebuilt part), `e2e/prebuilt-tab.spec.ts`
  moved into it.

### T3 The Parts tab (S)
Show, Operate, Draw, Arrange, Tables (Free, Card) as groups of rows; what the
device does not render not shown; Chart and Navigator as today. Click and
drag place as the ribbon's tools.
- Accept: a Slider clicked and placed, a Box dragged and placed; on the
  e-paper fixture no Operate group.
- Verify: `e2e/palette.spec.ts` (Parts part); `e2e/place-by-dragging.spec.ts`.

### Checkpoint A
- [ ] typecheck, the palette specs green; test:quick green
- [ ] The user tries the palette in the browser (ribbon still there)

### T4 The specs moved to the palette (L, mechanical)
`pickPart` / `pickPrebuilt` in `e2e/helpers.ts`; `e2e/palette-state.json`
and `storageState`; the about 34 specs that click a ribbon tool or tile
(`grep` for `data-tool`, `tools-ribbon`, `ribbon-tab`, tool button names)
switched to the helpers, in two or three commits by area.
- Accept: no spec reaches into `tools-ribbon`; full e2e green with the
  ribbon still there.
- Verify: `npm run test:quick`.

### T5 The ribbon and the Select tool out (M)
`components/toolbar/toolbar.tsx` and its place in `project-editor.tsx` go;
the space goes to the canvas; Select gone from the tool types offered (the
`select` mode itself stays, it is what the canvas is in).
- Accept: no ribbon; placing ends in selecting; Esc and a second click give
  an entry up; nothing else moved on the page.
- Verify: `npm run test:quick`.

### T6 The Row tool out (M)
`ROW_TEMPLATES`, `planRow`, `rowTargetAt`, `rowAsTable`, the row carry and
its hint in `lib/snap-table.ts` and `canvas.tsx`, where nothing else uses
them; `e2e/snap-table-rows.spec.ts` gone, what it held of tables in general
kept elsewhere; the `layout-linie` picture with a Text and a Switch.
- Accept: no «Row» anywhere in the UI; rows standing in projects open and
  deploy as before; snapping with Alt as before.
- Verify: `npm run test:quick`; `e2e/snap-table-canvas.spec.ts`.

### T7 Handbook and pictures (M)
The pages the spec names; «Eine ganze Zeile» out of `objekte/anordnen.md`;
the screenshots retaken (`editor`, `baustein-menue` as the palette with a
search, every picture with the ribbon); the diff through `maettel-humanizer`.
- Accept: no «Werkzeugleiste» or ribbon sentence left; handbook builds;
  `e2e/handbook-labels.spec.ts` green.
- Verify: `npm run build --prefix handbuch`; the label and screenshot specs.

### Checkpoint B
- [ ] test:quick green; the user reviews

### T8 Release run (S)
Spec status «built»; `npm run test:all`.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A floating palette over the canvas swallows clicks specs and people aim at the screen | High | Docked in the e2e state; the first float placed clear of the screen; `e2e/palette.spec.ts` checks a click beside it reaches the canvas |
| A carry started in a palette row fights the palette's own scroll and drag (title bar, resize edges) | High | T1 first; the rows use the tiles' pointer handling unchanged; resize only on the window's edges |
| Moving 34 specs breaks unrelated tests | Med | T4 before the ribbon goes, by area, test:quick after each |
| Keys typed in the search reach the canvas (Delete removes the selection) | Med | The canvas ignores keys from inputs already - checked in T1's spec |
| Row's code shared with tables in general | Med | Removed only where `grep` shows nothing else uses it; table specs green |
| Running Playwright beside test:quick | Med | Never (memory: kein Playwright neben test:quick) |
