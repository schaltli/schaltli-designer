# Plan: local-android

Spec: `docs/2026-10-13-local-topics.md` (decisions 2-6); device contract
§2.9. Module `local-android` of the capability map: the app keeps local
topics itself, like the boards since fw-2026.10.13.2. Never subscribed, a
write applied at once and never published, `initial` at start, and
`"local-topics"` declared in the DDF the app serves. Depends on
`local-contract` (done). After it: `local-demo`.

## Decisions taken here (to approve)

1. **The model knows them.** `Topic` gets `local: Boolean = false` and
   `initial: String? = null`. A pure helper `LocalTopics` (in `data/`,
   unit-tested) answers `isLocal(name)`, comparing without the `#path` and
   counting declared topics only, and `initialValues()`.
2. **The repository holds them, beside the broker's values.**
   `MqttRepository` gets `setLocalTopics(...)`, called whenever a project
   loads (at start and after a deploy). That call sets every local topic to
   its `initial`. The local values sit in a map of their own, and
   `topicValues` is the broker's map with the local values laid over it.
   A reconnect (`connect()` empties the broker's map) leaves the local
   values alone. Only a load resets them.
3. **One publish, two ways.** `MqttRepository.publish(topic, message)` sets
   a local topic's value at once and returns true, whether connected or
   not. A local write never reports «Not connected - nothing was sent»,
   because nothing has to be sent. Every other topic goes out as today.
   The switch, the button's send-mqtt, an energy node's action and the
   level drag all already go through `publish`, so this one change covers
   them. `schaltli/cmnd/theme` is no project topic and stays a publish.
4. **Nothing waits for an answer.** `noteAsked` ignores a local topic. A
   switch or level on one shows the new value straight away, without an
   «asked» marker.
5. **Never subscribed.** `wantedTopics()` leaves local topics out. Since a
   name that is not subscribed never arrives, nothing has to be dropped.
   The overlay of decision 2 still wins should one come anyway.
6. **The DDF says it.** `DdfBuilder` writes
   `"supportedFeatures": ["local-topics"]`. `SYSTEM_GENERATION` goes to
   **1.8**: the app already has the energy diagram (1.7), and with local
   topics it has all of the contract, like the 4.3B.
7. **Released separately.** The module ends with the app on the phone
   (HIL green), not with a release. Version 0.11.0 follows with your OK,
   and then the handbook's warning (`designer/topics.md`) names it.

## Tasks

- **A1 The HIL test first.** The Android fixture
  (`hil/android/fixtures/build-android-test.js`) gets a screen-9 before
  the navigator's screen. On it are `local/hil/view` (initial "b"), a
  button group writing it and a switcher reading it: panel «a» is a dark
  box, panel «b» a light one, on a mid-grey screen.
  `hil/android/orchestrator.js` checks it, not by comparison:
  1. the glass shows «b»;
  2. a tap on «a» shows «a» within a second;
  3. a listener on `#` heard nothing under `local/`;
  4. a retained «c» on the name changes nothing;
  5. after `am force-stop` and a start, «b» again.

  Red on v0.10.0.
- **A2 Model, repository, wiring.** Decisions 1-5: `ProjectModels.kt`,
  `data/LocalTopics.kt`, `MqttRepository.kt` and `MainActivity.kt`
  (`wantedTopics`, `setLocalTopics` on load). Unit test `LocalTopicsTest`
  for the name comparison and the initial values, plus a repository test
  for the overlay and for a reconnect not resetting it, if the client
  can be left out (otherwise in A1 only). Verify: unit tests and lint
  green, A1 checks 1-5 green on the phone.
- **A3 DDF and generation.** Decision 6: `DdfBuilder.kt`,
  `SystemGeneration.kt`, `DdfBuilderTest`. Verify: unit test reads the
  feature, and a Deploy plan against the phone (e2e `deploy-plan.spec.ts`
  already covers an app without the feature; add one with it) lets a
  project with local topics through.
- **Checkpoint:** the whole Android HIL (`hil/android/orchestrator.js`,
  all screens) and android-unit green; then test:all. You decide on the
  release (v0.11.0).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A write site that does not go through `MqttRepository.publish` | Med | grep shows four: the dispatcher's send-mqtt, the level drag, the theme switch and the deploy status. The last two are no project topics. A1 taps a button group. |
| The overlay of local values recomposes every screen on each local write | Low | local writes come from a tap, and a broker message today does the same |
| The fixture's new screen moves the navigator's run (eight entries → nine) | Low | screen-9 goes before screen-6, as 7 and 8 did; the drag already runs until the strip stops |
| The phone is not on the broker or not cabled | Low | the orchestrator already skips loudly (test-all) |
