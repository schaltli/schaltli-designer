# Implementation plan: the Autoterm block

Decisions: `docs/2026-10-05-autoterm-block.md` (agreed 2026-10-05). Tasks:
`tasks/autoterm-block-todo.md`. Chat German, docs English.

## Overview

The designer learns three small things a block description can say - a
text part, a level's measured value beside its setpoint, and sections the
Insert dialog ticks - and names its read-only parts. The bridge then
publishes the Autoterm's state, fault, diagnostics, fuel used and timer, and
describes the whole heater as one block with them.

## Architecture decisions

- **Format additions are keys, not a new version.** `kind: "text"`, a
  level's `current_topic` and a part's `section` are ignored by an older
  designer (lib/block-description.ts: unknown keys are ignored; an unknown
  kind skips that one part). `BLOCK_FORMAT_VERSION` stays 1.
- **A text part** is `{ kind: "text", read }` in the catalog, placed as a
  Text `{topic:…}` across its row, its topic declared as text. Only a
  description makes one; Home Assistant has nothing that maps to it.
- **The measured value** is `current` on a level control. Placed, the
  object's «Topic» (fill) is `current` and its «Setpoint topic» (handle) is
  `read`; without `current` nothing changes.
- **Read-only parts carry their name** in a block with several parts: a
  value or text row is `<name> {topic:…} <unit>` in one Text. Controls
  stay bare (decided 2026-10-01); a number alone does not say what it is.
- **Sections** map onto `BausteinOptions.parts`, which the builder already
  honours: parts without `section` are always placed, the dialog shows one
  checkbox per section, all ticked. Nothing about sections reaches the
  placed block.
- **The bridge keeps all Autoterm logic in `bridge-logic.js`**, tested
  directly; `build-flow.js` only wires: the fuel count and the faults need
  flow context and the HTTP answer, as the timer and the kept target do.
- **Fuel survives a restart** by reading its own retained topics back, as
  the theme does (`seen`).

## Task list

### Phase 1: Designer

- [ ] Task 1: Description format: `text`, `current_topic`, `section`
- [ ] Task 2: Placing: the text part, the measured value, named read-only parts
- [ ] Task 3: Insert dialog: a checkbox per section

### Checkpoint: Designer
- [ ] block-description, bausteine, ha-discovery specs pass; `npx tsc --noEmit -p .` clean; no van words

### Phase 2: Bridge

- [ ] Task 4: Autoterm values: state text, voltage, fan, pump, runtime, timer
- [ ] Task 5: Commands: `heater/view`, `heater/runtime`, `heater/timer_on`; runtime kept while off
- [ ] Task 6: Fuel used: counted, reset, read back after a restart
- [ ] Task 7: Faults: from the heater, a refused command, a start not followed
- [ ] Task 8: The heater block described with all of it

### Checkpoint: Bridge
- [ ] `e2e/vanpi-bridge.spec.ts` passes; the description reads fully supported through `readDescription`

### Phase 3: Handbook and van

- [ ] Task 9: Handbook: `designer/bausteine.md` (sections, named values, setpoint), `betrieb/vanpi-bruecke.md` (topics, commands, fuel, fault)
- [ ] Task 10: The user deploys; tried in the van with Schaltli commands, `stop/0` and a new target while heating included

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Two switchers in one block (view, timer) lay out badly | Medium | Task 8 places the described block in a spec and checks both switchers and their topics |
| Naming read-only parts changes existing multi-part blocks (a climate's current temperature) | Low | It only adds the part's name; specs that pin the old text are updated on purpose |
| Pekaway's HTTP API answers 200 with a refusal in text | Medium | The fault check reads the text (`must be`, `can only be`), not only the status |
| Pump Hz is sampled every 6 s, so the fuel count is an estimate | Low | Said in the handbook; a pause between answers is capped |
