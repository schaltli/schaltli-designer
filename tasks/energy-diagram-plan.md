# Implementation plan: the energy diagram (`energy-*`)

Spec: `docs/2026-10-11-energy-diagram.md` (2026-10-11), with its modules,
assumptions and target picture. Tasks: `tasks/energy-diagram-todo.md`.
Chat German, docs English.

Scope of this plan in detail: the first two modules, `energy-spike` and
`energy-layout`, which can run side by side. The later modules are
sketched at the end and get their tasks once these two are done and the
spike's answer is in.

## Overview

The spike answers one question before anything is built: can the 4.3B
move dots along a diagram's lines at 8 steps a second or more without a
tap getting more than 20 % slower, and can it fill a Sankey band the way
the designer draws it? `energy-layout` meanwhile writes the numbers every
renderer will share - where each node and band goes, what the rest is,
how fast a dot runs - as pure functions with test vectors, like
`lib/navigator.ts` and `lib/navigator/vectors.json`.

## Architecture decisions

- **One pure core, `lib/energy-diagram.ts`**, written to be ported:
  inputs are the object's properties and a map of watts and charges, out
  come rectangles, circles, band outlines, line ends and dot paths. No
  canvas, no React, no theme. Its cases go to
  `lib/energy-diagram/vectors.json` from the start, for the firmware and
  the app.
- **Bands are polygons.** A band's cubic edges are flattened into straight
  segments by the core (a fixed number per band), so the canvas, the
  firmware and the app fill the same polygon and the pixel diff can be
  near zero. The firmware needs a polygon fill, not a curve fill.
- **Dots are a phase, not a clock.** The core gives a dot's position along
  its path for a phase 0..1; each renderer advances the phase by elapsed
  time over `dotSeconds(watts)`. The 4.3B may step it 8-12 times a
  second, the designer every frame; the dots stand at the same places for
  the same phase, so a HIL snapshot can freeze a phase and compare.
- **The spike lives behind the test interface**, as the panel benchmark
  does: `GET /api/debug?set=energyspike=<n>` draws a still diagram of n
  lines with one band, then moves dots by regional redraws, and reports
  its numbers on `/api/debug`. It is removed or folded into the real
  renderer by `energy-firmware`, not shipped as a feature.

## Dependency graph

```
energy-spike ─────────────────────────────┐
                                          ├─> energy-firmware ─┐
energy-layout ─> energy-designer ─> energy-contract            ├─> energy-demo
                                          └─> energy-android ──┘
```

## Task list: `energy-spike`

### S1 - Measure today: a tap's latency on the 4.3B
**Description:** a HIL script taps a switch on a known screen through
`/api/touch` and measures until the redrawn feedback is in the snapshot
or the firmware's own render log says so; 20 taps, median and 90th
percentile. This is the baseline success criterion 3 compares with.
**Acceptance:**
- [ ] median and p90 of 20 taps, recorded with the firmware build
- [ ] the method written down in the script's header
**Verification:** `node hil/waveshare4v3b/energy-motion-spike.js --device 192.168.1.117 --baseline`
**Dependencies:** none. **Files:** `hil/waveshare4v3b/energy-motion-spike.js`. **Scope:** S.

### S2 - Firmware: a polygon fill
**Description:** `ColorScreenRenderer` fills a polygon (scanline, even-odd,
anti-aliasing as the designer's canvas for bands - decided by the diff in
S4). Used for one Sankey band in the spike.
**Acceptance:**
- [ ] a native test fills a known polygon and compares with a reference
- [ ] it builds for the 4.3B
**Verification:** `pio test -e native`, `pio run -e waveshare-touch-lcd-4v3b`
**Dependencies:** none. **Files:** `src/project/ColorScreenRenderer.{h,cpp}`, `test/test_polygon/`. **Scope:** M.

### S3 - Firmware: the spike's motion loop
**Description:** behind `?set=energyspike=<n>`: a still screen with n
lines to a bus and one Sankey band, then on a timer each line's dot
advances - only the rectangles of the dots' old and new places redrawn
(`renderRegion`) - and the band's wave moves one shade: each of the
band's columns refilled as one vertical stroke in its next palette colour
(spec decision 10). Counts steps per second and the time each step takes,
dots and wave separately, reported on `/api/debug`.
**Acceptance:**
- [ ] runs with n = 1..8, stops on `energyspike=0`
- [ ] `/api/debug` shows steps/s and ms per step
- [ ] touch keeps working while it runs
**Verification:** flash, `curl .../api/debug?set=energyspike=5`, watch the panel
**Dependencies:** S2. **Files:** `src/boards/waveshare4v3b/main.cpp`, a small `EnergySpike.{h,cpp}`. **Scope:** M.

