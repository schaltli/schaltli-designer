# Demo instance (demo.schaltli.com)

Idea: docs/ideas/demo-instanz.md (agreed 2026-10-09). The demo comes before
the forum announcement. Spec written the same day, after the server was set
up (Infomaniak VPS Lite, Debian 13, 2 vCPU, 4 GB, 179.237.127.7, firewall
22/80/443, Node 22, Mosquitto 2.0.21 local only, Caddy 2.6.2 from Debian -
Caddy's own repository answers 402 now) and the A record for
demo.schaltli.com was in place.

Status: spec agreed 2026-10-09. Plan: tasks/demo-instance-plan.md.

## Who and what for

The demo van is **a conversion in progress** - a community project. Stage
one is light: a few dimmers and relays, a few MQTT messages, a few blocks.
Stage two, water, followed on 2026-10-10: fresh and grey water and a valve
for the grey. Solar, the battery, the heater come later as further stages, each one a reason
for a new forum post, and the forum may say what goes in next.

A Pekaway owner from the forum opens one link and, without installing
anything, designs a screen fed by a van like theirs. Success is that they
install Schaltli afterwards. Nothing they do is saved; «Download Project»
takes their screen with them, and «Upload Project» opens it on their own
Pekaway later.

## Capability map

| Module | What | Where |
|---|---|---|
| `demo-mode` | One switch, server and client: what is refused, what is hidden, the start project opens, the notice | designer |
| `demo-broker-url` | On an https page the broker is `wss://<host>/mqtt` | designer |
| `demo-van` | The bridge's function nodes outside Node-RED, over a fake Pekaway with the lights of stage one, and the van's clock | `integrations/vanpi/` |
| `demo-scene` | «Your van» where the Projects panel is: the van drawn, day and night, its windows lit by the dimmers | designer |
| `demo-project` | The start project «Camper» for the 4.3B: the light | repo, seeded on the server |
| `demo-phone` | A start page on small screens | designer |
| `demo-server` | Caddy, Mosquitto with its ACL, systemd units, a setup script run over SSH | `deploy/demo/` |

Build order: `demo-broker-url` → `demo-mode` → `demo-van` → `demo-scene`
→ `demo-project` → `demo-phone` → `demo-server` → live check →
announcement.

## Decisions

1. **Next.js to the newest 14.2.x first: 14.2.35.** It closes the middleware
   bypass (fixed from 14.2.25). The 14 line gets no more fixes, though:
   `npm audit` still lists some twenty advisories for 14.2.35, fixed only in
   15 or 16. Most concern what the designer does not use (image optimization
   - `images.unoptimized` is set -, server actions, Pages Router i18n,
   rewrites, CSP nonces); what remains is mostly denial of service through
   React Server Components. For a demo that saves nothing and holds no
   secret but the van's broker password, that is someone taking it down, not
   taking anything - accepted (2026-10-09), with decisions 2 and 10 as the
   guard. The move to Next.js 16 and React 19 is its own piece of work, not
   under the announcement's pressure (issue).

2. **Demo mode is decided per request, on the server, twice.** `middleware.ts`
   over `/api/*` asks `isDemo(request)`, and every route handler asks it
   again through the same `refuseInDemo(request)` before it does anything -
   so the guard does not hang on middleware, where half of the open
   advisories live. `isDemo` is true when `SCHALTLI_DEMO=1` in the
   server's environment, or - only when `NODE_ENV !== "production"` - when
   the request carries `x-schaltli-demo: 1`, which is how the e2e tests turn
   it on against the shared dev server without a second one. In demo mode
   only these pass; everything else is answered 403 «Not in the demo»:
   - `GET /api/projects`, `GET /api/projects/<name>` (the start project only
     exists there), `GET /api/projects/<name>/versions` (empty)
   - `GET /api/ddf/list`, `GET /api/ddf/data/*`, `GET /api/fonts/list`
   - `GET /api/version`, which also answers `demo: { start }` - the start
     project's name, from the server's `SCHALTLI_DEMO_START` («Camper» on
     the demo server, "Demo" without it), so the designer's own code names
     nothing of a van (e2e/no-van-words.spec.ts)

   Refused are every POST and DELETE (saving, versions, rename, deploys,
   firmware upload, DDF fetch by URL, recovery), `GET /api/deploy/*`,
   `GET /api/firmware/*`, `GET /api/translate` and `GET /api/by-instance/*`.

3. **The client asks the server**, via `/api/version`, rather than a
   build-time variable: one build serves both, and the tests can switch it.
   In demo mode:
   - `/` opens the start project at once (`/projects/<start>`), no gate;
   - the Projects panel shows «Your van» instead of the list (decision 8);
   - hidden: Save, Save As, Rename, Delete, Version History, Deploy to Device,
     firmware, the MQTT connection settings, «Add device from URL»;
   - kept: Download Project, Upload Project (opens a file in the browser
     without saving it), Export Project, the preview, Discover MQTT Topics;
   - a notice under the top bar: «Demo - nothing is saved. Download Project
     takes your screen with you.» with a link to the handbook's install page;
   - the leave warning stays: it tells a visitor their work goes.

4. **On an https page the broker is `wss://<host>/mqtt`.**
   `defaultWebsocketUrl()` keeps `ws://<host>:9001` on http (every Pekaway
   today) and uses `wss://<host>/mqtt` on https. A broker URL a user set by
   hand still wins. Caddy forwards `/mqtt` to Mosquitto's WebSocket
   listener on 127.0.0.1:9001.

5. **Mosquitto keeps visitors in check.** Listeners: 1883 and 9001
   (websockets) on 127.0.0.1 only. Anonymous clients - the visitors - may
   read `schaltli/#` (the van's clock is `schaltli/demo/#`) and
   `homeassistant/#` and write `schaltli/cmnd/#` and nothing else; the demo van has a user of its own with a password from
   the server's environment and may read and write all. `max_connections
   200`, `message_size_limit 4096`, no persistence: a restart is a clean van.

6. **The demo van runs the bridge itself - stage one: light.**
   `integrations/vanpi/demo-van.js` builds the flow with `buildBridgeFlow()`
   and runs its function nodes in Node, wired as the flow wires them, over
   one MQTT connection - the way e2e/vanpi-bridge.spec.ts already runs them.
   Where the flow talks to Pekaway, a fake Pekaway answers - for stage one
   only what a light needs:
   - `pkw/stat/dimmer` with three dimmers (Innenlicht, Küche, Einstieg) and
     `pkw/stat/relay` with two relays (Lichterkette, Aussenlicht), in
     Pekaway's format, as recorded in the van; every other kind gets no
     answer, so the bridge announces and publishes nothing for it;
   - `pkw/cmnd/dimmer/<n>/POWER` and `pkw/cmnd/relay/<n>/POWER` change its
     state;
   - stage two, water: `pkw/stat/level` with Frischwasser and Grauwasser in
     whole percent, and a third relay «Grauwasser ablassen». Fresh water is
     used at about 1 % a minute, grey water rises with it; an open valve
     empties the grey tank in under a minute; an empty fresh tank is filled
     again.

   Beside the bridge it keeps **the van's clock**: a day lasts ten minutes,
   published retained as `schaltli/demo/daylight` (0 night … 1 noon) every
   two seconds. Nothing in Pekaway's format; only the scene reads it.

   It goes back to its seed (all lights off) at 04:00 and after 60 minutes
   without a command. A systemd unit restarts it on failure. Later stages
   add kinds to the fake Pekaway; the bridge already knows them all.

7. **The start project «Camper»** for the 4.3B, built by
   `deploy/demo/camper-project.ts` from the device's own description, the
   way New Project builds one. Two pages and a master with the navigator:
   - **Licht:** Innenlicht on a dial, Einstieg on a slider, Küche,
     Lichterkette and Aussenlicht as switches («Aus»/«An»), every name a live
     value from Pekaway's names. The page's icon is a live icon on the
     combined topic `licht_an` (any of the five on): a burning bulb, else an
     unlit one - the project's own three icons.
   - **Wasser:** Frischwasser and Grauwasser as tanks, and «Grauwasser
     ablassen» («Zu»/«Offen») - named by what it does, not by the part
     (2026-10-10).

   Not kept as a file: the device's fonts make it 3 MB. e2e/demo-camper.spec.ts
   with `DEMO_SEED_DIR` writes it into a project store in the designer's
   format, which the server's setup copies over. (#56's start project for
   real installs grows from it.)

8. **«Your van» where the Projects panel is.** In demo mode the far-left
   column (`components/projects-panel.tsx`) shows a scene instead of the
   project list, about 300 px wide, collapsible to a strip as today:
   - an SVG drawing (`integrations/vanpi/demo-scene.js`): sky, a Fiat Ducato
     high-roof van side on, its windows, a fairy light along its side under
     the roof, a step light under the sliding door;
   - day and night from `schaltli/demo/daylight`: the sky from blue through
     orange to dark blue, sun and moon, stars at night;
   - the living-room and the sliding-door window lit warm in proportion to
     their dimmers (`schaltli/state/dimmer/<n>/level`), the third dimmer the
     step light and the ground it lights, the relays the fairy light and the
     lamp above the sliding door; a legend with Pekaway's names;
   - a line beneath: «This van is a conversion in progress. So far: light
     and water. Next: solar?» with a link to the forum thread.

   It listens to the broker like the preview, not to the preview: a light
   another visitor switches lights here too. The drawing is a plain flat
   illustration; a better one can replace it, the logic stays.

9. **Phones get a start page.** Below 900 px width or on a touch-only
   device, `/` shows «Schaltli is made for a computer» with a short video
   (once recorded), a link to the handbook and «Open anyway».

10. **The server is set up by a script, over SSH.** `deploy/demo/setup.sh`,
   idempotent, run from the PC with `ssh schaltli-demo 'bash -s'`: clone or
   update the designer at a given ref, `npm ci`, build, seed
   `.data/projects/Camper`, write `/etc/schaltli-demo.env`
   (`SCHALTLI_DEMO=1`, `SCHALTLI_DEMO_START=Camper`, the van's broker
   password), Mosquitto's config and
   ACL, the Caddyfile (`demo.schaltli.com`: `/mqtt` to 9001, everything
   else to 127.0.0.1:3000), systemd units for the designer and the van,
   then start them. Caddy fetches the certificate itself. Against the
   advisories decision 1 leaves open: request bodies above 64 KB refused
   at Caddy (the demo takes in nothing larger), the designer and the van
   restarted by systemd on failure (`Restart=always`), the designer's
   memory capped (`MemoryMax=1G`), so a request that blows it up costs a
   restart, not the server. Caddy 2.6 has no rate limiting of its own;
   connections per visitor are left to Mosquitto's `max_connections` and
   the kernel for now.

## What the code says

- `app/api/` routes and methods as listed in decision 2 (read 2026-10-09).
- `hooks/use-mqtt-connection.ts` `defaultWebsocketUrl()`: `ws://${host}:9001`.
- `NEXT_PUBLIC_DEPLOY_ENABLED` already hides deploy in the device chooser.
- `public/ddf/waveshare-touch-lcd-4v3b.ddf.zip` is served as a curated DDF.
- `integrations/vanpi/build-flow.js` exports `buildBridgeFlow`; the nodes
  `sbb-requests`, `sbb-values`, `sbb-commands`, `sbb-http-out`, … carry
  their logic inline; e2e/vanpi-bridge.spec.ts `nodeRedFunction()` runs
  them outside Node-RED.

## Testing

- `e2e/demo-mode.spec.ts`: with `x-schaltli-demo: 1` every refused route is
  403 and every allowed one answers; `/` opens «Camper»; Save and Deploy are
  absent, Download Project works; without the header nothing changes.
- `e2e/demo-van.spec.ts`: the van against the local broker announces the
  dimmers and relays (and nothing else), publishes their states, switches
  them on command, runs its clock, and returns to its seed on reset.
- `e2e/demo-scene.spec.ts`: in demo mode the left column shows the scene;
  a dimmer level on the broker lights its window; night darkens the sky.
- `e2e/broker-url.spec.ts` (or the existing MQTT spec): http keeps
  `ws://<host>:9001`, https gives `wss://<host>/mqtt`, a set URL wins.
- Live check on demo.schaltli.com before the announcement: two browsers,
  a phone, the refused routes from outside, the ACL with a foreign client.

## Later stages

Solar (the yield following the clock, 150 W at noon, 0 at night), the
battery, the heater with its timer popup, the MaxxFan turning on the
roof - each a kind added to the fake Pekaway, a part of the scene, a screen
in «Camper», and a forum post. Not specified yet.

## Not in this spec

Saving, a van per visitor, deploy to a visitor's device, analytics, a guided
tour (docs/ideas/demo-instanz.md, «Not Doing»). The video itself.
