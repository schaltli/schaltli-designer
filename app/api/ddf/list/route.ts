import { NextResponse } from "next/server"
import { readdir } from "fs/promises"
import { join } from "path"

export async function GET() {
  try {
    const ddfDir = join(process.cwd(), "public", "ddf")

    const files = await readdir(ddfDir)
    const zipFiles = files.filter((file) => file.toLowerCase().endsWith(".zip"))

    const devices = zipFiles.map((file) => ({
      name: file,
      path: `/ddf/${file}`,
    }))

    return NextResponse.json({ devices })
  } catch (error) {
    console.error("[v0] Error reading ddf directory:", error)

    // Return empty list if directory doesn't exist or other error
    return NextResponse.json({ devices: [] })
  }
}
