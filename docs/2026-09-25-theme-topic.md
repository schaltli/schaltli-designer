# Spec: `theme-topic` - the topic that says light or dark

Module of `docs/2026-09-24-themes.md` (capability map), after `theme-model`
and `theme-export`, before `device-switch`. Status: approved 2026-09-25, with both open points decided (below).

## Objective

An installation has one answer to "light or dark?", on the broker, so that
every colour device can follow it once `device-switch` teaches them to, and
anything can set it: a switch on a screen, Pekaway, later a Node-RED flow at
22:00. This module writes that answer into the contract, makes the VanPi
bridge keep it, puts a switch for it on screens as a block, and says all of
it in the handbook. It does not make any device switch (that is
`device-switch`, in the firmware and Android repositories).

Decided in the map (2026-09-24) and with the user (2026-09-25):

- **The topics.** `schaltli/state/theme` holds `light` or `dark`, retained,
  no expiry. `schaltli/cmnd/theme` asks for a change, not retained, and
  takes `light`, `dark` or `toggle`.
- **Only the bridge sets the state** (user, 2026-09-25). A device never
  publishes retained (`docs/device-contract.md` §4), so a switch on a
  screen sends a command and the bridge answers with the state. Without a
  VanPi bridge nothing turns a command into a state; whoever integrates the
  installation otherwise (Home Assistant, a Node-RED flow of their own)
  publishes `schaltli/state/theme` retained themselves, and the handbook
  says so.
- **No state means light.** A broker that holds no `schaltli/state/theme`
  is an installation that never switched: devices show light, as today.
- **The block is a Switch with a moon** (user, 2026-09-25): knob form, two
  states labelled `Hell` (off) and `Dunkel` (on) - German on the device,
  like the Switch block's `Aus` / `An`. A knob switch draws its state's
  icon only while it is on (`render-switch.ts`, 2026-09-22), so the moon
  shows in dark and the knob is plain in light - there is no sun to draw.
- **Grey and 1-bit devices ignore the topic**; the designer's `Dark` switch
  stays a view and does not follow the topic.

### Acceptance criteria

1. `docs/device-contract.md` §4 names both topics, their payloads, retained
   or not, who publishes the state (the bridge, or the integrator), that
   absent means light, and that grey and 1-bit devices ignore it.
2. The VanPi bridge turns `schaltli/cmnd/theme` into a retained
   `schaltli/state/theme`:
   - `light` and `dark` publish that value; `toggle` publishes the other
     one than the last state it published (none yet: `dark`);
   - anything else is ignored, as every command it does not know is;
   - the state is published only when it changes, like every other state
     value, and never goes to Pekaway.
3. A **Theme** block in the designer's block list places a label and a knob
   switch that reads `schaltli/state/theme` and writes to
   `schaltli/cmnd/theme` (`light` / `dark`), declares both topics with
   examples, and brings its moon icon into the project's assets.
4. The handbook says it: the two topics on the MQTT page, the command on
   the VanPi bridge page, the block on the blocks page, and on the themes
   page how an installation switches - with the plain statement that the
   devices do not follow it yet, until `device-switch` lands (a
   `handbuch-macke` warning with its issue).

## Contract shape (example)

```
schaltli/cmnd/theme   toggle            (a finger on the Theme switch)
schaltli/state/theme  dark    retained  (the bridge's answer)
```

## Tech stack and structure

```
docs/device-contract.md            §4: the two topics
integrations/vanpi/bridge-logic.js command(): the theme command, answered with a state
integrations/vanpi/build-flow.js   routes that state to the retained output
lib/bausteine.ts                   the Theme block (THEME), incl. its icon asset
public/ or lib/                    the moon icon as SVG
e2e/vanpi-bridge.spec.ts           the bridge's half
e2e/bausteine.spec.ts              the block's half
handbuch/betrieb/mqtt.md, betrieb/vanpi-bruecke.md,
handbuch/designer/bausteine.md, designer/themes.md
```

The block model today builds a non-keyed block's topic as
`schaltli/state/<group>/<valueLeaf>` (`discoverInstances`,
`fallbackInstances`); the theme topic has no leaf below its group. The
block needs a small generalisation there (a block whose value topic is its
group), in `lib/bausteine.ts`.

## Commands

```
Typecheck:  npm run typecheck
Tests:      npx playwright test e2e/vanpi-bridge.spec.ts e2e/bausteine.spec.ts e2e/handbook-labels.spec.ts
```

The full suite is not run until the faster PC is there (user, 2026-09-25).

## Testing strategy

- **Bridge** (`vanpi-bridge.spec.ts`, calling `createBridgeLogic()` as the
  flow runs it): `light`, `dark`, `toggle` from each state and from none,
  an invalid payload, a repeated command publishing nothing new, and that
  nothing reaches `pkw/cmnd`. The built flow routes the theme state to the
  retained output.
- **Block** (`bausteine.spec.ts`): placing it yields a label and a knob
  switch bound to the two topics with `light`/`dark` values, `Dark` as the
  on state carrying the moon, the two topics declared, the icon in the
  assets once however often the block is placed.
- **Handbook**: `handbook-labels.spec.ts` for every label quoted.

## Boundaries

- **Always:** the bridge's logic stays one function the spec calls
  character for character; the block goes through the same path as the
  other blocks; the handbook in the same work.
- **Ask first:** anything in `lib/bausteine.ts` beyond the Theme block and
  the generalisation it needs - another session's `block-topics` work is
  in that file (`tasks/block-topics-plan.md`); a device publishing
  retained.
- **Never:** change a firmware or the app; let the designer's `Dark`
  switch publish or follow the topic.

## Decided open points (user, 2026-09-25)

1. **Coordinating `lib/bausteine.ts`:** contract and bridge first; the
   block once the `block-topics` session has committed, built on top of
   its work.
2. **A block that does nothing yet:** offered now, with the handbook's
   warning that the devices do not follow the topic until `device-switch`.
