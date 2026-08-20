# Testing

Run the full local test suite with `npm run test:all` (bundles the
Playwright `e2e/` suite and every HIL suite: `hil/epaper/`, `hil/m5dial/`,
`hil/waveshare/` and `hil/android/` - see `hil/README.md` for what each one
needs running/connected). Hardware-dependent HIL suites are skipped with a
visible warning when their device isn't reachable, never silently.

**Ad-hoc verification must become a permanent test before a task is done.**
When building or fixing a feature, any one-off script written to verify it
live (a scratch Playwright script, a manual HIL run against real hardware)
gets turned into a permanent `e2e/` spec or an addition to the relevant HIL
fixture (`hil/epaper/fixtures/build-comprehensive-test.js`,
`hil/m5dial/fixtures/`, `hil/waveshare/fixtures/`, or the equivalent under
`hil/android/fixtures/` once one exists) before considering the task
finished - not thrown away. State explicitly, when reporting a
task as complete, which test was added or extended.

Why: before `e2e/` existed (2026-07-26), verification scripts were built
and discarded repeatedly, so regressions in already-fixed behavior went
uncaught until they resurfaced by accident.
