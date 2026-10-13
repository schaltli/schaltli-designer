# Plan: local-firmware

Spec: `docs/2026-10-13-local-topics.md` (decisions 2-6); device contract
§2.9. Module `local-firmware` of the capability map: the knob, the 4.3B
and the PaperS3 keep local topics themselves - never subscribed, a write
applied at once and never published, `initial` at start - and declare
`"local-topics"` in their DDFs. Depends on `local-contract` (done
2026-10-13). Side by side with `local-android`; after both: `local-demo`.

## Decisions taken here (to approve)

1. **The loader knows them.** `MQTTTopic` gets `local` and `initial`
   (`ProjectLoader::parseTopics`); right after a project is loaded - at
   boot and after a deploy - every local topic with an `initial` has it as
   its value, as if it had arrived. `ProjectLoader::isLocalTopic(name)`
   compares the name without its `#path`, and only declared topics count.
2. **One write per board, one apply.** Each board gets
   `writeProjectTopic(topic, payload)`: a local topic goes to
   `applyTopicValue(topic, payload)`, any other to `mqttClient.publish`.
   Every site that publishes a project's topic goes through it: a
   switch, a button group, a button's send-mqtt action (an energy node's
   and a hardware button's are the same action), a level being dragged
   or adjusted by the knob's ring. `applyTopicValue` is what a message
   arriving does today - the knob's `onMqttMessage` body, the 4.3B's and
   the PaperS3's callback lambdas, made functions - so a local write
   redraws exactly as an arriving value does (partial redraw, combined
   topics, switchers). The theme command (`schaltli/cmnd/theme`) is no
   project topic and stays a publish.
3. **Nothing waits for an answer.** A switch on a local topic is not left
   pending (its value is there at once), and a level on one sets no
   «asked» marker.
4. **Never subscribed, never heard.** The subscription lists leave local
   topics out (the 4.3B and the PaperS3 subscribe `topics[]`, the knob
   what its objects read), and a message that still comes under a local
   name - a subscription from the project before - is dropped.
5. **The DDFs say it.** `ddf-source*/device.json` of all three list
   `"supportedFeatures": ["local-topics"]`; the designer's copies in
   `public/ddf` follow (`generate-ddf-header.js`). The 4.3B, which has
   every part of the contract, announces generation **1.8**; the knob
   stays at 1.4, the PaperS3 at 1.6.
6. **Released separately.** The module ends with a firmware build on the
   three boards, not a release; the release follows with your OK, and the
   handbook's warning names it then.

## Tasks

- **F1 The HIL test first: `hil/local-topics.js`.** For one board: a
  project with `local/<run>/view` (`initial` "a"), a button group writing
  it and a switcher reading it - panel «a» a box in one colour, panel «b»
  in another. Checks: (1) after install the glass shows «a»; (2) a tap on
  «b» shows «b» within a second, and `/api/topic-values` says "b"; (3) a
  listener on `#` heard nothing under the run's prefix; (4) a retained
  message «b» on the same name from the broker changes nothing
  (published while showing «a»); (5) after a restart (`?set=latewifi=1`)
  «a» again. And `--pair <ip>`: the same project on a second board, a tap
  on one, the other stays. In `hil/test-all.js` for all three and the
  knob/4.3B pair. Red on today's firmware.
- **F2 The loader and the DDFs.** Decisions 1 and 5. Verify: the three
  envs build, native tests, the designer's DDF freshness check, `public/ddf`
  copies list the feature (e2e: `fieldsOf` on the shipped DDFs).
- **F3 The knob.** Decisions 2-4 in `src/main.cpp`. Verify: F1 on the
  knob green; the knob's HIL suite (waveshare) green.
- **F4 The 4.3B.** The same in `src/boards/waveshare4v3b/main.cpp`.
  Verify: F1 on the 4.3B and the pair green; the 4.3B suites green.
- **F5 The PaperS3.** The same in `src/boards/papers3/main.cpp`. Verify:
  F1 on the PaperS3 green (its redraw is full-screen; the checks compare
  panels, not regions).
- **Checkpoint:** test:all (all three boards flashed by USB); then you
  decide on the release.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The designer's DDF copies list the feature before a release does: Deploy would install the old release and send local topics to a board that does not know them | Med | only the user deploys meanwhile; the release follows the checkpoint, and until then no project of the user's has a local topic |
| A publish site missed (four per board, plus device actions) | Med | F3-F5 grep every `mqttClient.publish` with a project topic; F1 taps a button group, the energy-node and send-mqtt paths share the action code |
| Applying from inside a touch handler where today only the MQTT loop applies (re-entrancy, a redraw mid-touch) | Med | `applyTopicValue` only records and sets the redraw flag, as the MQTT path does; the loop draws |
| The knob's subscription walk misses a nested reference and subscribes a local topic | Low | it subscribes by name; the filter is on the name, after the walk |
