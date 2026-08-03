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
  adornmentSvg: string | null
}

async function scanDdfDir(dir: string, pathPrefix: string): Promise<DdfListEntry[]> {
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
          adornmentSvg,
        }
      } catch (error) {
        console.error(`[v0] Error parsing DDF "${file}":`, error)
        return { name: file, path, deviceId: null, deviceName: file, ddfVersion: null, adornmentSvg: null }
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
    scanDdfDir(publicDir, "/ddf"),
    scanDdfDir(dataDir, "/api/ddf/data"),
  ])

  // Auto-fetched wins on a deviceId conflict - it came straight from the
  // device itself just now, so it's the freshest available copy (matches
  // resolveDeviceForProject's existing "always re-resolve fresh, never
  // trust a stale embedded copy" philosophy, just extended to which
  // *source* counts as freshest).
  const byDeviceId = new Map<string, DdfListEntry>()
  const withoutDeviceId: DdfListEntry[] = []
  for (const entry of [...curated, ...autoFetched]) {
    if (entry.deviceId) {
      byDeviceId.set(entry.deviceId, entry)
    } else {
      withoutDeviceId.push(entry)
    }
  }

  return NextResponse.json({ devices: [...byDeviceId.values(), ...withoutDeviceId] })
}
