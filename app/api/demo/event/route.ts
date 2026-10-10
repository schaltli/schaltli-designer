import { NextResponse } from "next/server"
import { isDemo, refuseInDemo } from "@/lib/demo-mode"
import { eventLine, withinLimits, writeEvent } from "@/lib/demo-events"

// POST /api/demo/event - what a demo visitor did (lib/demo-events.ts,
// docs/2026-10-10-demo-tracking.md). Only the demo has it: anywhere else it
// is not there at all. The address the request came from is Caddy's
// X-Forwarded-For - the designer listens on 127.0.0.1 only - and is used for
// the place and the limits, never written.
export const dynamic = "force-dynamic"

const MAX_BODY = 2000

export async function POST(request: Request) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  if (!isDemo(request)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const text = await request.text()
  if (text.length > MAX_BODY) return NextResponse.json({ error: "Too large" }, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Not JSON" }, { status: 400 })
  }
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
  const line = eventLine(body, {
    address,
    userAgent: request.headers.get("user-agent"),
    ownHost: request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? null,
  })
  if (!line) return NextResponse.json({ error: "Not an event" }, { status: 400 })
  if (!withinLimits(line.visit, address)) return NextResponse.json({ error: "Too many" }, { status: 429 })
  await writeEvent(line)
  return new NextResponse(null, { status: 204 })
}
