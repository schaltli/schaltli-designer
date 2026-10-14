# Plan: connections (issue #70, with #67 and #68)

Plan as artifact: https://claude.ai/artifact/ErbaU97EA9crsfHdBcWKk4

Every device talks only to the broker. rajiva's question in the forum
(«warum macht Du auf dem Tablet überhaupt einen Server Socket auf?»): the
description goes over the broker, the broker's rules apply to everything,
in normal operation no device has a server open. No TLS for now (the
user, 2026-10-14).

## Decisions

1. **The description on request, then retained.** A device publishes its
   DDF zip to `schaltli/<id>/ddf` (retained) when asked on
   `schaltli/<id>/ddf/get`. `ddfHash` stays in `hello`; `url` goes.
2. **The browser fetches, the server stores.** The browser subscribes to
   the one device's `ddf` topic when it lacks the hash, asks if missing or
   stale, and posts the bytes to `/api/ddf/upload` (same parse and checks
   as `/api/ddf/fetch`). The server keeps no MQTT connection.
3. **Boards stream from flash** (`DDF_ZIP`, 290-325 KB) through
   PubSubClient's `beginPublish`/`write`/`endPublish`; the 1 KB buffer stays.
4. **The recovery project the same way:** `schaltli/<id>/recovery/get`,
   answered on `schaltli/<id>/recovery`, not retained.
5. **Older devices still work:** a `hello` with `url` falls back to the
   HTTP fetch, until a later release removes it. A new system generation
   marks the change.
6. **The app re-announces on any network** (WLAN, Ethernet, USB).
7. **One broker login** (#67) stored by the designer, handed to the
   browser; every MQTT hook uses it.
8. **The address devices use for the designer** can be set; empty means
   detected.
9. **No fake `mqtts://`** in the setup portal.
10. **The test interface is off from the factory**, switched on in the
    setup portal's device tab with a password, kept across restarts; HIL
    sends `HIL_PASSWORD` from `.env.local`. Test boards are switched on by
    a file HIL writes through the still-open interface before the first
    flash with C9; the firmware takes it over once and deletes it.
11. **The app gets the same test interface** behind the same switch
    (own-window picture, taps, topic values, debug); adb only installs.

## Tasks

Phase 1: C1 app on any network · C2 contract · C3 designer reads over the
broker (+#68) · C4 boards answer · C5 app answers · checkpoint: test:all,
firmware release, app v0.12.0.

Phase 2: C6 one broker login (#67) · C7 designer address settable · C8 no
mqtts:// · checkpoint: test:quick.

Phase 3: C9 boards' test interface off + password · C10 the app's test
interface · C11 handbook · checkpoint: test:all, releases, issues closed,
forum draft for the user.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A broker refuses 300 KB | Med | check the van's Mosquitto; readable message |
| Something subscribes to `#` | Low | only on request; check Node-RED |
| A board stalls while streaming | Low | about a second, only when asked |
| Older devices in the field | Med | HTTP fallback while `hello` has `url` |
| The app's own picture differs from screencap | Med | compare once |
