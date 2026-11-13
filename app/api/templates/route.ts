import { NextResponse } from "next/server"
import { asProject, badProject, storeErrorResponse } from "../projects/store-response"
import { refuseInDemo } from "@/lib/demo-mode"
import { templateStore } from "./store"
import { templateFromProject } from "@/lib/templates"

// Templates (lib/templates.ts): the list, for New Project, and File > Save
// as Template.
export const dynamic = "force-dynamic"

// ?device=<id> -> the templates made for that device; without it, all.
export async function GET(request: Request) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const device = new URL(request.url).searchParams.get("device") ?? undefined
  return NextResponse.json({ templates: await templateStore.list(device || undefined) })
}

// { name, project } -> a new template made from `project`. 409 if the name
// is taken, by one of the user's templates or a shipped one.
export async function POST(request: Request) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const body = (await request.json().catch(() => null)) as { name?: unknown; project?: unknown } | null
  const project = asProject(body?.project)
  if (!project || typeof body?.name !== "string" || !Array.isArray(project.screens)) return badProject()
  try {
    const summary = await templateStore.create(templateFromProject(body.name, project as unknown as Parameters<typeof templateFromProject>[1]))
    return NextResponse.json(summary, { status: 201 })
  } catch (error) {
    return storeErrorResponse(error)
  }
}
