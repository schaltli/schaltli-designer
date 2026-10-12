# Plan: energy-firmware and energy-android

Spec: `docs/2026-10-11-energy-diagram.md`; what the devices get: device
contract §2.8 (energy-contract, done 2026-10-12). Both modules port the
core `lib/energy-diagram.ts` function by function and run its
`vectors.json`, as `NavigatorLayout` did for the navigator. Firmware first,
then Android: one run, firmware tasks before app tasks; each task its own
commit in its repo.

## Decisions (to approve)

1. **HIL compares a still frame.** The fixtures' diagrams have Motion off,
   so the snapshot is phase 0 and the pixel diff works as for every other
   object. That things move is checked apart: on the 4.3B by the spike's
   timing test, now against the real object (a tap's latency moving vs.
   still); on Android by two screenshots that differ inside the diagram
   only. The wave on the glass gets your eye once more at the end.
2. **The firmware reuses the spike's way, not its code.** A step every
   100 ms at the end of the loop, none while a finger is down; dots
   restored from a still copy and redrawn; the wave one row copied into
   every column. `PolygonRaster` and `RgbPanel::blitRegions/writeBack` are
   taken as they are; the spike's own code in `main.cpp` goes.
3. **The DDFs list `energy-diagram` in the same task as generation 1.7**
   (F6, A5), when the device draws it. The designer's copy of the 4.3B DDF
   is regenerated then; your local preview DDF
   (`.data/ddf/energy-preview-4v3b.ddf.zip`) is deleted after it.
4. **No release, no push, no van.** The test 4.3B on the desk and the phone
   are flashed and installed as the HIL does; firmware and app releases
   stay yours.

## energy-firmware (`schaltli-firmware`)

- **F1 The core in C++.** `src/project/EnergyDiagram.{h,cpp}`: resolve,
  Sankey layout (band polygons), Flow layout, boxes, `nodeAtTap`, dots,
  wave. `test/test_energy_diagram/` with a byte-for-byte copy of
  `vectors.json` (fails if it differs, skipped without the designer).
  Verify: `pio test -e native`.
- **F2 Parsing and dark.** `ProjectLoader` reads the object's properties
  and nodes into a struct; `ThemeVariant` swaps its colours, the nodes'
  `colorDark` and the icon looks' `…Dark`. Native test on a §2.8 example.
- **F3 Drawn still.** `renderEnergyDiagram` in `ColorScreenRenderer`: the
  Flow (lines, bus, circles, ring, icons, labels) and the Sankey (bands
  with `PolygonRaster` at phase 0, bars, bus, labels); `{watts}` filled in,
  lines as live text; `readsTopic` knows the nodes' topics. HIL: a
  conformance specimen and a 4.3B orchestrator screen, both modes, pixel
  diff within the usual threshold.
- **F4 Motion.** The step as decision 2, only on the screen showing a
  diagram with Motion on. HIL: the spike's latency test against the real
  object (moving vs. still within the spike's factor 1.06–1.16).
- **F5 A tap runs the node's action.** Hit test includes the diagram,
  `nodeAtTap` picks the node, `dispatchButtonAction` runs it. HIL: a tap
  on a node opens its popup.
- **F6 Generation 1.7 and the DDF.** `DeviceInfo.h` 1.7 with its line in
  the changelog; `device.json` lists the type; the designer's DDF copy
  regenerated (`hil/test-all.js` checks it); spike's `?set=energyspike`
  removed.

## energy-android (`schaltli-android`)

- **A1 The core in Kotlin.** `data/EnergyDiagramLayout.kt`, no Android
  imports; `app/src/test/resources/energy-diagram-vectors.json` with the
  sibling check. Verify: `gradle testDebugUnitTest`.
- **A2 Drawn.** `ui/objects/EnergyDiagramView.kt`, a Compose `Canvas`:
  both modes, labels with `{watts}` and live text as `TextBoxView` takes
  them, icons (the tinted SVGs) at the core's boxes; dark from the dark
  project as every view. Dispatch in `ScreenRenderer`. HIL: a fixture
  screen per mode in `hil/android/fixtures/build-android-test.js`, pixel
  diff within the app's limit.
- **A3 Motion.** A `withFrameNanos` loop while the diagram is shown and
  Motion is on. HIL: two screenshots a moment apart differ inside the
  diagram, nowhere else.
- **A4 A tap runs the node's action** through `ButtonActionDispatcher`.
  HIL: a tap opens the popup.
- **A5 Generation 1.7 and supported types.** `SYSTEM_GENERATION = "1.7"`,
  `SUPPORTED_TYPES` in `DdfBuilder`, `DdfBuilderTest`.

## After both

- Designer: the info box in `handbuch/objekte/anzeigen.md` goes; the
  device pages (`geraete/`) say the 4.3B and the app draw it, from which
  firmware and app version on.
- `npm run test:all` green; the wave and the dots on the 4.3B's glass and
  on the phone looked at by you.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The 4.3B's flash or RAM: a still copy of the diagram in PSRAM (≈ 540 KB at 676 × 396 × 2) | Med | the spike kept one already; measured in F4, `/api/debug` shows the heap |
| Text in the Sankey's labels differs by a pixel between canvas, u8g2 and Compose | Med | the boxes come from the core; parity rules of contract §3; threshold as for texts |
| Moving dots cost the touch on the 4.3B | Med | the spike's numbers (factor ≤ 1.16); F4 measures the real object |
| The phone's screenshot catches a moving frame | Low | fixtures with Motion off (decision 1) |
