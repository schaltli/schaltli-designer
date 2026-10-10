import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { isValidInstanceId } from "@/lib/deploy-utils"
import { volatileDir } from "@/lib/volatile-dir"
import { refuseInDemo } from "@/lib/demo-mode"

// GET /api/deploy/[instanceId] - this is the URL the *device* fetches
// (via a plain HTTP GET, no browser involved) after receiving its
// retained MQTT deploy trigger. See app/api/deploy/route.ts for how the
// zip gets stored here in the first place.
export const dynamic = "force-dynamic"

// RAM on the Pekaway, not its SD card (lib/volatile-dir.ts).
const DEPLOYS_DIR = volatileDir("deploys")

export async function GET(request: Request, { params }: { params: { instanceId: string } }) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const { instanceId } = params
  if (!isValidInstanceId(instanceId)) {
    return NextResponse.json({ error: "Invalid instanceId" }, { status: 400 })
  }

  try {
    const bytes = await readFile(join(DEPLOYS_DIR, `${instanceId}.zip`))
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json({ error: "No deploy found for this device" }, { status: 404 })
  }
}
