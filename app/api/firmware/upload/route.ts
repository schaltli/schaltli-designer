import { NextResponse } from "next/server"
import { mkdir, writeFile } from "fs/promises"
import { createHash } from "crypto"
import { join } from "path"
import { isValidInstanceId } from "@/lib/deploy-utils"
import { imageDeviceId } from "@/lib/firmware-build"
import { deviceFacingUrl } from "@/lib/server-lan-address"

// POST /api/firmware/upload - a firmware image from a file, for a development
// build or a device no release of this designer carries
// (docs/2026-09-15-firmware-ota.md, decision 4). Stored per device instance
// like a project deploy zip and served back at /api/firmware/upload/
// [instanceId] for the device to fetch.
//
// Answers with what the trigger needs - url, size, sha256 - and with the
// device the image names in its marker. An image naming no device, or
// another one than the caller says it is for, is refused here: the device
// would refuse it too, but only after downloading all of it.
export const dynamic = "force-dynamic"

const UPLOADS_DIR = join(process.cwd(), ".data", "firmware-uploads")
// An app slot on these boards is 6.4 MB; nothing larger could install.
const MAX_BYTES = 6_553_600

export async function POST(request: Request) {
  const formData = await request.formData()
  const instanceId = formData.get("instanceId")
  const deviceId = formData.get("deviceId")
  const file = formData.get("file")

  if (typeof instanceId !== "string" || !isValidInstanceId(instanceId)) {
    return NextResponse.json({ error: "Missing or invalid instanceId" }, { status: 400 })
  }
  if (typeof deviceId !== "string" || !deviceId) {
    return NextResponse.json({ error: "Missing deviceId" }, { status: 400 })
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `The file is ${file.size} bytes - more than a firmware slot holds` }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const imageFor = imageDeviceId(bytes)
  if (!imageFor) {
    return NextResponse.json({ error: "This is not a Schaltli firmware image - it names no device." }, { status: 400 })
  }
  if (imageFor !== deviceId) {
    return NextResponse.json({ error: `This firmware is for ${imageFor}, not ${deviceId}.` }, { status: 400 })
  }

  await mkdir(UPLOADS_DIR, { recursive: true })
  await writeFile(join(UPLOADS_DIR, `${instanceId}.bin`), bytes)

  return NextResponse.json({
    url: deviceFacingUrl(request, `/api/firmware/upload/${instanceId}`),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    deviceId: imageFor,
  })
}
