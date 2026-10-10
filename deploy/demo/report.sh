#!/usr/bin/env bash
# What visitors did in the demo, from this PC (deploy/demo/report.js runs on
# the server, over the files lib/demo-events.ts writes there):
#
#   bash deploy/demo/report.sh [--days 7]

set -euo pipefail
WIN_SSH=/c/Windows/System32/OpenSSH
if [ -x "$WIN_SSH/ssh.exe" ]; then SSH="${SSH:-$WIN_SSH/ssh.exe}"; else SSH="${SSH:-ssh}"; fi
"$SSH" schaltli-demo "cd /opt/schaltli-demo && sudo -u schaltli node deploy/demo/report.js $*"
