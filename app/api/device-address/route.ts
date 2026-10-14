import { NextResponse } from "next/server"
import { refuseInDemo } from "@/lib/demo-mode"
import { configuredDeviceAddress, isDeviceAddress, writeDeviceAddress } from "@/lib/device-address"
import { detectedDeviceHost } from "@/lib/server-lan-address"

/**
 * GET /api/device-address - where devices download projects and firmware
 * from: `{ configured, detected }`. PUT { address } - set it by hand, empty
 * to go back to the address found here (lib/device-address.ts, #70).
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return NextResponse.json(
    { configured: configuredDeviceAddress(), detected: detectedDeviceHost(request) },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PUT(request: Request) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const body = await request.json().catch(() => null)
  const address = typeof body?.address === "string" ? body.address.trim() : null
  if (address === null || !isDeviceAddress(address)) {
    return NextResponse.json({ error: "An address is a host name or IP address, optionally with :port - for example 192.168.1.20:3000" }, { status: 400 })
  }
  writeDeviceAddress(address)
  return NextResponse.json({ success: true, configured: address })
}
