# Todo: connections (autonomous run from 2026-10-14)

The user's go (2026-10-14): 1 push main/master after each task; 2 a
firmware release and app v0.12.0 after phase 1 and again at the end;
3 flash boards, install the app, HIL overwrites the devices; 4 change and
roll out the demo if needed; 5 flaky tests made robust, checks may be
weakened - listed at the end - killed runs restarted; 6 generate
`HIL_PASSWORD` into `.env.local`, test boards switched on by a file
written before the flash; 7 read-only look at the van's broker (pekaway
skill); 8 USB-Ethernet adapter at the phone; 9 close #70, #67, #68 with a
comment, no new issues; 10 through to the end, C10 included; 11 a forum
draft for rajiva, the user posts it.
Push notification on a stop and at the end.

## Phase 1
- [x] C1 The app on any network (schaltli-android f55a5ca)
- [x] C2 Contract §1, §4, §6
- [x] C3 The designer reads the DDF over the broker; #68 readable (e2e/ddf-over-broker.spec.ts)
- [x] C4 Boards answer ddf/get and recovery/get (schaltli-firmware ca9e491; seen on all three boards)
- [x] C5 The app answers; DdfServer gone (Android HIL «over the broker», 3 checks)
- [x] Checkpoint: test:all (green but for two fixed above); firmware release fw-2026.10.14.1; app v0.12.0

## Phase 2
- [x] C6 One broker login (#67) (e2e/broker-login.spec.ts)
- [x] C7 The designer's address can be set (e2e/device-facing-url.spec.ts @alone)
- [x] C8 No mqtts:// in the portal (schaltli-firmware 4716ece)
- [x] Checkpoint: test:quick (green after the two e2e fixes in 949336d)

## Phase 3
- [x] C9 Boards: test interface off, with a password (hil/test-interface.js check per board in test:all)
- [ ] C10 The app: the same test interface
- [ ] C11 Handbook
- [ ] Checkpoint: test:all; releases; issues closed; forum draft

## Findings

- The van's Mosquitto (2026-10-14, read only): no message_size_limit or
  max_packet_size, so 300 KB pass; Node-RED subscribes schaltli/cmnd/# and
  schaltli/state/theme only, nothing on # or the descriptions.
- PubSubClient 2.8 announces a large publish's length as uint16: 293775
  bytes went out as 31631 and the broker dropped the board. The firmware
  writes the PUBLISH header itself now.

## Weakened checks and tolerances (to report at the end)

- e2e/ddf-over-broker.spec.ts counts the device's ddf/get and recovery/get
  "at least once" rather than exactly once: every worker's page on the
  shared broker asks a hello it sees. "Never asked" stays exact.
- hil/test-all.js: the 4.3B's pixel-clock measurement runs after the lanes
  (it measures the WiFi the parallel boards share); same assertion.
