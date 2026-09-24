import { NextResponse } from "next/server"
import { projectStore, storeErrorResponse } from "../../store-response"

// { versionId, instanceId, deviceName } -> that version marked as deployed to
// the device, and the device pointed at this project (by-instance).
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const { versionId, instanceId, deviceName } = body ?? {}
  if (typeof versionId !== "string" || typeof instanceId !== "string" || typeof deviceName !== "string") {
    return NextResponse.json({ error: "versionId, instanceId and deviceName required" }, { status: 400 })
  }
  try {
    await projectStore.markDeploy(name, { versionId, instanceId, deviceName })
    return NextResponse.json({ success: true })
  } catch (error) {
    return storeErrorResponse(error)
  }
}
