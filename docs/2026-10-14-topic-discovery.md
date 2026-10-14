# Topic discovery

Asked for by the user on 2026-10-14, from Rajiva's first try of Schaltli
against his own camper control (forum.camper-bauen.de, topic 14107, issue
#71) and from the user's own van broker. Builds on the idea
`docs/ideas/topic-discovery.md` and the interview of 2026-10-14, which
widened it: not a better list to tick, but every heard topic where a topic
is chosen.

Status: approved by the user on 2026-10-14.

Pictures: `docs/2026-10-14-topic-discovery/` - `heute-*.png` today,
`entwurf-*.png` the drafts (drawn in `entwuerfe.html`, not the designer's
code; colours and spacing are the designer's as near as plain CSS gets).

## Objective

Someone who points the designer at a broker they already run - the user's
van: `homeassistant` 453 messages, `pkw` 987, `schaltli` 429, `ble`,
`shellies`, `tasmota`, `zigbee2mqtt` - finds any topic where they need it:
while binding an object, and while looking at what goes on.

Today a raw topic has to be ticked in «Listen to Broker» (Settings ›
Topics) and added to the project before any picker offers it; a Home
Assistant entity is placed from the Block menu in one step, its topics
coming with it. The dialog is a flat list in a narrow window that cuts names
off at the end, where discovery topics differ (picture `heute-listen.png`).
And a block placed with nothing heard shows a made-up «60»
(`Service ID 60` at Rajiva's, whose sensor reports `CamperVan_BiberTest`).

Users: whoever builds a panel against a real broker with raw topics -
first the user with the van, then Rajiva and the forum testers.

**Success:** against the van's broker, the user opens the Read topic of an
object, types «tank» or opens `pkw › tele`, picks the fresh-water topic,
and the object is bound and the topic is in the project - no Settings, no
scrolling through hundreds of rows, no stutter while `pkw` sends several
messages a second.

## Background: announcements and data

Home Assistant discovery is ordinary MQTT. A device announces each entity
with a message on `homeassistant/<component>/<id>/config` (the discovery
prefix, usually retained). Its payload is a description, never a value:
the entity's name, unit and kind, and the topics where its data lives -
`state_topic` where the value arrives, `command_topic` where a command
goes. Rajiva's:

```
homeassistant/sensor/CamperServiceID_BiberTest/config
  {"name": "Service ID", "state_topic": "CamperServiceID/state", ...}
CamperServiceID/state
  CamperVan_BiberTest
```

So a broker carries two sorts of topic: announcements, under the
discovery prefix, and data, wherever the sender puts it. The Block menu
reads the announcements and places a block wired to the data topics.
«Listen to Broker» and the picker show topics, both sorts alike, as
heard; a topic an announcement names but nobody has sent does not appear
in them (marking announced topics in the tree was dropped, idea of
2026-10-14). Rajiva took the config topics in the old list for his
entities; the pointer of decision 8 sends whoever looks for entities to
the Block menu.

## Decisions

1. **The designer listens in the background.** Once connected to the
   broker, the designer subscribes `#` and keeps what it hears in one store
   per tab. A switch «Listening» in the status bar turns it off and on, one
   click; the choice is kept per browser. On by default.
2. **What is kept, per topic:** the latest message always; the last 20
   messages with their arrival time; whether it ever came retained; the
   type guessed from the payloads (numeric, text, json - today's
   `detectValueType` and its upgrade rule); a JSON topic's fields merged
   across messages (today's `mergeJsonMessage`); the message count. In
   memory only, gone with the tab.
3. **One tree.** `buildTopicTree` moves out of the picker into `lib/` and
   becomes the one tree of every topic list: levels split at `/`, each row
   naming its own level only, a branch carrying how many topics and
   messages lie below it. A search for a fragment matches the whole path at
   any level and returns only the branches with a match, opened down to
   it.
4. **A topic comes into the project by being used.** Wherever a topic is
   chosen (the Topic Picker, a text's `{topic:…}` completion), what was
   heard is offered beside the project's topics. Choosing a heard topic the
   project does not have adds it: its name, the guessed type, its JSON
   fields as subtopics, and what was heard as its examples (decision 6).
5. **A topic nobody sent is added where it is chosen.** When the search
   finds nothing that fits, the picker offers «Add topic «…»» with the
   typed name and a type to pick. Settings › Topics stays as the project's
   list, where topics can still be added and edited.
6. **Examples are harvested, never made up.** A topic's examples are what
   the broker reported or what someone typed. Choosing a heard topic takes
   its heard messages; «Use as examples» in the viewer replaces a project
   topic's examples with the messages heard. A block placed with nothing
   heard stores no example (module `no-made-up-values`).
7. **«Listen to Broker» is for looking.** It moves out of Settings to the
   top bar, a dot beside its name showing whether the designer is
   listening. Tree on the left, the topic in focus on the right: the whole
   path, the latest value (JSON indented), retained or live, arrival time,
   the last 20 messages to step through, «Use as examples» when it is in
   the project. The checkboxes and «Add Selected Topics» go: topics come in
   by being used (decision 4).
8. **Topics are topics, entities are something else** (user,
   2026-10-14). Entities stay in the Block menu; the viewer only points
   there when discovery configs announce devices. Neither the viewer nor
   the picker lists a topic because an announcement names it - only what
   was heard, and the project's own.

## Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `ha-sensor-type` | A Home Assistant sensor is a number only with a unit, a `state_class` or a numeric `device_class`; otherwise text | - |
| `no-made-up-values` | No sample stored where nothing was heard; values heard while the Block dialog is open count | `ha-sensor-type` (both change the `value` case of `lib/bausteine.ts`) |
| `broker-listener` | The background subscription, the store, the status-bar switch, the shared tree core | - |
| `topic-picker` | The Topic Picker and the `{topic:…}` completion on the heard tree; adding by use and by hand | `broker-listener` |
| `listen-viewer` | «Listen to Broker» as the viewer in the top bar | `broker-listener` |

Build order: `ha-sensor-type` → `no-made-up-values` → `broker-listener` →
`topic-picker` → `listen-viewer`. Then `npm run test:all` and the held
release in one go (firmware fw-2026.10.14.2, app v0.13.0, demo, closing
#70, #67, #68 and #71).

Each module gets its plan and todo as `tasks/<module>-plan.md` and
`tasks/<module>-todo.md`.

### `ha-sensor-type`

Home Assistant treats a sensor as numeric only when it says so
([sensor docs](https://www.home-assistant.io/integrations/sensor.mqtt/)):
`unit_of_measurement`, `state_class`, or a numeric `device_class`. Without
them its state is text - IDs, versions, states. Today `singlePart` in
`lib/ha-discovery.ts` makes every sensor a `value` part, and the block a
number.

- A sensor with any of the three is a `value` part as today.
- Any other sensor is a `text` part: a text beside its name, its topic
  typed `text`. The numeric device classes are Home Assistant's list
  (everything but `date`, `enum`, `timestamp`); kept as a list in
  `lib/ha-discovery.ts` with its source.
- A `value_template` does not change the rule.

Acceptance:
- Rajiva's «Service ID» (no unit, `entity_category: diagnostic`) places a
  text, its topic `text`.
- A sensor with `unit_of_measurement: "V"`, one with only
  `state_class: measurement`, one with only `device_class: temperature`
  each place a number as today.
- A sensor with `device_class: timestamp` places a text.

Tests: cases in `e2e/ha-discovery.spec.ts` (which tests the library directly); Rajiva's
three configs as a fixture under `e2e/fixtures/ha-discovery/`, placed
through the Block menu in an e2e spec.

### `no-made-up-values`

Picture `entwurf-block.png`.

- `readTopicEntry` (`lib/bausteine.ts`) stores the broker's value as the
  example when there is one and otherwise none - not `sample`. The sample
  may still measure the width the object needs; it is not stored.
- An object whose topic has no example shows what it shows for a topic
  before its first message, in the editor as in the preview. (Today
  `getPreviewValueFromTopic` says «Topic … has no Examples» in some
  objects; part of this module is making every object that a block places
  show its no-value state instead.)
- `useRetainedValues` (`hooks/use-block-catalog.ts`) keeps listening while
  the Block dialog is open and counts a live message as well as a retained
  one. Once `broker-listener` exists, it reads the store first.

Acceptance:
- With nothing on the broker, a «Service ID» block shows its name and the
  no-value state; its topic has no examples; nothing reads «60».
- With `CamperVan_BiberTest` retained, the block shows it.
- With it published live while the Block dialog is open (not retained),
  the block shows it too.
- A number block with nothing heard keeps the width it has today.

Tests: cases on `buildFromCatalog` in `e2e/bausteine.spec.ts`; the e2e spec from `ha-sensor-type`
extended with the three broker states.

Out of scope: projects that already stored a made-up example keep it.

### `broker-listener`

Picture `entwurf-ort.png` (the status bar).

- `lib/topic-tree.ts`: the tree of decision 3, generic over what a leaf
  carries, with counts, fragment search (on path, optionally on payload)
  and the paths to open for a match. The picker's own `buildTopicTree`
  goes; its render keeps its look until `topic-picker`.
- `lib/broker-store.ts` (or a hook beside `use-mqtt-connection`): one MQTT
  client per tab on the designer's broker, subscribed to `#` while the
  switch is on. Decision 2's data per topic. Subscribers are notified at
  most every 250 ms with what changed; a row reads its own topic's entry,
  so a message redraws its row and its ancestors' counts, not the tree.
- The switch «Listening» in the status bar, beside «Dark» and
  «Adornment»; kept in `localStorage` (wrapped, works without it).
- The broker login and URL are the designer's (`useMqttConnection`, #67):
  nothing new to enter.
- No message cap that stops listening (today's 10 000 auto-stop); the
  limits are 20 messages per topic and, as a guard, 5 000 topics - past it
  new topics are counted, not kept, and the viewer says so.

Acceptance:
- With the switch on, a topic published after the page loaded is in the
  store within a second, with its latest value, count, retained flag and
  type; after 25 messages it keeps the last 20.
- Switching off unsubscribes `#` (checked on the broker) and keeps what
  was heard; switching on again resumes.
- The switch's state survives a reload.
- Under a publisher sending 50 messages a second across 300 topics for
  30 seconds, the editor stays responsive: a click on a screen object
  selects it within 200 ms.

Tests: a library spec `e2e/topic-tree.spec.ts` for `lib/topic-tree.ts`; an e2e spec on a private broker
of its own (as `e2e/demo-van.spec.ts` does since 2026-10-14), not the
bench's.

### `topic-picker`

Pictures `heute-picker.png` (today), `entwurf-picker.png`,
`entwurf-picker-neu.png`.

- The Topic Picker (`components/property-panel/topic-selector.tsx`, used
  by every topic row through `TopicField`) opens a popover instead of a
  `Select`: a search field on top, a switch «All» / «Project only» with
  counts, the tree below.
- «All» is every heard topic and every project topic; a project topic not
  heard is shown pale, «not heard». A project topic carries ✓. A heard
  row shows its latest value and type.
- Search as in decision 3, on the path only. Rows open down to matches.
- Choosing a heard topic the project lacks adds it (decision 4) and binds
  it in one undo step.
- When nothing fits the typed text, «Add topic «…»» with the type chips
  numeric / text / json adds it with no examples and binds it.
- «Manage Topics...» stays at the bottom. The Subtopics Picker beside it
  stays as it is.
- The `{topic:…}` completion of a text (`lib/placeholder-completion.ts`)
  offers heard topics after the project's, the same fragment match; picking
  one adds it as above.
- A write topic (`allowSubtopics` false) offers the same tree; its added
  topic takes no examples from what was heard (they are what others
  sent, not commands).

Acceptance:
- On a broker carrying `pkw/tele/water/fresh = 64`, choosing it in a
  Level's Read topic binds it, adds it typed `numeric` with example `64`,
  and one undo takes both back.
- «water» shows `pkw › tele › water › fresh, grey` and the project's
  `van/water_pump`, opened; nothing else.
- «pkw/tele/tank/black», heard by nobody, offers «Add topic «…»»; picking
  text adds and binds it.
- «Project only» shows the project's topics alone.
- The existing `e2e/topic-selector.spec.ts` cases still hold
  (unregistered topic shown, subtopics, write topic).

Tests: `e2e/topic-selector.spec.ts` extended; a new spec for adding by use
and by hand.

### `listen-viewer`

Pictures `heute-listen.png` (today), `entwurf-viewer.png`,
`entwurf-filter.png`, `entwurf-ort.png`.

- A button «Listen to Broker» in the top bar, a dot beside it green while
  listening, opens the viewer. Settings › Topics loses its button.
- Wide dialog: on top the switch «Listening», the broker, the totals, the
  filter «Filter topic or payload», «Collapse all», «Connection settings».
- The pointer of decision 8 above the tree when the discovery prefix
  carries configs: «N devices are announced via Home Assistant discovery.
  Their entities are placed as blocks.» - «Open the Block menu ›».
- The tree: every branch folded on opening. A message lights its row and
  every ancestor, fading over about 1.5 s; a row already lit starts its
  fade again. A topic in the project carries «✓ in project».
- The pane: path, retained/live, type, «in project»; the latest value
  (JSON indented), its time; the last 20 messages, newest first, ‹ › to
  step through and a click to show one; for a project topic, its current
  examples and «Use as examples», which replaces them with the heard
  messages (deduplicated, newest first) in one undo step.
- The local-topic warning stays (`docs/2026-10-13-local-topics.md`,
  decision 7).
- The demo hides «Connection settings» as today.

Acceptance:
- On opening, every branch is folded; counts are right.
- A message on `pkw/tele/battery/current` lights its row and `battery`,
  `tele`, `pkw`.
- Filter «heat» shows the three matches of `entwurf-filter.png`, opened.
- Clicking a topic shows its latest value and messages; ‹ › step.
- «Use as examples» on a project topic replaces its examples; undo puts
  them back.
- No checkbox, no «Add Selected Topics».

Tests: `e2e/mqtt-discovery.spec.ts` rewritten for the viewer; the
`broker-login`, `broker-url` and `demo-mode` specs follow the moved
button.

## Commands

```
npm run dev                # the user's dev server on 3000 - never restarted by Claude
npm run build              # production build
npm run test:quick         # after every change (e2e against a production build + device core checks)
npm run test:all           # before the release
npx playwright test e2e/<spec>.spec.ts --workers=1   # one spec
npm run dev --prefix handbuch                         # handbook preview
```

## Project structure

```
lib/topic-tree.ts            the one tree (new)
lib/broker-store.ts          the background listener's store (new)
lib/ha-discovery.ts          sensor type rule
lib/bausteine.ts             readTopicEntry without samples
hooks/use-block-catalog.ts   useRetainedValues: live values too
components/property-panel/topic-selector.tsx   the picker
components/mqtt-discovery-dialog.tsx           the viewer (renamed file allowed)
lib/placeholder-completion.ts                  heard topics in the completion
e2e/fixtures/ha-discovery/   Rajiva's three configs
handbuch/designer/topics.md, handbuch/betrieb/mqtt.md   the handbook
```

## Code style

As the surrounding code: TypeScript, React function components, Tailwind,
shadcn/ui. Comments say why, with the date and the finding that made a
rule. UI text in English; labels the handbook quotes are kept verbatim
or changed together with it.

## Testing strategy

- Library tests as Playwright specs without a page, the way
  `e2e/ha-discovery.spec.ts` and `e2e/bausteine.spec.ts` test `lib/` (there
  is no separate unit runner): `lib/topic-tree.ts`, the sensor rule,
  `buildFromCatalog`.
- e2e (Playwright, `e2e/`) per module as listed, each on a private broker
  of its own where it publishes, so the bench's devices and other specs
  never see its topics.
- A load check in `broker-listener`'s spec (50 messages a second).
- Ad-hoc checks against the van's broker become fixture data, never only
  a manual run (CLAUDE.md).

## Boundaries

- **Always:** `npm run test:quick` after each task, tests never in
  parallel; the handbook pages changed in the same task as the UI
  (`designer/topics.md`, `betrieb/mqtt.md`, `designer/bausteine.md` if the
  sensor rule shows there), through maettel-humanizer; commits per task,
  pushed to main.
- **Ask first:** anything on the van's broker beyond reading; publishing
  the release; changing the project file format (no change planned:
  topics and examples keep their shape).
- **Never:** publish to the bench broker's real topics from a test;
  restart the user's dev server; store a value the broker did not send as
  if it had.

## Success criteria

1. The success scenario of the Objective, run against a fixture shaped like
   the van's broker in e2e and once by the user against the van.
2. Rajiva's three configs place text where Home Assistant shows text, and
   no block shows a value nobody sent.
3. `npm run test:all` green, the handbook updated, #71 closed with a
   comment.

## Not doing

- Entities marked in the tree; grouping by device (the Block menu's view).
- MQTT Viewer's timeline, charts and publishing.
- `device_tracker` as a map; brightness in percent (#72).
- Cleaning up examples older projects already stored.
- Keeping heard topics across reloads.

## Settled with the user (2026-10-14)

- Listening is on by default in the demo too: its broker carries only the
  demo van.
- The 5 000-topic guard is checked against the van's broker (read only:
  subscribe `#` briefly, count) before `broker-listener` is done.
