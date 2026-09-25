# block-topics: tasks

Plan: `tasks/block-topics-plan.md` · Spec: `docs/2026-09-25-block-topics.md`

## Task 1: Realistic defaults and the name topic, without a broker

**Description:** Replace the placeholder examples with the spec's table
(tank 72/35/8, battery 87/54/12, dimmer 60/25/100, relay on/off) through one
`examplesWith()` helper, and have Tank, Switch and Dimmer declare their name
topic (type text, example = the label). `fallbackInstances` derives
`nameTopic`.

**Acceptance criteria:**
- [x] Placed without a broker, each of the four blocks leaves exactly its
      topics - state, command where it writes, name where it has one - with
      the default examples.
- [x] Placing a block whose topics the project already has leaves their type
      and examples untouched.

**Verification:**
- [x] `npx playwright test e2e/bausteine.spec.ts`
- [x] `npm run typecheck`

**Dependencies:** None

**Files likely touched:** `lib/bausteine.ts`, `e2e/bausteine.spec.ts`

**Estimated scope:** S

## Task 2: The broker's reported value and name come first

**Description:** `discoverInstances` keeps the reported value and name on the
instance; `examplesWith()` puts an accepted value first (dimmer rounded to its
step of 5), skips one that does not fit, and the name topic's example is the
reported name.

**Acceptance criteria:**
- [ ] A tank reporting 72 and "Frischwasser" gives level examples `72, 35, 8`
      and name example `Frischwasser`.
- [ ] A dimmer reporting 43 gives `45, 60, 25`; a relay reporting `on` gives
      `on, off`.
- [ ] A tank reporting `abc` keeps `72, 35, 8`.

**Verification:**
- [ ] `npx playwright test e2e/bausteine.spec.ts` (needs `npm run hil:broker`)

**Dependencies:** Task 1

**Files likely touched:** `lib/bausteine.ts`, `e2e/bausteine.spec.ts`

**Estimated scope:** S

## Checkpoint A
- [ ] Block spec and typecheck green
- [ ] Review with the user

## Task 3: Handbook

**Description:** `handbuch/designer/bausteine.md` says what a block adds to
the Topics list: state, command, name, with examples from the van. Through
`maettel-humanizer`.

**Acceptance criteria:**
- [ ] The page names the three kinds of topic and where the examples come
      from.
- [ ] `e2e/handbook-labels.spec.ts` green; the handbook builds.

**Verification:**
- [ ] `npx playwright test e2e/handbook-labels.spec.ts e2e/handbook.spec.ts`
- [ ] `npm run build --prefix handbuch`

**Dependencies:** Task 2

**Files likely touched:** `handbuch/designer/bausteine.md`

**Estimated scope:** XS

## Checkpoint B (done)
- [ ] `npm run test:e2e` green but for failures that also fail on `main`
- [ ] Every success criterion in the spec ticked
