# Implementation plan: the topic that says light or dark (`theme-topic`)

Spec: `docs/2026-09-25-theme-topic.md` (approved 2026-09-25, both open
points decided). Map: `docs/2026-09-24-themes.md`. Tasks: `tasks/todo.md`.
The previous plan (`theme-export`) is in git history (last at cbe6550).

## Overview

`schaltli/state/theme` (retained, `light` | `dark`) and
`schaltli/cmnd/theme` (not retained, `light` | `dark` | `toggle`) go into
the contract; the VanPi bridge turns the command into the state; a Theme
block puts a knob switch for it on a screen; the handbook says all of it,
and that devices do not follow it until `device-switch`.

## Architecture decisions

- **The bridge answers a theme command with a state, not a Pekaway
  command.** `command()` in `integrations/vanpi/bridge-logic.js` returns
  `{ state: [{ topic, value }] }` for it instead of `{ publish, refresh }`;
  `build-flow.js` sends those through the node that already publishes
  `schaltli/state/...` retained, and records them in the flow's last-state
  memory, so "only when changed" and `toggle` work as for every value.
- **The block is built last,** after the `block-topics` session has
  committed its work in `lib/bausteine.ts` (user, 2026-09-25). It needs a
  non-keyed block whose value topic is its group
  (`schaltli/state/theme`, no leaf), and a block that brings an icon asset.
- **Handbook in the same task as the behaviour it describes.**

## Order

```
Task 1  contract §4 + MQTT handbook page
Task 2  bridge: cmnd/theme -> retained state/theme, flow routing, tests,
        VanPi bridge handbook page
   ── Checkpoint A: targeted specs green; block-topics committed? ──
Task 3  Theme block (+ generalised topic, icon asset), tests,
        blocks and themes handbook pages with the device-switch warning
Task 4  review, targeted specs, commit, push
```

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Colliding with the `block-topics` session in `lib/bausteine.ts` | High | Block last, after they commit; stage only own files |
| The bridge's state memory and the flow's disagree | Medium | The test drives the built flow's routing, not only `command()` |
| A block that does nothing on devices confuses users | Low | Handbook warning with its `handbuch-macke` issue, removed in `device-switch` |

## Carried over from `theme-export`

- Full e2e run and `npm run test:all` - deferred by the user until the
  faster PC is there.
