import { NextResponse } from "next/server"
import { projectJson, storeErrorResponse } from "../../projects/store-response"
import { refuseInDemo } from "@/lib/demo-mode"
import { templateStore } from "../store"

// One template (lib/templates.ts): read when New Project makes a project
// from it, removed when the user no longer wants one of their own.
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ name: string }> }

export async function GET(request: Request, { params }: Context) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  try {
    return projectJson(request, { template: await templateStore.read((await params).name) })
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  try {
    await templateStore.remove((await params).name)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return storeErrorResponse(error)
  }
}
