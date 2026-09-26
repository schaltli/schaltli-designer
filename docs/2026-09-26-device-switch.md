# Spec: `device-switch` - the devices follow light and dark

Module of `docs/2026-09-24-themes.md`, the last one, after `theme-export`
(the export carries `XDark`, `docs/device-contract.md` §2.3) and
`theme-topic` (`schaltli/state/theme`, §4). Work in `schaltli-firmware` and
`schaltli-android`; this spec lives here because the contract does. Status:
approved 2026-09-26.

## Objective

When `schaltli/state/theme` says `dark`, the knob, the 4.3B and the Android
app redraw their screen in the theme's dark variant, at once and without a
new deploy; when it says `light`, is empty or absent, they show light. The
PaperS3 (4 bit) and the e-paper do nothing. This closes #20 and the
handbook's two warnings about it.

### Acceptance criteria

1. **Reading the dark fields.** A device that loads a 1.1 export keeps
   every `XDark` the contract lists (§2.3) - colours, `backgroundColorDark`,
   the dark bitmap paths - beside its light field. A lone `XDark` counts as
   the dark value of `X`; an empty or missing one means "use `X`".
2. **Following the topic.** The device subscribes to
   `schaltli/state/theme` (retained) independently of the project's own
   topics: it survives a project that also reads it (a Theme switch on a
   screen) and one that does not. `dark` (trimmed, case-insensitive) means
   dark; anything else, an empty payload, or no message means light.
