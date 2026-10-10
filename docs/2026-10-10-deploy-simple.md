# Deploy: at once, complete, or not at all

Decided with the user on 2026-10-10 (a grilling session, after tester Arno
could not deploy and the Deploy dialog had grown four generation warnings,
a firmware section with three buttons and a «will apply on reconnect»
state). The dialog is to do the right thing by itself and say little.

Status: spec agreed 2026-10-10. Issue #66.

## Decisions

1. **Online devices only.** Nothing is queued for a device that is not
   there: no «will apply on reconnect», for a project or for firmware. An
   update that happens days later is one nobody can explain. An offline
   device stays in the list, greyed, marked «offline». Chosen, it says:
   switch it on, and check that it is on the same network as this designer
   with the broker `<host>:1883` (the address the designer gives its
   devices; the designer does not know the WiFi's name). Deploy is off.
2. **No trigger left lying on the broker.** A device clears a retained
   trigger as it takes it (device contract §4). If it has not answered on
   deploy-status within 30 s, the designer clears the trigger itself and
   says «The device did not respond», with «Try again».
3. **A board always on the designer's release.** If the release the
   designer ships is newer than the board's firmware (`firmwareStanding`
   `update-available`), Deploy installs it first, waits until the board is
   back announcing that build, then deploys the project. No question asked:
   the button reads «Update & Deploy» and the line above it says what will
   happen. A board running something newer (`device-ahead`) is never
   downgraded by Deploy.
4. **One line, not warnings.** «Firmware fw-2026.10.04.2 · Deploy installs
   fw-2026.10.09.1 first», «Firmware fw-2026.10.09.1», or «Firmware … (newer
   than this designer's)». The four generation warnings go.
5. **A failed update stops the deploy.** The project is not sent; the
   dialog says why and offers «Try again». The board keeps its firmware (it
   rolls back by itself, hil/firmware-ota.js).
6. **Blocked, with what to do, where the device cannot show the project
   whole** - rather nothing than half:
   - an Android app announcing a lower generation than the project needs:
     update the app (link);
   - a board for which the designer ships no release (`no-release`) whose
     firmware is too old for the project: the flasher at schaltli.com;
   - a board whose release is still too old for the project (a project made
     with a newer designer than its release): the same;
   - object types the device's description does not declare at all (a
     navigator on the round knob): named, to be removed or another device
     chosen.
7. **«Firmware…»** behind a link: «From file…» and «Install release», also
   without a project. «Update firmware» goes - Deploy does it. «Install
   release» on a board running something newer asks first, naming both
   builds: a downgrade is sometimes right, never by accident (the 4.3B sat
   on an old release for a day on 2026-10-09 and nobody knew why).

## What the project needs

The generation a project needs is the highest of: placeholders a device
resolves (1.2), popups (1.3), live values beyond placeholders (1.4), the
navigator or a hidden screen (1.5) - the checks the warnings made, now one
function (`lib/deploy-plan.ts`) that also decides decisions 3 to 6 from the
device, the release and the project, without a browser.

## Verification

- `e2e/deploy-plan.spec.ts`: the plan for every case above, pure.
- `e2e/deploy-dialog.spec.ts`, against fake devices on the local broker:
  offline greyed and not deployable, with the broker address; no answer in
  30 s clears the trigger; Update & Deploy runs firmware then project; a
  failed update sends no project; Android too old is blocked; «Install
  release» over a newer build asks.
- HIL: the 4.3B set to fw-2026.10.04.2, Update & Deploy from the dialog
  (hil/firmware-designer.js), back on the current build afterwards.

## Not in this

The Android app cannot be updated from here. Several devices at once. A
progress bar for the firmware download beyond what deploy-status reports.
