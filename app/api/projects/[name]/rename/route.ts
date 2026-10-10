import { NextResponse } from "next/server"
import { projectStore, storeErrorResponse } from "../../store-response"
import { refuseInDemo } from "@/lib/demo-mode"

// { newName } -> the folder renamed and a version recording the rename.
// 409 if another project has the name already.
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const { name } = await params
  const body = (await request.json().catch(() => null)) as { newName?: unknown } | null
  if (typeof body?.newName !== "string") {
    return NextResponse.json({ error: "newName missing", code: "invalid-name" }, { status: 400 })
  }
  try {
    return NextResponse.json(await projectStore.rename(name, body.newName))
  } catch (error) {
    return storeErrorResponse(error)
  }
}