### S4 - Measure with motion, and the band's pixel diff
**Description:** the script of S1 runs again with the spike moving five
lines; it also takes a snapshot with motion off and compares the band
with the designer's polygon (test-render) by the usual threshold.
**Acceptance:**
- [ ] steps/s ≥ 8 and tap latency ≤ 1.2 × baseline, for the dots and for
      the wave - or a clear number showing why not
- [ ] band diff within the HIL threshold
- [ ] the result and the decision (move or stay still on the 4.3B)
      written into the spec's decision 14
**Verification:** `node hil/waveshare4v3b/energy-motion-spike.js --device 192.168.1.117`
**Dependencies:** S1, S3. **Files:** the script, the spec. **Scope:** S.

### Checkpoint: spike
- [ ] the spike's numbers and the decision for the 4.3B are in the spec
- [ ] the script is in `npm run test:all` (skipped without the board)
- [ ] the user has seen the numbers

## Task list: `energy-layout`

### L1 - Types and the rest
**Description:** the node and diagram types (spec decisions 2-6), and
`resolve(properties, values)`: each node's watts after «reverse sign»,
whether it gives or takes, the storage's side, the rest (decision 4).
**Acceptance:**
- [ ] the four situations of the target picture resolve to its numbers
- [ ] negative sources and sinks count as 0; at most one rest, one bus
**Verification:** `npx playwright test e2e/energy-diagram-layout.spec.ts`
**Dependencies:** none. **Files:** `lib/energy-diagram.ts`, the spec file. **Scope:** S.

### L2 - Sankey layout
**Description:** `sankeyLayout(resolved, box)`: givers left, takers right,
ordered by y, the bus in the middle, widths linear by watts ÷ fullScale
of the room, capped at the room, bands ≥ 3 px
while they carry, label slots ≥ 66 px, each band as a polygon (flattened
cubic), label anchors.
**Acceptance:**
- [ ] matches the target picture's geometry for its four situations
- [ ] a 0 W node is left out; a storage changes sides with its sign
**Verification:** same spec file. **Dependencies:** L1. **Files:** `lib/energy-diagram.ts`. **Scope:** M.

### L3 - Flow layout
**Description:** `flowLayout(resolved, box)`: circles at x/y, the bus at
its x/y, line ends on the circles' edges, line width from watts (3-12 px,
logarithmic), the storage's ring, grey for 0 W.
**Acceptance:** [ ] matches the target picture for its four situations
**Verification:** same spec file. **Dependencies:** L1. **Files:** `lib/energy-diagram.ts`. **Scope:** S.

### L4 - Dots and waves
**Description:** `dotSeconds(watts)`; `dotsAt(path, phase)`: the dots'
places along a line for a phase, direction by giving or taking, spacing
as in the target picture; `wavePalette(colour, background)` and
`waveColour(x, phase)`: the 8 soft shades and the blended colour a column
has; `WAVE_SECONDS` (4 s), the same for every band.
**Acceptance:** [ ] the same places for the same phase in every call; reversed for a taker
**Verification:** same spec file. **Dependencies:** L2, L3. **Files:** `lib/energy-diagram.ts`. **Scope:** S.

### L5 - Test vectors for the devices
**Description:** `lib/energy-diagram/vectors.json` with inputs and outputs
of L1-L4 for the four situations and the edge cases, generated by a
script and checked by the spec file, as `lib/navigator/vectors.json`.
**Acceptance:** [ ] the vectors file is written and read back equal
**Verification:** same spec file. **Dependencies:** L1-L4. **Files:** `lib/energy-diagram/vectors.json`, a generator. **Scope:** S.

