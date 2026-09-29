# block-options: tasks

Plan: `tasks/block-options-plan.md` · Spec: `docs/2026-09-29-block-options.md`

Every task that changes what a user sees updates its handbook page in the
same piece of work (CLAUDE.md) and says which one.

## Task 1: Label as a placeholder text

**Description:** Tank, Switch and Dimmer write their label as a Text with
`{topic:schaltli/state/<g>/<n>/name ?? "<name>"}`; the text box takes the
full label width. Battery and Theme keep a literal label.

**Acceptance criteria:**
- [x] A Tank placed on a van reporting «Frischwasser» has a Text
      `{topic:schaltli/state/tank/1/name ?? "Frischwasser"}`; without a
      broker `?? "Tank 1"`.
- [x] Publishing a new name on the broker changes the preview. (Checked
      through `resolve()` on the placed text; the live preview itself is
      covered by `e2e/label-placeholders.spec.ts`.)
- [x] Battery and Theme labels unchanged.

**Verification:**
- [x] `npx playwright test e2e/bausteine.spec.ts` (needs `npm run hil:broker`):
      32 of 35; the 3 failing (Switch, Dimmer, Theme twice) time out in
      `loadProject` on the start page and fail the same on `main`
- [x] `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/bausteine.ts`, `e2e/bausteine.spec.ts`,
`handbuch/designer/bausteine.md`

**Estimated scope:** S

## Task 2: Dialog second step with the label field

**Description:** Picking an instance no longer places the block; it shows
the options step with a placeholder-capable label field (prefilled as in
Task 1) and **Insert**. `onConfirm(instance, options)`; `build()` gets
`input.options`. A typed label is used as is.

**Acceptance criteria:**
- [ ] Instance → options → Insert places the same objects as Task 1 when
      nothing is changed.
- [ ] A label typed over with `Wasser` places a literal `Wasser`.
- [ ] Back returns to the instance list; Esc cancels.

**Verification:**
- [ ] `npx playwright test e2e/bausteine.spec.ts`
- [ ] `npm run typecheck`

**Dependencies:** Task 1

**Files likely touched:** `components/baustein-dialog.tsx`,
`components/project-editor.tsx`, `lib/bausteine.ts`,
`e2e/bausteine.spec.ts`, `handbuch/designer/bausteine.md`

**Estimated scope:** M

## Task 3: Looks and label position

**Description:** One layout function (label with optional icon above or
left, controls below). Looks: Tank/Battery Bar · Gauge · number
(`{topic:…:F0} %`); Dimmer Slider · Dial; Switch switch · button. An option
whose object type the device lacks is greyed out with the reason.

**Acceptance criteria:**
- [ ] Each look of each block places the named object type bound to the
      same topics; defaults equal today's layout.
- [ ] Label left places label and control side by side within the rect.
- [ ] On a device without `gauge` the Gauge option is disabled.

**Verification:**
- [ ] `npx playwright test e2e/bausteine.spec.ts`
- [ ] `npm run typecheck`

**Dependencies:** Task 2

**Files likely touched:** `lib/bausteine.ts`,
`components/baustein-dialog.tsx`, `e2e/bausteine.spec.ts`,
`handbuch/designer/bausteine.md`

**Estimated scope:** M

## Task 4: Texts: on/off words and step

**Description:** Switch «Aus»/«An», Theme «Hell»/«Dunkel» and the Dimmer's
step are fields in the options step. The dialog remembers the last options
per block for the session.

**Acceptance criteria:**
- [ ] A Switch placed with «Zu»/«Offen» shows those state labels.
- [ ] A Dimmer with step 10 has step 10 and its examples rounded to 10.
- [ ] The second Tank in a session opens with the first one's look.

