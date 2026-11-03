# Card (`card`): plan

Spec: `docs/2026-11-03-card.md` (approved 2026-11-03). Branch `card` from
`main`. Designer only.

The model first: a look written into the area by the layout pass is all the
rest needs, so the editor, preview, export and HIL reference stay as they
are. Then the UI that sets it. Then the anchor-dock card on the look and the
final run.

```
T1 lib/card.ts + layoutProject (model)
 └─ T2 Card tool, Look field, Settings › Cards, handbook
     └─ T3 the anchor-dock card on the look; final run
```

## Risks

| Risk | Mitigation |
|---|---|
| The layout pass writing properties makes every pass a change (undo steps, renders) | Values compared before writing; a pass that finds them there returns the same object - tested by laying out twice |
| A settings change must be one undo step | It is one project update, relaid out once |
| The tool filter hides tools the DDF does not declare | Card offered wherever Free is: both are layout-only |
