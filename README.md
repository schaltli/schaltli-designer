# Schaltli Designer

A visual editor for designing screens on small embedded displays (e-paper,
OLED) and deploying them to real devices over MQTT.

**Handbuch (German user handbook): <https://matthias-hess.github.io/schaltli-designer/>** -
installing, flashing a board, designing screens. Its source is
[`handbuch/`](./handbuch/).

## Installing on a Pekaway system

```bash
curl -fsSL https://raw.githubusercontent.com/Matthias-Hess/schaltli-designer/main/deploy/pekaway-install.sh | bash
```

Run as the `pi` user (no `sudo` in front - the script calls `sudo` itself only
for the individual system-level steps below). The same command re-run later
pulls updates and rebuilds in place - it's idempotent, safe to run again.

### Prerequisites

The script assumes this is already true of the system (every Pekaway image
has this out of the box) and **aborts with a clear error instead of trying
to install/patch anything** if it isn't:

- Node.js and npm on `PATH`
- `nginx` and `mosquitto` installed as systemd services
- passwordless `sudo` for the user running the script

### What it installs/changes

1. Clones (or `git pull`s, on a re-run) into `/home/pi/schaltli-designer`,
   then `npm ci` + `npm run build`.
2. Writes `/home/pi/schaltli-designer/.env.local` with
   `NEXT_PUBLIC_DEPLOY_ENABLED=true` - only if that file doesn't already
   exist, so a re-run never clobbers manual edits.
3. Installs and enables a `schaltli-designer.service` systemd unit
   (`next start` on port 3000, restarts on failure, starts on boot).
4. Adds an nginx site (`/etc/nginx/sites-available/schaltli-designer`,
   symlinked into `sites-enabled/`) proxying `schaltli.peka.way` on port 80
   to `127.0.0.1:3000`.
5. Adds a WebSocket listener to mosquitto (see below) and restarts it.

Steps 3-5 are all purely additive - nothing that already exists on the box
(other nginx sites, other systemd services, mosquitto's existing config) is
modified or removed, so other Pekaway services aren't affected. Because
mosquitto only picks up a *new* listener on a full restart (not a reload),
step 5 briefly drops all MQTT connections - anything else on the broker
(e.g. zigbee2mqtt) reconnects automatically within a few seconds.

### How it uses the existing MQTT broker

The designer doesn't run its own broker or bring a new one - it talks to
the mosquitto instance already running on the Pekaway system. That broker
normally only speaks raw MQTT on port 1883 (fine for other Pekaway services,
which are native processes), but a **browser** can only do MQTT over
WebSocket, not a raw TCP socket - that's what the designer's device
discovery and "Deploy to Device" features need for the live connection from
your browser tab to the broker.

So the script adds one more listener to the same broker, alongside the
existing one, rather than introducing a second broker:

```
listener 9001
protocol websockets
allow_anonymous true
```

Same `allow_anonymous true` policy as the existing 1883 listener, so no new
credentials to manage. Devices (the ESP32 firmware, etc.) keep talking to
the broker over plain 1883 exactly as before - only the browser side uses
the new 9001/WebSocket listener, at `ws://schaltli.peka.way:9001`.

## Which version is this?

Three different things, and merging them into one number would only hide which
one is behind:

```
curl http://<pi>:3000/api/version
```

- **designer** — what `git describe` says about the checkout it was built from,
  e.g. `fw-2026.09.15.1-24-g457f1ad-dirty`: 24 commits past that release, built
  from a tree someone was still editing. A designer is installed and updated by
  `git pull`, so that is its identity; there is no separate version number to
  bump. The release tag is in this repository too - `gh release create` puts it
  here while the firmware release tool pushes it there - so **designer and
  firmware describe themselves off the same release name**, each with its own
  distance past it. Both reading a plain `fw-2026.09.15.1` is what "in step"
  looks like.
- **systemGeneration** — the one number the designer and the firmware
  deliberately share. It says whether the two can work together at all; a
  different *major* is what gates a deploy.
- **firmware** — the release whose manifest this designer ships, and the
  firmware commit behind that tag.

The same line is at the bottom of the Deploy dialog. What a *board* runs it
announces itself: the dialog's Firmware panel shows it next to the release, and
`http://<board-ip>/api/debug` says it too. A build named
`fw-2026.09.15.1-8-g330ff3bf2f-dirty` is eight commits past that release and
built from an edited tree - a board flashed from a release carries the bare tag.

## Getting Schaltli onto a new board

A board fresh from the shop runs whatever it left the factory with, and has no
Schaltli to update over the air. Flash it once over the USB cable, from a
computer, in Chrome or Edge:

**<https://matthias-hess.github.io/schaltli-designer/flasher/>**

Pick your board, pick a firmware, connect the cable. Nothing to install - no
drivers, no Python. The page writes one file at 0x0; afterwards the device shows
a setup screen with a QR code and opens a WiFi network of its own, which is
where WiFi and MQTT are entered. From then on firmware arrives over the air
through this designer.

How that page and its images come about: [docs/2026-09-18-factory-image.md](./docs/2026-09-18-factory-image.md).

## Adding a new device

Every project targets a device, described by a Device Description File
(DDF). See [DEVICE_GUIDE.md](./DEVICE_GUIDE.md) for the DDF format and the
device testing plan.

## Design notes

- [docs/device-contract.md](./docs/device-contract.md) — what a firmware
  must do to interpret an export correctly, plus per-device gap status.
- [docs/nested-provenance.md](./docs/nested-provenance.md) — the intended
  DDF ⊂ project ⊂ export nesting, so a deployed device can hand back an
  editable project. Agreed, not yet built; records the reasoning and the
  alternatives already ruled out.

## License

The code in this repository is licensed under the GNU Affero General Public
License, version 3 or (at your option) any later version - see
[LICENSE](LICENSE).
The handbook in [`handbuch/`](handbuch/) is licensed under
[CC BY-SA 4.0](handbuch/LICENSE). The font Varela Round in `brand/` keeps its
own license, the [SIL Open Font License](brand/VarelaRound-OFL.txt).

The name "Schaltli" and the Schaltli mark are not covered by that license. A
fork may use the code, but not present itself as Schaltli.
