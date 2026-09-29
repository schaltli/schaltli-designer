# Implementation plan: block-options

Spec: `docs/2026-09-29-block-options.md` (draft 2026-09-29).
Task checklist: `tasks/block-options-todo.md`.

Kept in files of its own because `tasks/plan.md` and `tasks/todo.md` hold
another session's plan.

## Overview

Blocks get a label that follows the van (a placeholder text), options in
the Insert dialog (look, label position, texts, an icon found by name), and
two new blocks, Heater and MaxxFan, made of parts the user ticks. The bridge
learns what those two need. Once placed, a block is still a plain group.

## What the code looks like today

- `lib/bausteine.ts` (716 lines): `BausteinDef.build(input)` gets
  `{ instance, rect, palette, font }` and returns `objects`, `topics`,
  optional assets. Labels are literal text. Every def has one fixed layout
  (`stacked()` for bars, label left for switches).
- `components/baustein-dialog.tsx`: one step. Clicking an instance calls
  `onConfirm(instance)` at once; there is no place for options.
- `components/project-editor.tsx` `finishBaustein` (line 1668) turns the
  result into a group and adds missing topics.
- `lib/icon-search.ts`: `searchIcons(query)` and `fetchIconSvgData(icon)`,
  already used for the New Screen dialog's automatic suggestion.
- `integrations/vanpi/bridge-logic.js`: heater state power/target/status/
  temp/error and commands on/off/toggle/target; MaxxFan state from
  Pekaway's shape only (`:108-121`), no MaxxFan command at all.
- The old MaxxFan topics (`maxxfan/power|vent|auto|direction|temp`) are used
  only by `e2e/vanpi-bridge.spec.ts` and `handbuch/betrieb/vanpi-bruecke.md`.

## Architecture decisions

1. **The dialog gets a second step.** Picking an instance shows the options
   and an **Insert** button; `onConfirm(instance, options)`. `options` is one
   typed object per block (`look`, `labelPosition`, `label`, `texts`,
   `icon`, `parts`), and `build()` receives it as `input.options`. Defaults
   reproduce today's result, so existing tests keep passing unchanged.
2. **Layout is one function, not one per block.** Label (with optional
   icon) above or left, then one or more controls stacked below it. Tank's
   `stacked()` and Switch's side-by-side become two cases of it; Heater and
   MaxxFan use the same function with several controls.
3. **Parts are data.** A block with parts lists them (`id`, label, which
   object, which topics, `onlyIfReported?`); the dialog shows a checkbox per
   part; `build()` places the ticked ones in list order. Heater and MaxxFan
   are the only blocks with parts for now.
4. **The icon is looked up in the dialog, not in `build()`.** `build()`
   stays synchronous and testable; the dialog resolves the SVG and passes it
   as an asset in `options.icon`.
5. **The bridge's MaxxFan latch is state in the bridge's context**, like its
   retained values: `sawB` set when a B-shaped message arrives, never
   cleared until restart.
6. **The heater countdown when the van does not report it** is kept by the
   bridge from the last forwarded timer command (end time in the context),
   recomputed on every poll, published as whole minutes rounded up.

## Task list

See `tasks/block-options-todo.md`.

1. Label as a placeholder text
2. Dialog second step with the label field
3. Looks and label position
4. Texts: on/off words and step
5. Icon suggested by name
   - Checkpoint A (designer, no van)
6. Spike: does a slider on the devices follow its state while untouched?
7. Bridge: heater name, timer and power level
8. Bridge: MaxxFan both shapes, commands for A, handbook warning
9. vanpi-custom: the BLE flow listens on `schaltli/cmnd/maxxfan/#`
   - Checkpoint B (on the van, the user deploys)
10. Blocks with parts; the Heater block
11. The MaxxFan block
12. Handbook screenshots and a humanizer pass
   - Checkpoint C (complete)

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Devices do not redraw an untouched slider from its topic, so the countdown does not show | High for the timer | Task 6 checks firmware and Android first; if not, the timer part needs device work and is split off before Task 10 |
| A second timer command is ignored by Pekaway 2.0.10 | Med | Checkpoint B tests it on the van; fallback in the bridge: `off`, then the new timer |
| Replacing the old MaxxFan topics breaks a project using them | Low | Only the bridge spec and the handbook use them; the handbook page changes in Task 8 |
| Iconify unreachable or rate limited in the dialog | Low | The suggestion is optional; the block is placed without an icon, the dialog says why; tests mock Iconify |
| `vanpi-custom` is another repo, deployed by the user | Med | Task 9 only with the user's go-ahead; Checkpoint B before the MaxxFan block |
| `lib/bausteine.ts` grows past a reasonable size | Low | Move the new blocks and the layout function into `lib/bausteine/` files if it passes ~1000 lines |

## Open questions

Only what the van answers at Checkpoint B (spec, "Open questions").
