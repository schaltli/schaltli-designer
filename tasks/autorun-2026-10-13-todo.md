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

- [x] Topic prefixes, temp zips and report folders per device (hil/device-tag.js)
- [x] Conformance: installs measured, not guessed - 4 instead of 17, 179 s instead of 315
- [x] test:all in lanes, logs per lane; navigator, the local-topics pair, @alone/@dev after the lanes; designer firmware updates one at a time
- [x] test:quick: 7 min, green (2026-10-13); test:all 21 min instead of 50
- [x] e2e against a production build (hil/e2e-prod.js) with a broker of its own; keep-alive; flaky saves wait for the title
- [x] Knob layout red: next dev's test page timed out under load - the HIL renders on the production build now
- [x] Firmware tests skipped after a release: firmware-upload --install-checkout in test:all; all nine ran green
- [x] hil/README.md and CLAUDE.md

## 2. android-draws-all

- [x] Plan as artifact (https://claude.ai/artifact/9ouyiagmY2WRv8xgnVYR22)
- [x] The app draws box, line and fixed icon itself (LineRaster, BoxRaster, exact against the designer); the export bakes no background; "static-objects"; Deploy asks older apps
- [x] A text's background: dropped - the designer and the boards draw it one font height too

## 3. App v0.11.0

- [x] v0.11.0 released (https://github.com/schaltli/schaltli-android/releases/tag/v0.11.0); handbook topics.md, android.md

## 4. local-demo

- [x] «Flow | Sankey» (button group) on local/energie/view, a switcher with both looks; seen on the 4.3B; demo rolled out at dde324e, check green

## Weakened checks and tolerances (to report at the end)

- test:quick leaves out the navigator (theme), energy motion, firmware, WiFi, layout, smoke, pixel parity - all still in test:all
- e2e energy-diagram «held at a phase»: polls for another picture instead of one look after 300 ms (same assertion, no time limit of its own)
- hil/live-value-redraw.js: the board's combined:alarm is asked up to three times (a timeout read as "?")
- e2e/demo-camper.spec.ts: local topics left out of «published by the demo van» and «a command the bridge takes» (they never reach the broker); still must be declared
- Removed with the feature: the theme and group specs' checks on the baked background picture; the Android HIL's marker uses screen colours
- No pixel tolerance changed; the app's line and box match the designer exactly (StaticObjectGoldenTest)
