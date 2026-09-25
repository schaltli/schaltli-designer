# What a block tells the project about its topics

Agreed 2026-09-25. The first of two pieces of work; the
second, `text-placeholders` (a text that shows `{topic:a/bc:F2 ?? "–"}`),
builds on this one and gets its own spec.

## Capability map

| Module | What | Where | Depends on |
|---|---|---|---|
| `block-topics` | This spec: every topic a block reads or writes is declared in the project, with examples a van would really send, including the name topic | designer | - |
| `text-placeholders` | `{topic:…}`, `{device:…}`, `{project:…}` in texts and level labels, rendered live on every device; `{` opens a picker. Blocks then write their label as `{topic:…/name ?? "Frischwasser"}` | designer, firmware, Android | `block-topics` (the name topics it declares) |

## Objective

When someone places a block, the project should know every topic the block
depends on, as a person would describe it: which values it can take, with
values that look like a real van rather than placeholders. The preview then
shows something believable the moment the block lands, and the Topics list
is a true inventory of what the screen talks to.

What is there today (checked 2026-09-24 by placing a Switch and a Tank on
a fresh project, with the local broker answering):

- Tank, Battery, Switch and Dimmer already declare the topics their objects
  bind to, state and command topic both, since the first block on
  2026-09-16 (`finishBaustein` in `components/project-editor.tsx`). The user
  thought they did not; nothing contradicted that except that no test
  checked it.
- The examples are placeholders: `45, 0, 100` for every tank and battery,
  `50, 0, 100` for a dimmer, `on, off` for a relay.
- The value the broker reported while the block was being placed (the tank
  *is* at 72 %) is used to find the instance and then thrown away.
- The name (`…/tank/1/name`, published retained by the VanPi bridge) is
  read once and written into the label as fixed text. Its topic is not
  declared.

## Behaviour

1. **The name topic is declared** for every block that has one: Tank,
   Switch and Dimmer (`nameLeaf: "name"`). Battery has none - the bridge
   publishes no battery name - and stays as it is. Type `text`. In this
   module no object binds to it yet; `text-placeholders` will.
2. **Examples look like a van**, three per topic, the first one what the
   preview shows:

   | Topic | Examples when the broker answered | Examples without a broker |
   |---|---|---|
   | tank level | the reported value, then two of `72, 35, 8` | `72, 35, 8` |
   | battery soc | the reported value, then two of `87, 54, 12` | `87, 54, 12` |
   | relay power (state and command) | the reported value, then the other one | `on, off` |
   | dimmer level (state and command) | the reported value rounded to the block's step of 5, then two of `60, 25, 100` | `60, 25, 100` |
   | name | the reported name | the fallback label (`Tank 1`, `Relay 3`, `Dimmer 2`) |

   A reported value that does not fit (a tank at `abc`) is skipped; the
   defaults stand. No duplicates: if the broker reports 72, the tank's list
   is `72, 35, 8`.
3. **A topic the project already has is left alone** - its examples and
   type are the user's, possibly edited by hand. That is today's rule and
   it stays. Only missing topics are added.
4. The command topic gets the same examples as its state topic, as today.

## Tech stack

Next.js / React 19 / TypeScript, Playwright. No new dependency.

## Commands

```
Dev:        npm run dev
Typecheck:  npm run typecheck
This spec:  npx playwright test e2e/bausteine.spec.ts
Full e2e:   npm run test:e2e
```

## Project structure

```
lib/bausteine.ts                 → examples, name topic, what build() returns
components/project-editor.tsx    → finishBaustein (unchanged rule: add only missing)
components/baustein-dialog.tsx   → hands the reported value/name to build()
e2e/bausteine.spec.ts            → the tests
handbuch/designer/bausteine.md   → the handbook page
```

## Code style

As the repo: comments say why, with a date for a decision.

```ts
// The first example is what the preview shows, so it is the value the van
// reported while the block was placed, when there was one (2026-09-25).
function examplesWith(reported: string | undefined, defaults: string[]): string[] {
  const first = reported !== undefined && isNumeric(reported) ? [reported] : []
  return [...first, ...defaults.filter((d) => d !== reported)].slice(0, 3)
}
```

## Testing strategy

Playwright, as the rest of `e2e/`. `e2e/bausteine.spec.ts` gains:

- every block (Tank, Battery, Switch, Dimmer), placed with the local broker
  answering, leaves exactly its topics in *Settings › Topics*: state,
  command where it writes, name where it has one - none missing, none
  twice;
- the first example of each is the value the broker reported;
- placed without a broker, the defaults from the table above;
- placing a block whose topics the project already has leaves their type
  and examples untouched.

The pure example logic is checked through the same spec (the repo has no
unit test runner), in the same style as its existing non-browser tests.

## Boundaries

- **Always:** keep the rule "add only what is missing"; update
  `handbuch/designer/bausteine.md` in the same piece of work; run the block
  spec and typecheck before each commit.
- **Ask first:** changing a topic the project already has; any change to
  what a block places on the screen (that is `text-placeholders`).
- **Never:** touch firmware or Android here; write into `tasks/plan.md` or
  `tasks/todo.md` while another session's unfinished plan is in them.

## Success criteria

- [ ] The four new tests pass; `npm run test:e2e` green but for failures
      that also fail on `main`.
- [ ] Placing a Tank on a van reporting 72 % and "Frischwasser" gives
      `…/tank/1/level` with examples `72, 35, 8` and `…/tank/1/name` with
      `Frischwasser`.
- [ ] The handbook's block page says what a block adds to the Topics list.

## Open questions

None that block this module. For `text-placeholders`: which fields
`device:` and `project:` offer, and what a device shows for a reserved but
unimplemented expression.
