# Todo: autonomous run of 2026-10-13

The user's go for running items 1-4 without asking (2026-10-13):
1-5 yes (push main/master after each step; plans as artifacts without
waiting for a go; release app v0.11.0; change and roll out the demo;
flash boards, install the app, HIL runs overwrite the devices).
6 yes (test:quick's contents decided from the measurement, <= 10 min).
7 yes: flaky tests may be made robust, checks may even be weakened -
but every weakened check is listed clearly at the end.
8 yes (android-draws-all: a DDF feature, Deploy asks older apps to update).
9 rounding tolerances are to be listed, no reason to stop.
10 yes (the text background filling one line only is fixed in
android-draws-all, no issue).
11 yes: runs killed for memory may be restarted.
Stop only on a real blocker; a push notification then and at the end.

## 1. Fast tests

Measured (test:all 2026-10-13, 50 min): host lane 8.3 min (e2e 425 s),
4.3B 16.9 min (conformance 315 s, energy motion 234 s), knob 12.6 min
(layout 181 s red, energy motion 136 s, smoke 114 s), PaperS3 8.1 min,
Android 4.3 min.

- [ ] Topic prefixes per device in the HIL scripts that use fixed ones (hil-placeholder, hil-popup, hil-deploy, hil-conformance)
- [ ] Conformance in one install: the budget counts what is exported (no background bitmap since 2026-09-25)
- [ ] test:all in lanes: host, knob, 4.3B, PaperS3, Android in parallel, each lane sequential, a log per lane, the knob/4.3B pair after both
- [ ] test:quick (<= 10 min): e2e on the production build + each lane's core checks
- [ ] Flaky e2e under load made robust (snap-table-rows x2, energy-diagram held phase, project-save, project-list, mock-simulator)
- [ ] Knob layout containers red (181 s): find out
- [ ] Firmware update tests skipped: the board's build name vs the checkout's describe after a release tag
- [ ] Handbook/README: hil/README.md and CLAUDE.md name test:quick

## 2. android-draws-all

- [ ] Plan as artifact (no wait), then build
- [ ] The app draws box, line and fixed icon itself; the export bakes no background; a DDF feature; Deploy asks older apps to update
- [ ] A text's background fills its frame

## 3. App v0.11.0

- [ ] Release with local topics and android-draws-all; handbook names the version

## 4. local-demo

- [ ] The demo's «Energie» screen: «Flow | Sankey» on local/energie/view (initial flow), a switcher with both diagrams; roll out the demo

## Weakened checks and tolerances (to report at the end)

(none yet)
