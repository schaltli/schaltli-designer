#!/usr/bin/env bash
# Schaltli Designer - install/update script for a Pekaway system.
#
# Safe to re-run: this is the same script for a first install and for
# pulling updates later (git pull + npm ci + rebuild + restart the
# service). It only ever adds to nginx/mosquitto config, never touches
# anything that predates it, so other Pekaway services aren't affected.
#
# Assumes "a Pekaway system" already has Node.js, npm, nginx and
# mosquitto installed and running, and that this user has passwordless
# sudo (all true for the reference Pekaway image) - if any of that
# isn't the case, this script aborts with a clear error rather than
# trying to install/patch those itself.
#
# Usage: ./pekaway-install.sh   (run as the "pi" user, not via sudo -
# it invokes sudo itself only for the specific system-level steps)
#
#   ./pekaway-install.sh --ref fw-2026.09.27.2-pre.knob_crash
#
# installs exactly that version instead: a pre-release built for one person
# to try (the firmware's tools/release-firmware.js --prerelease), or any tag
# or branch. Without --ref it is always main, the official version - which is
# also how to go back from a pre-release. Through curl:
#
#   curl -fsSL .../pekaway-install.sh | bash -s -- --ref <tag>

set -euo pipefail

REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:-}"; [ -n "$REF" ] || { echo "[pekaway-install] ERROR: --ref needs a tag or branch" >&2; exit 1; }; shift 2 ;;
    *) echo "[pekaway-install] ERROR: unknown option $1" >&2; exit 1 ;;
  esac
done

INSTALL_DIR="/home/pi/schaltli-designer"
REPO_URL="https://github.com/Matthias-Hess/schaltli-designer.git"
APP_PORT=3000
DOMAIN="schaltli.peka.way"
MQTT_WS_PORT=9001
SERVICE_NAME="schaltli-designer"
SERVICE_USER="pi"

log() { echo "[pekaway-install] $*"; }
fail() { echo "[pekaway-install] ERROR: $*" >&2; exit 1; }

# --- 1. Preflight: fail loudly if this doesn't look like a Pekaway system ---
command -v node >/dev/null 2>&1 || fail "node not found - this script assumes a Pekaway system with Node.js already installed."
command -v npm >/dev/null 2>&1 || fail "npm not found - this script assumes a Pekaway system with npm already installed."
command -v git >/dev/null 2>&1 || fail "git not found."
systemctl list-unit-files nginx.service >/dev/null 2>&1 || fail "nginx.service not found - this script assumes a Pekaway system with nginx already installed."
systemctl list-unit-files mosquitto.service >/dev/null 2>&1 || fail "mosquitto.service not found - this script assumes a Pekaway system with mosquitto already installed."
sudo -n true 2>/dev/null || fail "passwordless sudo not available for this user - required to install the systemd service and edit nginx/mosquitto config."

# --- 2. Clone or update ---
if [ -d "$INSTALL_DIR/.git" ]; then
  log "Existing install found at $INSTALL_DIR, updating..."
  cd "$INSTALL_DIR"
  if [ -n "$(git status --porcelain)" ]; then
    fail "$INSTALL_DIR has uncommitted local changes - resolve manually (git status) before re-running this script."
  fi
else
  log "Cloning into $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
# Which version: main unless --ref names another. A pre-release is a tag, and
# is checked out as it is (detached); a branch follows its remote. Fetched
# every time, tags included, so a pre-release published since the last run is
# found - and forced, since a pre-release's tag may be made again.
git fetch --prune --tags --force origin
TARGET="${REF:-main}"
if git show-ref --verify --quiet "refs/remotes/origin/$TARGET"; then
  git checkout -B "$TARGET" "origin/$TARGET"
elif git show-ref --verify --quiet "refs/tags/$TARGET"; then
  git checkout --detach "refs/tags/$TARGET"
else
  fail "no branch or tag $TARGET in $REPO_URL"
fi
log "Installing $TARGET ($(git describe --tags --always))"

# --- 3. .env.local (only written once - never overwrites manual edits) ---
# Before the build, not after it: NEXT_PUBLIC_* values are compiled into the
# build, so a flag written afterwards only takes effect on the next run - and
# a first install came up without Deploy to Device (issue #3).
if [ ! -f "$INSTALL_DIR/.env.local" ]; then
  log "Writing .env.local..."
  echo "NEXT_PUBLIC_DEPLOY_ENABLED=true" > "$INSTALL_DIR/.env.local"
else
  log ".env.local already exists, leaving it untouched."
fi

# --- 3a. Install deps + build ---
log "Installing dependencies (npm ci)..."
npm ci
log "Building..."
npm run build

# --- 3b. Firmware for the devices (docs/2026-09-15-firmware-ota.md) ---
# The images firmware/manifest.json names, downloaded from this repo's GitHub
# release and checked against their SHA-256. Not fatal: the designer works
# without them, it just cannot offer those firmware updates until a later run
# fetches them - and says so in the device dialog.
log "Fetching firmware images..."
node scripts/fetch-firmware.js || log "WARNING: some firmware images could not be fetched - re-run this script to retry."

# --- 3c. VanPi bridge for live values (docs/2026-09-15-live-data.md) ---
# A Node-RED tab that asks Pekaway's MQTT API for its values every two seconds
# and republishes each retained under schaltli/state, and turns
# schaltli/cmnd commands into Pekaway's. Added or updated as one tab through
# Node-RED's admin API, after saving a copy of all flows; on a system without
# Pekaway's API it does nothing. --verify waits for the values on the broker.
# Not fatal: the designer works without it.
log "Installing the Schaltli VanPi bridge into Node-RED..."
node scripts/install-vanpi-bridge.js --verify || log "WARNING: the VanPi bridge could not be installed or verified - live values will not reach schaltli/state."

