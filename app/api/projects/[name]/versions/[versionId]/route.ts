import { NextResponse } from "next/server"
import { projectStore, storeErrorResponse } from "../../../store-response"
import { refuseInDemo } from "@/lib/demo-mode"

// One version of a project, full - payloads put back.
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ name: string; versionId: string }> }) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const { name, versionId } = await params
  try {
    return NextResponse.json(await projectStore.readVersion(name, versionId))
  } catch (error) {
    return storeErrorResponse(error)
  }
}
