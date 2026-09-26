# The topic that says light or dark (`theme-topic`): tasks

Plan: `tasks/plan.md` · Spec: `docs/2026-09-25-theme-topic.md` · Map:
`docs/2026-09-24-themes.md`

## Carried over
- [ ] Full e2e run and `npm run test:all` (deferred until the faster PC)

## Task 1: The topics in the contract and the MQTT page

**Acceptance criteria:**
- [x] `docs/device-contract.md` §4: both topics, payloads, retained or not,
      who publishes the state, absent means light, grey/1-bit ignore it.
- [x] `handbuch/betrieb/mqtt.md` lists them the same way.

**Verification:** `npx playwright test e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`

**Files:** `docs/device-contract.md`, `handbuch/betrieb/mqtt.md` · **Scope:** S

## Task 2: The bridge keeps the theme

**Acceptance criteria:**
- [x] `light` / `dark` publish that state; `toggle` the other one (none
      yet: `dark`); anything else nothing; a repeat publishes nothing new.
- [x] Nothing of it reaches `pkw/cmnd`; the built flow sends it through the
      retained `schaltli/state/...` output. Added on the way: the bridge
      also subscribes to `schaltli/state/theme`, so after a Node-RED restart
      a toggle starts from what the broker holds, not from light.
- [x] `handbuch/betrieb/vanpi-bruecke.md` says what the bridge does with it.

**Verification:** `npx playwright test e2e/vanpi-bridge.spec.ts e2e/handbook-labels.spec.ts`

**Files:** `integrations/vanpi/bridge-logic.js`, `integrations/vanpi/build-flow.js`,
`e2e/vanpi-bridge.spec.ts`, `handbuch/betrieb/vanpi-bruecke.md` · **Scope:** M

## Checkpoint A
- [x] Targeted specs green
- [x] `block-topics` committed (517213f, 0c2b2bb)

## Task 3: The Theme block

**Acceptance criteria:**
- [x] Placing it gives a label and a knob switch reading
      `schaltli/state/theme`, writing `light`/`dark` to `schaltli/cmnd/theme`;
      `Dunkel` is the on state with the moon.
- [x] Both topics declared with examples; the moon icon in the assets
      once, however often the block is placed.
- [x] Handbook: the block on `designer/bausteine.md`; `designer/themes.md`
      says how an installation switches and warns (issue + `handbuch-macke`)
      that devices do not follow yet.

**Verification:** `npx playwright test e2e/bausteine.spec.ts e2e/handbook-labels.spec.ts`

**Files:** `lib/bausteine.ts`, an icon SVG, `e2e/bausteine.spec.ts`,
`handbuch/designer/bausteine.md`, `handbuch/designer/themes.md` · **Scope:** M

## Task 4: Review and done
- [ ] Code review; findings fixed
- [x] Commit; push (2026-09-26)
- [ ] **Tomorrow, on the new PC** (the old one is at its limit, user
      2026-09-26): `e2e/bausteine.spec.ts` whole (the four Theme block tests
      passed), `e2e/handbook-labels.spec.ts`, `e2e/handbook.spec.ts`; then
      regenerate the handbook screenshots (the block menu now has Theme;
      `baustein-menue`'s alt text still names four blocks); then the full
      suite carried over above.
- Note: two `next dev` servers in one checkout share `.next` and hang each
  other (2026-09-26); test against the one on port 3000, never start a
  second one here.
