import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { isValidInstanceId } from "@/lib/deploy-utils"

// GET /api/firmware/upload/[instanceId] - the image uploaded for this device
// (app/api/firmware/upload), as the device fetches it after its firmware
// trigger names this URL.
export const dynamic = "force-dynamic"

const UPLOADS_DIR = join(process.cwd(), ".data", "firmware-uploads")

export async function GET(_request: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  if (!isValidInstanceId(instanceId)) {
    return NextResponse.json({ error: "Invalid instanceId" }, { status: 400 })
  }
  try {
    const bytes = await readFile(join(UPLOADS_DIR, `${instanceId}.bin`))
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json({ error: "No firmware uploaded for this device" }, { status: 404 })
  }
}
