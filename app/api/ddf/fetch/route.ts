import { NextResponse } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import { join } from "path"
import { parseDeviceDescriptionFile } from "@/lib/device-description"
import { isValidDeviceId } from "@/lib/deploy-utils"

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
 * Deliberately *not* a device->server request/response over MQTT for path
 * 1 - the device already puts its DDF's `url` straight in its existing
 * retained `hello`, so there's nothing left to ask it for. What "url"
 * resolves to is entirely up to whoever hosts it - an on-device HTTP server
 * for something WiFi-capable like MqttEPaperDisplay2 (which already runs
 * one for snapshot/debug), a GitHub-hosted DDF zip for path 2, a fixed
 * internet-hosted asset for something leaner (e.g. nRF52840-based) that
 * never runs a server at all. This route doesn't care which; it just
 * fetches whatever URL it's given.
 */
export const dynamic = "force-dynamic"

const DATA_DDF_DIR = join(process.cwd(), ".data", "ddf")
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
  if (!response.ok) {
    return NextResponse.json({ error: `Device returned ${response.status} for its DDF` }, { status: 502 })
  }

  const bytes = Buffer.from(await response.arrayBuffer())

  // Content validation: the ZIP must actually be a well-formed DDF. When
  // `announced`, its own device.json must claim the same deviceId the hello
  // announced - the main defense against a spoofed/malicious hello pointing
  // this fetch at something that isn't really that device's DDF (see
  // isBlockedHost above for why this carries more weight than a
  // network-level allowlist here). When manually imported, there's no prior
  // announcement to check against - the manifest's own declared id is
  // trusted directly (trust-on-first-use) and used as the cache key.
  let manifestDeviceId: string
  let ddfHash: string
  try {
    const parsed = await parseDeviceDescriptionFile(bytes)
    manifestDeviceId = parsed.manifest.device.id
    ddfHash = parsed.ddfHash
  } catch (error) {
    return NextResponse.json(
      { error: `Fetched file isn't a valid DDF: ${error instanceof Error ? error.message : "parse failed"}` },
      { status: 422 },
    )
  }
  if (announced) {
    if (manifestDeviceId !== deviceId) {
      return NextResponse.json(
        { error: `DDF's own deviceId ("${manifestDeviceId}") doesn't match the announced deviceId ("${deviceId}")` },
        { status: 422 },
      )
    }
    // Refusing rather than caching-anyway is what makes the announcement
    // worth anything: a device whose served bytes don't match what it said
    // it serves is exactly the drift this identity exists to surface. It
    // self-heals - the device's next hello carries the new hash, and that
    // triggers a fresh fetch.
    if (typeof announcedHash === "string" && announcedHash.toLowerCase() !== ddfHash) {
      return NextResponse.json(
        { error: `DDF at "${url}" hashes to ${ddfHash}, but the device announced ${announcedHash.toLowerCase()}` },
        { status: 422 },
      )
    }
  } else if (!isValidDeviceId(manifestDeviceId)) {
    return NextResponse.json({ error: `DDF's own deviceId ("${manifestDeviceId}") is invalid` }, { status: 422 })
  }

  const finalDeviceId = announced ? (deviceId as string) : manifestDeviceId

  // Keyed by deviceId, not by hash: a device serves exactly one DDF, so the
  // cache holds that one and overwrites it when the device's changes.
  // Hash-named files would instead accumulate one entry per revision a
  // device ever announced, and the Startup Gate would list the same device
  // several times with no way to tell which is current.
  await mkdir(DATA_DDF_DIR, { recursive: true })
  await writeFile(join(DATA_DDF_DIR, `${finalDeviceId}.ddf.zip`), bytes)

  return NextResponse.json({ success: true, deviceId: finalDeviceId, ddfHash })
}