### Checkpoint: layout
- [ ] all tests green; the target picture's four situations reproduced by
      the core (a test-render image of each beside the picture's)
- [ ] the user has looked at the four images

## Task list: `energy-designer` (planned 2026-10-12)

The precedent is the navigator (`tasks/navigator-plan.md`, its Tasks 4-6
and 9): a type, a tool, a renderer in `lib/render-screen.ts`, a panel, the
preview. Every picture comes from `lib/energy-diagram.ts`; the renderer
only paints what the core gives. Tests in `e2e/energy-diagram.spec.ts`.

### D1 - The object: type, tool, defaults, theme roles
**Description:** `energy-diagram` in `OBJECT_TYPES` and the drawing order;
tool «Energy diagram» under «Show» with its icon; a new diagram fills the
rectangle drawn with a bus and three nodes - «Solar» (source), «Battery»
(storage), «Consumers» (rest) - in mode Flow, placed round the bus by
`defaultDiagram(box)` in the core (each node's first line `{live:w} W`).
The six roles of decision 12 in `lib/themes.ts`: one light and one dark
value each, from the target picture, shared by every theme (a theme may
override later), offered by the role picker. Until `energy-contract` the
device zip and the Android bundle leave the object out, so nothing
half-made reaches a device.
**Acceptance:**
- [ ] drawing with the tool gives the bus and the three nodes, Flow, inside the rectangle
- [ ] the six roles resolve in every theme, light and dark
- [ ] a project with a diagram exports; the zip and the bundle have no `energy-diagram`
**Verification:** `npx playwright test e2e/energy-diagram.spec.ts e2e/energy-diagram-layout.spec.ts`
**Dependencies:** layout. **Files:** `lib/object-types.ts`, `lib/object-order.ts`, `lib/themes.ts`, `lib/energy-diagram.ts`, `components/toolbar/toolbar.tsx`, `components/icons/object-icons.tsx` (+ export filter). **Scope:** M.

### D2 - Drawn still: both modes on the canvas
**Description:** `components/canvas/renderers/render-energy-diagram.ts`,
called from `lib/render-screen.ts`, so the editor, the preview, the
thumbnails and test-render all draw it. From the values the canvas has
(broker or examples): `resolveEnergy`, then `flowLayout` or
`sankeyLayout`; circles with the node's icon tinted, lines, the ring for a
storage's charge, bars, the bus, band polygons, grey for 0 W; each node's
lines as live text through the text renderer, the label slot reserved for
the widest it can show (decision 11). Motion stands at phase 0 here.
**Acceptance:**
- [ ] test-render draws the target picture's four situations; colours sampled at the core's band centres, circles and bus match the roles
- [ ] a node without a value shows «No value yet» in its line and counts as 0 W
- [ ] the four images shown beside the core's pictures (artifact) - same geometry
**Verification:** same spec file. **Dependencies:** D1. **Files:** the renderer, `lib/render-screen.ts`, `app/test-render/page.tsx`. **Scope:** M.

### D3 - Motion in the preview
**Description:** while the preview runs and the diagram's Motion is on,
the dots run (`dotsOnLine`, `dotSeconds`) and the wave moves (`waveColour`,
`WAVE_SECONDS`) at the pace a device has - one animation loop for all
diagrams on the screen, only while one is visible, stopped when the
preview closes. The editor canvas stays still. A test hook freezes the
phase, so a test (and later the HIL diff) can take one fixed frame.
**Acceptance:**
- [ ] two frames a second apart differ inside a band and on a line, not elsewhere
- [ ] Motion off: no frame differs; no loop runs when no diagram is shown
- [ ] a frozen phase draws the same pixels as the core says
**Verification:** same spec file. **Dependencies:** D2. **Files:** the renderer, `components/canvas/canvas.tsx`. **Scope:** S.

### D4 - Property panel: the diagram and its nodes
**Description:** `energy-diagram-properties.tsx`: Mode (Sankey / Flow),
Motion, Full scale (watts, Sankey only, default 1000); the list «Nodes»
- each row its icon, name and role, «+ Add node» (Source, Sink, Storage,
Rest), delete, rows dragged to reorder (in Sankey that is the order top
to bottom, written to y). A row opens the node's fields: Name, Icon, Role,
Reads (watts), Reverse sign, Charge (storage only), Colour (the six roles
and the others), Lines (up to three, the live-text editor texts have).
At most one rest and one bus are enforced.
**Acceptance:**
- [ ] each field changes what the canvas draws (one test per field group)
- [ ] a second rest cannot be added; the bus cannot be deleted
- [ ] switching mode keeps every node and topic
**Verification:** same spec file. **Dependencies:** D2. **Files:** `components/property-panel/energy-diagram-properties.tsx`, `energy-node-fields.tsx`, `property-panel.tsx`. **Scope:** M.

### D5 - Dragging nodes in Flow
**Description:** with the diagram selected in mode Flow, a node's or the
bus's circle is dragged on the canvas; that is its x/y, relative to the
diagram, kept inside it; undo takes it back. In Sankey nothing is dragged
inside the diagram; the diagram itself moves and resizes as any object.
**Acceptance:**
- [ ] a drag moves one node, its line follows, the others stay; undo restores
- [ ] a drag elsewhere in the diagram moves the diagram
**Verification:** same spec file. **Dependencies:** D2. **Files:** `components/canvas/canvas.tsx`. **Scope:** S.

### D6 - A tap on a node runs its action
**Description:** the node's Action field (the button's actions, in
practice «Open popup»); in the preview a tap on a node's circle or bar
runs it. `lib/popup.ts` learns that actions live in nodes too, so a popup
removed leaves no dead node action and «opened by» lists the node.
**Acceptance:**
- [ ] tapping a node with «Open popup» opens it in the preview; without an action nothing happens
- [ ] deleting the popup removes the node's action
**Verification:** same spec file. **Dependencies:** D4. **Files:** `energy-node-fields.tsx`, `components/canvas/canvas.tsx`, `lib/popup.ts`. **Scope:** S.

### D7 - Copy and paste, topic usage
**Description:** a diagram copied to another project brings its icons,
topics - the storage's `chargeTopic` too, which `TOPIC_KEYS` in
`lib/clipboard-transfer.ts` does not know yet - and fonts; «Remove unused
topics» counts every node's topics (`lib/topic-usage.ts` already matches
`*topic`; a test makes sure).
**Acceptance:**
- [ ] paste into an empty project brings the node icons and both of the storage's topics
- [ ] a topic read only by a node is not «unused»
**Verification:** `npx playwright test e2e/clipboard-transfer.spec.ts e2e/energy-diagram.spec.ts`
**Dependencies:** D4. **Files:** `lib/clipboard-transfer.ts`, the two specs. **Scope:** XS.

