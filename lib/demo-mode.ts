import { NextResponse } from "next/server"

// The demo mode of demo.schaltli.com (docs/2026-10-09-demo-instance.md,
// decision 2): the designer open to anyone, saving nothing and acting on
// nothing outside itself. What passes is reading the start project and what
// the designer needs to draw it; everything else is answered 403.
//
// Decided per request and checked twice: in middleware.ts over /api/*, and
// again at the top of every route handler through refuseInDemo() - so the
// guard does not hang on middleware alone, where several of the advisories
// Next.js 14 still has live (decision 1).

/** The header that turns demo mode on in development, for the e2e tests. */
export const DEMO_HEADER = "x-schaltli-demo"

/**
 * Whether this request is served as the demo: `SCHALTLI_DEMO=1` in the
 * server's environment, or - only outside production - the test header,
 * which lets the e2e suite use the shared dev server instead of a second one.
 */
export function isDemo(request: Pick<Request, "headers">): boolean {
  if (process.env.SCHALTLI_DEMO === "1") return true
  if (process.env.NODE_ENV === "production") return false
  return request.headers.get(DEMO_HEADER) === "1"
}

// What a visitor may ask for: the methods and paths that only read what the
// designer needs. A path is matched whole, `*` standing for one segment.
const ALLOWED: { method: string; path: RegExp }[] = [
  { method: "GET", path: /^\/api\/projects$/ },
  { method: "GET", path: /^\/api\/projects\/[^/]+$/ },
  { method: "GET", path: /^\/api\/projects\/[^/]+\/versions$/ },
  { method: "GET", path: /^\/api\/ddf\/list$/ },
  { method: "GET", path: /^\/api\/ddf\/data\/[^/]+$/ },
  { method: "GET", path: /^\/api\/fonts\/list$/ },
  { method: "GET", path: /^\/api\/version$/ },
]

/** Whether the demo lets this method on this path through. */
export function allowedInDemo(method: string, pathname: string): boolean {
  const m = method.toUpperCase()
  const effective = m === "HEAD" ? "GET" : m
  return ALLOWED.some((rule) => rule.method === effective && rule.path.test(pathname))
}

/** The answer to anything the demo does not do. */
export function demoRefusal(): NextResponse {
  return NextResponse.json({ error: "Not in the demo" }, { status: 403 })
}

/**
 * For the top of a route handler: a 403 when this request is the demo and the
 * demo does not do this, else null and the handler goes on.
 */
export function refuseInDemo(request: Request): NextResponse | null {
  if (!isDemo(request)) return null
  const { pathname } = new URL(request.url)
  return allowedInDemo(request.method, pathname) ? null : demoRefusal()
}
