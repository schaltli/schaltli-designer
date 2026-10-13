# Todo: energy-nested

Plan: `tasks/energy-nested-plan.md`. Approved by the user 2026-10-13
(«Ja und ja»: the 4.3B may be flashed by USB for this module). Run:
/build auto; no release.

- [x] N1 A diagram in a switcher's panel moves
  - firmware 1a3d43b: energyAnimations walks a switcher's active panel at its place (nested too); the 4.3B recomputes on `switcherDrawCount()`, the knob on every present as before
  - HIL: `--mode nested` in hil/waveshare/energy-diagram.js and hil/waveshare4v3b/energy-diagram.js (part of the default run); both boards flashed by USB 2026-10-13 (the user: «Die flashes kannst du selber»), nested PASS on both
- [x] N2 A diagram in a popup moves
  - same commit: a popup's objects (screenOrPopupAt), and neither board stops for an open popup; HIL as N1 (the 4.3B opens it by a button, the knob by a node in the panel); the knob's popup diagram holds sun, bus and fridge only - a storage's track stood out of the small box
- [x] N3 Handbook
  - objekte/anzeigen.md, «Motion»: in a switcher or a popup from the next firmware
- [x] Checkpoint: native tests, knob and 4.3B HIL green
  - test:all 2026-10-13: e2e 1515 passed, 4 red under load (leave-unsaved, new-project, project-list, startup-gate: timeouts, one ECONNRESET to the dev server) - green alone; 4v3b live values and navigator, PaperS3 popups and hold countdown red in the run, green alone; every other suite green, the nested energy checks included
