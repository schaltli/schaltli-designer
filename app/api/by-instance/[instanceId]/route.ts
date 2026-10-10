import { NextResponse } from "next/server"
import { projectStore, storeErrorResponse } from "../../projects/store-response"
import { refuseInDemo } from "@/lib/demo-mode"

// Which project is on device X: { name }. Moved out of app/api/projects/
// (2026-09-24) so that no project can ever be called like it.
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const { instanceId } = await params
  try {
    const name = await projectStore.byInstance(instanceId)
    if (!name) return NextResponse.json({ error: "No project known for this device" }, { status: 404 })
    return NextResponse.json({ name })
  } catch (error) {
    return storeErrorResponse(error)
  }
}
