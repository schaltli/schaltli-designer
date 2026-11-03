# Card clip (`card-clip`): tasks

Spec: `docs/2026-11-03-card-clip.md`. Designer branch `card-clip`; firmware
and Android branches `card-clip` too. The release is the user's word.

## Task 1: The shape and the export (designer)

- [ ] `lib/clip.ts`: the row spans of a shape (Adafruit GFX fillRoundRect), the shape inside an area's edge; `lib/fixtures/clip-spans.json` for every renderer
- [ ] `clipContents` on a free area, on by default for a card; the toggle in the panel
- [ ] Export writes `properties.clip` (outermost first) at every depth, nested areas both
- [ ] The `clip` feature: a project with a clipping area blocked or offered the update on a device without it

**Verification:** `e2e/card-clip.spec.ts`; `npm run typecheck`

## Task 2: Drawn clipped in the designer

- [ ] Editor, preview and HIL reference (`lib/render-screen.ts`) draw clipped objects by the spans
- [ ] The screenshot's card, pixel-checked

**Verification:** `e2e/card-clip-canvas.spec.ts`

## Task 3: Firmware (colour boards, PaperS3)

- [ ] Shape clip in `ClippedCanvas16`; `clip` read by the loader; set around each object in `ColorScreenRenderer`, full and partial redraws
- [ ] DDFs declare `clip`; native test against `clip-spans.json`
- [ ] Conformance specimen at 0 px on knob, 4", 4.3B, PaperS3

## Task 4: Android

- [ ] The model reads `clip`; the renderer masks by the spans; the DDF declares `clip`; its HIL green

## Task 5: Contract, handbook, final run

- [ ] `docs/device-contract.md` §2.1; handbook `objekte/anordnen.md`
- [ ] `npm run test:quick` green apart from known load failures
