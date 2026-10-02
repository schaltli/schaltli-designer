# Layout containers - tasks

Spec: docs/2026-10-02-layout.md. Plan: tasks/layout-plan.md.

Every task: typecheck and the named specs green before its commit; a
visible change updates its handbook page in the same task; ad-hoc checks
become permanent tests (CLAUDE.md). Commits only with the user's OK.

## Phase 1 - `layout-model`

## Task 1: Container types and the vertical stack

**Description:** The four container types in `lib/object-types.ts`, with
their properties and defaults (padding and gap from the size scale). A
pure `layoutObjects` in `lib/layout.ts` that measures and arranges a
`vertical-stack`: children one under another at the stack's inner width,
heights from size steps (controls), fonts (text), steps (icons). `free`
keeps its children's geometry. Settles the coordinate rule for children of
panels with a test (`childOrigin` vs `getAbsolutePosition`).

**Acceptance criteria:**
- [x] A stack of a text, a switch and a button group: each the stack's
      inner width, one under another with the gap; heights from font and
      size step; S → L makes the stack taller and nothing overlaps.
- [x] `free` children keep their x, y, width, height.
- [x] One rule for panel children's coordinates, pinned by a test.

**Verification:** `npx playwright test e2e/layout-model.spec.ts`; `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/layout.ts` (new), `lib/object-types.ts`,
`lib/object-tree.ts` or `lib/object-groups.ts`, `e2e/layout-model.spec.ts` (new)

**Estimated scope:** M

## Task 2: Horizontal stack and grid

**Description:** `horizontal-stack` (side by side, as tall as the tallest;
alignment and distribution) and `grid` (columns `auto` or weighted, rows as
tall as their tallest cell). Rings take the width offered, diameter snapped
(`snapDiameter`); a switcher is as tall as its tallest panel, each panel
holding a `vertical-stack`. Content too tall for its container is flagged,
not shrunk. Decides open question 2 (`free` inside a stack).

**Acceptance criteria:**
- [x] A grid with columns `auto`, 1: the first column as wide as its widest
      cell, the second taking the rest; rows as tall as their tallest cell.
- [x] A horizontal stack distributes as set; a ring in a stack keeps a
      snapped diameter.
- [x] A switcher in a stack is as tall as its tallest panel; overflow is
      reported for the container, nothing resized.

**Verification:** `npx playwright test e2e/layout-model.spec.ts`; `npm run typecheck`

**Dependencies:** Task 1

**Files likely touched:** `lib/layout.ts`, `lib/size-scale.ts` (reading only, if possible), `e2e/layout-model.spec.ts`

**Estimated scope:** M

## Task 3: Groups in a grid share its columns

**Description:** A `group` directly in a `grid` puts its pieces into
consecutive columns of the grid and takes part in measuring them; a group
with more pieces than columns starts a new row. Elsewhere a group stays as
it is (`normalizeGroups`).

**Acceptance criteria:**
- [x] Three groups «Licht», «Frischwasserpumpe», «Theme» (label + control)
      in a two-column grid: all labels in one column as wide as the longest,
      all controls starting on one edge.
- [x] A group outside a grid is laid out exactly as before.

**Verification:** `npx playwright test e2e/layout-model.spec.ts`; `npm run typecheck`

**Dependencies:** Task 2

**Files likely touched:** `lib/layout.ts`, `lib/object-groups.ts`, `e2e/layout-model.spec.ts`

**Estimated scope:** S

## Task 4: Containers drawn, and dissolved at deploy

**Description:** (Split 2026-10-02: a root container on every screen
needs containers drawn and dissolved first.) The shared
renderer (`lib/render-screen.ts`), the canvas and the flattening for baked
bitmaps (`lib/asset-export.ts`) draw a container's children relative to
it, as a group's; the canvas's "not drawn by this device" warning leaves
containers out. Containers are dissolved at deploy - in
`dissolveGroups`, so the device zip, the Android export and baked bitmaps
alike - their children keeping their own stacking numbers. Switchers and
panels keep their hierarchy; the editable `project.zip` keeps the
containers. Nothing visible changes yet: no container can be made.

**Acceptance criteria:**
- [x] A screen with stacks, a grid and a switcher is drawn by the shared
      renderer as its laid-out coordinates say.
- [x] Dissolved, it has no container type, every object where the designer
      drew it, children's stacking numbers unchanged; switchers kept.
- [x] A project without containers dissolves to the same reference.

