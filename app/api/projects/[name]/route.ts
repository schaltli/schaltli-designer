import { NextResponse } from "next/server"
import { projectStore, storeErrorResponse } from "../store-response"

// One project by name: its newest version, or deleting it with all its
// versions. The name is matched without case (lib/project-name.ts).
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ name: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { name } = await params
  try {
    return NextResponse.json(await projectStore.readNewest(name))
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { name } = await params
  try {
    await projectStore.remove(name)
    return NextResponse.json({ success: true })
  } catch (error) {
    return storeErrorResponse(error)
  }
}
