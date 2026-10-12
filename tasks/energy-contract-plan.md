# Plan: energy-contract

Spec: `docs/2026-10-11-energy-diagram.md` (decisions 15, 16). Module
`energy-contract` of the capability map: the diagram leaves the designer
for a device, in the device zip and the Android bundle, as contract §2.8,
generation 1.7. Depends on `energy-designer` (done 2026-10-12). After it:
`energy-firmware` and `energy-android`, side by side.

## Decisions taken here (to approve)

1. **The device draws, the export carries data.** As the navigator, the
   object goes as its data: mode, motion, full scale, the diagram's
   colours (each with `…Dark`), the fonts, and per node its role, x/y,
   topics, reverse sign, colour, lines and action. A device computes every
   place from its port of `lib/energy-diagram.ts`, values change the
   picture there, not in the designer.
2. **Where names, lines and icons stand moves into the core.** Today the
   designer's renderer works out the label boxes itself
   (`render-energy-diagram.ts` `labelObjects`, `iconObject`). A device
   would have to copy a renderer, not the core, and a Sankey's slot grows
   with its band, so the places depend on the values. They become core
   functions with cases in `vectors.json`, the renderer uses them.
3. **Icons are baked per node and per look.** A node's icon changes
   colour with its state: its colour while it carries watts, muted at
   0 W; a storage charge colour or discharge colour. Each look is baked
   (light and dark) at the size the mode draws it, as a live icon's
   branches are (`<object>~<node>~<look>`). The device picks one.
4. **`{watts}` stays in the lines**, as `{topic:…}` does: the device
   fills in the node's watts after resolving, "-" while unknown. Live
   values go as §2.6.
5. **The DDFs do not list `energy-diagram` yet.** That comes in
   `energy-firmware` and `energy-android`, when a device can draw it - so
   no one puts a diagram on a 4.3B project that no firmware shows.
   The local preview DDF stays until then.
6. **Below 1.7** a device skips the unknown type (it draws nothing in its
   place). The Deploy dialog warns before sending and names the
   diagrams, as for the navigator.

## Tasks

- **C1 Label and icon boxes in the core.** `nodeBoxes(layout, nodes,
  mode, metrics)` → per node the icon box and the label box (x, y, width,
  align) for Flow and Sankey, the bus label too. Renderer uses it;
  pictures unchanged (the existing render tests). Vectors: `boxes`, at
  least four cases (Flow under/beside, Sankey left/right, a slot grown by
  its band). Files: `lib/energy-diagram.ts`, `vectors.json`,
  `render-energy-diagram.ts`, `e2e/energy-diagram-layout.spec.ts`.
- **C2 Contract §2.8 and generation 1.7.** The JSON written down in
  `docs/device-contract.md`, with an example; `ENERGY_DIAGRAM_GENERATION`
  in `lib/system-generation.ts`; spec decision 16 amended.
- **C3 Into the device zip.** `withoutEnergyDiagrams` leaves
  `project-zip.ts`; the diagram's colours resolved with `…Dark`, its
  nodes' lines through `exportedTextProperties`, its fonts and topics
  (`topic`, `chargeTopic`, the lines' live values) listed; icons baked
  per look (asset-export). Test: an e2e builds the zip and reads the
  object, the paths, the bitmaps' sizes and colours, the topics.
- **C4 Into the Android bundle.** The same object in `android-export.ts`
  (24 bit, dark always). Test: an e2e on the bundle's JSON.
- **C5 The Deploy dialog.** A device below 1.7 gets the warning naming
  the diagrams; at 1.7 none. Test: e2e as the navigator's.
- **C6 Handbook.** The info box in `objekte/anzeigen.md` says the
  diagram now goes to the device, which draws it once its firmware or
  app knows it (the Deploy dialog says so); `geraete/` unchanged until
  firmware.

### Checkpoint: contract
- `npm run test:all` green
- the user has read §2.8 (it is what firmware and app are built against)

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Too many bakes (5 nodes × 3 looks × light/dark) fill LittleFS | Med | small icons (≤ 40 px), only the looks a role needs; size measured in C3's test |
| A Sankey with many nodes and a font changes the boxes on the device | Med | the boxes come from the core with font metrics as input; vectors fix them |
| Releasing the designer before the firmware | Low | DDFs don't list the type until a device draws it (decision 5) |