**Verification:**
- [ ] `npx playwright test e2e/bausteine.spec.ts`
- [ ] `npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:** `lib/bausteine.ts`,
`components/baustein-dialog.tsx`, `e2e/bausteine.spec.ts`,
`handbuch/designer/bausteine.md`

**Estimated scope:** S

## Task 5: Icon suggested by name

**Description:** The options step searches Iconify for the instance's name,
else the block's kind, and shows the first hit; «Change…» opens the icon
browser, «None» removes it. The icon is added to the project's assets once
and placed before the label.

**Acceptance criteria:**
- [ ] «Frischwasser» (Iconify mocked) suggests the mocked water icon; the
      placed group contains an Icon object with it.
- [ ] «None» places no icon; placing twice with the same icon adds one asset.
- [ ] Iconify failing: no icon, a line in the dialog says so, Insert works.

**Verification:**
- [ ] `npx playwright test e2e/bausteine.spec.ts`
- [ ] `npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:** `components/baustein-dialog.tsx`,
`lib/bausteine.ts`, `e2e/bausteine.spec.ts`,
`handbuch/designer/bausteine.md`

**Estimated scope:** M

## Checkpoint A: designer, no van
- [ ] `npx playwright test e2e/bausteine.spec.ts e2e/handbook-labels.spec.ts` green, typecheck green
- [ ] `npm run test:e2e` green but for failures that also fail on `main`
- [ ] Review with the user in the running designer

## Task 6: Spike: does a slider on the devices follow its state untouched?

**Description:** Read the firmware (Knob, 4.3B) and Android code: does a
Slider redraw when its state topic changes while nobody touches it, and
does it stop following while a finger is on it? Result written into the
spec. No code change unless trivial.

**Acceptance criteria:**
- [x] For each device: yes/no with file:line.
- [x] If any device does not, the timer part is split into its own task
      (device work) and Task 10 places the timer only where it works.

**Verification:**
- [x] Spec's open question 2 answered

**Dependencies:** None (may run any time before Task 10)

**Files likely touched:** `docs/2026-09-29-block-options.md`

**Estimated scope:** XS

## Task 7: Bridge: heater name, timer and power level

**Description:** `heater/name` from `heater_name`; `cmnd/heater/timer`
(0-600; 0 = off) → `POWER/<target>/<min>`; `heater/timer` from
`runtime_remaining_s`, else the bridge's own countdown; `heater/power_level`
and `cmnd/heater/power_level` when the van reports `autoterm1`.

**Acceptance criteria:**
- [ ] Timer 90 → `pkw/cmnd/heater/POWER/<target>/90` `on`; 0 → `POWER` `off`.
- [ ] Without `runtime_remaining_s` the state counts down each minute and
      goes 0 when power goes off.
- [ ] No `autoterm1` → no power level topic; with it, both ways work.

**Verification:**
- [ ] `npx playwright test e2e/vanpi-bridge.spec.ts`

**Dependencies:** None

**Files likely touched:** `integrations/vanpi/bridge-logic.js`,
`integrations/vanpi/build-flow.js`, `e2e/vanpi-bridge.spec.ts`,
`handbuch/betrieb/vanpi-bruecke.md`

**Estimated scope:** M

## Task 8: Bridge: MaxxFan both shapes, commands for A, handbook warning

**Description:** Normalise A and B into `maxxfan/mode|speed|temperature|
cover|airflow`; after one B message ignore A until restart; replace the old
topics. `cmnd/maxxfan/<part>` becomes A's toggles/steps from the current
state, only while no B was seen. Handbook: new topics and the A-only
warning with its `handbuch-macke` comment and a GitHub issue labelled
`handbuch` (created after asking).

**Acceptance criteria:**
- [ ] A alone and B alone give the same topics for the same fan state.
- [ ] A after B publishes nothing; a command after B sends nothing to A.
- [ ] `mode auto` from `off` on A sends `power` then `auto`; `speed 50`
      from 30 sends two `speed` steps (as Pekaway expects).

**Verification:**
- [ ] `npx playwright test e2e/vanpi-bridge.spec.ts`
- [ ] `npx playwright test e2e/handbook-labels.spec.ts`

**Dependencies:** None

