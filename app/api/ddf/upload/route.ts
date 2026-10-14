import { NextResponse } from "next/server"
import { isValidDeviceId } from "@/lib/deploy-utils"
import { refuseInDemo } from "@/lib/demo-mode"
import { DdfRefused, storeDdf } from "@/lib/ddf-store"

/**
 * POST /api/ddf/upload?deviceId=…&ddfHash=… with the description's zip as
 * the body - a device's description as the browser received it from the
 * broker (lib/announced-ddf.ts). Since 2026-10-14 no device serves it over
 * HTTP; it publishes it on `schaltli/<id>/ddf` when asked
 * (docs/device-contract.md §4, #70). The server keeps no MQTT connection
 * of its own, so the browser hands it over. Checked exactly as a fetched
 * one is (lib/ddf-store.ts).
 */
export const dynamic = "force-dynamic"

// A description is about 300 KB; anything far beyond is not one.
const MAX_BYTES = 4 * 1024 * 1024

export async function POST(request: Request) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const params = new URL(request.url).searchParams
  const deviceId = params.get("deviceId")
  const ddfHash = params.get("ddfHash")
  if (!deviceId || !isValidDeviceId(deviceId)) {
    return NextResponse.json({ error: "Invalid deviceId" }, { status: 400 })
  }
  if (!ddfHash || !/^[0-9a-f]+$/i.test(ddfHash)) {
    return NextResponse.json({ error: "Invalid ddfHash" }, { status: 400 })
  }
  const bytes = Buffer.from(await request.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: `A device description of ${bytes.length} bytes is not one` }, { status: 400 })
  }
  try {
    const stored = await storeDdf(bytes, deviceId, ddfHash, "The description from the broker")
    return NextResponse.json({ success: true, ...stored })
  } catch (error) {
    if (error instanceof DdfRefused) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}
