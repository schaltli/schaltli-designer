# Starter redesign - todo

Plan: tasks/starter-redesign-plan.md. State after every step; read this
first after a context summary.

## Phase 0
- [x] H1 commit specs, review, plan, todo (9d7de888)
- [x] H2 app/test-render test, commit (de1b6e15)

## Phase 1 - bridge
- [x] B1 dimmer number (code, spec, handbook; test:quick running)
- [x] B2 heater/view on (heater/last_view; also maxxfan/power on -> maxxfan/last_mode)
- [x] B3 time and date (logic.clock, sbb-clock inject 10 s, only on change)
- [x] B4 block descriptions heater, MaxxFan (Nullen has look:"text" - designer must read it in L5/L7; cover: no immediate state, so asked pulses until Pekaway reports)
- [x] B5 handbook, push sent (user installs on the Pi)

## Phase 2 - LED look
- [x] L1 toggle shape styles (5cade6d5)
- [x] L2 migration, panel, renderer, convert, min width, card corner 12 px (5cade6d5)
- [x] L3 asked pulse (designer, fw loop redraw 500 ms, android LaunchedEffect)
- [x] L4 Button Group LED (designer, fw SwitchShape ledLayout, android; specimen button-group-led)
- [x] L5 button style Text (devices draw exported look; no fw change)
- [x] L6 navigator LED, theme icon entry (devices draw objects; firmware taps the place)
- [x] L7 block builder (commit after test:quick quick-l7: e2e fixed; papers3-popups fetch failed = network)
- [x] L8 export (looks carry light; nav objects; text button look)
- [x] L9 demo (migrates on load; demo-camper green), handbook (bedienen, anordnen, baugruppen)

## Phase 3 - value cards
- [x] V1 heading, wide form (3940f833)
- [x] V2 colour of meaning, thin bar (3940f833; Erste Schritte neu: Tank+Batterie breit, Licht|Dimmer als Tabelle)
- [x] V3 compact chart, sparkline (dc8b9241, fw 17b5c09 geflasht ws4/4v3b/papers3, charts-draw 0 px; Android hat keine Charts → keine Sparkline)

## Phase 4 - chart
- [x] C1 axis rule (TS+fw, Achsenenden ohne Binärrest)
- [x] C2 series name (lib/series-names.ts, Panel über usePrebuiltCatalog)
- [x] C3 invented course (chart-preview inventedData; Live ohne History: Note «Invented: no history yet»)
- [x] C4 range label (rangeLabelOf, ersetzt Tagesnamen; fw geflasht, charts-draw/actions grün auf ws4/4v3b/papers3) (a176f2c0, fw 44867b6)

## Phase 5 - energy
- [x] E1 property, icons (modeSwitchLayout, Ecke beim Einfügen top-right, defaultDiagram ohne)
- [x] E2 preview tap (canvas energyModesRef)
- [x] E3 export + fw (ws4/4v3b/papers3 geflasht, knob gebaut) + Android (HIL 32/32); HIL energy --mode switch, conformance energy 0 px
- [x] E4 demo (ein Diagramm, bottom-right) (300594d7, fw a03f6aa, android 6a9b1ca)

## Phase 6 - firmware
- [x] F1 toggle light + pulse, F2 LED group (fw led-look 9910ea0; conformance 79/79 ws4 + 4v3b; boards flashed over WiFi with --install-checkout)
- [x] F3 navigator (nichts in fw nötig; HIL korrigiert: retained theme, Icon statt Knopf - grün ws4/4v3b/papers3), F4 chart (17b5c09, 44867b6), F5 energy switch (a03f6aa); F6 knob unerreichbar (gebaut, nicht geflasht)

## Phase 7 - Android
- [x] A1 toggle + LED group (780f69f), energy switch (6a9b1ca); Charts kann die App nicht - keine Sparkline dort (Builder fragt supportedObjectTypes)

