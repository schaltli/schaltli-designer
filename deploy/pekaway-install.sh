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

set -euo pipefail

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
  git pull --ff-only
else
  log "Cloning into $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# --- 3. Install deps + build ---
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

# --- 4. .env.local (only written once - never overwrites manual edits) ---
if [ ! -f "$INSTALL_DIR/.env.local" ]; then
  log "Writing .env.local..."
  echo "NEXT_PUBLIC_DEPLOY_ENABLED=true" > "$INSTALL_DIR/.env.local"
else
  log ".env.local already exists, leaving it untouched."
fi

# --- 5. systemd service ---
log "Installing systemd service ${SERVICE_NAME}.service..."
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null <<EOF
[Unit]
Description=Schaltli Designer
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
Environment=PORT=${APP_PORT}
Environment=NODE_ENV=production
ExecStart=$(command -v npm) run start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

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

log "Done."
log "Schaltli Designer: http://${DOMAIN}/"
log "MQTT WebSocket broker: ws://${DOMAIN}:${MQTT_WS_PORT}"
