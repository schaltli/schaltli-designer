# Tasks: blocks described by the bridge (`bridge-blocks`)

Plan: `tasks/bridge-blocks-plan.md` · Spec: `docs/2026-10-04-bridge-blocks.md`.
Chat German, docs English.

## Task 1: The format: read a description into a catalog entry

**Description:** `lib/block-description.ts` reads `schaltli/blocks/<id>/config`
payloads into `CatalogEntry`s (or unsupported, with a reason). Internal types
gain `shownWhen`, `uniqueId`, choice `labels`, switch state `label`.
`lib/ha-discovery.ts` fills `uniqueId` from `unique_id`.

**Acceptance criteria:**
- [ ] The spec's MaxxFan description becomes an entry with five controls,
      labels and two `shownWhen`s; plain and `{value,label}` options both read.
- [ ] An unknown major is unsupported with its reason; an unknown key is
      ignored; a part without a topic is skipped; an empty payload removes it.
- [ ] A Home Assistant entry carries its `unique_id`.

**Verification:** new `e2e/block-description.spec.ts`; `e2e/ha-discovery.spec.ts`
still passes; `npx tsc --noEmit -p .`

**Dependencies:** none · **Scope:** M

**Files likely touched:** `lib/block-description.ts`, `lib/ha-discovery.ts`,
`e2e/block-description.spec.ts`

## Task 2: A conditional part becomes a switcher in the placed block

**Description:** `buildEntry` puts the parts with the same `shownWhen.topic`
into one switcher row with a panel per value (`==`), each panel its parts as
rows; labels become the button and switch words. Topics declared.

**Acceptance criteria:**
- [ ] The MaxxFan entry builds: Mode row, one switcher on `hvac_mode` with
      panels `auto` (temperature) and `fan_only` (speed), no `off` panel,
      Cover and Airflow rows; buttons say «Aus/Hand/Auto».
- [ ] Placed on a screen, the block lays out inside its table without
      overlap on every size step; in the preview, changing the mode topic
      shows the other slider, `off` none.

**Verification:** extend `e2e/bausteine.spec.ts` (build + layout + preview);
`e2e/layout*.spec.ts` still pass.

**Dependencies:** Task 1 · **Scope:** M

**Files likely touched:** `lib/bausteine.ts`, `e2e/bausteine.spec.ts`

## Task 3: The Block menu lists descriptions and hides what they cover

**Description:** `hooks/use-block-catalog.ts` reads `schaltli/blocks/+/config`
in the same burst; `readCatalog` merges descriptions and drops entries whose
`uniqueId` a description covers. `hil/discovery-devices.js` publishes a
description (a fan from another publisher, in the fixtures).

**Acceptance criteria:**
- [ ] With the local broker, the menu lists the description under its device
      and not the entries it covers; other entries unchanged.
- [ ] Picking it opens the options step with its parts; Insert places the
      block of Task 2.

**Verification:** extend `e2e/bausteine.spec.ts` (menu from the broker);
`e2e/no-van-words.spec.ts`.

**Dependencies:** Tasks 1, 2 · **Scope:** M

**Files likely touched:** `hooks/use-block-catalog.ts`, `lib/ha-discovery.ts`
(readCatalog), `hil/discovery-devices.js`, `e2e/fixtures/ha-discovery/`,
`e2e/bausteine.spec.ts`

## Checkpoint: Designer
- [ ] Specs pass, typecheck clean, no van words
- [ ] The user places the MaxxFan-like block and switches its mode in the preview

## Task 4: The bridge describes the MaxxFan

**Description:** `things("maxxfan")` adds `schaltli/blocks/maxxfan/config`
(the spec's description, covering the climate, cover and airflow entities);
announced and cleared with the rest.

**Acceptance criteria:**
- [ ] The bridge publishes the description retained, re-read through
      `lib/block-description.ts` fully supported, covering exactly the three.
- [ ] It is cleared when the MaxxFan disappears.

**Verification:** extend `e2e/vanpi-bridge.spec.ts`.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `integrations/vanpi/bridge-logic.js`, `e2e/vanpi-bridge.spec.ts`

## Task 5: The heater's view topic and description

**Description:** `schaltli/state/heater/view` (`off`/`target`/`power`/`fan`)
put wherever mode or preset is; `schaltli/blocks/heater/config` with Mode,
Preset, Target, Power, Fan and the current temperature (Mode and Target only
without an Autoterm), covering the climate and the two level numbers.

**Acceptance criteria:**
- [ ] The view for every mode × preset is as the spec's table.
- [ ] Both description shapes are fully supported; the timer is not covered.

**Verification:** extend `e2e/vanpi-bridge.spec.ts`.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `integrations/vanpi/bridge-logic.js`, `e2e/vanpi-bridge.spec.ts`

## Checkpoint: Bridge
- [ ] `e2e/vanpi-bridge.spec.ts` passes
- [ ] The user deploys the bridge; on the van the menu lists the MaxxFan and the heater blocks

## Task 6: Handbook

**Description:** `handbuch/designer/bausteine.md`: blocks from descriptions,
a block whose parts come and go with a mode. `handbuch/betrieb/vanpi-bruecke.md`:
`schaltli/blocks/*`, `heater/view`. Through `maettel-humanizer`.

**Acceptance criteria:**
- [ ] Both pages say it; `e2e/handbook-labels.spec.ts` passes.

**Verification:** `npx playwright test e2e/handbook-labels.spec.ts`

**Dependencies:** Tasks 3, 5 · **Scope:** XS

## Checkpoint: Complete
- [ ] `npm run test:all` green (hardware suites skipped only with their warning)
- [ ] The spec's success criteria checked
