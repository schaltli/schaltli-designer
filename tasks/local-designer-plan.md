# Plan: local-designer

Spec: `docs/2026-10-13-local-topics.md` (decisions 1-5, 7). Module
`local-designer` of the capability map: the designer knows local topics -
declared with `local: true` and `initial`, kept by the preview in
Simulation and in Live, never published, never subscribed. No device
export yet (that is `local-contract`). Side by side with `energy-nested`;
after it: `local-contract`.

## Decisions taken here (to approve)

1. **Two optional fields on `Topic`** (`components/project-editor.tsx`):
   `local?: boolean`, `initial?: string`. Absent means a normal topic, so
   every saved project stays as it is.
2. **One question, one place:** `isLocalTopic(topics, name)` in a new
   `lib/local-topics.ts`, `#path` stripped before the lookup, a topic not
   declared is never local. Every place that publishes or subscribes asks
   it; nothing else changes how values are keyed.
3. **The preview keeps one map of local values** (`localValues`), seeded
   from `initial` when the preview opens and when a local topic is added
   or its `initial` changed. Simulation and Live both read it over their
   own values, so the picture is the same in both. A tap on a local
   topic writes it there - with a toast «Local» instead of «Published» -
   and nothing goes to the broker or the mock engine.
4. **A message from the broker under a local topic's name is dropped**
   (decision 4: the display does not hear it).
5. **Until `local-contract`, Deploy says nothing new**: an old board
   would publish a local write, but no device has 1.8 yet and the module
   after this one adds the check. The handbook says so meanwhile.

## Tasks

- **L1 The core.** `local`, `initial` on `Topic`; `lib/local-topics.ts`
  with `isLocalTopic`, `localInitialValues(topics)`;
  `projectSubscriptionTopics` and `previewHeardTopics` leave local topics
  out. Test: e2e on the functions (subscriptions without a local topic,
  `#path` on a local topic, an undeclared name not local).
  Files: `components/project-editor.tsx` (type), `lib/local-topics.ts`,
  `lib/render-screen.ts`, `e2e/local-topics.spec.ts`.
- **L2 The preview, Simulation and Live.** `localValues` in the editor,
  `handlePreviewPublish` and the level path write it for a local topic,
  the canvas and the Topic Values panel read it over the other values,
  a broker message on a local name is dropped. Test: e2e - a Switch on a
  local topic flips a Switcher in Simulation and in Live; the mock broker
  listening on `#` hears nothing of it; a real message on the same name
  changes nothing; reload starts at `initial`.
  Files: `components/project-editor.tsx`, `components/topic-values-panel.tsx`,
  `e2e/local-topics.spec.ts`.
- **L3 The list «Local topics».** A section of its own in the project
  settings, below «Combined topics» and built like it
  (`components/local-topics-section.tsx`), with «Add local topic»: name
  (suggested `local/`), type (numeric or text), «Initial value»; edit and
  delete as there. The list «Topics» leaves local ones out; the data stays
  in `topics[]` with `local: true`, so the topic pickers offer them. Test:
  e2e add, edit, delete, not in «Topics», offered in a Switch's topic
  picker, saved in the project.
  Files: `components/local-topics-section.tsx`,
  `components/project-settings-dialog.tsx`, `e2e/local-topics.spec.ts`.
- **L4 Discover.** «Discover MQTT Topics» does not offer to add a name a
  local topic has, and warns «… is a local topic here; the broker's
  messages under this name do not reach the display». Test: e2e with the
  mock broker carrying such a topic.
  Files: `components/mqtt-discovery-dialog.tsx`, `e2e/local-topics.spec.ts`.
- **L5 Handbook.** A section on local topics where topics are declared
  (`handbuch/designer/projekte.md` or `objekte.md`, whichever explains
  «Add Topic»), through maettel-humanizer; it says that the devices come
  with the next release. Labels in `<span class="ui">`.
- **Checkpoint:** test:all green; the user tries a local switch in the
  preview.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A publish path that bypasses `handlePreviewPublish` (level drags, popup buttons, energy node actions) | Med | L2 greps every `client.publish` in components/ and routes or guards each |
| `localValues` and previewTopicValues disagreeing in the Topic Values panel | Low | one merged map for canvas and panel, as liveValues already is |
