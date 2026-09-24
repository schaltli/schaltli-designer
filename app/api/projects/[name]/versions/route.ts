import { NextResponse } from "next/server"
import { asProject, badProject, projectStore, storeErrorResponse } from "../../store-response"

// A project's versions: list them newest first, or add one (Save, Replace).
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ name: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { name } = await params
  try {
    return NextResponse.json({ versions: await projectStore.listVersions(name) })
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export async function POST(request: Request, { params }: Params) {
  const { name } = await params
  const project = asProject(await request.json().catch(() => null))
  if (!project) return badProject()
  try {
    return NextResponse.json(await projectStore.addVersion(name, project))
  } catch (error) {
    return storeErrorResponse(error)
  }
}
