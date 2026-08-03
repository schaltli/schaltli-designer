import { NextResponse } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import { join } from "path"
import { parseDeviceDescriptionFile } from "@/lib/device-description"
import { isValidDeviceId } from "@/lib/deploy-utils"

/**
 * POST /api/ddf/fetch { deviceId, ddfVersion, url } - auto-discovery for
 * device DDFs (2026-08-03, grilling session), triggered by the browser
 * (components/device-scan-section.tsx) the moment it sees an MQTT `hello`
 * announcing a ddfVersion this instance doesn't have cached yet.
 *
 * Deliberately *not* a device->server request/response over MQTT - the
 * device already puts `ddfVersion`+`url` straight in its existing retained
 * `hello`, so there's nothing left to ask it for. What "url" resolves to is
 * entirely up to that device's own firmware - an on-device HTTP server for
 * something WiFi-capable like MqttEPaperDisplay2 (which already runs one
 * for snapshot/debug), a fixed internet-hosted asset for something leaner
 * (e.g. nRF52840-based) that never runs a server at all. This route doesn't
 * care which; it just fetches whatever URL it's given.
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
  const deviceId = body?.deviceId
  const ddfVersion = body?.ddfVersion
  const url = body?.url

  if (typeof deviceId !== "string" || !isValidDeviceId(deviceId)) {
    return NextResponse.json({ error: "Invalid deviceId" }, { status: 400 })
  }
  if (typeof ddfVersion !== "string" || !ddfVersion) {
    return NextResponse.json({ error: "Invalid ddfVersion" }, { status: 400 })
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

  // Content validation: the ZIP must actually be a well-formed DDF whose own
  // device.json claims the same deviceId the hello announced - the main
  // defense against a spoofed/malicious hello pointing this fetch at
  // something that isn't really that device's DDF (see isBlockedHost above
  // for why this carries more weight than a network-level allowlist here).
  let manifestDeviceId: string
  try {
    const parsed = await parseDeviceDescriptionFile(bytes)
    manifestDeviceId = parsed.manifest.device.id
  } catch (error) {
    return NextResponse.json(
      { error: `Fetched file isn't a valid DDF: ${error instanceof Error ? error.message : "parse failed"}` },
      { status: 422 },
    )
  }
  if (manifestDeviceId !== deviceId) {
    return NextResponse.json(
      { error: `DDF's own deviceId ("${manifestDeviceId}") doesn't match the announced deviceId ("${deviceId}")` },
      { status: 422 },
    )
  }

  await mkdir(DATA_DDF_DIR, { recursive: true })
  await writeFile(join(DATA_DDF_DIR, `${deviceId}.ddf.zip`), bytes)

  return NextResponse.json({ success: true })
}
