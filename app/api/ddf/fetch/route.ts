import { NextResponse } from "next/server"
import { isValidDeviceId } from "@/lib/deploy-utils"
import { refuseInDemo } from "@/lib/demo-mode"
import { DdfRefused, storeDdf } from "@/lib/ddf-store"

/**
 * POST /api/ddf/fetch { deviceId?, ddfHash?, url } - two trigger paths:
 *
 * 1. Auto-discovery (2026-08-03, grilling session): `deviceId` supplied,
 *    triggered by the browser (components/device-scan-section.tsx) the
 *    moment it sees an MQTT `hello` for a DDF this instance doesn't have
 *    cached yet. `deviceId` here is already trusted (came from the hello),
 *    so the fetched DDF's own declared id is cross-checked against it
 *    below. `ddfHash` is the identity the hello advertised, when it carries
 *    one - checked against the bytes actually fetched, which catches a
 *    device announcing one DDF and serving another (a stale HTTP cache in
 *    between, or a firmware whose compiled-in hash drifted from its
 *    compiled-in zip). Firmware that doesn't announce a hash yet is still
 *    discoverable: the hash is then simply computed from what arrives.
 * 2. Manual import (2026-08-16 - designer ships with zero curated devices
 *    baked in, see docs/device-contract.md; startup-device-gate.tsx's
 *    "Add device from URL" form): `deviceId`/`ddfHash` omitted, a human
 *    just pastes a URL. There's no prior announcement to cross-check
 *    against, so this is trust-on-first-use - whatever `device.id` the
 *    fetched DDF's own manifest declares is what gets used and cached.
 *
 * Path 1 is only for devices older than 2026-10-14: since then a device
 * names no `url` and hands its description over the broker instead
 * (lib/announced-ddf.ts, app/api/ddf/upload, docs/device-contract.md §4,
 * #70) - the designer then needs to reach no device directly, which one in
 * a VM behind NAT cannot. The checks on the bytes are shared
 * (lib/ddf-store.ts).
 */
export const dynamic = "force-dynamic"

const FETCH_TIMEOUT_MS = 8000

// Blocks only the two ranges that would turn this into a way to make the
// server hit itself or another only-locally-reachable service on the same
// box (SSRF) - deliberately *not* a private-IP-only allowlist, since public
// internet URLs are an intentionally supported case (see header comment).
// The main defense is the deviceId content-check below; this is just the
// cheap, obviously-safe extra on top.
function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return lower === "localhost" || lower === "::1" || /^127\./.test(lower) || /^169\.254\./.test(lower)
}

export async function POST(request: Request) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const body = await request.json().catch(() => null)
  // `deviceId` absent = manual import (path 2 above), present = the
  // hello-triggered auto-discovery path (path 1). `ddfHash` is optional on
  // path 1 rather than required alongside it, because a device that
  // announces itself without a hash is still a device worth discovering -
  // it just can't have its claim checked. It has no meaning without a
  // deviceId to attach it to, so that combination is rejected rather than
  // silently ignored.
  const deviceId = body?.deviceId
  const announcedHash = body?.ddfHash
  const url = body?.url

  const announced = deviceId !== undefined
  if (announced) {
    if (typeof deviceId !== "string" || !isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "Invalid deviceId" }, { status: 400 })
    }
  } else if (announcedHash !== undefined) {
    return NextResponse.json({ error: "ddfHash without deviceId" }, { status: 400 })
  }
  if (announcedHash !== undefined && (typeof announcedHash !== "string" || !/^[0-9a-f]+$/i.test(announcedHash))) {
    return NextResponse.json({ error: "Invalid ddfHash" }, { status: 400 })
  }
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
      response = await fetch(parsedUrl, { signal: controller.signal, cache: "no-store" })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    return NextResponse.json(
      { error: `Could not reach "${url}": ${error instanceof Error ? error.message : "fetch failed"}` },
      { status: 502 },
    )
  }
  if (!response.ok) {
    return NextResponse.json({ error: `Device returned ${response.status} for its DDF` }, { status: 502 })
  }

  const bytes = Buffer.from(await response.arrayBuffer())

  try {
    const stored = await storeDdf(bytes, announced ? (deviceId as string) : undefined, announcedHash, `The file at "${url}"`)
    return NextResponse.json({ success: true, ...stored })
  } catch (error) {
    if (error instanceof DdfRefused) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}
