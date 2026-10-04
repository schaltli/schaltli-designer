# Tasks: blocks described by the bridge (`bridge-blocks`)

Plan: `tasks/bridge-blocks-plan.md` · Spec: `docs/2026-10-04-bridge-blocks.md`.
Chat German, docs English.

## Task 1: The format: read a description into a catalog entry

**Description:** `lib/block-description.ts` reads `schaltli/blocks/<id>/config`
payloads into `CatalogEntry`s (or unsupported, with a reason). Internal types
gain `shownWhen`, `uniqueId`, choice `labels`, switch state `label`.
`lib/ha-discovery.ts` fills `uniqueId` from `unique_id`.

**Acceptance criteria:**
- [x] The spec's MaxxFan description becomes an entry with five controls,
      labels and two `shownWhen`s; plain and `{value,label}` options both read.
- [x] An unknown major is unsupported with its reason; an unknown key is
      ignored; a part without a topic is skipped; an empty payload removes it.
- [x] A Home Assistant entry carries its `unique_id`.

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
- [x] The MaxxFan entry builds: Mode row, one switcher on `hvac_mode` with
      panels `auto` (temperature) and `fan_only` (speed), no `off` panel,
      Cover and Airflow rows; buttons say «Aus/Hand/Auto».
- [x] Placed on a screen, the block lays out inside its table without
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
- [x] With the local broker, the menu lists the description under its device
      and not the entries it covers; other entries unchanged.
- [x] Picking it opens the options step with its parts; Insert places the
      block of Task 2.

**Verification:** extend `e2e/bausteine.spec.ts` (menu from the broker);
`e2e/no-van-words.spec.ts`.

**Dependencies:** Tasks 1, 2 · **Scope:** M

**Files likely touched:** `hooks/use-block-catalog.ts`, `lib/ha-discovery.ts`
(readCatalog), `hil/discovery-devices.js`, `e2e/fixtures/ha-discovery/`,
`e2e/bausteine.spec.ts`

## Checkpoint: Designer
- [x] Specs pass, typecheck clean, no van words
- [x] The user places the MaxxFan-like block and switches its mode in the preview
      (2026-10-04: sliders in a panel could not be dragged in the preview - fixed, 687f757)

## Task 4: The bridge describes the MaxxFan

**Description:** `things("maxxfan")` adds `schaltli/blocks/maxxfan/config`
(the spec's description, covering the climate, cover and airflow entities);
announced and cleared with the rest.

**Acceptance criteria:**
- [x] The bridge publishes the description retained, re-read through
      `lib/block-description.ts` fully supported, covering exactly the three.
- [x] Announced with the rest, again only when it changes; cleared by the same
      announce diff as the Home Assistant configs (the MaxxFan is never
      reported gone, so neither is).

**Verification:** extend `e2e/vanpi-bridge.spec.ts`.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `integrations/vanpi/bridge-logic.js`, `e2e/vanpi-bridge.spec.ts`

## Task 5: The heater's view topic and description

**Description:** `schaltli/state/heater/view` (`off`/`target`/`power`/`fan`)
put wherever mode or preset is; `schaltli/blocks/heater/config` with Mode,
Preset, Target, Power, Fan and the current temperature (Mode and Target only
without an Autoterm), covering the climate and the two level numbers.

**Acceptance criteria:**
- [x] The view for every mode × preset is as the spec's table.
- [x] Both description shapes are fully supported; the timer is not covered.

**Verification:** extend `e2e/vanpi-bridge.spec.ts`.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `integrations/vanpi/bridge-logic.js`, `e2e/vanpi-bridge.spec.ts`

## Checkpoint: Bridge
- [x] `e2e/vanpi-bridge.spec.ts` passes
- [x] The user deploys the bridge; on the van the menu lists the MaxxFan and the heater blocks
      (2026-10-04, pre-release fw-2026.10.04.1-pre.bridge_blocks: MaxxFan Aus/Auto/Hand work;
      «Hand» needed the vanpi-custom BLE flow's fan_only fix, b343429, played into the van)

## Task 6: Handbook

**Description:** `handbuch/designer/bausteine.md`: blocks from descriptions,
a block whose parts come and go with a mode. `handbuch/betrieb/vanpi-bruecke.md`:
`schaltli/blocks/*`, `heater/view`. Through `maettel-humanizer`.

**Acceptance criteria:**
- [x] Both pages say it; `e2e/handbook-labels.spec.ts` passes.

**Verification:** `npx playwright test e2e/handbook-labels.spec.ts`

**Dependencies:** Tasks 3, 5 · **Scope:** XS

## Checkpoint: Complete
- [ ] `npm run test:all` green (hardware suites skipped only with their warning)
- [ ] The spec's success criteria checked
