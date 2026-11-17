# Plan: Areas

From docs/2026-11-16-areas.md (approved 2026-11-16, step 3 included). Designer
only; no firmware or app change (decision 11). Branch `areas` from `main`,
commits without push.

## What the code is today

- `lib/layout.ts` `layoutProject` lays out every screen's objects after every
  change and writes finished x, y, width, height into them. The canvas, the
  preview and the export read those and know nothing of containers. That is
  why «nothing moves» can be tested on the export alone.
- An area is `type === "free"`, asked for by name in `lib/dock.ts` (`dockFree`),
  `lib/anchor.ts` (`resizeFree`, `withUpdates`), `lib/free-min-size.ts`
  (`freeMinSize`, `keptInPadding`, `withCardsGrown`, `withCardsFollowing`),
  `lib/drop-into-free.ts`, `lib/object-groups.ts` (`dissolveContainerList`,
  the box and the clip), `lib/card.ts` and 13 places in `canvas.tsx`.
- A panel is a `ScreenObject` of type `panel`, filled to its switcher only
  when a container places the switcher (`withFilledPanels`); a device knows
  panels, so they are not dissolved on export.
- A screen is not a `ScreenObject`: `screen.objects` and nothing of a layout
  (`lib/free-screens.ts` took `layout` and `contentArea` away).
- A table's children are the objects themselves, their place in
  `properties.cell` (`lib/snap-table.ts`, 899 lines: `measure`,
  `arrangeSnapTable` and every editing operation read it).
- The kept sizes: `cell.drawnWidth/drawnHeight` (written by
  `arrangeSnapTable` on every pass while stretched) and `properties.ownSize`
  (written by `dockFree` wherever docking overwrote a size).

## Approach

**One predicate, one set of functions.** A new `lib/area.ts` says what an area
is and where its size comes from: `isArea(obj)` (`free`; `panel` from T2;
`cell` from T9) and `areaOf(...)` for the screen, which is wrapped for the
layout pass as an area object `{ x: 0, y: 0, width, height, properties:
screen.area ?? {}, children: screen.objects }` and unwrapped again. `dockFree`,
`resizeFree`, `freeMinSize`, `keptInPadding` and the grow and follow passes
then ask `isArea` instead of `type === "free"`; they keep their names until
step 3 is done, so each task's diff stays readable.

**Where the screen's own properties live:** `screen.area?: { padding?: number;
gapMm?: number }`. A panel carries them in its `properties`, as a Free area
does.

**A look only where it can be seen as one:** a standing area and a cell take
«Card»; a panel takes it only by taking over the one Free area that filled it
(T3), because that is what the project already showed. A screen has Padding
and Gap and no look. (Decision 1 gives every area an optional look; a screen
that is a card says nothing. To be confirmed, open question 3.)

**A panel's look on export.** A panel is not dissolved, so its box cannot come
from `dissolveContainerList`. The export puts the box in as the panel's lowest
child and `clip` on the others, which is what a device got when the Free area
inside the panel was dissolved. The box keeps the id the Free area's box had
(`properties.boxId` on the panel, written by the migration), because baked
pictures are keyed by object id; without it the zip is not the same bytes.

**The baseline first.** Before any change, the device zips of «VanPi-Starter»,
the demo and every template, exported by today's `main`, are pinned as file
lists with hashes in `e2e/fixtures/areas-baseline.json`. Every later task is
checked against them. E2a projects (controls outside a panel) are compared by
where each object lies instead.

**Step 3 keeps `properties.cell` readable.** `snapCellOf` reads the place from
a `cell` object once tables hold cells; the editing operations in
`lib/snap-table.ts` are moved over one group at a time (T10) behind the same
exports, so the canvas changes in its own task.

## Decisions taken while planning

- **Open question 1 of the spec** (an object alone in its cell, no longer
  docked Fill): docked Top, Bottom, Left or Right the cell is still a slot - the
  cell places the object, a drag takes it out of the table as today. With Dock
  None it stands free in the cell, a drag has to mean «move it in the cell»,
  so that cell is a level of its own (table, cell, object).
- **No format version exists.** `version` in a project file is a dead field
  (`lib/project-zip.ts`), and nothing in `lib/` refuses a newer project. The
  spec's «the format version goes up» has nothing to raise. See open
  question 1.
- **`ownSize` across a dock is dropped on load** (decision 14): no interface
  ever let one be typed, so every saved one is docking's own note. Along the
  dock an object's length is its `width` or `height` and stays.
- **«Free» becomes «Area» in step 1** (T6): it is a label, it ships alone, and
  the handbook is rewritten once instead of twice.

## Dependencies

```
T0 baseline
 └ T1 lib/area.ts (no behaviour change)
    ├ T2 panel is an area ── T3 panel takes over its Free area, E2a
    ├ T4 screen is an area
    └ T5 Position section everywhere ── T6 «Area», handbook      [step 1 ships]
       └ T7 ownSize in cells ── T8 docking keeps no size          [step 2 ships]
          └ T9 cell model ── T10 editing ── T11 «Position» for «Cell»
             └ T12 look and padding on a cell ── T13 several objects
                └ T14 prebuilts ── T15 handbook, MaxxFan          [step 3 ships]
