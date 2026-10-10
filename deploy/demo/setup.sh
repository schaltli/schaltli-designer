#!/usr/bin/env bash
# Sets up or updates demo.schaltli.com (docs/2026-10-09-demo-instance.md,
# decision 10) on a Debian server. Run as root, over SSH, from the PC - by
# deploy/demo/deploy.sh:
#
#   ssh schaltli-demo 'sudo bash -s -- --ref <commit or tag>' < deploy/demo/setup.sh
#
# Idempotent: a second run with the same ref changes nothing but restarting
# the services. Expects Node 22, Mosquitto, Caddy and git installed and the
# firewall open on 22, 80 and 443 only (done once by hand, 2026-10-09).
#
# What it sets up:
#   - a system user `schaltli`, the designer in /opt/schaltli-demo at the ref,
#     built for production;
#   - the start project, from /tmp/schaltli-demo-seed.tar.gz if deploy.sh
#     uploaded one (a project store made on the PC, e2e/demo-camper.spec.ts);
#   - /etc/schaltli-demo.env: demo mode on, the start project's name, the
#     demo van's broker password (made once, kept);
#   - Mosquitto on 127.0.0.1 only, 1883 and 9001 (websockets): anonymous
#     visitors read schaltli/# and homeassistant/# and write schaltli/cmnd/#
#     and nothing else; the demo van has an account that may do all;
#   - Caddy for demo.schaltli.com: HTTPS by itself, /mqtt to Mosquitto's
#     websockets, everything else to the designer, bodies above 64 KB refused;
#   - two systemd units, the designer (at most 1 GB of memory) and the demo
#     van, restarted on failure;
#   - for counting visits (docs/2026-10-10-demo-tracking.md): DB-IP's free
#     city database and GeoNames' places of 50 000 people or more, in
#     /var/lib/schaltli-demo-geo, fetched again after a month.

set -euo pipefail

main() {
REF="main"
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:?--ref needs a commit or tag}"; shift 2 ;;
    *) echo "[demo-setup] ERROR: unknown option $1" >&2; exit 1 ;;
  esac
done

DIR=/opt/schaltli-demo
REPO=https://github.com/schaltli/schaltli-designer.git
USER_NAME=schaltli
DOMAIN=demo.schaltli.com
ENV_FILE=/etc/schaltli-demo.env
SEED=/tmp/schaltli-demo-seed.tar.gz

log() { echo "[demo-setup] $*"; }
[ "$(id -u)" = 0 ] || { echo "[demo-setup] ERROR: run as root" >&2; exit 1; }

# --- the user and the checkout ---
id "$USER_NAME" >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/schaltli --shell /usr/sbin/nologin "$USER_NAME"
mkdir -p "$DIR"
chown "$USER_NAME:$USER_NAME" "$DIR"
as_user() { runuser -u "$USER_NAME" -- "$@"; }
if [ ! -d "$DIR/.git" ]; then
  log "Cloning $REPO"
  as_user git clone --quiet "$REPO" "$DIR"
fi
cd "$DIR"
as_user git fetch --quiet --tags --force origin
as_user git checkout --quiet --force "$REF" 2>/dev/null || as_user git checkout --quiet --force "origin/$REF"
log "Designer at $(as_user git describe --tags --always)"

log "npm ci"
as_user npm ci --no-audit --no-fund --loglevel=error
log "Building"
as_user env NEXT_TELEMETRY_DISABLED=1 npm run build --silent >/dev/null

# --- the start project ---
if [ -f "$SEED" ]; then
  log "Seeding the start project"
  as_user mkdir -p "$DIR/.data"
  rm -rf "$DIR/.data/projects/Camper"
  tar -xzf "$SEED" -C "$DIR/.data"
  chown -R "$USER_NAME:$USER_NAME" "$DIR/.data"
  rm -f "$SEED"
fi

# --- where visitors are, roughly: DB-IP Lite and GeoNames, monthly ---
GEO_DIR=/var/lib/schaltli-demo-geo
mkdir -p "$GEO_DIR"
if [ ! -f "$GEO_DIR/city.mmdb" ] || [ -n "$(find "$GEO_DIR/city.mmdb" -mtime +32)" ]; then
  log "Fetching DB-IP's city database"
  for month in "$(date +%Y-%m)" "$(date -d '-1 month' +%Y-%m)"; do
    if curl -fsSL "https://download.db-ip.com/free/dbip-city-lite-$month.mmdb.gz" | gunzip > "$GEO_DIR/city.mmdb.new"; then
      mv "$GEO_DIR/city.mmdb.new" "$GEO_DIR/city.mmdb"
      break
    fi
    rm -f "$GEO_DIR/city.mmdb.new"
  done
