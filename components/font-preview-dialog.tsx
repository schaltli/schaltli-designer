"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { BDFFont } from "@/lib/bdffont"
import { getBDFFontHeight, alignToPixel, setupBDFCanvas } from "@/lib/font-utils"

interface FontPreviewDialogProps {
  isOpen: boolean
  onClose: () => void
  font: {
    id: string
    name: string
    data: string
  } | null
}

export function FontPreviewDialog({ isOpen, onClose, font }: FontPreviewDialogProps) {
  const [previewText, setPreviewText] = useState(
    "Der flinke braune Fuchs hüpft über zwölf große Zwerge äußerst wütend. 1234567890.",
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    console.log("[v0] FontPreviewDialog useEffect triggered", {
      hasFont: !!font,
      isOpen,
      hasCanvas: !!canvasRef.current,
    })

    if (!font || !isOpen) {
      console.log("[v0] Early return: font or isOpen is false")
      return
    }

    const timeoutId = setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) {
        console.log("[v0] Canvas ref is still null after timeout")
        return
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        console.log("[v0] Could not get 2d context")
        return
      }

      console.log("[v0] Font preview rendering for:", font.name)

      try {
        // Parse the BDF font
        const bdfFont = new BDFFont(font.data)

        console.log("[v0] BDFFont parsed successfully")
        console.log("[v0] BDFFont properties:", bdfFont.properties)
        console.log("[v0] BDFFont FONTBOUNDINGBOX:", bdfFont.FONTBOUNDINGBOX)
        console.log("[v0] BDFFont glyphs count:", Object.keys(bdfFont.glyphs).length)

        const rootStyles = getComputedStyle(document.documentElement)
        const bgColorRaw = rootStyles.getPropertyValue("--background").trim()
        const fgColorRaw = rootStyles.getPropertyValue("--foreground").trim()

        console.log("[v0] Raw colors - bg:", bgColorRaw, "fg:", fgColorRaw)

        const parseHSL = (hslString: string) => {
          const match = hslString.match(/(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%/)
          if (match) {
            return `hsl(${match[1]}, ${match[2]}%, ${match[3]}%)`
          }
          return hslString
        }

        const bgColor = bgColorRaw.includes(" ") ? parseHSL(bgColorRaw) : bgColorRaw || "#ffffff"
        const fgColor = fgColorRaw.includes(" ") ? parseHSL(fgColorRaw) : fgColorRaw || "#000000"

        console.log("[v0] Parsed colors - bg:", bgColor, "fg:", fgColor)

        // Measure the text to determine canvas size
        const metrics = bdfFont.measureText(previewText)
        console.log("[v0] Text metrics:", metrics)

        const padding = 20
        const fontHeight = getBDFFontHeight(font.data)

        canvas.width = Math.max(metrics.width + padding * 2, 400)
        canvas.height = fontHeight + padding * 2

        console.log("[v0] Canvas size:", canvas.width, "x", canvas.height)

        // Clear canvas with background color
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Set up canvas for pixel-perfect rendering
        ctx.save()
        setupBDFCanvas(ctx)
        
        // Set text color
        ctx.fillStyle = fgColor

        const baselineY = alignToPixel(padding + fontHeight - (bdfFont.FONTBOUNDINGBOX?.y || 0))
        console.log("[v0] Drawing text at y:", baselineY)

        bdfFont.drawText(ctx, previewText, alignToPixel(padding), baselineY)
        
        // Restore canvas state
        ctx.restore()

        console.log("[v0] Font preview rendered successfully")
      } catch (error) {
        console.error("[v0] Error rendering font preview:", error)

        canvas.width = 600
        canvas.height = 100

        const rootStyles = getComputedStyle(document.documentElement)
        const bgColorRaw = rootStyles.getPropertyValue("--background").trim()
        const errorColorRaw = rootStyles.getPropertyValue("--destructive").trim()

        const parseHSL = (hslString: string) => {
          const match = hslString.match(/(\d+\.?\d*)\s+(\d+\.?\d*)%\s+(\d+\.?\d*)%/)
          if (match) {
            return `hsl(${match[1]}, ${match[2]}%, ${match[3]}%)`
          }
          return hslString
        }

        const bgColor = bgColorRaw.includes(" ") ? parseHSL(bgColorRaw) : bgColorRaw || "#ffffff"
        const errorColor = errorColorRaw.includes(" ") ? parseHSL(errorColorRaw) : errorColorRaw || "#ff0000"

        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = errorColor
        ctx.font = "12px sans-serif"
        ctx.fillText(`Error rendering font: ${error instanceof Error ? error.message : String(error)}`, 10, 30)
      }
    }, 100) // 100ms delay to ensure canvas is mounted

    return () => clearTimeout(timeoutId)
  }, [font, previewText, isOpen])

  if (!font) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Font Preview - {font.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="previewText" className="text-sm font-medium">
              Preview Text
            </Label>
            <Input
              id="previewText"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              className="mt-2"
              placeholder="Enter text to preview"
            />
          </div>

          <div>
            <Label className="text-sm font-medium">Preview</Label>
            <div className="mt-2 p-6 border rounded-lg bg-muted/50 flex items-center justify-center overflow-x-auto">
              <canvas ref={canvasRef} className="max-w-full" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