# --- 5. systemd: started when asked for, stopped when idle ---
# Most of the time nobody designs in the van, and a running designer holds
# some 180 MB (plus 60 MB for an npm around it, until 2026-09-28) for no one.
# So systemd listens on APP_PORT itself (${SERVICE_NAME}.socket); the first
# connection starts a small proxy, which starts the designer on an internal
# port and forwards to it. After IDLE_STOP without a connection the proxy
# exits and the designer stops with it (StopWhenUnneeded). The next visit -
# a browser, or a device fetching a retained deploy - starts it again, a few
# seconds later than a running one would answer. Addresses, nginx and the
# devices notice nothing else.
#
# And quiet on the SD card: node directly rather than through npm (which
# writes its own logs there when anything goes wrong), no telemetry, and
# stdout - the start banner, every start - kept out of the journal, which is
# persistent on Pekaway's image. Errors still go there.
INTERNAL_PORT=3001
IDLE_STOP="30min"
log "Installing systemd units for ${SERVICE_NAME} (socket-activated, stops after ${IDLE_STOP} idle)..."
# The one service of old was enabled and listening on APP_PORT itself.
if systemctl is-enabled "${SERVICE_NAME}.service" >/dev/null 2>&1; then
  sudo systemctl disable --now "${SERVICE_NAME}.service"
fi
sudo systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true

sudo tee "/etc/systemd/system/${SERVICE_NAME}.socket" > /dev/null <<EOF
[Unit]
Description=Schaltli Designer (listens, starts the designer on demand)

[Socket]
ListenStream=${APP_PORT}
Service=${SERVICE_NAME}-proxy.service

[Install]
WantedBy=sockets.target
EOF

sudo tee "/etc/systemd/system/${SERVICE_NAME}-proxy.service" > /dev/null <<EOF
[Unit]
Description=Schaltli Designer (forwards to the designer, exits when idle)
Requires=${SERVICE_NAME}.service ${SERVICE_NAME}.socket
After=${SERVICE_NAME}.service ${SERVICE_NAME}.socket

[Service]
ExecStart=/lib/systemd/systemd-socket-proxyd --exit-idle-time=${IDLE_STOP} 127.0.0.1:${INTERNAL_PORT}
EOF

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null <<EOF
[Unit]
Description=Schaltli Designer
After=network.target
StopWhenUnneeded=yes

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
# The port devices are sent to for downloads: the public one, not INTERNAL_PORT
# (lib/server-lan-address.ts devicePort).
Environment=SCHALTLI_PUBLIC_PORT=${APP_PORT}
ExecStart=$(command -v node) ${INSTALL_DIR}/node_modules/next/dist/bin/next start -H 127.0.0.1 -p ${INTERNAL_PORT}
# Started only once it answers: the proxy is ordered after this unit, and a
# connection forwarded to a port nobody listens on yet would be refused.
ExecStartPost=/bin/bash -c 'until (echo > /dev/tcp/127.0.0.1/${INTERNAL_PORT}) 2>/dev/null; do sleep 0.3; done'
TimeoutStartSec=120
StandardOutput=null
Restart=on-failure
RestartSec=5
EOF
sudo systemctl daemon-reload
# A running proxy and designer from before this run still serve the old build:
# stopped, so the next visit starts the new one.
sudo systemctl stop "${SERVICE_NAME}-proxy.service" "${SERVICE_NAME}.service" 2>/dev/null || true
sudo systemctl enable "${SERVICE_NAME}.socket"
sudo systemctl restart "${SERVICE_NAME}.socket"

# --- 6. nginx site (schaltli.peka.way -> 127.0.0.1:APP_PORT) ---
log "Installing nginx site for ${DOMAIN}..."
sudo tee "/etc/nginx/sites-available/${SERVICE_NAME}" > /dev/null <<EOF
server {
        listen 80;
        server_name ${DOMAIN};

        location / {
                proxy_pass http://127.0.0.1:${APP_PORT}/;
        }
}
EOF
sudo ln -sf "/etc/nginx/sites-available/${SERVICE_NAME}" "/etc/nginx/sites-enabled/${SERVICE_NAME}"
sudo nginx -t
sudo systemctl reload nginx

# --- 7. mosquitto WebSocket listener (browser MQTT needs WS, not raw 1883) ---
MQTT_CONF="/etc/mosquitto/conf.d/schaltli-websockets.conf"
if [ ! -f "$MQTT_CONF" ]; then
  log "Adding mosquitto WebSocket listener on port ${MQTT_WS_PORT}..."
  sudo tee "$MQTT_CONF" > /dev/null <<EOF
listener ${MQTT_WS_PORT}
protocol websockets
allow_anonymous true
EOF
  # mosquitto doesn't pick up a new listener on reload (SIGHUP only
  # reloads logging/ACLs) - a restart is required to actually bind it.
  sudo systemctl restart mosquitto
else
  log "Mosquitto WebSocket listener config already present, leaving it untouched."
fi

# The address that works. ${DOMAIN} has no DNS record anywhere (issue #4), so
# naming it here sent people to a page their browser could not find; the
# nginx site for it stays, for the day Pekaway's zone carries the name.
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
log "Done."
log "Schaltli Designer: http://${LAN_IP:-<this system's IP>}:${APP_PORT}/"
log "MQTT WebSocket broker: ws://${LAN_IP:-<this system's IP>}:${MQTT_WS_PORT}"