fi
if [ ! -f "$GEO_DIR/big-cities.txt" ] || [ -n "$(find "$GEO_DIR/big-cities.txt" -mtime +32)" ]; then
  log "Fetching GeoNames' cities"
  if curl -fsSL -o "$GEO_DIR/cities15000.zip" https://download.geonames.org/export/dump/cities15000.zip; then
    node "$DIR/deploy/demo/big-cities.js" "$GEO_DIR/cities15000.zip" > "$GEO_DIR/big-cities.txt.new" && mv "$GEO_DIR/big-cities.txt.new" "$GEO_DIR/big-cities.txt"
    rm -f "$GEO_DIR/cities15000.zip"
  fi
fi
chmod 644 "$GEO_DIR"/* 2>/dev/null || true

# --- the environment, with the van's broker password made once ---
VAN_PASSWORD=""
[ -f "$ENV_FILE" ] && VAN_PASSWORD="$(sed -n 's/^DEMO_VAN_PASSWORD=//p' "$ENV_FILE")"
[ -n "$VAN_PASSWORD" ] || VAN_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
umask 077
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
SCHALTLI_DEMO=1
SCHALTLI_DEMO_START=Camper
DEMO_GEO_DB=$GEO_DIR/city.mmdb
DEMO_BIG_CITIES=$GEO_DIR/big-cities.txt
DEMO_VAN_USER=demo-van
DEMO_VAN_PASSWORD=$VAN_PASSWORD
EOF
umask 022
chmod 640 "$ENV_FILE"
chgrp "$USER_NAME" "$ENV_FILE"

# --- Mosquitto: local only, visitors kept to commands ---
log "Mosquitto"
cat > /etc/mosquitto/conf.d/schaltli-demo.conf <<'EOF'
# demo.schaltli.com (written by deploy/demo/setup.sh)
listener 1883 127.0.0.1
listener 9001 127.0.0.1
protocol websockets
allow_anonymous true
password_file /etc/mosquitto/schaltli-demo.passwd
acl_file /etc/mosquitto/schaltli-demo.acl
max_connections 200
message_size_limit 4096
EOF
cat > /etc/mosquitto/schaltli-demo.acl <<'EOF'
# Anonymous visitors: read the van, send it commands, nothing else.
topic read schaltli/#
topic read homeassistant/#
topic write schaltli/cmnd/#

# The demo van: the bridge and the fake Pekaway.
user demo-van
topic readwrite #
EOF
rm -f /etc/mosquitto/schaltli-demo.passwd
install -m 640 -o root -g mosquitto /dev/null /etc/mosquitto/schaltli-demo.passwd
mosquitto_passwd -b /etc/mosquitto/schaltli-demo.passwd demo-van "$VAN_PASSWORD"
# Root's, as Mosquitto wants them (2.0.21 warns, later versions refuse
# otherwise), and readable by its group: on Debian it runs as its own user
# from the start, and root:root 600 kept it from starting (2026-10-10).
chown root:mosquitto /etc/mosquitto/schaltli-demo.passwd /etc/mosquitto/schaltli-demo.acl
chmod 640 /etc/mosquitto/schaltli-demo.passwd /etc/mosquitto/schaltli-demo.acl
systemctl restart mosquitto

# --- Caddy: HTTPS, /mqtt to the broker, the rest to the designer ---
log "Caddy"
cat > /etc/caddy/Caddyfile <<EOF
# demo.schaltli.com (written by deploy/demo/setup.sh)
$DOMAIN {
	encode gzip
	request_body {
		max_size 64KB
	}
	handle /mqtt* {
		reverse_proxy 127.0.0.1:9001
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable --quiet caddy
systemctl restart caddy

# --- the designer and the van ---
log "systemd units"
cat > /etc/systemd/system/schaltli-demo-designer.service <<EOF
[Unit]
Description=Schaltli demo: the designer in demo mode
After=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $DIR/node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=3
MemoryMax=1G
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/schaltli-demo-van.service <<EOF
[Unit]
Description=Schaltli demo: the demo van (the VanPi bridge over a fake Pekaway)
After=network-online.target mosquitto.service
Requires=mosquitto.service

[Service]
User=$USER_NAME
WorkingDirectory=$DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $DIR/integrations/vanpi/demo-van.js --broker mqtt://127.0.0.1:1883
Restart=always
RestartSec=3
MemoryMax=256M
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --quiet schaltli-demo-designer schaltli-demo-van
systemctl restart schaltli-demo-designer schaltli-demo-van

for i in $(seq 1 30); do
  curl -fs -o /dev/null http://127.0.0.1:3000/api/version && break
  sleep 1
done
log "Done: https://$DOMAIN/ - $(curl -fs http://127.0.0.1:3000/api/version || echo 'designer not answering yet')"
}

main "$@"
