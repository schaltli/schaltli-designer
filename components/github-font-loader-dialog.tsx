"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GitHubIcon } from "@/components/icons/github-icon"
import { BDFFont } from "@/lib/bdffont"
import { parseXLFD, formatXLFDDisplayName } from "@/lib/xlfd-parser"

interface GitHubFontLoaderDialogProps {
  isOpen: boolean
  onClose: () => void
  onFontLoaded: (fontData: {
    id: string
    name: string
    displayName: string
    path: string
    size?: number
    xlfd?: any
    data: string
  }) => void
}

interface GitHubFile {
  name: string
  path: string
  size: number
  download_url: string
}

export function GitHubFontLoaderDialog({ isOpen, onClose, onFontLoaded }: GitHubFontLoaderDialogProps) {
  const [fonts, setFonts] = useState<GitHubFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [loadingFont, setLoadingFont] = useState<string | null>(null)
  const [previewingFont, setPreviewingFont] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{ font: GitHubFile; bdfFont: BDFFont } | null>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (isOpen) {
      loadFontList()
    }
  }, [isOpen])

  const loadFontList = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("https://api.github.com/repos/olikraus/u8g2/contents/tools/font/bdf?ref=master")

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }

      const data = await response.json()
      const bdfFiles = data.filter((file: any) => file.name.endsWith(".bdf") && file.type === "file")

      setFonts(bdfFiles)
    } catch (err) {
      console.error("[v0] Error loading font list from GitHub:", err)
      setError("Failed to load font list from GitHub. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const loadFont = async (file: GitHubFile) => {
    setLoadingFont(file.name)
    setError(null)

    try {
      const response = await fetch(file.download_url)

      if (!response.ok) {
        throw new Error(`Failed to download font: ${response.status}`)
      }

      const bdfContent = await response.text()
      const bdfFont = new BDFFont(bdfContent)
      const fontName = bdfFont.FONT || file.name.replace(".bdf", "")

      const xlfdData = fontName ? parseXLFD(fontName) : null
      const displayName = xlfdData ? formatXLFDDisplayName(xlfdData) : fontName

      const fontId = `font-${Date.now()}`
      const fileName = file.name.replace(/[^a-zA-Z0-9\-_.]/g, "_")

      const newFont = {
        id: fontId,
        name: fontName,
        displayName: displayName,
        path: `fonts/${fileName}`,
        size: file.size,
        xlfd: xlfdData || undefined,
        data: bdfContent,
      }

      onFontLoaded(newFont)
      onClose()
    } catch (err) {
      console.error("[v0] Error loading font from GitHub:", err)
      setError(`Failed to load font: ${file.name}`)
    } finally {
      setLoadingFont(null)
    }
  }

  const previewFont = async (file: GitHubFile) => {
    if (previewingFont === file.name) {
      setPreviewingFont(null)
      setPreviewData(null)
      return
    }

    setPreviewingFont(file.name)
    setError(null)

    try {
      const response = await fetch(file.download_url)

      if (!response.ok) {
        throw new Error(`Failed to download font: ${response.status}`)
      }

      const bdfContent = await response.text()
      const bdfFont = new BDFFont(bdfContent)

      setPreviewData({ font: file, bdfFont })
    } catch (err) {
      console.error("[v0] Error previewing font from GitHub:", err)
      setError(`Failed to preview font: ${file.name}`)
      setPreviewingFont(null)
    }
  }

  useEffect(() => {
    if (!previewData || !previewCanvasRef.current) return

    const canvas = previewCanvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    try {
      const { bdfFont } = previewData
      const previewText = "Der flinke braune Fuchs hüpft über zwölf große Zwerge äußerst wütend. 1234567890."

      const rootStyles = getComputedStyle(document.documentElement)
      const bgColorRaw = rootStyles.getPropertyValue("--background").trim()
      const fgColorRaw = rootStyles.getPropertyValue("--foreground").trim()

      const parseHSL = (hslString: string) => {
        const match = hslString.match(/(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%/)
        if (match) {
          return `hsl(${match[1]}, ${match[2]}%, ${match[3]}%)`
        }
        return hslString
      }

      const bgColor = bgColorRaw.includes(" ") ? parseHSL(bgColorRaw) : bgColorRaw || "#ffffff"
      const fgColor = fgColorRaw.includes(" ") ? parseHSL(fgColorRaw) : fgColorRaw || "#000000"

      const metrics = bdfFont.measureText(previewText)
      const padding = 20
      const fontHeight = bdfFont.FONTBOUNDINGBOX?.h || 16

      canvas.width = Math.min(metrics.width + padding * 2, 600)
      canvas.height = fontHeight + padding * 2

      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = fgColor

      const baselineY = padding + fontHeight - (bdfFont.FONTBOUNDINGBOX?.yoff || 0)
      bdfFont.drawText(ctx, previewText, padding, baselineY)
    } catch (err) {
      console.error("[v0] Error rendering preview:", err)
    }
  }, [previewData])

  const filteredFonts = fonts.filter((font) => font.name.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitHubIcon className="h-5 w-5" />
            Load Font from u8g2 GitHub Repository
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          <div>
            <Label htmlFor="search" className="text-sm">
              Search Fonts
            </Label>
            <Input
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by font name..."
              className="mt-1"
            />
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Loading fonts from GitHub...</div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-2">
                  {filteredFonts.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8">
                      {searchQuery ? "No fonts found matching your search" : "No fonts available"}
                    </div>
                  ) : (
                    filteredFonts.map((font) => (
                      <div key={font.path} className="border rounded overflow-hidden">
                        <div className="p-3 hover:bg-muted">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{font.name}</div>
                              <div className="text-xs text-muted-foreground">{Math.round(font.size / 1024)}KB</div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => previewFont(font)}
                                disabled={loadingFont !== null}
                              >
                                {previewingFont === font.name ? "Hide" : "Preview"}
                              </Button>
                              <Button size="sm" onClick={() => loadFont(font)} disabled={loadingFont !== null}>
                                {loadingFont === font.name ? "Loading..." : "Load"}
                              </Button>
                            </div>
                          </div>
                        </div>
                        {previewingFont === font.name && previewData && (
                          <div className="p-3 border-t bg-muted/30">
                            <div className="flex items-center justify-center overflow-x-auto">
                              <canvas ref={previewCanvasRef} className="max-w-full" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
