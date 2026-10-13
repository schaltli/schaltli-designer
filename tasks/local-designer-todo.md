# Todo: local-designer

Plan: `tasks/local-designer-plan.md`. Approved by the user 2026-10-13
(«Ja»), with the list «Local topics» of its own asked for first. Run:
/build auto; no push, no release, demo and van untouched; a push on halt
or finish.

- [x] L1 The core
  - `local`, `initial` on Topic; lib/local-topics.ts `isLocalTopic`, `localInitialValues`; projectSubscriptionTopics leaves local topics out
  - e2e/local-topics.spec.ts «local topics: the core»
- [x] L2 The preview, Simulation and Live
  - `localValues` in project-editor.tsx, seeded from `initial` on entering the preview; handlePreviewPublish sets it with a toast «→ Local»; no asked marker for a local topic; a broker message under a local name dropped; previewTopics and liveValuesWithTheme read it; the Topic Values panel shows «local» and edits it in Live too
  - e2e/live-preview.spec.ts «local topics in the preview» (the switch fixture, put there for its pixel helpers)
- [x] L3 The list «Local topics»
  - components/local-topics-section.tsx below «Combined topics»: «Add local topic» (`local/topicN`), name (no spaces, # or +, not another topic's), type text/numeric, «Initial value» (also the topic's example, for the editor's canvas), Delete; «Topics» lists the others only
  - e2e/local-topics.spec.ts «local topics: the list»
- [ ] L4 Discover
- [ ] L5 Handbook
- [ ] Checkpoint: test:all green; the user tries a local switch in the preview
