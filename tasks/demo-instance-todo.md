# Tasks: demo instance (`demo-instance`)

Plan: `tasks/demo-instance-plan.md` · Spec: `docs/2026-10-09-demo-instance.md`.
Chat German, docs English.

## Task 1: Next.js to the newest 14.2.x

**Description:** decision 1. Only Next (and `eslint-config-next` if pinned
with it); no other upgrades in this commit.

**Acceptance criteria:**
- [x] `next` at 14.2.35, the newest 14.2.x (2026-10-09); the middleware
      bypass is closed. Some twenty advisories stay open in the 14 line,
      accepted for the demo (spec decision 1); Next.js 16 is issue #61.
- [ ] `npm run test:all` green (or only the known load-flaky tests, run
      alone green).

**Scope:** S

## Task 2: The broker URL on https

**Description:** decision 4, `hooks/use-mqtt-connection.ts`.

**Acceptance criteria:**
- [x] http: `ws://<host>:9001`, as before.
- [x] https: `wss://<host>/mqtt`.
- [x] A URL set in the MQTT dialog still wins (e2e/mqtt-connection.spec.ts).

Done 2026-10-09: `lib/broker-url.ts` `defaultBrokerUrl()`, used by the hook.

**Verification:** `e2e/broker-url.spec.ts`.

**Scope:** XS

## Task 3: Demo mode on the server

**Description:** decision 2. `lib/demo-mode.ts` (`isDemo`, the allow-list,
`refuseInDemo`), `middleware.ts` over `/api/*`, the same check at the top
of every route handler, `demo: true` in `/api/version`.

**Acceptance criteria:**
- [x] With `x-schaltli-demo: 1` (dev) or `SCHALTLI_DEMO=1`: every refused
      route answers 403 «Not in the demo», every allowed one as usual.
- [x] The header does nothing when `NODE_ENV=production` (in `isDemo`; seen
      on the server in Task 9).
- [x] Without either, every route as before (154 API and project specs green).
- [x] Every route handler refuses on its own too: called directly, past the
      middleware, a refused route is still 403.

Done 2026-10-09: `lib/demo-mode.ts`, `middleware.ts`, `refuseInDemo` at the
top of all 23 handlers, `demo: true` in `/api/version`.

**Verification:** `e2e/demo-mode.spec.ts` (API part).

**Scope:** M

## Task 4: Demo mode in the client

**Description:** decision 3.

**Acceptance criteria:**
- [x] `/` opens the start project at once in demo mode (its name from the
      server's `SCHALTLI_DEMO_START`, not from the designer's code).
- [x] Save, Save As, Version History, Deploy, the Projects panel (with its
      rename and delete), MQTT connection settings, «Add device from URL»
      absent; Download, Upload, Export, New Project, preview, Discover present;
      Ctrl+S says the demo saves nothing.
