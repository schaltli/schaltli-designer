import { NextResponse } from "next/server"
import { projectStore, storeErrorResponse } from "../../../store-response"

// One version of a project, full - payloads put back.
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ name: string; versionId: string }> }) {
  const { name, versionId } = await params
  try {
    return NextResponse.json(await projectStore.readVersion(name, versionId))
  } catch (error) {
    return storeErrorResponse(error)
  }
}
