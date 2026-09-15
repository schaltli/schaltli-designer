import { NextResponse } from "next/server"
import { readFirmwareRelease } from "@/lib/firmware-release"
import { deviceFacingUrl } from "@/lib/server-lan-address"

// GET /api/firmware/release - the firmware release that ships with this
// designer, per device: build, size, sha256, system generation, whether the
// image has been fetched, and the URL a device downloads it from
// (docs/2026-09-15-firmware-ota.md). That URL is this server, not GitHub: the
// images are already here, and a device in a van may have no internet at all.
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const release = await readFirmwareRelease()
  const devices = Object.fromEntries(
    Object.entries(release.devices).map(([deviceId, entry]) => [
      deviceId,
      { ...entry, url: deviceFacingUrl(request, `/api/firmware/release/${entry.file}`) },
    ]),
  )
  return NextResponse.json({ release: release.release, devices })
}
