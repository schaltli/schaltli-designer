# The dark variant in the export (`theme-export`): tasks

Plan: `tasks/plan.md` · Spec: `docs/2026-09-25-themes-export.md` · Map:
`docs/2026-09-24-themes.md`

## Carried over from `theme-model`
- [ ] `npm run test:all` with the HIL suites, where hardware is reachable
- [x] Push `main` (theme-model's commits; rebased onto the explicit-save
      merge and pushed 2026-09-25)

## Task 1: Dark colours in the JSON

**Description:** `darkColours(objects, theme, depth)` in `lib/themes.ts`:
for every colour key an object draws with (set to a role, or unset and
given its default role), the dark hex as `<key>Dark`. Both exporters add
them to each object's `properties` and `backgroundColorDark` to each
screen - 24-bit only. `SYSTEM_GENERATION` becomes 1.1; the frozen corpus
gains a 1.1 case.

**Acceptance criteria:**
- [x] A themed 24-bit project exports `<key>Dark` for every role-valued
      colour (masters' objects in each screen's theme) and
      `backgroundColorDark`; the export with every `…Dark` key stripped is
      identical to the light-only export.
- [x] A 4-bit and a 1-bit project export no `…Dark` key.
- [x] Firmware and Android carry the same keys; the export says 1.1;
      `system-generation.spec.ts` passes with the new corpus case.

**Verification:**
- [x] `npx playwright test e2e/themes-export.spec.ts e2e/system-generation.spec.ts`
- [x] `npm run typecheck`

**Dependencies:** none

**Files likely touched:** `lib/themes.ts`, `lib/project-zip.ts`,
`lib/android-export.ts`, `lib/system-generation.ts`,
`test-projects/generations/build-corpus.js` (+ new `project-1.1.zip`),
`e2e/themes-export.spec.ts`

**Estimated scope:** M

## Task 2: Dark bitmaps for the firmware

**Description:** `AssetExporter` runs its bakes a second time for 24-bit
exports with the dark-resolved objects and background and the filename
suffix `-dark`; every bake kind (flattened background, icon usages,
live-icon rules, level icons, switch state icons, buttons). A dark file
identical to its light one is not written. `project-zip.ts` writes
`pathDark`, `pathNormalDark`, `pathActiveDark` beside the light paths.
The size of the largest colour fixtures' exports, light and with dark, is
measured and noted.

**Acceptance criteria:**
- [x] Every light path of a themed 24-bit export has its `…Dark` path, and
      the file exists.
- [x] Dark files of each kind carry the dark background and the dark tint
      (pixel probes); a master object on two screens in two themes has two
      dark files.
- [x] An icon that keeps its own colours on a background that does not
      change gets no second file; both fields name the same one.
- [x] Sizes measured and written into the spec's open question 1. (Dark
      flattened backgrounds overran LittleFS; with the user, the flattened
      background is no longer exported at all - a24d4bc.)

**Verification:**
- [x] `npx playwright test e2e/themes-export.spec.ts e2e/master-icon-background.spec.ts e2e/software-button-render.spec.ts e2e/nested-container-export.spec.ts`

**Dependencies:** Task 1

**Files likely touched:** `lib/asset-export.ts`, `lib/project-zip.ts`,
`e2e/themes-export.spec.ts`

**Estimated scope:** M

## Task 3: Dark bitmaps for the app

**Description:** The same for `lib/android-export.ts`: its bakes (screen
background PNG, icons, switch icons, level icons, buttons) a second time in
dark, `…Dark` paths beside the light ones, identical files once.

**Acceptance criteria:**
- [x] Every light path in the Android bundle of a themed project has its
      `…Dark` path and file; pixels carry the dark background and ink.
      (`backgroundImageDark`, `pathDark`, `activePathDark`, `pressedPathDark`
      - the app's own field names, same rule.)
- [x] `android-export.spec.ts` passes unchanged.

**Verification:**
- [x] `npx playwright test e2e/themes-export.spec.ts e2e/android-export.spec.ts`

**Dependencies:** Task 1

**Files likely touched:** `lib/android-export.ts`, `e2e/themes-export.spec.ts`

**Estimated scope:** M

## Checkpoint A
- [ ] Full e2e green but for the known failures, listed by name
- [x] Export sizes shown to the user; decision if anything is tight
      (2026-09-25: dark flattened backgrounds overran LittleFS; the flattened
      background is no longer exported to devices, a24d4bc)

## Task 4: The reference render draws dark

**Description:** `app/test-render`'s render request takes `variant:
"dark"`: every `XDark` replaces its `X` (colours, screen background, files)
before drawing. A test renders an exported themed project in dark and
compares it with the designer's canvas with `Dark` on.

**Acceptance criteria:**
- [ ] `variant: "dark"` on an exported project draws the dark colours and
      files; without it nothing changes (existing HIL reference tests pass).
- [ ] The dark reference render and the designer's Dark canvas agree
      pixel for pixel on a screen with text, box, bar, dial, switch and
      button.

**Verification:**
- [ ] `npx playwright test e2e/themes-export.spec.ts e2e/hil-reference-assets.spec.ts e2e/empty-values.spec.ts`

**Dependencies:** Tasks 2, 3

**Files likely touched:** `app/test-render/page.tsx`, `e2e/themes-export.spec.ts`

**Estimated scope:** S

## Task 5: The contract, a review, and done

**Description:** `docs/device-contract.md` gets the `X` → `XDark` rule, the
field list, what a device that knows them does (and that it switches on
`schaltli/state/theme`, which `theme-topic` defines), what one that does
not know them does, the 24-bit-only rule and the quantiser note, and the
measured sizes. Code review by the agent; findings fixed.

**Acceptance criteria:**
- [ ] The contract section exists and matches the export.
- [ ] Review findings fixed or answered.
- [ ] Full e2e green but for known failures.

**Verification:**
- [ ] Full suite; review report

**Dependencies:** Task 4

**Files likely touched:** `docs/device-contract.md`, whatever review finds

**Estimated scope:** S
