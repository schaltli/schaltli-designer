# Blocks on a calm grid

Agreed with the user on 2026-10-04, after the MaxxFan block ran in the van
(docs/2026-10-04-bridge-blocks.md). Looked at on the 4.3B.

## Problem

How might the parts of a block stand on one grid, so it reads calm and
flush on the 4.3B?

The MaxxFan block worked but looked ragged: the name sat in the middle of
the block's height, and every part had its own right edge - a slider takes
the whole cell (`fills()`, lib/layout.ts), a button group only what its
words need (decided 2026-10-02), so «Aus | Hand | Auto», «Zu | Offen» and
«Rein | Raus» ended at three different places.

## Direction

**Designer, for every block** (not only described ones - the grid is the
designer's business, not the publisher's):

- **The name stands at the top**, level with the first part, not centred on
  the block's height. Tables gain a vertical alignment - on the column,
  with a cell's own overriding it, as `align` already works: `alignY` is
  `top`, `centre` (the default, as today) or `bottom`. In the property panel
  beside «Align». Designer-only: an export dissolves tables into placed
  objects, so no device changes.
- **The parts share one width**: the parts table's one column is `auto`
  (as wide as its widest part) and `stretch` (every part across it), the
  tables in a switcher's panels as well. Free-standing objects keep «only as
  wide as it needs».
- **The gap stays**: a switcher keeps its tallest panel's height when a mode
  shows nothing, so nothing below it jumps.

**Bridge, the MaxxFan**: Betrieb, Deckel, then the switcher with the slider
and the airflow; the airflow shown only by hand and in auto (`shown_when`
fan_only, auto). Since every part conditional on the same topic goes into
one switcher, the airflow sits in it below the slider, and the gap when off
comes last in the block.

## MVP

- `lib/table.ts`: `alignY` on column and cell, used where a cell's object is
  placed; the table panel offers it.
- `lib/bausteine.ts` `blockTable`/`switcherSlot`: name column `alignY: top`;
  parts and panel tables one column `auto`/`stretch`.
- `integrations/vanpi/bridge-logic.js`: the MaxxFan's order and the
  airflow's `shown_when`.
- Tests: `e2e/bausteine.spec.ts` (right edges equal, name at the top),
  `e2e/table-model.spec.ts` (`alignY`), `e2e/vanpi-bridge.spec.ts`.
- Handbook: `objekte/anordnen.md` (vertical alignment),
  `designer/bausteine.md`, `betrieb/vanpi-bruecke.md` (the MaxxFan's parts).

## Not doing

- A fixed slot with unit for a slider's value - declined by the user.
- Closing the gap when a mode shows nothing - every device would have to
  re-lay out a table at run time; the exported positions are fixed.
- Two columns of parts on wide screens - more rules, later.
- Look hints in a description - the designer decides the screen.
