import { NextResponse } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import { join } from "path"
import { isValidInstanceId } from "@/lib/deploy-utils"

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

  // Relative path only - the browser knows its own origin (same LAN/host
  // the target device reaches too, per this project's local-first
  // deployment model) and builds the absolute URL from it before putting
  // it in the MQTT trigger payload.
  return NextResponse.json({ path: `/api/deploy/${instanceId}` })
}
