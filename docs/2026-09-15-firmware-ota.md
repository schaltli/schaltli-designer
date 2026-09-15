# Firmware updates over the air

Agreed 2026-09-15, and built the same day - all seven steps of the order of
work below, verified on the 4.3B and the PaperS3 (the knob builds but was
not reachable). The code cites this document by decision number. No release
has been published yet: tools/release-firmware.js has only been dry-run.

## Where it starts

- **The slots are there.** The knob, the 4.3B and the PaperS3
  (`screenbee-firmware`) all use `default_16MB.csv`: two 6.4 MB app slots
  plus `otadata`. No board needs repartitioning, so nobody needs a cable.
- **The write path works.** `POST /api/firmware` (`TestInterfaceServer`,
  shared by all three, since `0cfda4c`) streams an image into the other slot
  through `Update`. Sixteen uploads on 2026-09-15 landed;
  `hil/firmware-upload.js` checks it, reading the `last reset …, running
  from …` line the 4.3B and PaperS3 report since `c17dfe7`.
- **So does delivery.** A project deploy is already shaped the way a
  firmware update should be: the designer stores the file on its own backend
  (`app/api/deploy`), publishes a retained MQTT message with a URL and a
  checksum, and the device pulls it over HTTP and reports progress on
  `deploy-status` (`device-contract.md` §4). Pulling means it works wherever
  a project deploy works, the van included.
- **What happens after an update is designed.** `nested-provenance.md`,
  Fall 4: a new firmware that cannot read the installed project shows a
  clear "redeploy" state rather than rolling back.

What is missing: an MQTT-triggered pull on the device, an identity for a
build, a refusal of images meant for another board, a way for firmware to
reach the designer, and the designer's side of it.

One risk found while looking: **`/api/firmware` accepts any ESP32-S3
image today.** The knob's firmware would install on the 4.3B.

## Decisions

**1. Three boards: knob, 4.3B, PaperS3.**
The e-paper (`MqttEPaperDisplay2`) stays on USB flashing until it is retired
(PaperS3 grilling, decision 10). The Android app updates through its own
channel and is not part of this.

**2. Triggered over MQTT, like a project deploy.**
Not a push from the designer to `POST /api/firmware`. Deploy is one of the
building blocks that must be identical on every device, and a pull reports
its own progress and needs no route from the designer to the device.
Topic and payload follow the `deploy` shape - retained, cleared by the
device once taken, as `clearDeployTrigger()` does - with the image's size
and SHA-256 in place of the CRC32. Status goes out on `deploy-status` with
the states it already has.

**3. Firmware ships with the designer, as release assets.**
Installing or updating the designer brings the firmware that was tested
with it, as `public/ddf/` already brings the DDFs. But not in git: an image
is about 2 MB, three boards make 6 MB per firmware state, and git keeps
every one - a clone on a van's mobile connection would grow by hundreds of
megabytes. So the repo carries a small manifest (per device: build id,
system generation, size, SHA-256, download URL) and the images are assets
of a GitHub release. `deploy/pekaway-install.sh` downloads the ones the
manifest names on install and on every update, and checks their hashes.
The release lives in this repo, `screenbee-designer`, not in
`screenbee-firmware`: that one is private, so a Pekaway system could not
download from it without a login. The binaries are public, the firmware
source stays private (the user's choice, the same day).
The user accepted what this implies: firmware reaches devices through
deliberate releases, not every intermediate build.

**4. A file upload in the dialog, for everything else.**
Development builds, and devices whose firmware no release of this designer
will ever carry. Stored and served like a project zip, triggered the same
way.

**5. The device refuses an image that is not its own.**
Every image carries a marker naming its `DEVICE_ID`. The device looks for it
in the stream while writing and aborts before `Update.end()` if it never
came, so the running slot stays as it was. The same check goes into
`POST /api/firmware`. This guards against mistakes, not against intent: as
with project deploys, the network is the trust boundary, and anyone on it
could still upload a marked image.

**6. A build has an identity.**
All three boards announce `FIRMWARE_VERSION "0.1.0"` and always have. A
pre-build step writes a build id from git - commit, and whether the tree was
dirty - the way `pre_build_ddf.py` writes the DDF hash. `hello` carries it
as `firmwareBuild`; `/api/debug` shows it.

**7. The designer points out newer firmware; only a click installs it.**
It compares a device's `firmwareBuild` with the manifest and marks devices
that have a newer one. Nothing checks, downloads or installs on its own,
neither in the designer nor on the device.

**8. During an update the device does nothing else.**
A "Firmware-Update läuft" screen, no rendering and no touch while the image
is written. On failure the old firmware keeps running: an error on
`deploy-status`, the project back on the screen, no restart.

## Order of work

1. **Refuse foreign images** (decision 5) on `POST /api/firmware`. Small,
   and closes the risk above on its own. HIL: `firmware-upload.js` also
   uploads another board's image and asserts it is refused with the slot
   unchanged.
2. **Build identity** (decision 6): `firmwareBuild` in `hello` and
   `/api/debug`.
3. **The MQTT-triggered pull** (decisions 2 and 8), shared in
   `screenbee-firmware` beside `DeployManager`. HIL: `hil/firmware-ota.js`
   triggers the running image through the broker and asserts the status
   sequence, the slot switch and the software restart, and a foreign image
   refused.
4. **Release tooling** (decision 3) in `screenbee-firmware`: build the three
   environments, hash the images, create the GitHub release with them
   attached, write the manifest into this repo.
5. **Install and update script** downloads and verifies the images.
6. **Designer**: the firmware section in the device dialog - running build,
   build available, the hint, the update button, the file upload -
   publishing and following progress as `deploy-dialog.tsx` does. e2e specs
   for the dialog.
7. **Contract**: the new topic in `device-contract.md` §4 and in
   `DEVICE_GUIDE.md`, so a third-party firmware can implement it.

Estimated at three to five working days, hardware checks included.
