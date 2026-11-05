# Plan: prebuilt

From docs/2026-11-05-quick-blocks.md (approved by the user 2026-11-05).
Tasks: tasks/prebuilt-todo.md. Designer only, no firmware or Android.

## Before starting

The working tree holds uncommitted work on the same files (`lib/bausteine.ts`,
`lib/block-card.ts`, `lib/dock.ts`, `components/project-editor.tsx`,
`e2e/bausteine.spec.ts`, `e2e/card-blocks.spec.ts`,
`handbuch/designer/bausteine.md`, the tsconfigs). It is committed or set
aside by the user first; this plan starts from a clean `main`, on a branch
`prebuilt`.

## Approach

**Risk first.** The one thing nobody has built yet is a carry that starts
outside the canvas and runs without a button held. Today a carry is a
`dragState` of mode `create`, begun by a mousedown on the canvas
(`components/canvas/canvas.tsx`, the `placing` branch around line 3780).
T1 and T2 make that carry start from a ribbon tile - for the existing tools,
before any tab or catalog work - so if it turns out hard, it is known on
day one and nothing else is built on sand.

**One carry for everything.** Tools, Row templates, Card and prebuilts all
end in the same carry (`creatingType` + `blockTableRef` + the card path of
`armedBlockCarry`). The ribbon only has to hand the canvas «carry this,
pressed» or «carry this, hanging»; the drop rules stay where they are.

**The catalog is the broker store's.** `BrokerListener` subscribes to `#`;
`readCatalog(configs, prefix, blocksPrefix)` (`lib/ha-discovery.ts`) is pure
over a topic → payload map. T5 feeds it the store's retained config topics
instead of a fresh connection; an empty retained config is skipped there
already (`ha-discovery.ts:172`).

**Defaults are the dialog's initial state.** What `BausteinDialog`
initialises (first look per part, suggested icon, every section, state
icons) becomes `defaultOptions(entry, icons)` in `lib/bausteine.ts`, so
the placed result is provably the same as «Insert» pressed at once - the
existing `e2e/bausteine.spec.ts` expectations stay as they are, only the
way there changes.

