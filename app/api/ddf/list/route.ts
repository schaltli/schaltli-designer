import { NextResponse } from "next/server"
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import JSZip from "jszip"

// This route reads its DDF directories from disk on every request. Without
// this, Next.js may treat a GET route handler with no dynamic APIs as
// static and cache the first response indefinitely, so newly added/removed
// DDFs (or this route's own code changes) wouldn't be picked up without a
// full rebuild.
export const dynamic = "force-dynamic"

interface DdfListEntry {
  name: string
  path: string
  deviceId: string | null
  deviceName: string
  ddfVersion: string | null
  source: "curated" | "auto-discovered"
  adornmentSvg: string | null
}

async function scanDdfDir(
  dir: string,
  pathPrefix: string,
  source: "curated" | "auto-discovered",
): Promise<DdfListEntry[]> {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    // Directory doesn't exist yet (e.g. .data/ddf/ before any device has
    // ever been auto-fetched) - not an error, just nothing to list here.
    return []
  }
  const zipFiles = files.filter((file) => file.toLowerCase().endsWith(".zip"))

  // Parse each DDF's device.json (and adornment SVG, for a picker preview)
  // server-side, so the client can check device availability and show a
  // thumbnail without fetching/unzipping every DDF itself.
  return Promise.all(
    zipFiles.map(async (file) => {
      const path = `${pathPrefix}/${file}`
      try {
        const buffer = await readFile(join(dir, file))
        const zip = await JSZip.loadAsync(buffer)
        const manifestFile = zip.file("device.json")
        const manifest = manifestFile ? JSON.parse(await manifestFile.async("string")) : null

        let adornmentSvg: string | null = null
        if (manifest?.adornment?.svgPath) {
          const svgFile = zip.file(manifest.adornment.svgPath)
          if (svgFile) {
            adornmentSvg = await svgFile.async("string")
          }
        }

        return {
          name: file,
          path,
          deviceId: manifest?.device?.id ?? null,
          deviceName: manifest?.device?.name ?? file,
          ddfVersion: manifest?.ddfVersion ?? null,
          source,
          adornmentSvg,
        }
      } catch (error) {
        console.error(`[v0] Error parsing DDF "${file}":`, error)
        return { name: file, path, deviceId: null, deviceName: file, ddfVersion: null, source, adornmentSvg: null }
      }
    }),
  )
}

export async function GET() {
  // public/ddf/ - hand-curated, committed to the repo, served statically at
  // /ddf/*.zip. .data/ddf/ - auto-fetched at runtime whenever a device
  // announces a ddfVersion+url in its MQTT hello that isn't cached yet (see
  // app/api/ddf/fetch/route.ts) - deliberately kept outside public/ instead,
  // same split (and the same reason) as app/api/deploy/route.ts's
  // .data/deploys/: this is runtime state, not a build-time asset.
  const publicDir = join(process.cwd(), "public", "ddf")
  const dataDir = join(process.cwd(), ".data", "ddf")

  const [curated, autoFetched] = await Promise.all([
    scanDdfDir(publicDir, "/ddf", "curated"),
    scanDdfDir(dataDir, "/api/ddf/data", "auto-discovered"),
  ])

  // Deliberately *not* deduped by deviceId - an earlier version silently let
  // "auto-discovered" win a same-deviceId conflict, on the theory that
  // whatever a device announces moments ago must be freshest. In practice
  // that meant a device's own (possibly stale, since pushing a new DDF to a
  // device's filesystem is a separate manual step from updating its curated
  // copy) DDF silently shadowed a deliberately-maintained public/ddf/ entry,
  // with no visible sign anything was overridden - bit us twice in one day
  // (2026-08-04). Both entries are returned now; callers that need a single
  // automatic choice (lib/device-description.ts's resolveDeviceForProject)
  // apply their own explicit precedence, and UI pickers
  // (startup-device-gate.tsx, project-settings-dialog.tsx) show both,
  // grouped by source with their version visible, so a human picks instead
  // of a silent rule.
  return NextResponse.json({ devices: [...curated, ...autoFetched] })
}
