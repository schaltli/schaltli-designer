# Plan: charts-actions

Spec: `docs/2026-10-16-charts.md` decision 15 (the screen's time range,
pinch, the four range actions), decision 9 (dragging stays the chart's),
decision 12 (the defaults a history page gets) and «Gestures and actions».
After charts-designer. The designer side only: the gestures and actions in
the model, the export and the pickers, the preview following them, and the
defaults of «Add history below». The devices carry them out in
charts-firmware and charts-android.

## Decisions taken here (to approve)

1. **Two gesture ids, `pinch-in` and `pinch-out`**, beside the swipes:
   offered in a screen's «Swipe navigation» (renamed «Gestures» once it
   holds more than swipes) only on a device whose description declares the
   feature `pinch`. They are hardware buttons as the swipes are
   (lib/device-description.ts), so everything that resolves a button -
   the master's fallback, the export, the summaries - takes them as it is.
2. **Four action types** in `HardwareButtonAction` (the spec's names):
   `narrow-range`, `widen-range`, `move-range` with `rangeDirection`
   («earlier», «later»), `set-range` with `range` (1h, 6h, 24h, 7d).
   Offered in every action picker - gestures, hardware buttons, the knob's
   ring, a Button - but only in a project for a device that declares
   `charts`, or that has a chart: elsewhere they would do nothing.
3. **The steps** (decision 15): narrow 7d → 24h → 6h → 1h, widen the other
   way, each stopping at its end; move by one range, at 24 h one day, at
   7 days a week; set straight to its span. Moving later stops at today.
   One pure module, `lib/chart-range.ts`, which the preview uses and the
   firmware and app port.
4. **A screen's range is the preview's state**, as a local topic's value
   is: it opens at the screen's «Time range» and is kept per screen while
   the preview runs; leaving the preview forgets it (decision 15, «After a
   restart a screen opens at it again»).
5. **Dragging a scrolling chart in the preview** moves the screen's
   window and, let go, settles on whole days from 24 h up (decision 9: a
   window within 6 hours of a midnight snaps to it). No coasting in the
   designer; that is the devices' (decision 9, «The device decides how it
   moves»).
6. **The defaults of a history page** (spec «Gestures and actions»): on a
   device with `pinch`, pinch in widens and pinch out narrows; on the knob
   the ring moves the range earlier and later and its press sets 24 h.
   Written into the screen made by «Add history below», as any action.
7. **Deploy:** the four actions need `charts` (already asked for a chart or
   a time range; now also for a range action anywhere), the two pinch
   gestures need `pinch`, named in the message as the other features are.

## Tasks

- **A1 The range steps.** `lib/chart-range.ts`: `narrowed`, `widened`,
  `moved(range, offset, direction)`, the window with an offset
  (`chartWindow` takes it), whole-day snapping.
  Test: `e2e/chart-range.spec.ts` (pure): each step and its ends; moving
  earlier and back; later stops at today; snapping within 6 hours.
  Files: `lib/chart-range.ts`, `lib/chart-window.ts`, `e2e/chart-range.spec.ts`.
- **A2 The model and the export.** The four types and their fields in
  `HardwareButtonAction`; the pinch ids from a DDF declaring `pinch`;
  summaries («Narrow the time range», «Widen the time range», «Move the
  time range earlier/later», «Set the time range to 24 hours»); the device
  zip and the Android bundle carry them; Deploy's features (decision 7).
  Test: `e2e/chart-actions.spec.ts`: summaries, export of each, a pinch
  gesture only from a DDF with `pinch`, the features asked for.
  Files: `components/project-editor.tsx` (types), `lib/hardware-button-actions.ts`,
  `lib/device-description.ts`, `lib/chart.ts`, `lib/project-zip.ts`,
  `lib/android-export.ts`, `e2e/chart-actions.spec.ts`.
- **A3 The pickers.** The four actions in the action picker with their
  fields (direction, span); «Pinch in» and «Pinch out» among a screen's
  gestures.
  Test: `e2e/chart-actions.spec.ts`: chosen in the picker, each lands in
  the project; offered only where decision 2 says.
  Files: the action picker component, `components/property-panel/screen-properties.tsx`,
  `e2e/chart-actions.spec.ts`, `e2e/fixtures/property-panel-controls.json`.
- **A4 The preview follows.** The screen's range kept per screen
  (decision 4); a Button or a clicked gesture with a range action changes
  it; every chart on the screen redraws for it; dragging a scrolling chart
  moves it and settles (decision 5).
  Test: `e2e/chart-actions.spec.ts`: in the preview, a Button «Set the time
  range» 1 h turns the chart's axis to the last hour; a drag on a
  scrolling chart shows yesterday.
  Files: `components/project-editor.tsx`, `components/canvas/canvas.tsx`,
  `lib/chart-preview.ts`, `e2e/chart-actions.spec.ts`.
- **A5 The history page's defaults.** Decision 6 in `withHistoryBelow`.
  Test: `e2e/chart-history-page.spec.ts`: on a device with `pinch` the
  two pinches set; on the knob the ring and its press.
  Files: `lib/chart-from-controls.ts`, `e2e/chart-history-page.spec.ts`.
- **A6 Handbook.** `handbuch/designer/tasten.md`: the two gestures and the
  four actions; `handbuch/objekte/anzeigen.md` «Chart»: what a swipe, a
  pinch and the ring do on a history page; through maettel-humanizer;
  `e2e/handbook-labels.spec.ts` green.
- **Checkpoint:** test:quick green; the user moves through a history page's
  days in the preview.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The action picker grows past readable | Medium | the four under one heading «Time range», as «Go to the screen beside» groups its sides |
| A drag on a chart fights the swipe that changes the page | Medium | only a chart with Scrolling on takes the drag (decision 12); elsewhere a swipe is the screen's |
| No DDF declares `pinch` yet | Low | the gestures are tested with a seeded DDF that does; the 4.3B's and PaperS3's DDFs declare it in charts-firmware |

## Not in this plan

Carrying out the actions, pinch and dragging on the devices (charts-firmware,
charts-android).
