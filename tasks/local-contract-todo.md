# Todo: local-contract

Plan: `tasks/local-contract-plan.md`. Approved by the user 2026-10-13
(«Freigabe ok»), after reading it as an artifact. Run: /build auto; no
push, no release, demo and van untouched.

- [x] C1 Contract §2.9, `supportedFeatures`, generation 1.8
  - changed with the user before building («Ja»): a feature in the DDF, not a generation - the knob announces 1.4, the PaperS3 1.6; spec decision 6 and the plan's decisions 3, 4, C1, C3 rewritten
  - device-contract §1 (`supportedFeatures?[]`), §2.9, a line in §4; `LOCAL_TOPIC_GENERATION`; `supportedFeatures` read from the DDF and kept in ProjectSettings
  - e2e/local-topics.spec.ts «local topics: the device's feature»
- [x] C2 Into the device zip and the Android bundle
  - no code: exportedTopics copies the declaration; e2e/local-topics.spec.ts «local topics: into the export» reads both outputs
- [x] C3 Deploy
  - planDeploy takes `unsupportedFeatures` and `releaseFeatures` beside the types; `localTopicsFeature` in lib/local-topics.ts; the dialog reads the device's live DDF features
  - e2e/deploy-plan.spec.ts «local topics: a board without the feature …»; e2e/local-topics.spec.ts «Deploy asks the feature …»
- [ ] C4 Mock host and HIL tooling
- [ ] C5 Handbook
- [ ] Checkpoint: the e2e specs touched green, tsc clean; the user has read §2.9
