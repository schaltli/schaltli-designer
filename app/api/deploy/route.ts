import { NextResponse } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import { join } from "path"
import { isValidInstanceId } from "@/lib/deploy-utils"
import { serverLanAddress } from "@/lib/server-lan-address"

// POST /api/deploy - stores a project zip so a device can download it over
// plain HTTP GET (see app/api/deploy/[instanceId]/route.ts), as part of
// the MQTT-triggered self-deploy flow (components/deploy-dialog.tsx): the
// browser already builds the zip client-side (same JSZip code path as
// "Export Project", export-dialog.tsx), uploads it here, then publishes a
// retained MQTT trigger pointing the target device at the URL this route
// returns. Kept outside public/ (which is meant for build-time static
// assets like DDFs) - this is runtime state, one zip per device instance,
// overwritten on every deploy.
export const dynamic = "force-dynamic"

const DEPLOYS_DIR = join(process.cwd(), ".data", "deploys")

export async function POST(request: Request) {
  const formData = await request.formData()
  const instanceId = formData.get("instanceId")
  const file = formData.get("file")

  if (typeof instanceId !== "string" || !isValidInstanceId(instanceId)) {
    return NextResponse.json({ error: "Missing or invalid instanceId" }, { status: 400 })
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }

  await mkdir(DEPLOYS_DIR, { recursive: true })
  const bytes = Buffer.from(await file.arrayBuffer())
  await writeFile(join(DEPLOYS_DIR, `${instanceId}.zip`), bytes)

  const path = `/api/deploy/${instanceId}`

  // Absolute URL built from *this server's* own LAN-reachable address, not
  // the browser's window.location.origin - a user browsing via
  // http://localhost:3000 (very common for a self-hosted instance) would
  // otherwise hand the device a URL that only ever resolves back to the
  // device itself. Falls back to the request's own host (old behavior)
  // only if no usable network interface was found at all.
  const lanAddress = serverLanAddress()
  const requestUrl = new URL(request.url)
  const host = lanAddress ? `${lanAddress}:${requestUrl.port || "80"}` : requestUrl.host
  const url = `${requestUrl.protocol}//${host}${path}`

  return NextResponse.json({ path, url })
}