- [x] The notice with its link to the handbook's install page.
- [x] Outside demo mode nothing changes: the whole e2e suite 1367 passed, the
      one failure (no-van-words, the start project's name in the code) fixed.

Done 2026-10-09.

**Verification:** `e2e/demo-mode.spec.ts` (UI part, with
`extraHTTPHeaders`).

**Scope:** M

## Task 5: The demo van, stage one: light

**Description:** decision 6, `integrations/vanpi/demo-van.js` with a
`--broker` option, its seed (three dimmers, two relays) and its clock.

**Acceptance criteria:**
- [x] Against the local broker: the dimmers and relays are announced under
      `homeassistant/…` (and the bridge's theme switch) and published under
      `schaltli/state/…`; no other kind is.
- [x] `schaltli/cmnd/dimmer/2 60` and `schaltli/cmnd/relay/1 on` change the
      fake Pekaway and come back as their states.
- [x] `schaltli/demo/daylight` and `schaltli/demo/time` run through a day in
      ten minutes.
- [x] A reset puts every light off.

Done 2026-10-10. The flow's nodes run as Node-RED would: function nodes
with their context and flow context, the inject interval, the delay, MQTT in
and out; the HTTP node answers «not in this van». The spec clears exactly
what the van published retained.

**Verification:** `e2e/demo-van.spec.ts`.

**Scope:** M

## Task 6: «Your van»

**Description:** decision 8, a `DemoVanScene` component in the Projects
panel's place in demo mode.

**Acceptance criteria:**
- [x] Demo mode: the left column shows the scene, collapsible, in the
      preview too; outside it the project list as before.
- [x] A dimmer level on the broker lights its window in proportion; a relay
      lights the fairy light / the outside lamp.
- [x] `daylight` 0 gives night (dark sky, moon, stars), 1 noon, between
      dawn and dusk.
- [x] The line about the conversion in progress, linking the forum (the
      announcement's thread once it exists, Task 10).

Done 2026-10-10. The drawing was agreed with the user on three drafts: a
Fiat Ducato high-roof van after a reference picture, the fairy light along
its side under the roof, no awning; the third dimmer is «Einstieg», a step
light under the sliding door. Drawn in `integrations/vanpi/demo-scene.js`,
beside the demo van - the designer's own code names nothing of a van
(no-van-words) and only shows `sceneSvg()` (`components/demo-scene-panel.tsx`).
The scene tests sit in `e2e/demo-van.spec.ts`, beside the van's: both use the
same topics on the broker and must not run at once.

**Verification:** `e2e/demo-scene.spec.ts` (values published on the local
broker, pixels of the windows and the sky compared).

**Scope:** M

## Task 7: The start project «Camper», and stage two: water

**Description:** decision 7, `deploy/demo/camper-project.ts`; the demo van's
stage two (decision 6).

**Acceptance criteria:**
- [x] Licht: Innenlicht dial, Einstieg slider, Küche / Lichterkette /
      Aussenlicht switches, names as live values; the page icon burns while
      any light does (combined topic `licht_an`, live icon).
- [x] Wasser: two tanks and «Grauwasser ablassen» («Zu»/«Offen»).
- [x] The navigator on the master.
- [x] Every bound topic is one the demo van publishes, every written one a
      command the bridge takes, all declared.
- [x] In the preview against the demo van the lights and the drain answer,
      the tanks move, the scene follows (seen 2026-10-10, pictures to the user).

Done 2026-10-10. The demo van grew stage two: two tanks and the drain relay.

**Verification:** `e2e/demo-camper.spec.ts` (topics, pages, written into a
project store and read back); `e2e/demo-van.spec.ts` (the water).

**Scope:** M

## Task 8: The phone start page

**Description:** decision 9.

**Acceptance criteria:**
- [ ] Below 900 px or touch-only: the start page; «Open anyway» opens the
      project.
- [ ] Desktop: straight into the project.

**Verification:** `e2e/demo-mode.spec.ts` with a phone viewport.

**Scope:** S

## Task 9: The server

**Description:** decision 10, `deploy/demo/setup.sh`, `Caddyfile`,
`mosquitto.conf`, `acl`, the systemd units, run over SSH
(`ssh schaltli-demo 'bash -s' < deploy/demo/setup.sh`).

**Acceptance criteria:**
- [ ] https://demo.schaltli.com opens «Camper» with a valid certificate.
- [ ] The preview and «Your van» are live against the demo van over
      `wss://…/mqtt`.
- [ ] From outside: a refused route is 403; a foreign MQTT client cannot
      publish on `schaltli/state/#`; only 22, 80, 443 open.
- [ ] Rerunning the script changes nothing; a reboot brings it all back.

**Verification:** a check script (`deploy/demo/check.js`) run from the PC,
kept for every later update.

**Scope:** M

## Task 10: Live check, handbook, announcement

**Acceptance criteria:**
- [ ] Two browsers at once, a phone, the check script green.
- [ ] Handbook start page: «Ausprobieren: demo.schaltli.com».
- [ ] The announcement links the demo.

**Scope:** S
