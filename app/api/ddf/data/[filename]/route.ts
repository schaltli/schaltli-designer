import { NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"

// GET /api/ddf/data/[filename] - serves auto-fetched DDFs from .data/ddf/
// (see app/api/ddf/fetch/route.ts, which writes them there). Needed because
// .data/ is deliberately outside public/ (runtime state, not a build-time
// asset - see that route's header comment), so Next.js doesn't serve it as
// a static file the way public/ddf/*.zip already is.
export const dynamic = "force-dynamic"

const DATA_DDF_DIR = join(process.cwd(), ".data", "ddf")

// Filenames here are always "{deviceId}.ddf.zip", written by
// app/api/ddf/fetch/route.ts (which already validates deviceId via
// isValidDeviceId before using it to build that filename) - checked again
// here too, since this route treats the URL param as untrusted input
// regardless of who normally constructs it, same as every other route
// building a filesystem path from a request param in this app.
const VALID_FILENAME = /^[A-Za-z0-9_-]+\.ddf\.zip$/

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params
  if (!VALID_FILENAME.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
  }

  try {
    const bytes = await readFile(join(DATA_DDF_DIR, filename))
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json({ error: "DDF not found" }, { status: 404 })
  }
}
