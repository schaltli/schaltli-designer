# Implementation plan: blocks described by the bridge (`bridge-blocks`)

Spec: `docs/2026-10-04-bridge-blocks.md` (approved 2026-10-04). Tasks:
`tasks/bridge-blocks-todo.md`. Chat German, docs English.

## Overview

The bridge publishes, beside its Home Assistant configs, a small Schaltli
description per device on `schaltli/blocks/<id>/config`. The designer reads
it into a catalog entry, hides the Home Assistant entries it covers, and
places it as a block whose conditional parts sit in a switcher with one
panel per value. First the MaxxFan, then the heater with its view topic.

## Architecture decisions

- **`lib/block-description.ts` is pure and maps onto `CatalogEntry`**, as
  `lib/ha-discovery.ts` does for Home Assistant. The two internal additions:
  `CatalogControl.shownWhen?: { topic, values }` and `CatalogEntry.uniqueId?`.
  Labels: a choice gains `labels?: string[]` beside `options`, a switch's
  `on`/`off` gain `label?` - both default to today's words.
- **The catalog reads both prefixes in one retained burst**
  (`hooks/use-block-catalog.ts` `collectRetained` takes a list of filters
  already). `readCatalog` gets the description messages and drops covered
  entries; nothing in the UI knows where an entry came from.
- **The switcher is built in `buildEntry`**: parts with the same
  `shownWhen.topic` become one switcher row; each panel holds its parts as
  rows (a one-column table, like the control cell of a multi-part block). A
  panel's objects are relative to the switcher, as the contract says.
- **The bridge adds descriptions to `things()`'s output**, so the existing
  announce/clear diff publishes and clears them. The heater's view is
  `put("heater/view", …)` wherever mode or preset is put.
- **Order: risk first.** The switcher inside a block's table is the one
  thing nothing builds today (layout of a table inside a panel inside a
  switcher inside a table cell); it comes right after the format, before
  the menu, so a layout surprise shows up before the UI is wired.

## Task list

### Phase 1: Designer

- [ ] Task 1: The format: read a description into a catalog entry
- [ ] Task 2: A conditional part becomes a switcher in the placed block
- [ ] Task 3: The Block menu lists descriptions and hides what they cover

### Checkpoint: Designer
- [ ] Specs pass, `npx tsc --noEmit -p .` clean, no van words
- [ ] The user places the MaxxFan from `hil/discovery-devices.js` and switches its mode in the preview

### Phase 2: Bridge

- [ ] Task 4: The bridge describes the MaxxFan
- [ ] Task 5: The heater's view topic and description

### Checkpoint: Bridge
- [ ] `e2e/vanpi-bridge.spec.ts` passes; the bridge's descriptions are fully supported
- [ ] The user deploys the bridge to the van; the menu lists MaxxFan and heater blocks

### Phase 3: Handbook

- [ ] Task 6: Handbook: blocks from descriptions, the bridge's new topics

### Checkpoint: Complete
- [ ] `npm run test:all` green (hardware suites skipped only with their warning)
- [ ] Every success criterion of the spec checked

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The table layout does not lay out a table inside a panel inside a switcher inside a cell | High | Task 2 first after the format; if it fails, a panel stacks its parts without a table (absolute rows) |
| The switcher's height: panels with different part counts | Med | As tall as its fullest panel (spec); shorter panels leave space below |
| `covers` hides an entry the user wants on its own (the timer) | Low | Only what the description lists; the heater's timer is not covered |
| Bridge on the van is deployed by the user only | Med | Checkpoint asks; e2e covers the bridge's output before |

## Open questions

None.
