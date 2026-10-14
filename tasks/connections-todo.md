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
- [ ] C3 The designer reads the DDF over the broker; #68 readable
- [ ] C4 Boards answer ddf/get and recovery/get
- [ ] C5 The app answers; DdfServer gone
- [ ] Checkpoint: test:all; firmware release; app v0.12.0

## Phase 2
- [ ] C6 One broker login (#67)
- [ ] C7 The designer's address can be set
- [ ] C8 No mqtts:// in the portal
- [ ] Checkpoint: test:quick

## Phase 3
- [ ] C9 Boards: test interface off, with a password
- [ ] C10 The app: the same test interface
- [ ] C11 Handbook
- [ ] Checkpoint: test:all; releases; issues closed; forum draft

## Weakened checks and tolerances (to report at the end)

(none yet)
