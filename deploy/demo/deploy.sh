#!/usr/bin/env bash
# Puts the designer at a ref on demo.schaltli.com, from this PC
# (docs/2026-10-09-demo-instance.md, decision 10):
#
#   bash deploy/demo/deploy.sh [ref]        # default: this checkout's HEAD
#
# 1. builds the start project «Camper» into a project store
#    (e2e/demo-camper.spec.ts with DEMO_SEED_DIR) and packs it, and the demo
#    camera's frames from the user's drain video (hil/camera-server.js
#    --prepare-demo; SCHALTLI_CAMERA_VIDEO or the file it names in
#    Downloads). The video stays on this PC: the repo is public. Without it
#    the server keeps the frames it has;
# 2. uploads both to the server;
# 3. runs deploy/demo/setup.sh there as root, which seeds it;
# 4. checks the result from outside (deploy/demo/check.js).
#
# Needs `ssh schaltli-demo` to work (~/.ssh/config, the key in the agent) and
# the ref pushed, since the server clones it from GitHub.

set -euo pipefail
cd "$(dirname "$0")/../.."
REF="${1:-$(git rev-parse HEAD)}"
# On Windows, Windows' own OpenSSH: Git's ssh does not talk to the Windows
# ssh-agent that holds the key.
WIN_SSH=/c/Windows/System32/OpenSSH
if [ -x "$WIN_SSH/ssh.exe" ]; then
  SSH="${SSH:-$WIN_SSH/ssh.exe}"
  SCP="${SCP:-$WIN_SSH/scp.exe}"
else
  SSH="${SSH:-ssh}"
  SCP="${SCP:-scp}"
fi
HOST=schaltli-demo

git merge-base --is-ancestor "$REF" origin/main 2>/dev/null || git ls-remote --exit-code origin "$REF" >/dev/null || {
  echo "[demo-deploy] ERROR: $REF is not on GitHub yet - push it first" >&2
  exit 1
}

SEED_DIR="$(mktemp -d)"
trap 'rm -rf "$SEED_DIR"' EXIT
echo "[demo-deploy] building the start project"
DEMO_SEED_DIR="$SEED_DIR/store" npx playwright test e2e/demo-camper.spec.ts -g "written into a project store" --reporter=line >/dev/null
tar -czf "$SEED_DIR/seed.tar.gz" -C "$SEED_DIR/store" projects blobs

echo "[demo-deploy] preparing the camera's frames"
if node hil/camera-server.js --prepare-demo "$SEED_DIR/camera"; then
  tar -czf "$SEED_DIR/camera.tar.gz" -C "$SEED_DIR/camera" .
else
  echo "[demo-deploy] WARNING: no camera frames - the server keeps the ones it has" >&2
fi

echo "[demo-deploy] uploading"
"$SCP" -q "$SEED_DIR/seed.tar.gz" "$HOST:/tmp/schaltli-demo-seed.tar.gz"
if [ -f "$SEED_DIR/camera.tar.gz" ]; then
  "$SCP" -q "$SEED_DIR/camera.tar.gz" "$HOST:/tmp/schaltli-demo-camera.tar.gz"
fi

echo "[demo-deploy] setting up $REF"
"$SSH" "$HOST" "sudo bash -s -- --ref $REF" < deploy/demo/setup.sh

echo "[demo-deploy] checking"
node deploy/demo/check.js
