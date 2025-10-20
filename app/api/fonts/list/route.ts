import { NextResponse } from "next/server"
import { readdir } from "fs/promises"
import { join } from "path"

export async function GET() {
  try {
    const fontsDir = join(process.cwd(), "public", "fonts", "bdf")
    
    // Read the directory contents
    const files = await readdir(fontsDir)
    
    // Filter for .bdf files only
    const bdfFiles = files.filter((file) => file.toLowerCase().endsWith(".bdf"))
    
    // Create font objects
    const fonts = bdfFiles.map((file) => ({
      name: file,
      path: `/fonts/bdf/${file}`,
    }))
    
    return NextResponse.json({ fonts })
  } catch (error) {
    console.error("[v0] Error reading fonts directory:", error)
    
    // Return empty list if directory doesn't exist or other error
    return NextResponse.json({ fonts: [] })
  }
}

