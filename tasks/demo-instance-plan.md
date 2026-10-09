# Implementation plan: demo instance (`demo-instance`)

Spec: `docs/2026-10-09-demo-instance.md` (agreed 2026-10-09). Tasks:
`tasks/demo-instance-todo.md`. Idea: `docs/ideas/demo-instanz.md`. Chat
German, docs English.

## Overview

demo.schaltli.com: the designer in a demo mode that saves nothing, a
simulated van running the real bridge logic, the start project «Camper»
opening at once, and «Your van» drawn where the project list is. The van
is a conversion in progress: stage one is light. Live before the forum
announcement.

## Order

1. Next.js to the newest 14.2.x, test:all.
2. The broker URL on https.
3. Demo mode: server (middleware), then client.
4. The demo van, stage one: light.
5. «Your van», the scene.
6. The start project «Camper».
7. The phone start page.
8. The server: setup script, Caddy, Mosquitto, units.
9. Live check, handbook link, announcement.

Each task ends with its test green; the whole suite after tasks 1, 4 and 9.

## Risks

- Next 14.2.x update breaks something: test:all catches it; it goes in on
  its own commit.
- The bridge's function nodes assume Node-RED details the shim lacks
  (`node.send` from timers, context, the HTTP node): the van's spec runs
  the real flow, so a gap shows there first.
- Visitors on phones: the start page; checked live.
