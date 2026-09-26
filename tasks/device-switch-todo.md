# The devices follow light and dark (`device-switch`): tasks

Spec: `docs/2026-09-26-device-switch.md` (approved 2026-09-26) · Map:
`docs/2026-09-24-themes.md`. Kept beside `tasks/todo.md` (theme-topic, whose
review and tests are still open) rather than over it.

Builds (gradle, PlatformIO) and HIL runs wait for the new PC; code, the
parity golden and the tests are written before.

## Task 1: Parity golden (designer)
- [x] `hil/android/fixtures/build-theme-variant-golden.js` records (written; **run it on the new PC** - it needs the dev server and a browser)
      `darkVariantOf` input/output pairs (XDark wins, lone XDark, empty
      XDark, nested arrays and children, a key named `Dark`) into
      `schaltli-android/app/src/test/resources/theme-variant-golden.json`,
      which the firmware's host tool reads too.

## Task 2: The app follows the topic (schaltli-android)
- [ ] `data/ThemeVariant.kt`: `darkVariantOf(JsonElement)`, `THEME_TOPIC`.
- [ ] `ProjectRepository.loadFromDisk`: a light and a dark `Project`.
- [ ] `MainActivity`: theme topic always in the topic set, dark derived from
      its value, the shown project chosen by it; first-screen reset,
      `setTopics` and orientation stay keyed on the light project.
- [ ] `MqttRepository.setTopics` never unsubscribes the theme topic;
      `SYSTEM_GENERATION` and `DdfBuilder` say 1.1.
- [ ] JVM tests: transform against the golden, dark decode, subscription
      (dark / light / empty / absent; a project that reads the topic, then
      one that stops). **Run on the new PC.**

## Task 3: The firmware reads and swaps (schaltli-firmware, shared)
- [ ] Dark fields in `ProjectTypes.h`, parsed in `ProjectLoader.cpp`
      (paths through `resolveAssetPath`, no defaults).
- [ ] `ThemeVariant.h`: `applyThemeVariant(ProjectConfig&, bool dark)`,
      swapping pairs, idempotent; mutable access on `IProjectLoader`.
- [ ] `tools/theme-variant/` host check against the golden.
- [ ] `SYSTEM_GENERATION_MINOR` 1 on all three boards.

## Task 4: The knob follows the topic
- [ ] Subscribe in `setupMqtt` (not on 4-bit), own callback branch, store
      the variant, apply after every load, redraw whole (slots, menu
      backdrop).
- [ ] `/api/debug`: `theme` line, `set=theme=dark|light`.

## Task 5: The 4.3B follows the topic
- [ ] The same in `boards/waveshare4v3b/main.cpp`, redraw via `renderAndPresent`.

## Task 6: Verify and flash (new PC)
- [ ] App: `gradle testDebugUnitTest`; firmware: build the three envs, host tools.
- [ ] HIL dark pass (waveshare, waveshare4v3b, android) against the
      reference render with `variant: "dark"`, added to the fixtures.
- [ ] Flash the connected boards over USB (user, 2026-09-26).

## Task 7: Handbook and done
- [ ] Remove the `handbuch-macke #20` warnings (`designer/themes.md`,
      `designer/bausteine.md`), say the devices follow the topic; close #20.
- [ ] Contract §4: drop "until device-switch lands".
