import { isDemo } from "@/lib/demo-mode"
import { brokerDefaultScript, serverBrokerUrl } from "@/lib/broker-default"

/**
 * GET /api/broker-default - a script setting the broker address the server
 * gives every browser (lib/broker-default.ts, #82), loaded by app/layout.tsx
 * before the page connects anywhere. Empty when SCHALTLI_BROKER_URL is not
 * set, and in the demo, whose broker is its own.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = isDemo(request) ? "" : serverBrokerUrl()
  return new Response(brokerDefaultScript(url), {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" },
  })
}
