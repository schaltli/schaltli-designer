# Todo: broker-listener

Plan: `tasks/broker-listener-plan.md`. Spec approved by the user 2026-10-14; run «bau durch».

- [x] B1 One topic, pure
  - lib/heard-topic.ts; e2e/heard-topic.spec.ts. The old dialog keeps its own copy until listen-viewer replaces it
- [x] B2 The tree
  - lib/topic-tree.ts; the picker draws it; e2e/topic-tree.spec.ts, e2e/topic-selector.spec.ts green
- [x] B3 The store and the listener
  - lib/broker-store.ts, components/broker-listener.tsx, «Listening» in the status bar; e2e/broker-listener.spec.ts (own WebSocket aedes)
- [x] B4 Under load
  - same spec, @alone (214 ms among the parallel workers, under 200 alone)
- [x] B5 Handbook
  - handbuch/designer/topics.md «Topics vom Broker holen»: the background listening and «Listening»
- [x] Checkpoint: test:quick 2026-10-14: every device suite green; e2e 1562 passed, 1 failed - the load test among the workers, since @alone and green alone
