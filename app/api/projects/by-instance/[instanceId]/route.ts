import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { isValidInstanceId } from "@/lib/deploy-utils"

// Resolves "which project is currently on device X" - the reverse index
// autosave/route.ts keeps up to date on every save. Deliberately returns
// just the projectId rather than the project content itself: the caller
// chains a normal GET to /api/projects/[projectId]/autosave for that, so
// this route's only job is the by-instanceId -> projectId lookup, not a
// second copy of "how do I read a project's current state".
export const dynamic = "force-dynamic"

const BY_INSTANCE_DIR = join(process.cwd(), ".data", "projects", "by-instance")

export async function GET(_request: Request, { params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  if (!isValidInstanceId(instanceId)) {
    return NextResponse.json({ error: "Invalid instanceId" }, { status: 400 })
  }

  try {
    const data = await readFile(join(BY_INSTANCE_DIR, `${instanceId}.json`), "utf-8")
    return new NextResponse(data, { headers: { "Content-Type": "application/json" } })
  } catch {
    return NextResponse.json({ error: "No project known for this device" }, { status: 404 })
  }
}
