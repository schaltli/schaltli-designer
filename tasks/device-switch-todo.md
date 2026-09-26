# The devices follow light and dark (`device-switch`): tasks

Spec: `docs/2026-09-26-device-switch.md` (approved 2026-09-26) · Map:
`docs/2026-09-24-themes.md`. Kept beside `tasks/todo.md` (theme-topic, whose
review and tests are still open) rather than over it.

Builds (gradle, PlatformIO) and HIL runs wait for the new PC; code, the
parity golden and the tests are written before.

**State 2026-09-26:** tasks 1-5 written and committed - designer 74828f8
(pushed), app 7eed32f and firmware 2781bc4 (local, **not pushed** until they
build). Nothing compiled or run yet.

## Task 1: Parity golden (designer)
- [x] `hil/android/fixtures/build-theme-variant-golden.js` records (written; **run it on the new PC** - it needs the dev server and a browser)
      `darkVariantOf` input/output pairs (XDark wins, lone XDark, empty
      XDark, nested arrays and children, a key named `Dark`) into
      `schaltli-android/app/src/test/resources/theme-variant-golden.json`,
      which the firmware's host tool reads too.

## Task 2: The app follows the topic (schaltli-android)
- [x] `data/ThemeVariant.kt`: `darkVariantOf(JsonElement)`, `THEME_TOPIC`.
- [x] `ProjectRepository.loadFromDisk`: a light and a dark `Project`.
- [x] `MainActivity`: theme topic always in the topic set, dark derived from
      its value, the shown project chosen by it; first-screen reset,
      `setTopics` and orientation stay keyed on the light project.
- [x] `MqttRepository.setTopics` never unsubscribes the theme topic (done in
      MainActivity instead: the theme is always in the wanted set, so no
      guard in the repository is needed);
      `SYSTEM_GENERATION` and `DdfBuilder` say 1.1.
- [ ] JVM tests: transform against the golden, dark decode, subscription
      (dark / light / empty / absent; a project that reads the topic, then
      one that stops). **Run on the new PC.**

## Task 3: The firmware reads and swaps (schaltli-firmware, shared)
- [x] Dark fields in `ProjectTypes.h`, parsed in `ProjectLoader.cpp`
      (paths through `resolveAssetPath`, no defaults).
- [x] `ThemeVariant.h`: `applyThemeVariant(ProjectConfig&, bool dark)`,
      swapping pairs, idempotent; mutable access on `IProjectLoader`.
- [x] `tools/theme-variant/` host check. Its cases mirror the golden's, as
      structs: the firmware never sees the JSON again after loading, so the
      swap on the parsed project is what it checks.
- [x] `SYSTEM_GENERATION_MINOR` 1 on all three boards.

## Task 4: The knob follows the topic
- [x] Subscribe in `setupMqtt` (not on 4-bit), own callback branch, store
      the variant, apply after every load, redraw whole (slots, menu
      backdrop).
- [x] `/api/debug`: `theme` line, `set=theme=dark|light`.

## Task 5: The 4.3B follows the topic
- [x] The same in `boards/waveshare4v3b/main.cpp`, redraw via `renderAndPresent`.

## Task 6: Verify and flash (new PC)
- [x] App: `gradle testDebugUnitTest` (47 green, 3 new); firmware: the three envs build, theme-variant/switch-shape/level-shape host tools pass (2026-09-26).
- [x] HIL dark pass on the 4.3B (`orchestrator.js --dark`, in test:all):
      6/6, 0 of 384,000 pixels in dark (2026-09-26).
- [ ] The same for the knob (`hil/waveshare/orchestrator.js`) and the app
      (`hil/android/orchestrator.js`) - neither board nor phone was
      reachable on 2026-09-26.
- [x] Flash the connected boards over USB: the 4.3B (COM14) on 2026-09-26.
      COM5 was the retired e-paper, left alone.
- [ ] Knob and PaperS3 over USB once they are connected (they were on the
      camper's WLAN).

## Task 7: Handbook and done
- [x] Warnings for #20 replaced by "from firmware/app of 2026-09-26"
      (`designer/themes.md`, `designer/bausteine.md`); #20 closed.
- [x] Contract §4 says where it was built.
