# ScreenBee Designer

A visual editor for designing screens on small embedded displays (e-paper,
OLED) and deploying them to real devices over MQTT.

## Installing on a Pekaway system

```bash
curl -fsSL https://raw.githubusercontent.com/Matthias-Hess/screenbee-designer/main/deploy/pekaway-install.sh | bash
```

Run as the `pi` user (no `sudo` in front - the script calls `sudo` itself only
for the individual system-level steps: the systemd service, the nginx site,
and the mosquitto WebSocket listener). Assumes node/npm/nginx/mosquitto are
already present, which is true of any Pekaway system - if something's
missing, the script aborts with a clear error instead of guessing.

The same command re-run later pulls updates and rebuilds - see
[deploy/pekaway-install.sh](./deploy/pekaway-install.sh) for exactly what it
does.

## Adding a new device

Every project targets a device, described by a Device Description File
(DDF). See [DEVICE_GUIDE.md](./DEVICE_GUIDE.md) for the DDF format and the
device testing plan.
