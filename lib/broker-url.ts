// The broker a designer page talks to when nobody has set one by hand.
//
// The broker and the designer run on the same host in every deployment -
// this dev server beside hil/local-broker.js, a Pekaway's designer beside its
// mosquitto - so the address follows from the page's own. Over plain http
// that is mosquitto's added WebSocket listener on port 9001, which is every
// Pekaway today. An https page may not open a plain WebSocket at all, so
// there it is wss on the page's own host and port, path /mqtt, which the
// web server in front forwards to that listener: demo.schaltli.com (Caddy,
// docs/2026-10-09-demo-instance.md, decision 4), and any Pekaway put behind
// https later.
export function defaultBrokerUrl(page: { protocol: string; hostname: string; host: string } | undefined): string {
  if (!page) return "ws://localhost:9001"
  if (page.protocol === "https:") return `wss://${page.host}/mqtt`
  return `ws://${page.hostname}:9001`
}
