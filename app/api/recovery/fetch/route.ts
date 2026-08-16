import { NextResponse } from "next/server"

/**
 * POST /api/recovery/fetch { url } - server-side proxy for
 * recover-project-dialog.tsx's GET <device>/recovery-project.
 *
 * A direct browser fetch straight to a device's own IP would be blocked by
 * CORS (found live 2026-08-15 building this: the fetch either rejects
 * outright or, worse, "succeeds" with an opaque response the browser won't
 * let JS read) - no device firmware here sends
 * Access-Control-Allow-Origin, same as it wouldn't for GET /ddf.zip. That
 * endpoint's own browser-facing consumer (device-scan-section.tsx)
 * sidesteps this by never fetching the device directly either - it goes
 * through app/api/ddf/fetch/route.ts, a server-side proxy. This route is
 * the same pattern applied to recovery: server-to-server requests aren't
 * subject to browser CORS at all.
 */
export const dynamic = "force-dynamic"

const FETCH_TIMEOUT_MS = 15000

// Same SSRF guard as app/api/ddf/fetch/route.ts's isBlockedHost() - kept
// as its own copy rather than a shared import since the two routes have no
// other logic in common and this is the entire cheap-extra-defense
// surface, easy to keep in sync by eye.
function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return lower === "localhost" || lower === "::1" || /^127\./.test(lower) || /^169\.254\./.test(lower)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const url = body?.url

  if (typeof url !== "string") {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return NextResponse.json({ error: "Malformed url" }, { status: 400 })
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "url must be http:// or https://" }, { status: 400 })
  }
  if (isBlockedHost(parsedUrl.hostname)) {
    return NextResponse.json({ error: "url host is not allowed" }, { status: 400 })
  }

  let response: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      response = await fetch(parsedUrl, { signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach "${url}": ${error instanceof Error ? error.message : "fetch failed"}` },
      { status: 502 },
    )
  }

  if (response.status === 404) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }
  if (!response.ok) {
    return NextResponse.json({ error: `Device returned ${response.status}` }, { status: 502 })
  }

  const bytes = await response.arrayBuffer()
  return new NextResponse(bytes, { status: 200, headers: { "Content-Type": "application/zip" } })
}
