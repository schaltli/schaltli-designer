# Better topic discovery

Idea written down with the user on 2026-10-13, from Rajiva's first try of
Schaltli against his own camper control (forum.camper-bauen.de, topic
14107, page 2, with three screenshots). He ran «Discover MQTT Topics» and the
Block menu on a broker carrying his Home Assistant discovery configs, and
stumbled three times in a few minutes.

Status: idea. No spec yet. Issue #71.

## Problem Statement

How might someone who points the designer at a broker they already run see
at once which topic is which, and get blocks that show what their devices
really report, not values the designer made up?

What Rajiva hit:

1. **Names cut off at the wrong end.** The discovery dialog is narrow, and
   a name like `homeassistant/sensor/CamperServiceID_BiberTest/config`
   shows as `homeassistant/sensor/CamperService…`. Discovery topics share
   their beginning and differ at the end, so the cut takes away exactly what
   tells them apart. The tooltip has the whole name, but waiting for it on
   every row is slow.
2. **A «60» nobody sent.** His sensor «Service ID» (no unit,
   `entity_category: diagnostic`) reports the text `CamperVan_BiberTest`.
   The placed block showed `Service ID 60`. The designer had no retained
   value for the state topic (the Block dialog reads only retained ones,
   `useRetainedValues` in `components/baustein-dialog.tsx`), so
   `buildFromCatalog` filled in its sample `"60"` and typed the topic
   `numeric` (`lib/bausteine.ts`, case `"value"`). He took it for a value
   from his van and asked where it came from.
3. **A sensor without a unit is taken for a number.** In Home Assistant a
   sensor is numeric only when it says so: a unit, a `state_class` or a
   numeric `device_class`. Without them it is text, as IDs, versions and
   states mostly are. The catalog makes every sensor a `value` and every
   value a number.

The user added on 2026-10-13: the flat list is the deeper problem. On a
real van broker (the user's own: `homeassistant` 453 messages, `pkw` 987,
`schaltli` 429, plus `ble`, `shellies`, `tasmota`, `zigbee2mqtt` …) a list of
every topic is too long to find anything in, whatever the width. The model
is MQTT Viewer's tree (screenshot of the user's broker, 2026-10-13).

## Recommended Direction

**A tree, not a list.** The dialog shows the broker as MQTT Viewer does:
one row per level, `homeassistant › climate › schaltli-vanpi › maxxfan ›
config`, folded until opened. Each row names only its own level, so the
cut-off problem goes away with it: `CamperServiceID_BiberTest` stands on a
row of its own. On each row:

- how many topics and messages lie below (MQTT Viewer's `↳ 6 | ✉ 453`),
  so it is clear where the bulk is before opening anything;
- on a topic itself: a dot for retained, `live` otherwise, its type, and
  the start of its payload on the same line;
- a checkbox. On a branch it selects every topic below, half-ticked when
  only some are; a topic already in the project stays marked «in project»
  and cannot be ticked, as today.

**A new message lights up its way.** When a message arrives, its topic's
row and every ancestor row light up briefly and fade, the way MQTT Viewer
does it. A folded branch shows that something below it is alive without
being opened; a branch that keeps lighting up is a busy one. A row already
lit starts its fade again rather than stacking.

**A pane for the topic in focus.** Beside the tree, the whole topic as a
path, its payload decoded (JSON indented, as in MQTT Viewer), retained or
live, and when it arrived. That is where a long name and a long payload
are read in full, instead of in a tooltip.

**Filter opens the tree.** The filter field matches topic and payload; the
tree shows only branches with a match, opened down to it. «Collapse all»
folds it back.

The designer has a topic tree already, in the topic picker of the property
panel (`buildTopicTree`, `components/property-panel/topic-selector.tsx`);
the dialog builds on it rather than on a second one.

**Never show a made-up value as if it were reported.** Where the broker
had nothing for a topic, the placed block shows the object's «no value
yet», not a sample. If the editor needs something to measure the width by,
it measures the sample but does not store it as the topic's example. Where
a value arrives live while the dialog is open, it counts as well as a
retained one.

**Read a sensor's type as Home Assistant does.** A sensor with a unit, a
`state_class` or a numeric `device_class` is a number; any other is text and
becomes a text in the block, typed `text`. The same rule for the
`readTopicEntry` type, so the topic list does not say «numeric» for an ID.

## Key Assumptions to Validate

- [ ] **Rajiva's state is not retained.** The MQTT Explorer screenshot
  shows `CamperServiceID/state = CamperVan_BiberTest` but not whether it is
  retained. Ask him, or check against the same configs in an e2e fixture.
  If it was retained, the «60» has another cause.
- [ ] **The tree stays quick on a full broker.** The user's broker has some
  2500 messages under a dozen roots, and the dialog keeps listening while
  open. Test: open it against that broker, count renders while values
  arrive, and keep counts and the lighting-up per row without redrawing
  the tree. `pkw` alone sends several messages a second; its rows may
  have to stay lit rather than flash.

## MVP Scope

In: the tree with counts, retained/live and payload preview; rows lighting
up on a new message, ancestors included; checkboxes on
branches; the detail pane; the filter over topic and payload; no sample
stored where nothing was heard; live values heard in the Block dialog
counted; Home Assistant's rule for numeric sensors. An e2e spec with
Rajiva's three configs (from the screenshot) as a fixture under
`e2e/fixtures/ha-discovery/`. The handbook page `designer/topics.md`.

## Not Doing (and Why)

- **A map for `device_tracker`** - Rajiva called it the «Königsklasse»
  himself. It stays «Not supported»; its coordinates as text could come
  later.
- **Brightness as percent** - his other question; it belongs to
  `docs/ideas/rechnen-in-combined-topics.md`.

- **The Topics list under Settings** - stays as it is (user, 2026-10-13);
  it holds the project's topics, not a whole broker.
- **MQTT Viewer's timeline, charts and publishing** - the dialog picks
  topics for a project; watching and sending stay with the tools made for
  it.

## Open Questions

- Which branch opens first? Perhaps the discovery prefix and `schaltli/`,
  since that is where blocks come from.
