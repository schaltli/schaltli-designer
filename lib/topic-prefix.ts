// The MQTT topic namespace every device/browser participant in the deploy
// flow shares - centralized in one place deliberately: this string is a real
// protocol contract (Pekaway users' own Node-RED flows/dashboards will
// eventually depend on it), not just cosmetic branding, so a rename should be
// a one-line change here rather than a repo-wide hunt. See
// components/deploy-dialog.tsx's header comment for the full topic layout.
//
// Renamed twice: "screensmith" -> "screenbee" on 2026-08-02, and "screenbee"
// -> "schaltli" on 2026-09-23 (docs/2026-09-23-schaltli-rename.md). The promise
// above held for this file and nowhere else: five other implementations keep
// their own copy - three boards, the e-paper, the Android app - and four more
// live in the HIL harness. They have to move in the same release or a device
// that still says the old word is talking to nobody.
export const TOPIC_PREFIX = "schaltli"
