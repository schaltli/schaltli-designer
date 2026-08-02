import { NextResponse } from "next/server"
import { mkdir, readFile, writeFile } from "fs/promises"
import { join } from "path"
import { isValidInstanceId, isValidProjectId } from "@/lib/deploy-utils"

// Server-side autosave (2026-08-02): the designer previously had zero
// persistence for the project itself (only the MQTT broker URL lives in
// localStorage) - close the tab, crash, or navigate away before manually
// exporting, and the work is gone, even if it had already been
// successfully deployed to a device (that only ever sends a compiled,
// device-format artifact, never the editable source). Stored server-side
// rather than IndexedDB so it survives clearing browser data and is
// reachable from any browser/device hitting the same self-hosted
// instance - matches app/api/deploy/route.ts's existing .data/ pattern,
// still fully local-first (nothing leaves this server).
export const dynamic = "force-dynamic"

const PROJECTS_DIR = join(process.cwd(), ".data", "projects")
const BY_INSTANCE_DIR = join(process.cwd(), ".data", "projects", "by-instance")

function currentJsonPath(projectId: string) {
  return join(PROJECTS_DIR, projectId, "current.json")
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
  }

  const project = await request.json().catch(() => null)
  if (!project || typeof project !== "object") {
    return NextResponse.json({ error: "Invalid project JSON" }, { status: 400 })
  }

  await mkdir(join(PROJECTS_DIR, projectId), { recursive: true })
  await writeFile(currentJsonPath(projectId), JSON.stringify(project))

  // Keep the reverse "which project is on device X" index current, so a
  // later session can recover by instanceId alone without ever knowing
  // this project's own projectId.
  const boundInstanceId = project?.settings?.boundInstanceId
  if (typeof boundInstanceId === "string" && isValidInstanceId(boundInstanceId)) {
    await mkdir(BY_INSTANCE_DIR, { recursive: true })
    await writeFile(join(BY_INSTANCE_DIR, `${boundInstanceId}.json`), JSON.stringify({ projectId }))
  }

  return NextResponse.json({ success: true })
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
  }

  try {
    const data = await readFile(currentJsonPath(projectId), "utf-8")
    return new NextResponse(data, { headers: { "Content-Type": "application/json" } })
  } catch {
    return NextResponse.json({ error: "No autosave found for this project" }, { status: 404 })
  }
}
