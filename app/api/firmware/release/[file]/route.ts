import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { releaseImagePath } from "@/lib/firmware-release"

// GET /api/firmware/release/[file] - a release image, fetched by the device
// after the firmware trigger names this URL (app/api/firmware/release). Only
// files the manifest names and scripts/fetch-firmware.js has verified are
// served; anything else is a 404, whatever happens to sit in firmware/bin/.
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const path = await releaseImagePath(file)
  if (!path) return NextResponse.json({ error: "No such firmware image in this release" }, { status: 404 })
  const bytes = await readFile(path)
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  })
}
