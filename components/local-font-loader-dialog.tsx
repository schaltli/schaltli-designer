"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BDFFont } from "@/lib/bdffont"
import { getBDFFontHeight } from "@/lib/font-utils"
import { FolderIcon, FileIcon } from "lucide-react"

interface LocalFontLoaderDialogProps {
  isOpen: boolean
  onClose: () => void
  onFontLoaded: (fontData: {
    id: string
    name: string
    displayName: string
    path: string
    size?: number
    data: string
    internalName?: string
    ascent?: number
    descent?: number
  }) => void
}

interface LocalFontFile {
  name: string
  path: string
}

export function LocalFontLoaderDialog({ isOpen, onClose, onFontLoaded }: LocalFontLoaderDialogProps) {
  const [fonts, setFonts] = useState<LocalFontFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [loadingFont, setLoadingFont] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadFontList()
    }
  }, [isOpen])

  const loadFontList = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch the list of BDF files from the public/fonts/bdf directory
      const response = await fetch("/api/fonts/list")

      if (!response.ok) {
        throw new Error(`Failed to load font list: ${response.status}`)
      }

      const data = await response.json()
      setFonts(data.fonts || [])
    } catch (err) {
      console.error("[v0] Error loading local font list:", err)
      setError("Failed to load local fonts. Please ensure BDF fonts are in the public/fonts/bdf directory.")
    } finally {
      setLoading(false)
    }
  }

  const loadFont = async (file: LocalFontFile) => {
    setLoadingFont(file.name)
    setError(null)

    try {
      const response = await fetch(`/fonts/bdf/${file.name}`)

      if (!response.ok) {
        throw new Error(`Failed to load font: ${response.status}`)
      }

      const bdfContent = await response.text()
      const bdfFont = new BDFFont(bdfContent)
      const fontName = bdfFont.FONT || file.name.replace(".bdf", "")

      // Get font metrics from BDF data
      const fontAscent = bdfFont.properties["FONT_ASCENT"] || bdfFont.properties["ASCENT"] || 14
      const fontDescent = bdfFont.properties["FONT_DESCENT"] || bdfFont.properties["DESCENT"] || 4
      const actualFontHeight = fontAscent + fontDescent
      const displayName = `${fontName} ${actualFontHeight}px`

      // Determine internal name from fontmap.json if available
      let internalName: string | undefined = undefined
      console.log(`[FontLoader] Loading font: ${file.name}`)
      try {
        const mapResponse = await fetch(`/fonts/bdf/fontmap.json`)
        console.log(`[FontLoader] Fontmap fetch status:`, mapResponse.ok, mapResponse.status)
        if (mapResponse.ok) {
          const fontMap: Record<string, string> = await mapResponse.json()
          console.log(`[FontLoader] Fontmap contents:`, fontMap)
          console.log(`[FontLoader] Looking up file.name: "${file.name}"`)
          const mappedName = fontMap[file.name]
          console.log(`[FontLoader] Mapped name result:`, mappedName)
          if (typeof mappedName === "string" && mappedName.trim().length > 0) {
            internalName = mappedName
            console.log(`[FontLoader] ✓ Using internal name: ${internalName}`)
          } else {
            console.log(`[FontLoader] ✗ No valid mapping found, no internal name`)
          }
        } else {
          console.log(`[FontLoader] ✗ Fontmap fetch failed, no internal name`)
        }
      } catch (err) {
        console.error(`[FontLoader] ✗ Error fetching fontmap:`, err)
        // Ignore mapping errors and continue without internal name
      }
      console.log(`[FontLoader] Font metrics - Ascent: ${fontAscent}, Descent: ${fontDescent}, Height: ${actualFontHeight}`)

      const fileName = file.name.replace(/[^a-zA-Z0-9\-_.]/g, "_")

      const newFont = {
        id: `font-${Date.now()}`, // Will be overridden by project-settings-dialog
        name: fontName,
        displayName: displayName,
        path: `fonts/${fileName}`,
        size: actualFontHeight,
        data: bdfContent,
        internalName: internalName,
        ascent: fontAscent,
        descent: fontDescent,
      }

      onFontLoaded(newFont)
      onClose()
    } catch (err) {
      console.error("[v0] Error loading local font:", err)
      setError(`Failed to load font: ${file.name}`)
    } finally {
      setLoadingFont(null)
    }
  }

  const filteredFonts = fonts.filter((font) => font.name.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderIcon className="w-5 h-5" />
            Load Local BDF Font
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="search">Search Fonts</Label>
            <Input
              id="search"
              placeholder="Search by font name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          ) : fonts.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <FolderIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm">No fonts found in the local directory.</p>
              <p className="text-xs mt-2">
                Add .bdf files to <code className="bg-gray-100 px-1 py-0.5 rounded">public/fonts/bdf/</code> directory.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {filteredFonts.map((font) => (
                  <div
                    key={font.path}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileIcon className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="font-medium text-sm">{font.name}</p>
                        <p className="text-xs text-gray-500">{font.path}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => loadFont(font)}
                      disabled={loadingFont === font.name}
                    >
                      {loadingFont === font.name ? "Loading..." : "Load"}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex justify-between items-center pt-4 border-t">
            <p className="text-xs text-gray-500">
              {filteredFonts.length} font{filteredFonts.length !== 1 ? "s" : ""} available
            </p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

