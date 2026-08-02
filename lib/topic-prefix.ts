// The MQTT topic namespace every device/browser participant in the deploy
// flow shares (screensmith/... until 2026-08-02's rename) - centralized in
// one place deliberately: this string is a real protocol contract (Pekaway
// users' own Node-RED flows/dashboards will eventually depend on it), not
// just cosmetic branding, so a future rename should be a one-line change
// here rather than a repo-wide hunt. See components/deploy-dialog.tsx's
// header comment for the full topic layout.
export const TOPIC_PREFIX = "screenbee"
