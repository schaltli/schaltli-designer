# Card (`card`): tasks

Plan: `tasks/card-plan.md`. Spec: `docs/2026-11-03-card.md`. Designer only,
branch `card`.

## Task 1: The look in the model

**Acceptance criteria:**
- [x] `lib/card.ts`: defaults, `cardSettingsOf`, `withCardLook` for Card and Card, accent; mm to px at the project's scale
- [x] `layoutProject` applies looks before docking, on every screen and at any depth; a second pass changes nothing
- [x] Look None: the area keeps its last values

**Verification:** `e2e/card.spec.ts` (new); `npm run test:quick` with Task 2
**Files likely touched:** new `lib/card.ts`, `lib/layout.ts`
**Estimated scope:** S

## Task 2: Card tool, Look, Settings › Cards

**Acceptance criteria:**
- [x] The Card tool beside Free, drawing a free area with `look: "card"`
- [x] Look (None, Card, Card, accent) in the free area's section; the look's fields greyed with a note
- [x] Settings › Cards: radius, edge, accent edge, padding, a preview; a change reaches every card, one undo step
- [x] Handbook: `objekte/anordnen.md` (Card), `designer/projekte.md` (the tab)

**Verification:** `e2e/card-canvas.spec.ts` (new), `e2e/handbook-labels.spec.ts`
**Dependencies:** Task 1
**Files likely touched:** `components/toolbar/toolbar.tsx`, `components/canvas/canvas.tsx`, `components/property-panel/free-properties.tsx`, `components/project-settings-dialog.tsx`, handbook
**Estimated scope:** M

## Task 3: The anchor-dock card on the look; final run

**Acceptance criteria:**
- [x] `e2e/anchor-dock-card.spec.ts` builds its card with `look: "card"`, laid out as before
- [x] The spec's success criteria ticked; `npm run test:quick` green apart from known load failures

**Done:** `npm run test:quick` 2026-11-03: host 2109 passed; 4v3b-charts-draw skipped (board unreachable), green alone at 0 px; 4v3b-internal-heap red as always. Built differently from the spec: a look's fields are hidden behind a note rather than greyed - the panel's fields have no greyed state (noted in the spec). The Card tool needed `card` exempted from the toolbar's «declared by the device» check, as layout-only types are.

**Dependencies:** Task 2
**Estimated scope:** XS
