# Starter redesign - plan

From the block review of 2026-11-11 (`tasks/bausteine-review.md`) to the new
starter film. Approved specs (the user, 2026-11-11):

- docs/2026-11-11-led-look.md (LED)
- docs/2026-11-11-value-cards.md (VC)
- docs/2026-11-11-chart-tweaks.md (CH)
- docs/2026-11-11-energy-mode-switch.md (EN)
- docs/2026-11-11-bridge-for-starter.md (BR)

Target picture: Artifact «Starter, alle Screens»
https://claude.ai/artifact/2uk4m65eYdrYSvMq5VidX4

Run autonomously (memory: starter-redesign-lauf). Halts, with a push
message and the state in the todo: the user installs bridge and tab on the
van; the 4" goes into the van; a real blocker.

Every code task: `npm run typecheck`, then `npm run test:quick` (never
Playwright beside it); live checks become permanent tests; the handbook in
the same piece of work; single files staged; commit on `starter-project`
(firmware and app: a branch `led-look` in their repos); no push.

## Phase 0 - housekeeping

- H1 Commit the specs, the review, plan and todo.
- H2 `app/test-render/page.tsx` (energy icons preloaded in tables/panels,
  uncommitted since T1): its test, then commit.

## Phase 1 - bridge (first, so the user can install while the rest is built)

- B1 Dimmers as `number` (BR 1). Accept: vanpi-bridge spec - a dimmer
  announces `number` 0-100 %, mode slider, state `dimmer/<n>/level`.
- B2 `heater/view on` starts the last mode, remembered (BR 2). Accept: unit
  cases after each of target/power/fan, and from nothing remembered
  (temperature).
- B3 Time and date every minute, retained (BR 3), inject node in the tab
  (`build-flow.js`). Accept: payloads «18:31», «Mi 11.11.»; the flow has the
  inject.
- B4 Block descriptions: heater - switch «Heizung» (`heater/view` on/off),
  choice of three modes shown only while on, dial, fuel line; MaxxFan -
  switches «Lüfter» and «Deckel», choice Hand|Auto, slider by mode, «Luft»
  shown only while on (BR 2, 4; LED 11). Check whether the cover reports
  «open» only once open (pulse). Accept: description specs; Prebuilt e2e.
- B5 Handbook `betrieb/vanpi-bruecke.md`; bundle for the van; push: «Brücke
  bereit zum Installieren» (not a halt - work goes on).

## Phase 2 - LED look in the designer

- L1 `toggle-button-shape.ts`: styles korry / led-h / led-v, the light per
  face and asked, icon before the name, fixed alignment, min height; the
  disc goes. Accept: toggle-button-shape spec rewritten (styles × states ×
  depths).
- L2 Migration filled/tonal → korry on load; property panel «Style» lists;
  renderer. Accept: e2e load of an old project; panel.
- L3 Asked pulses in the preview; still form where `screenMotion: false`.
  Accept: e2e preview pending state; PaperS3 project still.
- L4 Button Group style «led» in `switch-shape.ts` and renderer. Accept:
  switch-shape spec; panel lists Filled/Tonal/LED.
- L5 Button style «Text» in `button-shape.ts`. Accept: button-shape spec.
- L6 Navigator: active look «LED», theme entry as icon behind a divider.
  Accept: navigator specs.
- L7 Block builder: switch part → Korry Toggle Button; choice → LED group;
  slider in a card with name and value in the heading (dimmer «Aus» at 0);
  parts shown only while on via Switcher (exists). Check: live texts over a
  dial. Accept: bausteine specs; card-blocks spec.
- L8 Export of the new fields (lights, asked fill, dividers, strips, nav
  strip/theme entry, text button). Accept: export spec.
- L9 Demo «Camper»: Toggle Buttons migrate; check its look. Handbook
  `objekte/bedienen.md`, the navigator's page; labels spec.

## Phase 3 - value cards (VC)

- V1 Card heading muted and smaller, icon before it; wide form name|value
  in one row, bar below. Accept: block-card spec.
- V2 Number big in the colour of its meaning; thin bar, no percentage.
  Accept: bausteine spec per entity kind (battery, solar, temperature, fresh,
  grey, fuel).
- V3 Chart «Compact» (no axes, legend, date; 3 h fixed); sparkline beside
  the number added by the builder where the device declares charts.
  Accept: chart-layout spec; bausteine spec.
- Handbook: Prebuilt page, chart page.

## Phase 4 - chart tweaks (CH)

- C1 «Automatic» from 0 only for power and %. Accept: chart-layout spec.
- C2 Series name from discovery. Accept: builder spec.
- C3 Invented course in the designer's preview/simulation, marked.
  Accept: preview e2e.
- C4 Range label top right. Accept: chart-layout spec.
- Handbook chart page.

## Phase 5 - energy mode switch (EN)

- E1 Property «Mode switch», icons, corner kept free in Sankey. Accept:
  energy-diagram specs.
- E2 Preview: tap on an icon switches, node actions unchanged. Accept: e2e.
- E3 Export: corner and baked icons.
- E4 Demo «Camper»: one diagram. Accept: demo spec. Handbook pages.

## Phase 6 - firmware (schaltli-firmware, branch led-look)

- F1 Toggle Button lights, asked pulse (timer, light rect only), still
  form on PaperS3.
- F2 Button Group LED form; button style Text.
- F3 Navigator LED look and theme entry.
- F4 Chart: axis rule, range label, compact form (layout core ported).
- F5 Energy diagram: mode switch icons and tap.
- F6 DDF headers regenerated by hand where needed (memory); flash the desk
  boards; HIL conformance specimens for each; `test:quick` lanes green.

## Phase 7 - Android (schaltli-android, branch led-look)

- A1 Same as F1-F5 in the views; goldens; HIL Android.

## Phase 8 - the starter rebuilt

- S1 New film script (docs/video/starter-drehbuch.md, sprechtext):
  chapters follow the new screens (Temperaturen under Klima; Solar and
  Batterie under Power; Ablassen with the valve only; dimmers as sliders;
  header with clock; Prebuilt cards); humanizer; pronunciation file.
- S2 Chapter scripts K0-K20 adapted; device whitelist in lib.mjs (MaxxFan
  cover, Boiler 12V, dimmers, light/dark; heater fan only; never Boiler
  220V) - every MQTT publish and every click on a switch goes through it.
- S3 Dry run of every chapter headless against the van designer (no
  voice), the result compared with the target picture.
- HALT if the bridge is not yet installed on the van (S3 needs it).

## Phase 9 - the film

- M1 Voice: ElevenLabs «Helmut», two takes per chapter, take b
  transcribed for word times.
- M2 Record K0-K20 in step; K19 needs the 4" in the van → HALT there.
- M3 Assemble (assemble.py, camera.py), YouTube chapter description.
- M4 T5-T8 of tasks/starter-project-todo.md from the filmed project:
  starter under lib/starters, New Project choice, demo seed, handbook.
- Push: «Film fertig».
