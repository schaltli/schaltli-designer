# The topic that says light or dark (`theme-topic`): tasks

Plan: `tasks/plan.md` · Spec: `docs/2026-09-25-theme-topic.md` · Map:
`docs/2026-09-24-themes.md`

## Carried over
- [ ] Full e2e run and `npm run test:all` (deferred until the faster PC)

## Task 1: The topics in the contract and the MQTT page

**Acceptance criteria:**
- [ ] `docs/device-contract.md` §4: both topics, payloads, retained or not,
      who publishes the state, absent means light, grey/1-bit ignore it.
- [ ] `handbuch/betrieb/mqtt.md` lists them the same way.

**Verification:** `npx playwright test e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`

**Files:** `docs/device-contract.md`, `handbuch/betrieb/mqtt.md` · **Scope:** S

## Task 2: The bridge keeps the theme

**Acceptance criteria:**
- [ ] `light` / `dark` publish that state; `toggle` the other one (none
      yet: `dark`); anything else nothing; a repeat publishes nothing new.
- [ ] Nothing of it reaches `pkw/cmnd`; the built flow sends it through the
      retained `schaltli/state/...` output.
- [ ] `handbuch/betrieb/vanpi-bruecke.md` says what the bridge does with it.

**Verification:** `npx playwright test e2e/vanpi-bridge.spec.ts e2e/handbook-labels.spec.ts`

**Files:** `integrations/vanpi/bridge-logic.js`, `integrations/vanpi/build-flow.js`,
`e2e/vanpi-bridge.spec.ts`, `handbuch/betrieb/vanpi-bruecke.md` · **Scope:** M

## Checkpoint A
- [ ] Targeted specs green
- [ ] `block-topics` committed (else wait, or ask the user)

## Task 3: The Theme block

**Acceptance criteria:**
- [ ] Placing it gives a label and a knob switch reading
      `schaltli/state/theme`, writing `light`/`dark` to `schaltli/cmnd/theme`;
      `Dunkel` is the on state with the moon.
- [ ] Both topics declared with examples; the moon icon in the assets
      once, however often the block is placed.
- [ ] Handbook: the block on `designer/bausteine.md`; `designer/themes.md`
      says how an installation switches and warns (issue + `handbuch-macke`)
      that devices do not follow yet.

**Verification:** `npx playwright test e2e/bausteine.spec.ts e2e/handbook-labels.spec.ts`

**Files:** `lib/bausteine.ts`, an icon SVG, `e2e/bausteine.spec.ts`,
`handbuch/designer/bausteine.md`, `handbuch/designer/themes.md` · **Scope:** M

## Task 4: Review and done
- [ ] Code review; findings fixed
- [ ] Targeted specs green; commit; push