### D8 - Handbook
**Description:** a page «Energiediagramm» under the objects (what it
shows, Knoten and their roles, the rest, Sankey and Flow, full scale,
motion, a tap), the tool in `objekte.md`, through the humanizer; labels
marked `ui` so `e2e/handbook-labels.spec.ts` checks them. Says that only
the designer draws it until the devices follow.
**Acceptance:** [ ] handbook builds; handbook-labels green
**Verification:** `npx playwright test e2e/handbook-labels.spec.ts`, `npm run build --prefix handbuch`
**Dependencies:** D1-D7. **Files:** `handbuch/designer/energiediagramm.md`, `objekte.md`, the sidebar. **Scope:** S.

### Checkpoint: designer
- [ ] `npm run test:all` green
- [ ] the user builds their van's diagram in the designer and watches it in the preview with the broker's values

## Later modules (tasks once the designer's checkpoint is passed)

- `energy-contract`: export of the object, icons baked per node, contract
  §2.8, generation 1.7, the DDFs' `supportedObjectTypes`, the Deploy
  dialog's need.
- `energy-firmware`: the 4.3B's renderer from the core's port, motion or
  still per the spike, a tap's action, HIL against the designer.
- `energy-android`: the view, motion, a tap's action, the orchestrator.
- `energy-demo`: the demo's page «Energie» from the object; photo on the
  4.3B.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Motion makes the 4.3B's taps slow | High | the spike decides first; still on the 4.3B is an accepted outcome (decision 14) |
| Band edges differ by anti-aliasing between canvas and firmware | Med | bands as polygons from the core; the diff in S4 decides AA on or off |
| A full redraw (782 ms) catches a moving dot mid-way | Med | the motion timer pauses while a full render runs; dots resume at their phase |
| A diagram deployed before `energy-contract` | Med | D1 leaves it out of both exports; the contract adds it with generation 1.7 |
| Values arriving one by one make the rest jump | Low | the rest settles after 500 ms (spec), checked in the demo |
| The target picture promises what no device can draw | Med | it is drawn with the core's rules once L2-L4 exist, and compared |

## Open questions

- Ask Pekaway to publish the time to go (spec, open questions).
