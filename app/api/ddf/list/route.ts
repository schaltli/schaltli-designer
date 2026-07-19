import { NextResponse } from "next/server"
import { readdir, readFile } from "fs/promises"
import { join } from "path"
import JSZip from "jszip"

// This route reads public/ddf/ from disk on every request. Without this,
// Next.js may treat a GET route handler with no dynamic APIs as static and
// cache the first response indefinitely, so newly added/removed DDFs (or
// this route's own code changes) wouldn't be picked up without a full
// rebuild.
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const ddfDir = join(process.cwd(), "public", "ddf")

    const files = await readdir(ddfDir)
    const zipFiles = files.filter((file) => file.toLowerCase().endsWith(".zip"))

    // Parse each DDF's device.json (and adornment SVG, for a picker preview)
    // server-side, so the client can check device availability and show a
    // thumbnail without fetching/unzipping every DDF itself.
    const devices = await Promise.all(
      zipFiles.map(async (file) => {
        const path = `/ddf/${file}`
        try {
          const buffer = await readFile(join(ddfDir, file))
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
            adornmentSvg,
          }
        } catch (error) {
          console.error(`[v0] Error parsing DDF "${file}":`, error)
          return { name: file, path, deviceId: null, deviceName: file, adornmentSvg: null }
        }
      }),
    )

    return NextResponse.json({ devices })
  } catch (error) {
    console.error("[v0] Error reading ddf directory:", error)

    // Return empty list if directory doesn't exist or other error
    return NextResponse.json({ devices: [] })
  }
}