**Verification:** `npx playwright test e2e/layout-model.spec.ts`; `npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:** `lib/render-screen.ts`, `components/canvas/canvas.tsx`, `lib/asset-export.ts`, `lib/object-groups.ts`, `e2e/layout-model.spec.ts`

**Estimated scope:** M

## Task 5: A screen is its own root container, and the layout pass

**Description:** A screen is its own root container (the user,
2026-10-02, over wrapping its objects in a container object, once the
costs of wrapping were seen): `screen.layout` (`free`, a stack, a grid,
with properties), its objects the root's children. `migrateProject` gives
a screen without one `{ type: "free" }`; its objects stay where they were.
No `systemGeneration` step (the user, 2026-10-02: devices never see
containers). `layoutProject` runs after every change where
`normalizeGroups` runs (so after `resolveScale` too), keeping every
reference where nothing moved. A switcher's panels are made to fill it
only where a container places the switcher, so a saved switcher stays as
saved.

**Acceptance criteria:**
- [x] Every project in `test-projects/` loads, looks and deploys
      byte-for-byte as before (device zip compared).
- [x] Loading twice changes nothing.
- [x] Canvas, object tree and master work on a screen's objects as before
      (the whole e2e suite green).
- [x] The layout pass on the largest test project stays within one frame
      (16 ms) per change.

**Verification:** `npx playwright test e2e/layout-model.spec.ts e2e/size-scale.spec.ts`, the canvas specs (`e2e/*canvas*`, `e2e/object-*`, `e2e/group*`); `npm run typecheck`

**Dependencies:** Task 4

**Files likely touched:** `lib/object-types.ts`, `components/project-editor.tsx`, `components/canvas/canvas.tsx`, `lib/object-groups.ts`, `e2e/layout-model.spec.ts`

**Estimated scope:** M

## Checkpoint A - the model
- [x] `layout-model.spec.ts`, `size-scale.spec.ts`, `bausteine.spec.ts` green
- [x] Old projects byte-for-byte as before
- [x] Review with the user: the layout rules as tested, before any UI.
      Decided 2026-10-02: objects only as wide as they need, not stretched
      (bars, sliders, containers, switchers still fill); a text measured by
      its words, in its font.

## Phase 2 - `layout-canvas`

## Task 6: The Layout tools and container properties

**Description:** A «Layout» section in the toolbar (`Vertical Stack`,
`Horizontal Stack`, `Grid`, `Free`). A container is created in `free` by
drawing its rectangle, as other objects are. Selecting a container shows
its properties (padding, gap, alignment, distribution, columns); an
object in a container shows x, y and width read-only, its size step
editable. Handbook: `objekte/anordnen.md`, the four containers.

**Acceptance criteria:**
- [x] A grid drawn in the free root, its columns edited, is laid out at
      once.
- [x] An object in a stack shows x, y and width read-only.
- [x] The handbook names the four containers and their properties.

**Verification:** `npx playwright test e2e/layout-canvas.spec.ts e2e/handbook-labels.spec.ts`; `npm run build --prefix handbuch`; `npm run typecheck`

**Dependencies:** Task 5

**Files likely touched:** `components/toolbar/toolbar.tsx`, `components/property-panel/` (new container panel), `components/canvas/canvas.tsx` (creation), `e2e/layout-canvas.spec.ts` (new), `handbuch/objekte/anordnen.md`

**Estimated scope:** M

## Task 7: Placing into a container at the insertion line

**Description:** With a tool armed, a stack or grid shows a line where the
object would land - between two children, or a grid cell - and a click
puts it there, sized by the container. In `free`, a rectangle is drawn as
today.

**Acceptance criteria:**
- [x] A switch placed into a stack between two objects by a click lands
      there, full width, its step's height.
- [x] Into a grid cell by a click.
- [x] In `free` nothing changes.

**Verification:** `npx playwright test e2e/layout-canvas.spec.ts`; `npm run typecheck`

**Dependencies:** Task 6

**Files likely touched:** `components/canvas/canvas.tsx`, `components/project-editor.tsx`, `e2e/layout-canvas.spec.ts`, `handbuch/objekte/anordnen.md`

**Estimated scope:** M

## Task 8: Moving within and between containers on the canvas

**Description:** Dragging an object on the canvas shows the same insertion
line in whichever container is under the pointer and moves it there -
reordering within a container, or into another one. The object tree shows
the containers and moves objects into them by the same rules
(`canDropAsChildOf`).

**Acceptance criteria:**
- [ ] An object dragged within a stack changes its place in it.
- [ ] Dragged from one stack into another, or from `free` into a grid.
- [ ] The object tree does the same, and refuses what the rules refuse.

**Verification:** `npx playwright test e2e/layout-canvas.spec.ts`; `npm run typecheck`

**Dependencies:** Task 7

**Files likely touched:** `components/canvas/canvas.tsx`, `lib/object-tree.ts`, `components/object-tree/object-tree-panel.tsx`, `e2e/layout-canvas.spec.ts`

**Estimated scope:** M

## Task 9: Round screens and the master's content area

**Description:** `screen.shape` in the DDF (`"rect"` when absent); the
Knob's DDF says `"round"` - a change in `schaltli-firmware`, asked for
first. A master's `contentArea` defaults to the whole screen, or on a round
screen to the inscribed square; on the master it is a frame moved and
resized like an object; screens show it and lay their root container out
in it. Handbook: the master's content area on the screens page.

**Acceptance criteria:**
- [ ] On the Knob a new master's content area is the inscribed square.
- [ ] Resizing it on the master re-lays every screen using it.
- [ ] A DDF without `shape` is treated as rectangular.

**Verification:** `npx playwright test e2e/layout-canvas.spec.ts e2e/handbook-labels.spec.ts`; `npm run typecheck`

**Dependencies:** Task 6

**Files likely touched:** `lib/device-description.ts`, `components/project-editor.tsx`, `components/canvas/canvas.tsx`, `e2e/layout-canvas.spec.ts`, `handbuch/designer/screens.md`; DDF in `schaltli-firmware`

**Estimated scope:** M

## Checkpoint B - on devices
- [ ] A screen built with containers by hand, deployed to the 4.3B and the
      Knob, matches the preview (added to the HIL fixture)
- [ ] M → L and a device change leave it without overlaps
- [ ] Default padding and gap tried and fixed (open question 3)
- [ ] Review with the user in the running designer

## Phase 3 - `layout-blocks`

## Task 10: Blocks into containers, lined up in a grid

**Description:** After Insert in the block dialog, a block is placed at
the insertion line like any object (in `free`, by its rectangle as today).
The block builders give the pieces and their steps; in a grid the name
falls into the first column and the control into the next, an entry with
several parts row by row. Handbook: `designer/bausteine.md`.

**Acceptance criteria:**
- [ ] Three blocks in a two-column grid: names and controls on one edge
      each.
- [ ] A block in `free` is placed exactly as today.
- [ ] A multi-part entry in a grid: its name, then each part on a row.

**Verification:** `npx playwright test e2e/bausteine.spec.ts e2e/layout-canvas.spec.ts` (needs `npm run hil:broker`); `npm run typecheck`

**Dependencies:** Task 7, Task 3

**Files likely touched:** `lib/bausteine.ts`, `components/project-editor.tsx`, `e2e/bausteine.spec.ts`, `handbuch/designer/bausteine.md`

**Estimated scope:** M

## Phase 4 - `layout-templates`

## Task 11: A screen's Layout option

**Description:** A «Layout» option for a screen with the built-in
templates «One column», «Name and control», «Two columns», «Free».
Choosing one copies its containers into the screen's content area; the
content of containers not in the new layout is appended to the one that
stays; one undo step. A new screen gets «Name and control». Handbook: the
screens page.

**Acceptance criteria:**
- [ ] «Two columns» to «One column» keeps all content, the second column's
      after the first's.
- [ ] Undo brings back the two columns as they were.
- [ ] A new screen starts with «Name and control».

**Verification:** `npx playwright test e2e/layout-templates.spec.ts e2e/handbook-labels.spec.ts`; `npm run build --prefix handbuch`; `npm run typecheck`

**Dependencies:** Task 8, Task 9

**Files likely touched:** `components/` (screen settings), `components/project-editor.tsx`, `lib/layout-templates.ts` (new), `e2e/layout-templates.spec.ts` (new), `handbuch/designer/screens.md`

**Estimated scope:** M

## Task 12: Handbook pictures, humanizer pass, full run

**Description:** The handbook's pictures for containers and the Layout
option (`e2e/handbook-screenshots.spec.ts`); every page this plan touched
through `maettel-humanizer`; the full suite.

**Acceptance criteria:**
- [ ] The handbook shows containers and the Layout option in pictures.
- [ ] Every touched page has been through the humanizer.

**Verification:** `npx playwright test e2e/handbook-screenshots.spec.ts e2e/handbook-labels.spec.ts`; `npm run build --prefix handbuch`; `npm run test:all`

**Dependencies:** Task 11, Task 10

**Files likely touched:** `e2e/handbook-screenshots.spec.ts`, `handbuch/objekte/anordnen.md`, `handbuch/designer/screens.md`, `handbuch/designer/bausteine.md`

**Estimated scope:** S

## Checkpoint C - complete
- [ ] `npm run test:all` green but for failures that also fail on `main`
- [ ] Every success criterion in the spec ticked
- [ ] Review with the user
