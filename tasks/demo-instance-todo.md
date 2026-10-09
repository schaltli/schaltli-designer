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
- [ ] With `x-schaltli-demo: 1` (dev) or `SCHALTLI_DEMO=1`: every refused
      route answers 403 «Not in the demo», every allowed one as usual.
- [ ] The header does nothing when `NODE_ENV=production`.
- [ ] Without either, every route as before.
- [ ] Every route handler refuses on its own too: called directly, past the
      middleware, a refused route is still 403.

**Verification:** `e2e/demo-mode.spec.ts` (API part).

**Scope:** M

## Task 4: Demo mode in the client

**Description:** decision 3.

**Acceptance criteria:**
- [ ] `/` opens «Camper» at once in demo mode.
- [ ] Save, Save As, Rename, Delete, Version History, Deploy, firmware, MQTT
      settings, «Add device from URL» absent; Download, Upload, Export,
      preview, Discover present.
- [ ] The notice with its handbook link.
- [ ] Outside demo mode nothing changes (the existing suite).

**Verification:** `e2e/demo-mode.spec.ts` (UI part, with
`extraHTTPHeaders`).

**Scope:** M

## Task 5: The demo van, stage one: light

**Description:** decision 6, `integrations/vanpi/demo-van.js` with a
`--broker` option, its seed (three dimmers, two relays) and its clock.

**Acceptance criteria:**
- [ ] Against the local broker: the dimmers and relays are announced under
      `homeassistant/…` and published under `schaltli/state/…`; no other
      kind is.
- [ ] `schaltli/cmnd/dimmer/1 60` and `schaltli/cmnd/relay/1 on` change the
      fake Pekaway and come back as their states.
- [ ] `schaltli/demo/daylight` runs through a day in ten minutes.
- [ ] A reset puts every light off.

**Verification:** `e2e/demo-van.spec.ts`.

**Scope:** M

## Task 6: «Your van»

**Description:** decision 8, a `DemoVanScene` component in the Projects
panel's place in demo mode.

**Acceptance criteria:**
- [ ] Demo mode: the left column shows the scene, collapsible; outside it
      the project list as before.
- [ ] A dimmer level on the broker lights its window in proportion; a relay
      lights the fairy light / the outside lamp.
- [ ] `daylight` 0 gives night (dark sky, moon, stars), 1 noon, between
      dawn and dusk.
- [ ] The line about the conversion in progress, linking the forum thread.

**Verification:** `e2e/demo-scene.spec.ts` (values published on the local
broker, pixels of the windows and the sky compared).

**Scope:** M

## Task 7: The start project «Camper»

**Description:** decision 7, built in the designer against the demo van,
saved to `deploy/demo/Camper.zip`.

**Acceptance criteria:**
- [ ] One screen «Licht»: three dimmers, two relays, names as live values,
      the theme switch; opens without warnings.
- [ ] Every bound topic is one the demo van publishes.
- [ ] In the preview against the demo van the lights answer, and the scene
      follows.

**Verification:** a spec that opens `deploy/demo/Camper.zip` and checks
its topics against the demo van's.

**Scope:** S

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
