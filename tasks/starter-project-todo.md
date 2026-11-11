# starter-project - todo

Plan: tasks/starter-project-plan.md. Video: docs/video/starter-stichworte.md,
docs/video/starter-sprechtext.md.
Each code task: `npm run typecheck`, then `npm run test:quick` (CLAUDE.md);
name the test added and the handbook page changed when reporting.

- [x] T0 (user, 2026-11-10) Code-Nachbau: die nicht committeten Änderungen verworfen (Diff im Scratchpad der Sitzung), der committete Stand bleibt für camperui-rebuild.spec und card-blocks.spec. Arbeit auf Branch `starter-project`.
- [ ] T1 Bridge (STAND 2026-11-10 nachts: Code, Spec und Handbuch fertig auf Branch starter-project, nicht committet; vanpi-bridge.spec 47/47 grün, typecheck grün; test:quick noch einmal laufen lassen, dann committen. Ausserdem uncommitted: app/test-render/page.tsx (Energy-diagram-Icons in Tabellen/Panels vorladen), braucht noch einen Test) (`integrations/vanpi/bridge-logic.js`, `build-flow.js`): globals `shore_*`, `booster_*` to `schaltli/state/shore/{connected,power,voltage,current}` and `schaltli/state/booster/{active,power,voltage,current}`, only when set; `solar_power` or else Pekaway's `mppt_pv_watts` to `schaltli/state/solar/power`; Home Assistant announcements for them.
  - Accept: e2e on createBridgeLogic: set globals give the topics, unset give none; solar takes `solar_power` over the MPPT and falls back. Handbook `betrieb/vanpi-bruecke.md` names the variables and the exception.
- [ ] T2 Van flow (STAND: `vanpi-custom/flows/schaltli_quellen.json` geschrieben, nicht committet, nicht im Van) in `vanpi-custom` filling the variables from `ble/charger`, `ble/orion` and the Ective. Brought to the Pi by git bundle (memory: vanpi-custom auf dem Pi).
  - Accept: on the van broker `schaltli/state/shore/power`, `booster/power`, `solar/power` follow the BLE values.
- [x] T3 Dummy camera (2026-11-10: läuft per nohup auf dem Pekaway, http://192.168.8.107:8090/shot.jpg, Bilder in ~/schaltli-camera; überlebt keinen Neustart: `cd ~/schaltli-designer && nohup node hil/camera-server.js --frames /home/pi/schaltli-camera --port 8090 &`) on the Pekaway: frames prepared on the PC (`hil/camera-server.js --prepare-demo`), uploaded, served with `--frames`; check `jimp` there.
  - Accept: the camera address answers a JPEG that moves, from the 4".
- [ ] T4 Checks before filming (STAND: Screens über/unter der Reihe bekommen keinen Navigator-Eintrag; Recorder hält 30 Tage, zeichnet aber nur auf, was ein Chart eines übertragenen Projekts zeigt - Vortage gibt es erst später; offen: Verbraucher des Energy diagram gegen den Energie-Flow): does a screen under the main row get a navigator entry; how many past days does the recorder hold; does the energy diagram's consumers match the van's own flow.
- [ ] Checkpoint A: filming in the van. Der Nutzer will, dass Claude baut und filmt (ffmpeg gdigrab, Designer auf http://192.168.8.107:3000 im Chrome; Probe ok). Ton per ElevenLabs-MCP (seit 2026-11-10 mit --scope user eingetragen). Auf «stop» des Nutzers angehalten, noch nicht begonnen.
- [ ] T5 Starter from the filmed project: download, camera address to a placeholder, kept under `lib/starters/`, registry entry (id, label, device ids).
  - Accept: a spec lists every topic of the starter: all under `schaltli/`; no address of the user's van.
- [ ] T6 New Project dialog: «Start with» Empty / the starter, only for the 4"; Create saves it and opens it.
  - Accept: e2e: 4" offers the choice, 4.3B and Knob do not; created from the starter it opens with Home first and is saved; Empty unchanged. Passes in `npm run test:e2e:prod`.
- [ ] T7 Demo: seed the starter beside «Camper»; a visitor can open it.
- [ ] T8 Handbook: `designer/projekte.md` (the choice), `geraete/waveshare-4.md` (starter, navigator on the 4"), `objekte/anordnen.md` (navigator also on the 4"), CamperUI named as the model; humanizer; `e2e/handbook-labels.spec.ts` green.
- [ ] Checkpoint B (user): reads the handbook pages.
- [ ] T9 `docs/video/remotion/scripts/sprechtext.py` reads K numbers from `starter-sprechtext.md`; BLE in `aussprache.md` if the voice gets it wrong.
- [ ] T10 (user) Release; forum reply to Mario in thread 2781 (draft by me); the video.
