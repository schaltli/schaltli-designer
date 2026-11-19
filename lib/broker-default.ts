/**
 * A broker address the server gives every browser (#82): SCHALTLI_BROKER_URL,
 * for a designer that does not run beside its broker - in a Docker container,
 * or at home with the van's broker over a VPN. It replaces the page's own
 * host (lib/broker-url.ts) as the default; an address someone set by hand in
 * a browser still comes first there (hooks/use-mqtt-connection.ts).
 *
 * Read at request time, not at build time: a container is configured when it
 * starts. A value that is not a ws:// or wss:// URL is ignored.
 */
export function serverBrokerUrl(): string {
  const value = (process.env.SCHALTLI_BROKER_URL ?? "").trim()
  return /^wss?:\/\/[^\s/]+/i.test(value) ? value : ""
}

/** The global the page reads it from, set by app/api/broker-default. */
export const BROKER_DEFAULT_GLOBAL = "__schaltliBrokerUrl"

// A backslash and u003c: < written as a JavaScript escape, so a value can
// never close the script it is written into.
const ESCAPED_LT = String.fromCharCode(92) + "u003c"

/** The script that hands it to the page, before anything there connects. */
export function brokerDefaultScript(url: string): string {
  return `window.${BROKER_DEFAULT_GLOBAL} = ${JSON.stringify(url).replace(/</g, ESCAPED_LT)};\n`
}