**Files likely touched:** `integrations/vanpi/bridge-logic.js`,
`integrations/vanpi/build-flow.js`, `e2e/vanpi-bridge.spec.ts`,
`handbuch/betrieb/vanpi-bruecke.md`

**Estimated scope:** M

## Task 9: vanpi-custom: the BLE flow listens on `schaltli/cmnd/maxxfan/#`

**Description:** In `C:\GitHub\vanpi-custom\flows\maxxfan.json` a new MQTT
in on `schaltli/cmnd/maxxfan/#` turns `<part>` + value into
`{"<part>": <value>}` on `ble/<mac>/command/set`, with the value checks the
flow already has. Only with the user's go-ahead; the user deploys.

**Acceptance criteria:**
- [ ] Each of the five parts reaches the fan (checked on the van).
- [ ] Out-of-range or unknown parts are dropped with a log line.

**Verification:**
- [ ] On the van at Checkpoint B

**Dependencies:** Task 8 (topic names)

**Files likely touched:** `vanpi-custom/flows/maxxfan.json`

**Estimated scope:** S

## Checkpoint B: on the van (the user deploys bridge and flow)
- [ ] Heater: timer set, raised, lowered, 0; power level if Autoterm
- [ ] Spec open question 1 answered (second timer command)
- [ ] Fan: state shown is B's, each command reaches the fan
- [ ] The HIL run becomes a permanent test (bridge spec or HIL fixture)

## Task 10: Blocks with parts; the Heater block

**Description:** Parts as data (id, label, object, topics,
`onlyIfReported`); checkboxes in the options step; `build()` places ticked
parts stacked under the label. Heater: Power, Setpoint 12-35, Timer
(counting-down slider 0-600), Power level (only if reported).

**Acceptance criteria:**
- [ ] Ticking Power + Timer places a switch and a slider bound to the
      right state and command topics, and declares them with examples.
- [ ] Power level is not offered when the broker has no `heater/power_level`.
- [ ] Label follows `heater/name`.

**Verification:**
- [ ] `npx playwright test e2e/bausteine.spec.ts`
- [ ] `npm run typecheck`

**Dependencies:** Tasks 3, 6, 7

**Files likely touched:** `lib/bausteine.ts` (or `lib/bausteine/`),
`components/baustein-dialog.tsx`, `e2e/bausteine.spec.ts`,
`handbuch/designer/bausteine.md`

**Estimated scope:** M

## Task 11: The MaxxFan block

**Description:** Parts Mode (three states), Speed 10-100 step 10,
Temperature 0-37, Cover, Airflow, on the topics from Task 8.

**Acceptance criteria:**
- [ ] All five ticked place five controls bound to state and command.
- [ ] Mode's states are `off`/`manual`/`auto` as the bridge publishes them.

**Verification:**
- [ ] `npx playwright test e2e/bausteine.spec.ts`
- [ ] `npm run typecheck`

**Dependencies:** Tasks 8, 10

**Files likely touched:** `lib/bausteine.ts` (or `lib/bausteine/`),
`e2e/bausteine.spec.ts`, `handbuch/designer/bausteine.md`

**Estimated scope:** S

## Task 12: Handbook screenshots and humanizer pass

**Description:** New screenshots of the options step, Heater and MaxxFan
(`e2e/handbook-screenshots.spec.ts`); `bausteine.md` and
`vanpi-bruecke.md` through `maettel-humanizer`.

**Acceptance criteria:**
- [ ] Screenshots show the options step and both new blocks.
- [ ] `npm run build --prefix handbuch` succeeds.

**Verification:**
- [ ] `npx playwright test e2e/handbook-screenshots.spec.ts e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`

**Dependencies:** Task 11

**Files likely touched:** `e2e/handbook-screenshots.spec.ts`,
`handbuch/designer/bausteine.md`, `handbuch/betrieb/vanpi-bruecke.md`

**Estimated scope:** S

## Checkpoint C: complete
- [ ] `npm run test:all` green but for failures that also fail on `main`
- [ ] Every success criterion in the spec ticked
- [ ] Review with the user
