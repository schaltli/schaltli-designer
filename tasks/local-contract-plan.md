# Plan: local-contract

Spec: `docs/2026-10-13-local-topics.md` (decisions 1-6). Module
`local-contract` of the capability map: local topics leave the designer for
a device - written down in the device contract, carried in the device zip
and the Android bundle, asked of a device by Deploy at generation 1.8.
Depends on `local-designer` (done 2026-10-13). After it: `local-firmware`
and `local-android`, side by side.

## Decisions taken here (to approve)

1. **The export carries the declaration as it is.** A topic in `topics[]`
   keeps `local: true` and, where it has one, `initial` (a string, as
   every value). Nothing else changes: an object reads and writes a local
   topic by its name, as any topic. `exportedTopics` already copies the
   project's topics; a topic it adds for a reference nobody declared is
   never local.
2. **Contract §2.9 «Local topics»**, beside the other generations, says
   what a device does: never subscribe a local topic, never publish a
   write to one; a write is its value at once, as if it had arrived
   (combined topics worked out again, readers drawn again); every local
   topic starts at `initial` at boot and after a deploy, without one it
   has no value; the value is never kept across a restart. A name is
   compared without its `#path`. §4 (MQTT) gets one line pointing there:
   a local topic is never on the broker.
3. **A feature in the DDF, not a generation** (changed with the user
   2026-10-13, «Ja»: the knob announces 1.4 and the PaperS3 1.6, so a 1.8
   gate would shut them out for good). A DDF lists what its firmware
   can do beyond object types in `supportedFeatures`; a firmware that
   keeps local topics lists `"local-topics"`. A device without it ignores
   the two fields: it would subscribe the topic and publish its writes -
   shared among all displays, the very thing a local topic is not.
   Generation 1.8 (`LOCAL_TOPIC_GENERATION`) names the contract's state
   for a device that has all of it, as 1.7 does for the energy diagram.
4. **Deploy asks the feature of a device for any declared local topic**,
   used or not, and names them: «local topics (local/energie/view)». As
   for an object type the device's own DDF does not list
   (`lib/deploy-plan.ts`): where the designer's copy of the device's DDF
   (the release's) lists it, the board is brought up to the release
   first; else refused with the reason; an app is asked to update.
   Unused ones are «Remove unused topics»'s to clear.
5. **The mock host and the HIL tooling leave local topics alone**: a mock
   answers commands on the broker, and a local topic is never there.
   (`lib/mock-engine.js` reads `topics[].mock`, which a local topic does
   not have; checked in C4, changed only where something subscribes or
   publishes by the topic list.)

## Tasks

- **C1 Contract §2.9, `supportedFeatures`, generation 1.8.** The section
  in `docs/device-contract.md` with an example (`topics[]` with a local
  topic, a switch writing it, a switcher reading it); `supportedFeatures`
  in §1; the line in §4; `LOCAL_TOPIC_GENERATION`; the DDF reader keeps
  `supportedFeatures` (`lib/device-description.ts`) and a project keeps
  its copy in its settings beside `supportedObjectTypes`.
  Files: `docs/device-contract.md`, `lib/system-generation.ts`,
  `lib/device-description.ts`, `lib/project-device.ts`,
  `components/project-editor.tsx`.
- **C2 Into the device zip and the Android bundle.** Test: an e2e builds
  both from a project with a local topic (with and without `initial`)
  and a text referencing an undeclared `local/x`: the zip's and the
  bundle's `topics[]` carry `local` and `initial` exactly, the undeclared
  one carries neither. Code only if the test shows a field dropped.
  Files: `e2e/local-topics.spec.ts`, maybe `lib/project-zip.ts`,
  `lib/android-export.ts`.
- **C3 Deploy.** `planDeploy` takes the features a project needs that
  the device's DDF lacks, beside the types, and the release's
  (`project.settings.supportedFeatures`); the dialog feeds it
  «local topics (…)» from the declared local topics. Test: e2e on
  `planDeploy` as the energy diagram's type gate - a board whose DDF
  lacks the feature with a release listing it is updated first, without
  one refused naming the topics; an app asked to update; a device
  listing it deploys at once.
  Files: `lib/local-topics.ts`, `lib/deploy-plan.ts`,
  `components/deploy-dialog.tsx`, `e2e/deploy-plan.spec.ts`.
- **C4 Mock host and HIL tooling.** Grep `hil/` and `lib/mock-engine.js`
  for everything that subscribes or publishes by `topics[]`; leave local
  topics out where one does. Test: the mock-engine spec with a local
  topic - nothing answers on it, nothing subscribed.
  Files: `lib/mock-engine.js`, `hil/simulate-project.js`,
  `e2e/mock-engine.spec.ts`.
- **C5 Handbook.** `handbuch/designer/topics.md`, the warning: what Deploy
  does with an older board or app (as the energy diagram's box says it),
  through maettel-humanizer.
- **Checkpoint:** the e2e specs touched green, tsc clean; the user has
  read §2.9.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Until a firmware listing `local-topics` is released, a project with a local topic cannot go to a board at all | Med - the demo's switch waits for it | the demo in the browser needs no device; the release follows `local-firmware` |
| A field dropped on the way (Android's bundle builds its own topic list) | Med | C2's test reads both outputs, not the function |
| The mock host subscribing by the topic list and answering a local topic | Low | C4 |
