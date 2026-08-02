import { NextResponse } from "next/server"
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "fs/promises"
import { join } from "path"
import { isValidProjectId } from "@/lib/deploy-utils"

// Version history (2026-08-02): unlike autosave/route.ts's single
// always-overwritten current.json, each snapshot here is kept - taken
// explicitly (deploy-dialog.tsx, after a successful deploy) rather than
// on every keystroke, so the list stays a meaningful set of checkpoints
// ("what did this look like right before I sent it to device X") instead
// of noise.
export const dynamic = "force-dynamic"

const PROJECTS_DIR = join(process.cwd(), ".data", "projects")

// Keeps the version directory from growing without bound over a project's
// lifetime - 50 checkpoints is generous for "checkpoint per deploy" while
// still bounded.
const MAX_VERSIONS_KEPT = 50

function versionsDir(projectId: string) {
  return join(PROJECTS_DIR, projectId, "versions")
}

// ISO timestamps contain ":" (invalid in Windows filenames) - swap for
// "-" to get a filename that's still lexicographically sortable and
// trivially round-trips back to a real Date.
function filenameTimestamp(date: Date): string {
  return date.toISOString().replace(/:/g, "-")
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

  const dir = versionsDir(projectId)
  await mkdir(dir, { recursive: true })
  const timestamp = filenameTimestamp(new Date())
  await writeFile(join(dir, `${timestamp}.json`), JSON.stringify(project))

  // Prune oldest beyond the cap - filenames sort lexicographically by
  // timestamp, so a plain string sort is enough, no need to stat() every
  // file just to order them.
  const entries = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()
  const excess = entries.length - MAX_VERSIONS_KEPT
  if (excess > 0) {
    await Promise.all(entries.slice(0, excess).map((f) => unlink(join(dir, f))))
  }

  return NextResponse.json({ success: true, timestamp })
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: "Invalid projectId" }, { status: 400 })
  }

  const dir = versionsDir(projectId)
  let entries: string[]
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith(".json"))
  } catch {
    return NextResponse.json({ versions: [] })
  }

  // Newest first - each entry carries just enough to render a picker
  // without the client having to fetch every snapshot's full content.
  const versions = await Promise.all(
    entries.map(async (f) => {
      const timestamp = f.replace(/\.json$/, "")
      const s = await stat(join(dir, f))
      let projectName: string | undefined
      try {
        const content = JSON.parse(await readFile(join(dir, f), "utf-8"))
        projectName = content?.name
      } catch {
        // Corrupt snapshot - still list it (timestamp/size), just without a name.
      }
      return { timestamp, sizeBytes: s.size, projectName }
    }),
  )
  versions.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  return NextResponse.json({ versions })
}
