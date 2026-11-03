# Card clip (`card-clip`): tasks

Spec: `docs/2026-11-03-card-clip.md`. Designer branch `card-clip`; firmware
and Android branches `card-clip` too. The release is the user's word.

## Task 1: The shape and the export (designer)

- [x] `lib/clip.ts`: the row spans of a shape (Adafruit GFX fillRoundRect), the shape inside an area's edge; `lib/fixtures/clip-spans.json` for every renderer
- [x] `clipContents` on a free area, on by default for a card; the toggle in the panel
- [x] Export writes `properties.clip` (outermost first) at every depth, nested areas both
- [x] The `clip` feature: a project with a clipping area blocked or offered the update on a device without it

**Verification:** `e2e/card-clip.spec.ts`; `npm run typecheck`

## Task 2: Drawn clipped in the designer

- [x] Editor, preview and HIL reference (`lib/render-screen.ts`) draw clipped objects by the spans
- [x] The screenshot's card, pixel-checked

**Verification:** `e2e/card-clip-canvas.spec.ts`

## Task 3: Firmware (colour boards, PaperS3)

- [x] `clip` read by the loader; set around each object in `ColorScreenRenderer`, full and partial redraws (the shape drawn by Adafruit GFX into a one-bit canvas and read back as spans, not in `ClippedCanvas16`)
- [x] DDFs declare `clip` (no native test: the native environment has no Adafruit GFX; the specimen holds the board to the designer at 0 px)
- [x] Conformance specimen at 0 px on knob, 4", 4.3B, PaperS3

## Task 4: Android

- [x] The model reads `clip`; the renderer masks by the spans; the DDF declares `clip`; its HIL green

## Task 5: Contract, handbook, final run

- [x] `docs/device-contract.md` §2.1; handbook `objekte/anordnen.md`
- [x] `npm run test:quick` green apart from known load failures (2026-11-03: deploy-check ran the card-clip screen too - fixed with `typesOnly`, deploy green on all four boards; popups and screen graph green alone; 4v3b-internal-heap red as in every run since T8)
