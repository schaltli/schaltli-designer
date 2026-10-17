# Todo: graph-model

Plan: `tasks/graph-model-plan.md`. Approved by the user on 2026-10-17,
decision 1 after asking why («ok, bleib bei 1»), decision 7 (a row
screen with no swipe action gains swiping to its neighbours: «7 ja»).

- [x] G1 The core
  - lib/screen-graph.ts: `mainRow`, `rowScreenOf`, `isInGraph`, `neighboursOf`, `backOf`, `screensCutOff`, `withCutOffHidden`, `canDock`, `pagedScreen`; `dock?` on ProjectScreen
  - `isPagedScreen` leaves docked screens out, so `firstScreenToOpen` and the preview's next and previous follow the main row (`pagedScreen`: from a docked screen it counts from the row screen it hangs from)
  - left and right of a row screen is the row: docking there is refused, the list orders the row
  - e2e/screen-graph.spec.ts «screen graph: the core» (7 tests)
- [x] G2 The action
  - `goto-neighbour` with `side` in HardwareButtonAction; summaries «Go to the screen above / below / on the left / on the right» (`describeNeighbourSide`)
  - the picker: «Go to the screen beside» (not on a popup) and «Side»; a swipe suggests the side it pulls in, a button «Right»; «No screen is docked there: here it does nothing.» on a screen without one
  - the preview moves to the neighbour and closes a popup; a click on a swipe or button resolves through `resolveSwipeAction` (own, «Nothing» included; neighbour; master)
  - e2e/screen-graph.spec.ts «what a swipe does» (4) and «Go to the screen beside» (picker, note, preview)
- [x] G3 The export
  - device zip and Android bundle: `mainRow`, each screen's `neighbours` and `back`; a docked screen also `hidden: true`, so a board of today pages past it
  - `exportedButtonAction(..., screens)` resolves a swipe as own, neighbour, master; a neighbour in the row beside a row screen goes out as «Next screen» / «Previous screen», one off the row as `goto-neighbour`, none as nothing - a single row exports no `goto-neighbour`
  - Android also writes the four swipes of a screen in the graph, which only a neighbour may fill
  - e2e/screen-graph-export.spec.ts (4 cases, device and Android); e2e/android-export.spec.ts «a master screen is resolved away» now expects the row neighbour's swipe on the screen without a master (decision 7)
- [x] G4 «Position» and leaving the graph
  - «Position» in ScreenEditorFields (the screen's panel and Manage Screens): «In the main row» and every place `canDock` allows, e.g. «Below "Energie"»; not on a hidden screen, a popup or a master
  - «Hide screen» only on a screen in the row
  - one place for every way a screen leaves the graph: `setProject` runs `withGraphMended` (lib/screen-graph.ts) - a screen docked on one deleted, hidden or made a popup or master becomes hidden, a toast names it once; a screen itself made a popup or master just loses its dock
  - e2e/screen-graph.spec.ts «Position» (dock by the field, offered places, hide the page → its history hidden, toast) and «a broken dock is mended»
- [x] G5 The navigator
  - `navigatorScreens` leaves docked screens out: the main row, in the preview and in the device's baked entries alike
  - `navigatorEntries` (lib/navigator-entries.ts): on a docked screen one entry without a name, an arrow against the way back (four arrow icons, `BACK_ARROW_ASSETS`), whose id is the screen it goes back to - so drawing, layout and a click take it as any entry
  - e2e/navigator.spec.ts «the navigator and the screen graph»: a docked screen has no entry; on it the single «←» goes back
  - the device draws its own «←» in graph-firmware; nothing of it is baked yet
- [x] G6 Handbook
  - handbuch/designer/screens.md «Screens über- und untereinander» (main row, «Position», the swipe order, cut-off screens hidden, a warning that the devices follow with their next firmware and app) and «Position» among the screen's properties
  - handbuch/designer/tasten.md: «Go to the screen beside» in the table; swipes go to the neighbours, the master where none is, buttons for each direction
  - through maettel-humanizer; e2e/handbook-labels.spec.ts green
  - the screen menu stays in the handbook until graph-contract removes it
- [ ] Checkpoint: test:quick green (G5 run 2026-10-17: e2e 1597 passed, every device lane green); the user docks a history below a page in the preview