## Phase 8 - starter
- Stand 2026-11-12: Van-Broker zeigt noch alte Brücke (Dimmer als light, kein schaltli/state/time) -> Erinnerung per Push; S3 hält, bis sie installiert ist
- [x] S1 script: starter-sprechtext.md neu gefasst (K3-K16, neu K10-2b, K14-4b; sprechtext.py liest Buchstaben-Suffix). Drehbuch-Tabellen erst nach neuer Stimme neu takten
- [~] S2: Whitelist + Wächter in lib.mjs (vanPublish, guardVan in record(); heater/view nur fan/off, relay/1, dimmer, theme, maxxfan/cover); K9 umgestellt. Koordinaten der Kapitel erst nach Starter-Neubau im Van-Designer
- [ ] S3 dry run (nächster Schritt: Kapitelskripte K3-K16 auf neue Wortzeiten und neue Bausteine umschreiben, Starter im Van-Designer neu aufbauen). Van läuft seit 2026-11-12 auf fw-2026.11.12.1-pre.starter_look (Designer+Brücke, geprüft: time/date, Dimmer number, Blöcke). Nächster Schritt: M1 vorziehen - neue Takes nur für geänderte Kapitel 3,4,5,6,8-16 (starter-vo.json neu angelegt, markiert alle; alte Takes 0,1,2,7,17-20 behalten), dann Kapitelskripte neu takten und Starter im Van-Designer neu aufbauen


## S3-Lauf: Stand und Erkenntnisse (2026-11-12, nachts)
- Neu aufgenommen gegen den Van-Designer (Rohvideos raw/K*.mp4, Zustände states/after-K*.json): K3 (Toggle Button), K4 (7 Screens, Temperaturen unter Klima), K5 (Kopfzeile: Uhrzeit/Datum-Text links, Flamme rechts, Line-Werkzeug per Klick+Doppelklick), K6 (Navigator LED, 7 Einträge, Theme-Platz 40 px), K7 unverändert. K8 in Arbeit.
- Aufnahme-Browser: Chromium auf :9333 headless, Profil scratchpad/chrome-film (Palette angedockt = localStorage schaltli.palette mode dock). Start: `cmd /c start "" /b chrome.exe --headless=new --remote-debugging-port=9333 --window-size=1614,1051 --force-device-scale-factor=1.2 --user-data-dir=<profil>` (Start-Process-Instanzen starben). Screenshots in Gerätepixeln (÷1.2 = CSS).
- Native <select> im Headless nie anklicken (Tab-Crash), nur hinzeigen + selectOption. Theme-Combobox: Option per Locator-Klick nach scrollIntoView.
- lib.mjs: openProject setzt Van auf hell (vanPublish theme light); guardVan in record(); check-cues.mjs prüft Wortmarken.
- Home-Layout (4"): Kartenabstand paddingMm 1.2 (in after-K7.json gesetzt), Favoriten-Toggles Text size «Large · 16 px», Tabelle «Equal columns» + Width 68.4 mm (6.78 px/mm). Objektliste: Neuestes oben, innere Kartentabellen heissen auch «table» -> äussere Tabelle über kleinste x-Einrückung wählen. Alt-Snap: Karte wird an der Mitte getragen, rastet mit Oberkante 3 px unter/neben ein -> Ziel aus draft()-Geometrie rechnen, nicht feste Koordinaten.

## Phase 9 - film
- [x] M1 voice (vorgezogen, 2026-11-12): neue Takes a/b + b.words.json für K3-K6, K8-K16 in public/vo-st (alte als *.old.*), Session-IDs in vo-st/sessions-2026-11-12.json; Text-Korrekturen K9 (Karten), K11 (Kalibrier-Absatz raus); K0-2, K7, K17-K20 alte Takes. Nutzer muss noch reinhören
- [ ] M2 record
- [ ] M3 assemble
- [ ] M4 starter T5-T8

## Notes
- Known limit: on the knob (360 px) the heater description's two dials side by side are left out (as before 2026-11-11); card-blocks spec pins it.
- L7 decision taken while building: part tiles without heading only for block descriptions (entry id "block ..."); HA entities keep their card with the name, parts inside as Toggle Buttons / LED groups (HA parts «Power» do not say whose they are).
- Handbook texts of L (bedienen, anordnen, baugruppen) ran through maettel-humanizer (2 small edits).
- test:quick for phase 1 (quick-b.log) ran while L-edits were being made; e2e may mix. Rerun after L.
- L7 plan: switch parts -> Toggle Button look "toggle" (default, name inside); choice -> LED group; button look:"text"; multi-part blocks: one card per part (heading = part name, value right for sliders); dimmer 0 -> "Aus".