3. **Redrawing.** On a change, the current screen is redrawn whole in the
   other variant: every colour, the screen background, every baked bitmap,
   and everything derived from them (tracks, switch surfaces, ink, the
   knob's pre-rendered neighbour screens and menu backdrop). The screen
   stays the one shown; nothing resets to the first screen.
4. **Order does not matter.** The theme may arrive before the project is
   loaded, after it, or during a swipe; the next drawn frame is right.
5. **Colour only.** The PaperS3 does not subscribe (compile-time gate on
   `DEVICE_COLOR_DEPTH_4BIT`); its behaviour is unchanged.
6. **Generation 1.1.** Firmware (`SYSTEM_GENERATION_MINOR`, three boards)
   and app (`SYSTEM_GENERATION`, `DdfBuilder`) report 1.1.
7. **Verifiable.** Firmware: `/api/debug` reports the theme and accepts
   `set=theme=dark|light`; the app is verified through the broker. A HIL
   dark pass per device compares the device with the designer's reference
   render in `variant: "dark"`.
8. **Handbook.** The warnings with `handbuch-macke #20` go
   (`designer/themes.md`, `designer/bausteine.md`), `designer/themes.md`
   says the devices follow the topic, #20 is closed.

## Approach

### Firmware (`schaltli-firmware`)

- **Parse** the dark fields into parallel `String` members
  (`ProjectTypes.h`): `Screen::backgroundColorDark`; in `ObjectProperties`
  `colorDark`, `backgroundColorDark`, `borderColorDark`, `textColorDark`,
  `fillColorDark`, `strokeColorDark`, `switchColorDark`; in `ScreenObject`
  `pathDark`, `pathNormalDark`, `pathActiveDark`; `SwitchState::iconPathDark`,
  `iconPathActiveDark`; `ValueIconPair::pathDark`. Paths through
  `resolveAssetPath()`. No parse-time default for a dark field (the light
  field's default must not be mistaken for a dark value). `iconColor` and
  `buttonColor` are not parsed today and need not be: both reach the
  device baked, through the dark paths.
- **Switch by swapping, not by teaching the renderer.** One function
  `applyThemeVariant(ProjectConfig&, bool dark)` swaps every pair whose dark
  side is set, and remembers which variant the config is in, so applying
  the same variant twice changes nothing and applying the other swaps back.
  The renderer, `currentScreenBgHex_` and every derived colour keep reading
  the light field names and so draw dark without a change - the ~20 read
  sites the exploration found stay untouched, and none can be missed. It
  needs one mutating accessor on `IProjectLoader`. Kept in its own header
  so a host tool (`tools/theme-variant/`, like `tools/level-shape/`) can
  check it without a board.
- **Subscribe** in each colour board's MQTT setup beside `deploy` and
  `firmware` (knob `main.cpp` `setupMqtt`; 4.3B `main.cpp` MQTT setup), with
  its own branch in the callback before project topics: store the wanted
  variant, apply it to the loaded project, and redraw - knob:
  `canvasPresenter.invalidateSlots()`, `menuBackdropReady = false`,
  `renderScreenIndex(currentScreenIndex)`; 4.3B: a full `renderAndPresent`.
  After every project load the stored variant is applied again.
- **Gate** subscription and swap with `#if !DEVICE_COLOR_DEPTH_4BIT`.
- **Debug**: `set=theme=dark|light` and a `theme` line in `/api/debug`, on
  both boards.
- **Known cost**: the added `String`s grow the objects vector the renderer
  copies each frame, and dark bitmaps fill the 192 KB bitmap cache sooner
  (no eviction; beyond it, bitmaps are read from LittleFS per draw).
  Measured on the knob fixture before closing.

### App (`schaltli-android`)

- **Transform, don't touch the views.** A Kotlin port of the designer's
  `darkVariantOf` (`lib/themes.ts`) over `JsonElement` - every `XDark` in
  place of its `X`, a lone `XDark` as `X`, recursive - runs once in
  `ProjectRepository.loadFromDisk` before decoding, giving a light and a
  dark `Project`. `SchaltliRoot` shows one or the other. No view changes:
  every bitmap and pill cache is keyed on path or properties, so the swap
  redraws exactly what differs. The typed fields (`backgroundImage`,
  `path`, `pressedPath`) pick up their dark values through the transform,
  which the parser would otherwise drop (`ignoreUnknownKeys`).
- **Subscribe** to `schaltli/state/theme` always, added to the topic set in
  both `connect` and `setTopics`, and never unsubscribed by `setTopics`
  when a project stops reading it. Dark = its value trimmed equals `dark`.
- **Keep keyed on the light project** what must not fire on a theme flip:
  the reset to the first screen, `setTopics`, the orientation effect.
- A broker change clears values, so the app shows light for a moment until
  the retained theme arrives; accepted.

### Designer (this repo)

- **Parity data**: a small golden of `darkVariantOf` input/output pairs,
  recorded by the designer (like the existing `hil/android/fixtures/build-*
  -golden.js`) and checked by the app's unit test and the firmware's host
  tool, so all three readers agree on the rule.
- **HIL dark pass** in `hil/waveshare/`, `hil/waveshare4v3b/`,
  `hil/android/`: a themed fixture, retained `schaltli/state/theme=dark`,
  compare against the reference render with `variant: "dark"`, clear the
  retained value afterwards.
- **Handbook** as in criterion 8.

## Order

1. App: transform + two projects + subscription + generation, JVM tests.
2. Firmware: fields, parse, `applyThemeVariant` + host tool, knob
   subscription/redraw/debug, generation.
3. Firmware: the 4.3B the same.
4. Designer: parity golden, HIL dark passes, handbook, close #20.

Builds and HIL runs wait for the new PC (user, 2026-09-26); code, host
tools and JVM tests can be written before.

## Testing strategy

- **App**: JVM tests for the transform (against the parity golden), for
  decoding the dark project, and a `CommandDropTest`-style test of the
  subscription (dark, light, empty, absent; a project that reads the topic
  itself, then one that stops).
- **Firmware**: host tool for `applyThemeVariant` (swap, idempotent, back,
  lone XDark, empty XDark) against the golden; HIL dark pass on both boards
  and the `/api/debug` setter.
- **Everything else** by HIL against the reference render.

## Boundaries

- **Always**: the contract's rule as written (§2.3, §4); light unchanged
  for a device that never hears the topic; commit style of each repo.
- **Ask first**: releasing a firmware or app version; changing the
  contract.
- **Never**: react on the PaperS3 or e-paper; publish the theme from a
  device.

## Decided (user, 2026-09-26)

1. **No release.** Once built and verified, the boards that are connected
   get the new firmware over USB - some are on the camper's WLAN, out of
   reach of an OTA update from here. No firmware or app release is cut
   for this module.
