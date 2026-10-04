# Tasks: the rotary ring adjusts a slider or dial (`ring-adjust`)

Plan: `tasks/ring-adjust-plan.md` · Idea: `docs/2026-10-04-ring-adjust.md`.
Chat German, docs English.

## Task 1: Set the action, export it

**Description:** `HardwareButtonAction` gains `"adjust-level"` with
`targetObjectId` and `direction`. The hardware button side panel offers
«Adjust a slider or dial» with a picker of the screen's (on a master: the
master's) sliders, dials and switchers, and a direction preset from the
button's name. `describeHardwareButtonAction` names it. The export writes it
and drops one whose target is gone or of another type. `device-contract.md`
§5 gets the type.

**Acceptance criteria:**
- [x] On a Knob project, «Rotate Right» set to «Adjust a slider or dial» on a
      slider exports `{type:"adjust-level", targetObjectId, direction:"up"}`;
      «Rotate Left» presets «down».
- [x] The picker lists only sliders, dials and switchers of this screen (or
      the master's own); with none, the option says why it cannot be used.
- [x] Deleting the target shows «target missing» in the side panel, and the
      export leaves the action out.

**Verification:** new `e2e/hardware-button-adjust-level.spec.ts`; existing
`e2e/hardware-button-*.spec.ts` still pass; `npm run build`.

**Dependencies:** none · **Scope:** M

**Files likely touched:** `components/project-editor.tsx`,
`components/hardware-button-side-panel.tsx`,
`lib/hardware-button-actions.ts`, `lib/project-zip.ts`,
`docs/device-contract.md`

## Task 2: The preview turns the ring

**Description:** In preview mode, clicking a hardware button bound to
«Adjust a slider or dial» does what the device will: one step from the
asked-or-reported value, clamped to the calibration range, published to the
write topic and held as the asked value; a switcher target moves the slider
or dial in its visible panel.

**Acceptance criteria:**
- [x] Five clicks on «Rotate Right» on a slider 10-100 step 10 at 50 publish
      60, 70, 80, 90, 100; a sixth publishes nothing.
- [x] Clicks count from the asked value, even while no report has come back.
- [x] Bound to a switcher, the click moves the slider of the visible panel;
      after the switcher's topic changes, the other panel's; with no
      slider visible, nothing is published.

**Verification:** extend `e2e/hardware-button-adjust-level.spec.ts`;
`e2e/preview-mode.spec.ts` still passes.

**Dependencies:** Task 1 · **Scope:** S

**Files likely touched:** `components/project-editor.tsx` (preview
dispatch), a small helper next to `lib/settable-level.ts`

## Checkpoint: Designer
- [ ] Specs pass, `npm run build` clean
- [ ] The user sets the action on a Knob project and turns it in the preview

## Task 3: A detent moves a slider or dial (Knob)

**Description:** `schaltli-firmware`: `ButtonAction` parses `targetObjectId`
and `direction`; `dispatchButtonAction` handles `adjust-level` for a slider
or dial target: next value from the asked-or-reported one, clamp, asked
value, redraw, publish at once, arm the await. Ignored while a finger holds
a level.

**Acceptance criteria:**
- [x] HIL: detents injected through `POST /api/input` publish the absolute
      next values on the slider's write topic, and the screen shows them.
- [x] HIL: five quick detents while the broker echoes each value 1 s late
      publish five increasing values; the handle never jumps back.
- [x] At the end of the range a detent publishes nothing.

**Verification:** `hil/waveshare/fixtures/build-smoke-test.js` gains a
slider bound to both ring buttons; `hil/waveshare/orchestrator.js` gains
the scenarios; `node hil/waveshare/orchestrator.js --device 192.168.1.114`
with `npm run hil:broker` running.

**Dependencies:** Task 1 · **Scope:** M

**Files likely touched:** `schaltli-firmware/src/project/ProjectTypes.h`,
`src/project/ProjectLoader.cpp`, `src/main.cpp`;
`hil/waveshare/fixtures/build-smoke-test.js`, `hil/waveshare/orchestrator.js`

## Task 4: A detent moves the visible panel's slider (Knob)

**Description:** The renderer gains a public helper for the settable level a
switcher shows now; `adjust-level` on a switcher target uses it.

**Acceptance criteria:**
- [x] HIL: with the switcher's topic on panel A, a detent moves A's slider;
      after the topic changes to B, B's.
- [x] HIL: on a panel without a slider, a detent publishes nothing.

**Verification:** HIL fixture gains a switcher with two panels (one slider
each) and an empty third; orchestrator scenarios as above.

**Dependencies:** Task 3 · **Scope:** S

**Files likely touched:** `schaltli-firmware/src/project/ColorScreenRenderer.h/.cpp`,
`src/main.cpp`; the two HIL files

## Checkpoint: Knob

Tasks 3 and 4 landed together (schaltli-firmware d913aa9): the switcher case
needed only the renderer helper. HIL 2026-10-04 on the Knob: all six
screen-6 checks and 16/16 visual cases pass.

- [x] `hil/waveshare` passes on the Knob
- [ ] The user spins the real ring fast; no lost or doubled steps

## Task 5: Handbook page of the Knob

**Description:** `handbuch/geraete/knob.md`, section «Der Drehring»: the new
action, what one detent does, the switcher case, the end stop. UI labels
marked `<span class="ui">`; draft through `maettel-humanizer`.

**Acceptance criteria:**
- [ ] The page names «Adjust a slider or dial» and explains it with the
      MaxxFan-like example (temperature in auto, speed by hand).
- [ ] `e2e/handbook-labels.spec.ts` passes.

**Verification:** `npx playwright test e2e/handbook-labels.spec.ts`;
`npm run dev --prefix handbuch` read through.

**Dependencies:** Task 4 · **Scope:** XS

## Checkpoint: Complete
- [ ] `npm run test:all` green (hardware suites skipped only with their warning)
- [ ] Every acceptance criterion above checked
