# Todo: listen-viewer

Plan: `tasks/listen-viewer-plan.md`. Spec approved by the user 2026-10-14; run «bau durch».

- [x] V1 The viewer
  - components/listen-viewer.tsx, top-bar button with its dot, Settings button and components/mqtt-discovery-dialog.tsx gone; e2e/listen-viewer.spec.ts in place of e2e/mqtt-discovery.spec.ts (folded with counts, lit and fading, filter on path and payload, the pane and its messages, the local-topic warning, nothing to tick)
- [x] V2 Use as examples
  - same spec, with undo
- [x] V3 Connection settings and the pointer
  - restartListening() in lib/broker-store; a refused login shown from the listener (broker-store error); the pointer opens the Block menu by a window event. Same spec; broker-login, broker-url, demo-mode follow the button
- [x] V4 Handbook
  - handbuch/designer/topics.md «Was auf dem Broker los ist» (anchor kept), the local-topic line; handbuch/betrieb/verbindungen.md the login. Pictures: the Pages workflow photographs anew
- [x] Checkpoint: test:quick 2026-10-14: every device suite green; e2e 1568 passed, 1 red - broker-listener's switch-on test sent once before the listener had subscribed again; now sent until heard, green
