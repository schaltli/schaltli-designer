# Plan: broker-listener

Spec: `docs/2026-10-14-topic-discovery.md` (decisions 1-3), module
`broker-listener`. The designer listens to its broker in the background and
keeps what it hears; one tree for every topic list. After
`no-made-up-values`; next: `topic-picker`, then `listen-viewer`.

## Decisions taken here

1. **What one topic keeps is pure:** `lib/heard-topic.ts` -
   `heardMessage(prev, payload, retained, at)` returns the topic's next
   state (latest, time, retained ever, count, the last 20 messages newest
   first, the guessed type with today's upgrade rule, a JSON topic's fields
   merged up to 10 kept examples). The rules move there from
   `components/mqtt-discovery-dialog.tsx` (`detectValueType`,
   `mergeJsonMessage`); the dialog uses them until `listen-viewer`
   replaces it.
2. **The store is one object per tab:** `lib/broker-store.ts` - a map of
   heard topics, a version, listeners told at most every 250 ms with the
   topics that changed since; `useHeardTopic(topic)` and
   `useHeardTopics()` read it through `useSyncExternalStore`. A guard of
   5 000 topics: past it a new topic is counted in `overflow`, not kept.
3. **One component owns the subscription:** `BrokerListener`, mounted
   once in the editor, connects with `useMqttConnection("schaltli-listen")`
   (the designer's broker and login, #67), subscribes `#` while the switch
   is on and the connection up, unsubscribes when it goes off, reconnects
   as the other users of the hook do. The store keeps what was heard when
   listening stops.
4. **The switch «Listening»** in the status bar, first of its switches,
   `localStorage` key `schaltli.listening`, on unless set to "false"
   (wrapped; works without storage).
5. **The tree:** `lib/topic-tree.ts` - `topicTree(items)` with each
   branch's topic and message counts, `searchTopicTree(tree, match)` for the
   pruned tree and the paths to open. The picker's private
   `buildTopicTree` is replaced by it with its look unchanged.

## Tasks

- **B1 One topic, pure.** `lib/heard-topic.ts`; the dialog uses it. Test:
  `e2e/heard-topic.spec.ts` (no page) - 25 messages keep 20 newest first;
  numeric then text is text; JSON wins; fields merged; retained stays.
- **B2 The tree.** `lib/topic-tree.ts`; the picker on it. Test:
  `e2e/topic-tree.spec.ts` (no page) - counts per branch, a topic that is
  also a branch, search on a fragment at any level opens down to it;
  `e2e/topic-selector.spec.ts` unchanged and green.
- **B3 The store and the listener.** `lib/broker-store.ts`,
  `components/broker-listener.tsx`, mounted in `project-editor.tsx`, the
  status-bar switch. Test: `e2e/broker-listener.spec.ts` on a private
  broker (aedes with WebSocket, its URL set for the page): a topic
  published after load is heard within a second with value, count,
  retained and type (read through a test hook on `window`, as other specs
  read editor state, or the viewer once it exists); switching off
  unsubscribes (the broker sees no subscription on `#` for the client)
  and keeps what was heard; the switch survives a reload.
- **B4 Under load.** In the same spec: 50 messages a second across 300
  topics for 30 s; a click on a screen object selects it within 200 ms.
- **B5 Handbook.** `handbuch/designer/topics.md`: the designer listens to
  the broker while it is open, the switch «Listening» turns it off.

## Checkpoint

`npm run test:quick` green; commits per task, pushed.
