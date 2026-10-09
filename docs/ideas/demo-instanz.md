# Schaltli demo in the browser

Idea refined with the user on 2026-10-09, ahead of the forum announcement:
one click from the announcement and an interested Pekaway owner is in the
designer, with a finished camper project and a simulated van to play with.
Prompted by the forum thread on CamperUI (forum.pekaway.de, topic 2732),
where trying a display means setting up the Arduino IDE.

Status: idea agreed; spec docs/2026-10-09-demo-instance.md. The demo comes **before** the announcement.

## Problem Statement

How might a Pekaway owner from the forum experience, in under a minute and
without installing anything, that they can design their own display - fed by
the values of *their* van?

## Recommended Direction

`demo.schaltli.com` runs the designer in a **demo mode** on a small server.
Whoever opens the link lands in the start project, a finished camper screen.
Beside it runs a **simulated van**: a small process imitates Pekaway's values
(tanks, battery, relays, dimmers, heater, MaxxFan), and the real
`integrations/vanpi/bridge-logic.js` turns them into blocks, values and
answers to commands. The block menu shows the same blocks as in a real van;
in the preview the light switches and the tank goes down.

**Nothing is saved.** The server hands out the start project and the device
descriptions and takes nothing in. Everything that acts outward is off in
demo mode: saving, deploy, firmware, adding a device by URL, translation.
What a visitor has built leaves with «Download Project» - entirely in the
browser - and opens with «Upload Project» on their own Pekaway after the
install. That is the bridge to what counts as success: people install.

The start project is built for the demo and then ships with new installs
too (#56).

Who it is for: Pekaway owners in the forum - they have a VanPi, know Node-RED
partly or not at all, and want a display. Success: they install Schaltli
afterwards.

## Key Assumptions to Validate

- [ ] **Visitors open the link on a computer.** Forums are read on phones,
      and the designer is built for a mouse and a large screen. *Test:* open
      the designer on a phone. On small screens a start page with a short
      video and «open on a computer»; the preview stays clickable.
- [ ] **One shared simulated van does not confuse.** Visitor A switches the
      light, visitor B sees it. *Test:* two browsers side by side. The van
      resets at night and after an hour without commands.
- [ ] **The designer is safe in public in demo mode.** It assumes a home
      network today. *Test:* go through every route under `app/api/`; writing
      and outward-acting ones are refused in demo mode. Next.js to the newest
      14.2.x (`npm audit` reports critical issues for 14.2.16).
- [ ] **The broker keeps visitors in check.** *Test:* the Mosquitto ACL -
      visitors write only `schaltli/cmnd/#`, read `schaltli/#` and
      `homeassistant/#`, all over `wss://` (an https page cannot open a plain
      WebSocket).
- [ ] **Seeing the demo leads to installs.** *Test:* ask in the forum, watch
      the feedback. No analytics.

## MVP Scope

In:

- **Server:** Infomaniak VPS Lite (2 vCPU, 4 GB, Debian 13, in Switzerland,
  CHF 7.20 a month with a year paid ahead) - Hetzner had nothing available
  on 2026-10-09. Caddy in front for HTTPS and `wss://`, the designer
  (`next start` in demo mode), Mosquitto, the simulator.
  `demo.schaltli.com` as an A record at Namecheap. Set up over SSH; nothing
  billable is created without asking first.
- **Demo mode** behind an environment variable: no save, delete or rename;
  no deploy, firmware, URL import or translation; the start project opens
  at once; a notice «Demo - nothing is saved. Download Project takes your
  screen with you.»
- **Simulator:** imitated Pekaway values that change slowly, through the real
  bridge logic, answering commands.
- **Start project (#56)** for the 4.3B, its device description on the server,
  so no real device is needed. Android as a second one once it stands.
- **Phone start page** with the video and the hint to use a computer.
- **An e2e test of demo mode:** what is off is refused, the start project
  opens, the preview shows simulated values.

## Not Doing (and Why)

- **Saving, not even per visitor** - it would need folders, cookies and
  clean-up, and the demo gets no better for it; «Download Project» is enough.
- **A van per visitor** - own topics and own simulators; the shared van is
  enough and even feels alive.
- **Deploy to a visitor's own phone or board** - the wow, but an open door
  for strangers on the broker. Perhaps later, with a one-time code.
- **Browser-only, without a server** - every server route would need a
  stand-in in the browser; a small server is fine.
- **Analytics or tracking** - privacy; asking in the forum is enough.
- **A guided tour** - only if it turns out people get stuck without one.

## Open Questions

- Video: recorded once the demo runs, with the demo as its backdrop?
- The van's values: recorded from the user's van (as the bridge tests do),
  or invented?
- Does the demo mode also hide what it turns off (deploy buttons, the MQTT
  settings), or show it greyed out with a word why?
