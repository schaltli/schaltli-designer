# Plan: Starter project (`starter-project`)

Asked for on 2026-11-10 after the forum thread «Schaltli für 4" Waveshare
Display» (forum.pekaway.de/t/2781): a tester should not start from an empty
screen. Rewritten the same day after the video was planned
(`docs/video/starter-stichworte.md`, `docs/video/starter-sprechtext.md`): the
starter is the project built on camera, not a project built by code.

## What it is

The New Project dialog gets a choice in its name step: start empty, as now,
or from a starter. The first starter is for the Waveshare 4"
(`waveshare-touch-lcd-4`): the screens of the video, in Schaltli's standard
look, after CamperUI's arrangement. The choice appears only for a device a
starter is made for.

## Decisions

1. **The starter is the filmed project.** The user builds it in the designer
   on the Pekaway while filming. Afterwards it is downloaded as a project file
   and kept in the repo as the starter. `buildCamperUiProject`
   (`deploy/demo/camperui-project.ts`) no longer becomes the starter.
2. **It reads only `schaltli/…`.** Values the VanPi does not have by itself
   come through the bridge (decision 3), so the same project works on any
   VanPi: what someone has not wired stays absent, not wrong. The camera's
   address is the only value of the user's van; it becomes a placeholder.
3. **The bridge takes over CamperUI's variables for shore power and booster,
   and one for solar.** CamperUI reads Node-RED globals the user fills
   (`shore_connected`, `shore_power`, `shore_voltage`, `shore_current`,
   `booster_active`, `booster_power`, `booster_voltage`, `booster_current`;
   CamperUI `docs/flows/vanpi_energy_producers_flow.json`). The bridge
   publishes them, when set, as `schaltli/state/shore/…` and
   `schaltli/state/booster/…` and announces them. New: `solar_power`; when set
   the bridge publishes it as `schaltli/state/solar/power`, otherwise Pekaway's
   MPPT watts (never the sum: whoever has both adds them in their own flow).
   This is the bridge's second deliberate exception to «only Pekaway's
   documented API» after `ttgo`; the handbook says so.
4. **The user's van fills the variables with a small flow** in `vanpi-custom`
   (`ble/charger/…` to `shore_*`, `ble/orion/…` to `booster_*`, the Ective's
   watts to `solar_power`).
5. **Filmed in the van, with a dummy camera** (`hil/camera-server.js
   --frames`, the user's drain video, as on demo.schaltli.com) running on the
   Pekaway, since the van has no camera yet.
6. **Reaches Pekaway users only through a release**, which the user ships.

## Dependency order

```
T0 fate of the uncommitted code rebuild (user)
T1 bridge: shore_*, booster_*, solar_power        ─┐
T2 van flow fills the variables (vanpi-custom)     ├ T4 checks before filming
T3 dummy camera on the Pekaway                    ─┘   └ Checkpoint A: filming (user)
                                                          └ T5 starter from the filmed project
                                                             └ T6 dialog: the choice
                                                                ├ T7 demo seed
                                                                └ T8 handbook ── Checkpoint B
T9 voiceover script reads K numbers, BLE in aussprache.md (any time)
                                                                   └ T10 release, forum (user)
```

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Installing the new bridge and the van flow on the Pekaway is the user's (van-deploy, install) | Filming waits | T1 first, release or pre-release before filming |
| `jimp` is a devDependency; the camera server may not start on the Pi | Dummy camera missing | Check in T3; frames could be served by a plain static server instead |
| A project downloaded from the designer carries the camera address and names of the user's van | Starter not neutral | T5 replaces the address with a placeholder; a test lists every topic and URL in the starter |
| Names in a UI label: CamperUI has no stated licence | Low | Label neutral, CamperUI named as the model in the handbook and the video only |

## Open questions

1. Label in the dialog: «VanPi-Starter (4")» (proposal) or naming CamperUI?
2. T0: commit the code rebuild as a comparison, or drop it?
