# Todo: local-android

Plan: `tasks/local-android-plan.md`. Approved by the user 2026-10-13
(«ja»), after reading it as an artifact. App v0.10.0 (energy diagram) was
released just before; no release in this module.

- [x] A1 The HIL test first: screen-9 in the Android fixture, orchestrator checks 1-5
  - hil/android/orchestrator.js checkLocalTopics, plus check 6: the app's DDF lists local-topics (hil/android/ddf-fonts.js passes supportedFeatures on)
  - the panels hold texts with a background, not boxes: the app draws no box, and the export bakes none inside a switcher's panel (a gap of its own, to report); the app fills a text's background to its line only, so the check reads near the panel's top
  - red on v0.10.0: the tap went over the broker («a» heard), no initial value
- [x] A2 Model, repository, wiring
  - Topic.local/initial, data/LocalTopics.kt; MqttRepository.setLocalTopics (start and every install, keyed on the installation), publish applies a local write, noteAsked ignores one, connect keeps local values; wantedTopics without local topics
  - LocalTopicsTest 3/3; the Android HIL 6/6 on screen-9, every other screen green
- [x] A3 DDF and generation
  - DdfBuilder supportedFeatures ["local-topics"], SYSTEM_GENERATION 1.8; DdfBuilderTest; the HIL's check 6 reads it from the phone
- [x] Checkpoint: Android HIL and android-unit green, test:quick green; released with android-draws-all as v0.11.0 (the user's go for the autonomous run)
