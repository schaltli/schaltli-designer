import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { isValidProjectId } from "@/lib/deploy-utils"

export const dynamic = "force-dynamic"

const PROJECTS_DIR = join(process.cwd(), ".data", "projects")

// The filenameTimestamp() shape from ../route.ts (ISO with ":" swapped
// for "-") - validated the same "safe path segment" way as project/
// instance IDs before it ever touches a filesystem path, since it's
// untrusted route-param input just like those.
const VALID_TIMESTAMP = /^[0-9A-Za-z.\-]+$/

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; timestamp: string }> },
) {
  const { projectId, timestamp } = await params
  if (!isValidProjectId(projectId) || !VALID_TIMESTAMP.test(timestamp)) {
    return NextResponse.json({ error: "Invalid projectId or timestamp" }, { status: 400 })
  }

  try {
    const data = await readFile(join(PROJECTS_DIR, projectId, "versions", `${timestamp}.json`), "utf-8")
    return new NextResponse(data, { headers: { "Content-Type": "application/json" } })
  } catch {
    return NextResponse.json({ error: "Version not found" }, { status: 404 })
  }
}
