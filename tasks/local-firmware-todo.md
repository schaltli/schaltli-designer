# Todo: local-firmware

Plan: `tasks/local-firmware-plan.md`. Approved by the user 2026-10-13
(«Go»), after reading it as an artifact. Run: /build auto; boards flashed
by USB (allowed: «Die flashes kannst du selber»); no push, no release.

- [x] F1 The HIL test first: hil/local-topics.js
  - initial "b", not the first panel «a» a switcher shows without a value (with "a" check 1 passed on the old firmware); a mid-grey screen, so a switcher showing no panel reads as neither; the broker's retained value is «c»
  - in hil/test-all.js for all three, the knob with the 4.3B as its pair; red on the old knob firmware: 5 of 5
- [ ] F2 The loader and the DDFs
- [ ] F3 The knob
- [ ] F4 The 4.3B
- [ ] F5 The PaperS3
- [ ] Checkpoint: test:all; the user decides on the release
