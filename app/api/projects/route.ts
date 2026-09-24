import { NextResponse } from "next/server"
import { asProject, badProject, projectStore, storeErrorResponse } from "./store-response"

// The project list and project creation (docs/2026-09-23-explicit-save.md).
// Projects are folders named like the project; see lib/project-store.ts.
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ projects: await projectStore.list() })
}

// { name, project } -> a new project whose first version is `project`.
// 409 if the name is taken, with the existing spelling in `name`.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown; project?: unknown } | null
  const project = asProject(body?.project)
  if (!project || typeof body?.name !== "string") return badProject()
  try {
    return NextResponse.json(await projectStore.create(body.name, project), { status: 201 })
  } catch (error) {
    return storeErrorResponse(error)
  }
}
