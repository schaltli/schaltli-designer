# Plan: listen-viewer

Spec: `docs/2026-10-14-topic-discovery.md` (decisions 7-8), module
`listen-viewer`. «Listen to Broker» becomes a window for looking: the
broker as a tree, the topic in focus beside it, examples harvested. Last
of the five modules.

## Decisions taken here

1. **A new component, `components/listen-viewer.tsx`,** in place of
   `components/mqtt-discovery-dialog.tsx`, which goes, and with it its own
   subscription: the viewer shows `lib/broker-store`, what the background
   listener heard since the page opened.
2. **Opened from the top bar,** a button «Listen to Broker» before Help,
   its dot green while listening. Settings › Topics loses its button.
3. **Connection settings** stay in the viewer (not in the demo): WebSocket
   URL, Discovery prefix, Username, Password, «Connect». Connect stores the
   address and keeps the login as before (#67) and restarts the listener
   on it (`restartListening()` in the store), what was heard forgotten.
4. **The tree** is `lib/topic-tree.ts` over the heard topics, every branch
   folded on opening. A row lights when a message arrives below it and
   fades over 1.5 s: an overlay keyed by the newest arrival time under the
   row, so a new message starts the fade again. A topic that is also a
   branch is one row with a chevron.
5. **The pointer** counts devices announced under the discovery prefix
   (configs read with `expandConfig`, a device by its identifiers, else
   each config alone) and opens the Block menu through a window event the
   toolbar listens to.
6. **The pane:** path, retained/live, type, «in project»; the message in
   view (the latest at first; JSON indented) and its time; the kept
   messages newest first, ‹ › and a click to view one; for a project
   topic its examples and «Use as examples», which replaces them with the
   kept messages, without repeats, newest first - one undo step.
7. **The filter** «Filter topic or payload» matches the path or the latest
   payload and opens the tree to the matches; «Collapse all» folds it.

## Tasks

- **V1 The viewer.** Component, top-bar button, Settings button gone, the
  old dialog removed. Test: `e2e/mqtt-discovery.spec.ts` rewritten as
  `e2e/listen-viewer.spec.ts` on an own broker: folded on opening with the
  right counts; a message lights its row and its ancestors; filter «heat»
  opens to the matches in path and payload; a topic shows its latest
  value and its messages, ‹ › steps; no checkbox, no «Add Selected
  Topics»; the local-topic warning as before.
- **V2 Use as examples.** Test: on a project topic, the button replaces its
  examples with what was heard; undo puts them back.
- **V3 Connection settings and the pointer.** Test: the pointer counts the
  announced devices and opens the Block menu; Connect on another broker
  hears that one. The specs that opened the dialog through Settings
  (`broker-login`, `broker-url`, `demo-mode`) follow the button.
- **V4 Handbook.** `handbuch/designer/topics.md` «Topics vom Broker
  holen» rewritten for the viewer, `betrieb/verbindungen.md` and
  `betrieb/mqtt.md` where they name the old place.

## Checkpoint

`npm run test:quick` green; commits per task, pushed.