```

## Tasks

Every task: `npm run typecheck`, its own spec, `e2e/areas-nothing-moves.spec.ts`.
A step ends with `npm run test:quick` (the export and the project format are
touched) and a stop for the user.

### Step 1 - panel and screen are areas

**T0 Baseline.** `e2e/areas-nothing-moves.spec.ts`: loads each saved project
through `migrateProject` and `layoutProject`, exports the device zip, compares
names and hashes with `e2e/fixtures/areas-baseline.json` (written once from
`main`, by the spec with an env switch).
- The spec is green on `main` without any other change.
- It covers the projects the repo builds: the starter from `templates/vanpi-4.json`
  (the only shipped template), the demo «Camper», CamperUI rebuilt.
- A changed byte names the file.
Files: the spec, the fixture. Size S.

Done 2026-11-16, from `main` at 784739e8: 97, 67 and 47 files. Left out of the
comparison: `_source/` (the designer's own project as a recovery copy, which a
migration changes and no device reads) and `exportedAt` in `project.json`.
The user's own «VanPi-Starter» with the screen «MaxxFan» lives in `.data/`
and is not in the repo: the shapes it has (a card stretched in a cell, a panel
with one Free area) get fixtures of their own in T3 and T12.

**T1 `lib/area.ts`.** `isArea`, the screen wrapped as an area; `dock.ts`,
`anchor.ts`, `free-min-size.ts`, `drop-into-free.ts` ask it. `isArea` is still
only `free`.
- No test changes; `e2e/anchor-dock*.spec.ts`, `card-min-size`, `free-area`,
  `drop-into-free*` green.
- T0 green.
Files: lib/area.ts, lib/dock.ts, lib/anchor.ts, lib/free-min-size.ts,
lib/drop-into-free.ts. Size M.

**T2 A panel is an area.** A panel docks, pads and anchors what stands in it;
it is at least as large as its content, the switcher as large as its largest
panel, standing free too (E2). Past the right or bottom edge the panel grows,
past the left or top the object is moved in; dragged smaller, the switcher
stops where every panel holds its content. «Padding» and «Gap» in the panel's
properties.
- The cases of `e2e/anchor-dock.spec.ts` run in a panel
  (`e2e/area-panel.spec.ts`).
- E2 as a canvas case: drop past the right edge, drag the switcher smaller.
- T0 green for every project without controls outside a panel.
Files: lib/area.ts, lib/layout.ts (`fitSwitcher`, `withFilledPanels`),
lib/free-min-size.ts, components/property-panel/panel-properties.tsx,
components/canvas/canvas.tsx. Size L - the canvas part is its own commit.

**T3 Old panels.** On load a panel holding exactly one Free area that fills it
takes its properties and children (`boxId` kept, see Approach); a switcher
whose panels have controls outside grows to hold them, to the left and up by
moving its corner and its children with it (E2a).
- Migration cases in `e2e/areas-migration.spec.ts`: the take-over with and
  without look, a Free area that does not fill (stays), controls outside on
  each of the four sides.
- T0 green byte for byte for the take-over; E2a projects equal by each
  object's place on the glass.
- Idempotent: migrating twice changes nothing.
Files: lib/object-types.ts, lib/area-migration.ts (new), lib/object-groups.ts
or lib/project-zip.ts (the panel's box), the spec. Size M.

**T4 A screen is an area.** `screen.area`; objects on a screen dock; the
screen's area grows to the right and downwards for what is docked (E1), the
editor draws it past the panel; free objects lie anywhere and Position measures
from the panel's edges (E1a); masters lay out on their own (E7); the knob's
area is its square (E8). «Padding» and «Gap» in the screen's properties.
- `e2e/area-screen.spec.ts`: the anchor-dock cases on a screen, E1, E1a, E7.
- Nothing docked, nothing changes: T0 green.
- `dockedOut` is no longer set anywhere (every area grows); a saved one goes
  on load.
Files: lib/area.ts, lib/layout.ts (`layoutProject`), lib/dock.ts,
components/property-panel/screen-properties.tsx, components/canvas/canvas.tsx,
components/project-editor.tsx (`ProjectScreen`). Size L - canvas its own commit.

**T5 «Position» wherever an object stands in an area.** `FreePositionProperties`
shown for objects on a screen and in a panel; the frame lock and its hint say
«area», not «free area».
- The section is there in all three places, with Dock, Horizontal, Vertical.
- `e2e/fixtures/property-panel-controls.json` harvested again.
Files: components/property-panel/property-panel.tsx, free-properties.tsx, the
fixture. Size S.

**T6 «Area», and the handbook for step 1.** The tool, the object list and the
section say «Area» (decision 15); the type stays `free`.
`handbuch/objekte/anordnen.md`, `designer/index.md`: Dock, Position and
Padding on a screen and in a panel, «Area» for «Free»; through
`maettel-humanizer`.
- `e2e/handbook-labels.spec.ts` green.
- `npm run test:quick`.
Files: lib/object-types.ts, free-properties.tsx, canvas.tsx (two labels), the
handbook pages. Size M.

**Checkpoint 1.** test:quick noted in the todo; the user looks at «MaxxFan»:
two panels that dock their own content.

### Step 2 - one kept size

**T7 `ownSize` in a cell.** `cell.drawnWidth/drawnHeight` become
`properties.ownSize`; on load, larger than the content needs they are kept,
else dropped. «Min W» and «Min H» read and write `ownSize`.
- `e2e/stretched-min-size.spec.ts` and `card-min-size.spec.ts` on the new
  property; a migration case above and below the content's need.
- No `drawnWidth` or `drawnHeight` left in `lib/` or `components/` outside the
  migration.
- T0 green.
Files: lib/snap-table.ts, lib/free-min-size.ts, lib/paste-beside.ts,
property-panel.tsx, free-properties.tsx, canvas.tsx,
renderers/render-chart.ts, render-energy-diagram.ts, lib/area-migration.ts.
Size L - mechanical, one rename.

**T8 Docking keeps no size.** `dockFree` no longer writes `ownSize`; a docked
object shows «Min W» or «Min H» across its dock and has one only when typed
(decision 14); saved ones go on load.
- A docked card can be dragged as narrow as its words (`anchor-dock-card`).
- Undocked, an object keeps the size it has.
- T0 green; `npm run test:quick`.
Files: lib/dock.ts, lib/free-min-size.ts, property-panel.tsx,
lib/area-migration.ts, e2e/anchor-dock.spec.ts. Size M.

**Checkpoint 2.** test:quick; the user confirms before step 3.

### Step 3 - the cell is an area

**T9 The cell in the model.** `type: "cell"`, an area, a layout-only type; a
table's children are cells; `measure` takes a column's width from what its
widest cell needs (`freeMinSize` of the cell); a cell's one object is docked
Fill with `cell.anchor` as its `anchor` (decision 5); `dissolveContainerList`
dissolves a cell. Migration: every object in a table gets its cell.
- `e2e/snap-table-model.spec.ts` on cells; E3, E9.
- T0 green: a table of texts and switches exports the same bytes.
- `layoutProject` twice returns the same reference (no column that grows on
  every pass).
Files: lib/snap-table.ts (top half), lib/area.ts, lib/layout.ts,
lib/object-groups.ts, lib/area-migration.ts. Size L.

**T10 Editing a table of cells.** `placeInCell`, `takeOutOf`, `snapPair`,
`mergeTables`, `resizeSpan`, `liftOut`, `deleteObjects`, `moveOutOf`,
paste beside and replace work on cells; a cell with one object and no look is
skipped by selection, the tree and Esc (decision 12).
- `e2e/snap-table-canvas.spec.ts`, `card-grid*.spec.ts`, `tree-carry`,
  `place-by-dragging`, `convert` green with their `properties.cell` reads
  moved to a helper.
- Nobody building a table of texts and switches sees a difference: the
  canvas specs need no new step.
Files: lib/snap-table.ts (bottom half), lib/paste-beside.ts, canvas.tsx,
object-tree-panel.tsx, the specs. Size L - lib and canvas as two commits.

**T11 «Position» for «Cell».** The section «Cell» goes; an object alone in its
cell shows «Dock: Fill» and can change it (decision 13, and the decision above
on open question 1).
- The same three fields in a cell as anywhere; the fixture harvested again.
- Dock None in a cell: the object stands free there, the cell is a level.
Files: snap-table-properties.tsx, free-properties.tsx, property-panel.tsx,
canvas.tsx. Size M.

**T12 A look and padding on a cell.** Look, Padding, Gap and colours on a
cell, shown under «Position» of the one object in it (decision 12) or on the
cell itself; the export draws its box and clips. Migration: a Free area
stretched both ways in its cell becomes the cell, its `ownSize` the cell's.
- Migration cases: stretched both ways (becomes the cell), stretched one way
  (stays), pulled taller (shows «Min H»).
- E4 and E5 as canvas cases.
- T0 green for «VanPi-Starter» byte for byte.
Files: lib/area-migration.ts, lib/object-groups.ts, lib/card.ts,
snap-table-properties.tsx, lib/snap-table.ts (`tidied`). Size L.

**T13 Several objects in a cell.** A drop onto an occupied cell goes into it
and stands free (E6); Alt snaps beside; table, cell, object with Esc going up;
«Cell» in the object list.
- `e2e/area-cell.spec.ts`: E6 with and without Alt, Paste Replace, docking the
  second object.
- The anchor-dock cases run in a cell: all four places covered.
Files: lib/snap-table.ts (`snapDropAt`), lib/drop-into-free.ts, canvas.tsx,
object-tree-panel.tsx. Size M.

**T14 Prebuilts and templates** build cells with a look (E10).
- `e2e/bausteine.spec.ts`, `card-blocks`, `block-tiles`, `templates` on the new
  shape; what they export equals what they exported before.
Files: lib/bausteine.ts, lib/block-card.ts, lib/templates.ts, the specs. Size M.

**T15 Handbook and the success criteria.** `anordnen.md` rewritten around the
area and the table of areas; `designer/screens.md`, `baugruppen.md`,
`index.md` follow; `e2e/area-maxxfan.spec.ts` builds «MaxxFan» with no Free
area: three cells with the look, two panels that dock.
- handbook-labels green; no `<span class="ui">Cell</span>` as a section left.
- `npm run test:quick`.
Size M.

**Checkpoint 3.** The spec's success criteria one by one, with the user.

## Risks

| Risk | Weight | What is done about it |
|---|---|---|
| A layout pass that is not stable once cells size columns by `freeMinSize` (a column growing on every change, as `drawn()` once guarded against) | high | T9's criterion: `layoutProject` twice, same reference; the search in `freeMinSize` runs per cell per pass, so its cost is measured on «VanPi-Starter» |
| The panel's box under another id changes baked picture names | high | `boxId` kept by the migration; T0 catches it |
| `canvas.tsx` asks `type === "free"` in 13 places and `properties.cell` directly | medium | canvas changes are their own commits in T2, T4, T10; the specs that read `properties.cell` (17 files) go through one helper |
| A project saved between steps | medium | each step's migration is idempotent and reads what the step before wrote |
| The grow pass now runs for screens and panels on every edit | medium | measured in T4; `withCardsGrown` already stops after three rounds |
| E2a: a switcher that grows on load pushes a table it stands in | low | compared by place, and listed per project in the migration spec's output |

## Open questions for the user

1. **Format version.** There is none to raise, and an older designer would
   open a project of the new one and lay it out wrongly without saying so.
   Proposed: write `settings.formatVersion = 2` from step 1 on and have this
   designer refuse anything higher than it knows - it protects from the next
   change on, not from this one. Or leave it, since there is one designer and
   it is always the newest.
2. **Position on a screen and a device change.** An area's anchors act when the
   area changes size; a screen changes size only on a device change, where
   the size scale already moves and resizes everything. Proposed: the size
   scale stays as it is, and only objects docked or anchored other than
   Left/Top are placed by the screen's area afterwards.
3. **A look on a screen or a panel** (Approach above): Padding and Gap only,
   a look on a panel only where the migration brings one. Or the full section
   everywhere.
