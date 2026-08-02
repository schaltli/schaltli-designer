# ScreenBee Designer

A visual editor for designing screens on small embedded displays (e-paper,
OLED) and deploying them to real devices over MQTT.

## Installing on a Pekaway system

```bash
curl -fsSL https://raw.githubusercontent.com/Matthias-Hess/screenbee-designer/main/deploy/pekaway-install.sh | bash
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

1. Clones (or `git pull`s, on a re-run) into `/home/pi/screenbee-designer`,
   then `npm ci` + `npm run build`.
2. Writes `/home/pi/screenbee-designer/.env.local` with
   `NEXT_PUBLIC_DEPLOY_ENABLED=true` - only if that file doesn't already
   exist, so a re-run never clobbers manual edits.
3. Installs and enables a `screenbee-designer.service` systemd unit
   (`next start` on port 3000, restarts on failure, starts on boot).
4. Adds an nginx site (`/etc/nginx/sites-available/screenbee-designer`,
   symlinked into `sites-enabled/`) proxying `screenbee.peka.way` on port 80
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
the new 9001/WebSocket listener, at `ws://screenbee.peka.way:9001`.

## Adding a new device

Every project targets a device, described by a Device Description File
(DDF). See [DEVICE_GUIDE.md](./DEVICE_GUIDE.md) for the DDF format and the
device testing plan.