**Convert is pure.** `lib/convert-object.ts` maps an object to another type
of its family; the size in a cell comes from the block builders' own
functions (`arcObject`, the slider's) so a converted part looks like one a
prebuilt would have brought.

**Handbook with each task.** The rename Bausteine → Baugruppen comes first
(T0), so every later task writes its part into `baugruppen.md` in the same
work (CLAUDE.md). The last task retakes the screenshots and runs the whole
handbook diff through `maettel-humanizer`.

## Dependency graph

```
T0 handbook rename ───────────────────────────────────────────┐
T1 drag a tool from the ribbon ──┬── T2 click a tool: hangs    │
                                 │        │                    │
T3 Shift for Alt (any time) ─────┤        │                    │
                                 │   T4 tabs + Prebuilt tiles  │
                                 │        │                    │
                                 │   T5 catalog from the store │
                                 │        │                    │
                                 └── T6 no dialog: tile carries a prebuilt
                                          │
                                     T7 icons prefetched, late icon
T8 convert, free objects ── T9 convert in cells/cards ── T10 right-click
                                                               │
                                         T11 screenshots, humanizer, test:quick
```

T8-T10 depend on nothing above them and could go in parallel with T4-T7.

## Tasks

See tasks/prebuilt-todo.md for the checklist; each task:

### T0 handbook: Bausteine → Baugruppen (S)
Rename `handbuch/designer/bausteine.md` to `baugruppen.md`; «Baustein» →
«Baugruppe» on the 14 pages that use it, links and the sidebar in
`handbuch/.vitepress/config.mjs`; a short page at the old address
`designer/bausteine` pointing to the new one (VitePress has no redirects on
Pages). A comment in `lib/bausteine.ts`: «Baustein» in the code is the
prebuilt assembly. No UI change.
- Accept: no link to `/designer/bausteine` left but the pointer page; the
  handbook builds; `e2e/handbook-labels.spec.ts` green.
- Verify: `npm run build --prefix handbuch`; the label spec.

### T1 drag a tool from the ribbon (M, highest risk)
Pressing on a tool button of the ribbon and moving starts a carry: the
object hangs at the pointer by its middle as soon as it is over the screen,
the hint chip as today, let go over the screen it lands by the placing
rule, let go elsewhere nothing is placed. Pointer events with capture on the
tile, handed to the canvas (not HTML drag and drop). The Row templates and
Card included; Line and Live Line not.
- Accept: a Slider dragged from the ribbon lands where let go, into a card
  and an empty cell by the pointer; let go over the ribbon, nothing; undo
  one step.
- Verify: `e2e/place-by-dragging.spec.ts` extended; `npm run typecheck`;
  `npm run test:quick`. Handbook: `designer/objekte.md` «So setzt du …».
- Files: `components/toolbar/toolbar.tsx`, `components/canvas/canvas.tsx`,
  `components/project-editor.tsx`, `e2e/place-by-dragging.spec.ts`,
  `e2e/helpers.ts`.

### T2 click a tool: the object hangs (M)
A click on a tool makes its object hang at the pointer without a button; a
click on the screen sets it down; Esc, the same tile again or a click
outside the screen gives it up; another tile takes over. The chip says
«Click to …»; the old tool hint at the top of the canvas goes for carried
tools (Line keeps its own). A press on the screen with a tool armed is that
click (no rectangle any more).
- Accept: the three ways to give up; the chip's two texts; Line drawn as
  before; after placing, Select.
- Verify: `e2e/placing.spec.ts` extended, the specs that place by pressing
  on the screen still green; typecheck; test:quick. Handbook:
  `designer/objekte.md`, `objekte/anordnen.md` («nach dem Druck auf den
  Screen»).
- Files: `canvas.tsx`, `components/canvas/snap-table-overlay.ts`,
  `toolbar.tsx`, `e2e/placing.spec.ts`.

### T3 Shift builds tables instead of Alt (S-M, mechanical)
`altKey` → `shiftKey` wherever placing reads it in `canvas.tsx`; the key
listener that redispatches the move on Alt listens for Shift; Shift at the
press still adds to the selection; the chip's keycap «Shift ⇧». The e2e
helpers and the eight specs that hold Alt hold Shift. Handbook: every page
naming <kbd>Alt</kbd> for tables.
- Accept: Shift during a carry builds tables, Alt does nothing; Shift+click
  still adds to the selection.
- Verify: `e2e/placing.spec.ts`, `snap-table-canvas.spec.ts`,
  `card-grid-canvas.spec.ts`, `drop-into-free-canvas.spec.ts`; test:quick.
- More than five files, but each change is the same substitution.

### Checkpoint A (after T0-T3)
test:quick green apart from known load failures; the user tries dragging
and clicking tools in the browser before the tabs come.

### T4 two tabs, the Prebuilt tiles (M)
«Parts» and «Prebuilt» above the ribbon, the last one remembered
(`localStorage`, guarded). The Prebuilt tab renders `catalogGroups` as
ribbon groups of tiles (new `components/toolbar/block-tiles.tsx`), greyed
with reasons, the three status texts. The Block button and
`block-catalog-menu.tsx` go; `OPEN_BLOCK_MENU_EVENT` selects the tab. A
tile still opens the dialog in this task (the system stays working), the
catalog still read as today.
- Accept: tabs switch and are remembered; tiles grouped by device; «Listen
  to Broker»'s pointer opens the tab.
- Verify: new `e2e/prebuilt-tab.spec.ts`; the catalog helper in
  `e2e/bausteine.spec.ts`, `size-scale.spec.ts`, `mqtt-connection.spec.ts`
  and `handbook-screenshots.spec.ts` switched from menu to tile; test:quick.
  Handbook: the tabs.

### T5 the catalog from the broker store (S-M)
`useBlockCatalog` derives the catalog from `brokerStore` while listening,
recomputed when config topics change; a one-off read and a refresh button
while not. The values half from the store too.
- Accept: the tab shows the catalog without a new connection; a new
  announcement appears in the open tab, an empty retained one removes its
  tile; with Listening off, the refresh button.
- Verify: `e2e/prebuilt-tab.spec.ts` extended (seeded broker); test:quick.
- Files: `hooks/use-block-catalog.ts`, `lib/broker-store.ts` (a selector
  for config topics if needed), `block-tiles.tsx`.

### T6 no dialog: a tile carries the prebuilt (M)
`defaultOptions(entry)` in `lib/bausteine.ts`; a tile dragged or clicked
builds with it and carries through T1/T2; examples from the store;
`BausteinDialog` unmounted and removed. Icons as far as already loaded (no
waiting yet - T7).
- Accept: MaxxFan by a click and a click is the card it was through the
  dialog's defaults; a single-part one a row; nothing heard, no example.
- Verify: `e2e/bausteine.spec.ts` - the dialog's own tests removed or
  turned into placing tests, the result expectations unchanged;
  `e2e/card-blocks.spec.ts`; test:quick. Handbook: «So geht's» and the
  dialog's paragraphs in `baugruppen.md`.
- Files: `lib/bausteine.ts`, `project-editor.tsx`, `block-tiles.tsx`,
  `components/baustein-dialog.tsx` (deleted), e2e specs.

### T7 icons fetched with the tab, a late icon (S)
The tab fetches entry icons, suggested icons and state icons when first
shown (a small cache); an icon arriving while the prebuilt is carried is
put in; placed before, it stays without; the service down, no icon, no
error in the way.
- Accept: the three cases.
- Verify: `e2e/bausteine.spec.ts` (icon service stubbed slow / failing);
  test:quick.

### Checkpoint B (after T4-T7)
test:quick green; the user places VanPi's prebuilts in the van's project.

### T8 Convert to, free objects (M)
`lib/convert-object.ts`: `convertTargets`, `convertObject` for Slider ↔
Dial, Bar ↔ Gauge, Switch ↔ Button Group (two states); id, topics, range,
step, calibration, send-as, value shown, colours, font kept; the new type's
defaults for the rest; free: same top-left, natural size for the width.
«Convert to» in the Properties panel header (`property-panel.tsx:303`),
types the device does not render greyed; one undo step.
- Accept: each family both ways; a Knob binding on the dial still valid
  after Dial → Slider; undo.
- Verify: new `e2e/convert.spec.ts` (model and UI); test:quick. Handbook:
  the six object pages.

### T9 Convert in a cell and a card (S-M)
In a table cell or a card the converted object is sized as a block builds
that look for the cell; the row and a content-high card follow.
- Accept: MaxxFan's dial → slider in its card, the card shorter, nothing
  overlapping; in a plain table the row follows.
- Verify: `e2e/convert.spec.ts` extended; test:quick.

### T10 Convert to in the right-click menu (S)
A «Convert to» submenu in the canvas context menu beside Group / Ungroup,
for one object of a family.
- Accept: shown for one Slider, absent for two objects or a Text.
- Verify: `e2e/convert.spec.ts`; test:quick. Handbook where the menu is
  described.

### Checkpoint C (after T8-T10)
test:quick green; the user converts parts of a placed prebuilt.

### T11 screenshots, humanizer, release run (S)
Retake `baustein-menue` as the Prebuilt tab, drop `baustein-tank`
(`e2e/handbook-screenshots.spec.ts`); the whole handbook diff through
`maettel-humanizer`; spec status «built»; `npm run test:all`.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A carry starting outside the canvas fights its mouse handlers (capture, coordinates, zoom, scroll) | High | T1 first; pointer capture on the tile, coordinates converted by the canvas's own function |
| A hanging carry without a button breaks assumptions (`buttons: 1` in the redispatched move, mouseup ending a carry) | High | T2 right after T1, with Esc/second-click tests |
| The rename breaks links from outside (forum post) | Med | Pointer page at the old address (T0) |
| `e2e/bausteine.spec.ts` (69 tests) leans on the dialog | Med | One helper switched from dialog to tile in T4/T6; result expectations untouched |
| Shift at the press means «add to selection» | Med | Shift counts only once the carry runs (T3), tested |
| Running Playwright beside test:quick | Med | Never (memory: kein Playwright neben test:quick) |

## Open question

- **Shift or Alt (decision 8)?** Found while planning: the canvas already
  swallows Alt while carrying (`canvas.tsx` ~4650, «Chrome on Windows moves
  the focus to its menu on a lone Alt»), and a hanging carry is a carry
  too - so Alt would likely work for the clicked way as well. The reason
  for decision 8 is weaker than stated. **The user, 2026-11-05: decided
  after trying** - once T2 is built, Alt is tried with a hanging carry on
  Windows Chrome; only if it gets in the way does T3 switch to Shift.
