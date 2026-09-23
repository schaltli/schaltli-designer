# Testing

Run the full local test suite with `npm run test:all` (bundles the
Playwright `e2e/` suite and every HIL suite: `hil/epaper/`,
`hil/waveshare/`, `hil/waveshare4v3b/`, `hil/android/` and
`hil/conformance/` - see `hil/README.md` for what each one needs
running/connected). Hardware-dependent HIL suites are skipped with a
visible warning when their device isn't reachable, never silently.

**Ad-hoc verification must become a permanent test before a task is done.**
When building or fixing a feature, any one-off script written to verify it
live (a scratch Playwright script, a manual HIL run against real hardware)
gets turned into a permanent `e2e/` spec or an addition to the relevant HIL
fixture (`hil/epaper/fixtures/build-comprehensive-test.js`,
`hil/waveshare/fixtures/`, or the equivalent under
`hil/android/fixtures/` once one exists) before considering the task
finished - not thrown away. State explicitly, when reporting a
task as complete, which test was added or extended.

Why: before `e2e/` existed (2026-07-26), verification scripts were built
and discarded repeatedly, so regressions in already-fixed behavior went
uncaught until they resurfaced by accident.

# Handbook

`handbuch/` is the user handbook (German, VitePress), published at the root of
this repo's GitHub Pages site by `.github/workflows/pages.yml`; the flasher
page sits beside it under `flasher/`. Preview it with `npm run dev --prefix
handbuch`.

**A change a user can see is not done until the handbook says so.** A renamed
label, a changed flow, a new object type, a new device or a changed device
gesture gets its handbook page updated in the same piece of work. State
explicitly, when reporting such a task as complete, which handbook page was
changed - or that none needed to be.

Labels the handbook quotes from the designer are marked `<span
class="ui">…</span>`; `e2e/handbook-labels.spec.ts` fails when one of them no
longer exists in the designer's source. Labels only a device shows are marked
`<span class="ui fw">…</span>` and are not checked there.

Known shortcomings the handbook warns about carry an HTML comment
`<!-- handbuch-macke #<issue>: … -->` next to the warning, naming its GitHub issue
labelled `handbuch`. Fixing one means removing its warning too.

Writing style (decided 2026-09-23): Swiss spelling (ss, «…»), "du" without
chumminess, English UI labels quoted verbatim, "Screen" in running text.
Drafts go through the `maettel-humanizer` skill before they count as written.

Why: the handbook quotes the UI word for word so a reader can find what it
names, which means every UI change can silently make it wrong.
