"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

interface AssetColorEditorDialogProps {
  isOpen: boolean
  onClose: () => void
  asset: any // Replace 'any' with the actual type of your asset
  onUpdateAsset: (assetId: string, newData: string) => void
}

export function AssetColorEditorDialog({ isOpen, onClose, asset, onUpdateAsset }: AssetColorEditorDialogProps) {
  const [previewSvg, setPreviewSvg] = useState("")
  const [availableColors, setAvailableColors] = useState<string[]>([])
  const [recolorations, setRecolorations] = useState<{ originalColor: string; newColor: string }[]>([])
  const [livePreviewSvg, setLivePreviewSvg] = useState("")

  useEffect(() => {
    if (!asset || !isOpen) {
      setPreviewSvg("")
      setAvailableColors([])
      setRecolorations([])
      return
    }


    // Process SVG content for preview
    let svgContent = asset.data
    try {
      if (asset.data?.startsWith("data:image/svg+xml;base64,")) {
        svgContent = atob(asset.data.replace("data:image/svg+xml;base64,", ""))
      } else if (asset.data?.startsWith("data:image/svg+xml,")) {
        svgContent = decodeURIComponent(asset.data.replace("data:image/svg+xml,", ""))
      } else if (asset.data?.startsWith("data:image/svg+xml;charset=utf-8,")) {
        svgContent = decodeURIComponent(asset.data.replace("data:image/svg+xml;charset=utf-8,", ""))
      }

      setPreviewSvg(svgContent || "")

      // Extract colors from SVG
      const extractedColors = extractColorsFromSVG(svgContent || "")
      setAvailableColors(extractedColors)

      // Create initial recolorations for all available colors
      const initialRecolorations = extractedColors.map((color) => ({
        originalColor: color,
        newColor: color === "currentcolor" ? "#000000" : color,
      }))
      setRecolorations(initialRecolorations)
    } catch (error) {
      console.error("[v0] Error processing asset:", error)
      setPreviewSvg("")
      setAvailableColors([])
      setRecolorations([])
    }
  }, [asset, isOpen])

  const extractColorsFromSVG = (svgContent: string): string[] => {
    const colors = new Set<string>()

    // Extract hex colors
    const hexMatches = svgContent.match(/#[0-9a-fA-F]{3,8}/g)
    if (hexMatches) {
      hexMatches.forEach((color) => colors.add(color.toLowerCase()))
    }

    // Extract rgb/rgba colors
    const rgbMatches = svgContent.match(/rgba?$$[^)]+$$/g)
    if (rgbMatches) {
      rgbMatches.forEach((color) => colors.add(color))
    }

    // Extract named colors and special values
    const namedColorMatches = svgContent.match(/(?:fill|stroke)=["']([^"']+)["']/g)
    if (namedColorMatches) {
      namedColorMatches.forEach((match) => {
        const color = match.split("=")[1].replace(/["']/g, "")
        if (color !== "none" && !color.startsWith("url(")) {
          colors.add(color.toLowerCase())
        }
      })
    }

    return Array.from(colors)
  }

  const applyColorRecolorations = (
    svgContent: string,
    recolorations: { originalColor: string; newColor: string }[],
  ): string => {
    let result = svgContent
    let replacementCount = 0

    recolorations.forEach(({ originalColor, newColor }) => {
      if (originalColor !== newColor) {
        const escapedOriginal = originalColor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

        // Create regex patterns for different color formats (case-insensitive)
        const patterns = [
          new RegExp(`fill=["']${escapedOriginal}["']`, "gi"),
          new RegExp(`stroke=["']${escapedOriginal}["']`, "gi"),
          // Also match colors without quotes
          new RegExp(`fill=${escapedOriginal}(?=[\\s>])`, "gi"),
          new RegExp(`stroke=${escapedOriginal}(?=[\\s>])`, "gi"),
          // Match colors in style attributes
          new RegExp(`fill:\\s*${escapedOriginal}`, "gi"),
          new RegExp(`stroke:\\s*${escapedOriginal}`, "gi"),
        ]

        patterns.forEach((pattern) => {
          const matches = result.match(pattern)
          if (matches) {
            replacementCount += matches.length
            result = result.replace(pattern, (match) => {
              return match.replace(new RegExp(escapedOriginal, "gi"), newColor)
            })
          }
        })
      }
    })

    return result
  }

  const updateRecoloration = (index: number, field: string, value: string) => {
    setRecolorations((prev) =>
      prev.map((recoloration, i) => (i === index ? { ...recoloration, [field]: value } : recoloration)),
    )
  }

  useEffect(() => {
    if (previewSvg && recolorations.length > 0) {
      const updatedPreview = applyColorRecolorations(previewSvg, recolorations)
      setLivePreviewSvg(updatedPreview)
    } else {
      setLivePreviewSvg(previewSvg)
    }
  }, [previewSvg, recolorations])

  const removeRecoloration = (index: number) => {
    setRecolorations((prev) => prev.filter((_, i) => i !== index))
  }

  const handleApplyChanges = () => {
    if (!asset || !previewSvg) return

    const updatedSvg = applyColorRecolorations(previewSvg, recolorations)

    // Convert back to the original data format
    let updatedData = updatedSvg
    if (asset.data?.startsWith("data:image/svg+xml;base64,")) {
      updatedData = "data:image/svg+xml;base64," + btoa(updatedSvg)
    } else if (asset.data?.startsWith("data:image/svg+xml,")) {
      updatedData = "data:image/svg+xml," + encodeURIComponent(updatedSvg)
    } else if (asset.data?.startsWith("data:image/svg+xml;charset=utf-8,")) {
      updatedData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(updatedSvg)
    }

    onUpdateAsset(asset.id, updatedData)
    onClose()
  }

  if (!asset) {
    return null
  }

  const safeAvailableColors = availableColors || []

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change Colors - {asset.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Preview Section */}
          <div>
            <Label className="text-sm font-medium">Preview</Label>
            <div className="mt-2 p-6 border rounded-lg bg-muted/50 flex items-center justify-center min-h-[120px]">
              <div
                className="w-full h-full max-w-[100px] max-h-[100px] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-[80px] [&>svg]:max-h-[80px]"
                style={{ minWidth: "80px", minHeight: "80px" }}
                dangerouslySetInnerHTML={{ __html: livePreviewSvg }}
              />
            </div>
          </div>

          {/* Color Recolorations Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Color Recolorations</Label>
            </div>

            {safeAvailableColors.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 bg-muted rounded">No colors detected in this asset</div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-2 pb-2 border-b">
                  <div className="flex-1">
                    <Label className="text-xs font-medium text-muted-foreground">From</Label>
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs font-medium text-muted-foreground">To</Label>
                  </div>
                  <div className="w-8"></div> {/* Spacer for delete button */}
                </div>

                {recolorations.map((recoloration, index) => (
                  <div key={index} className="flex items-center gap-3 px-2 py-2 hover:bg-muted/50 rounded">
                    <div className="flex-1 flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border border-border flex-shrink-0"
                        style={{
                          backgroundColor:
                            recoloration.originalColor === "currentcolor" ? "#000000" : recoloration.originalColor,
                          border: recoloration.originalColor === "currentcolor" ? "1px solid #ccc" : undefined,
                        }}
                      />
                      <span className="text-xs font-mono text-muted-foreground">{recoloration.originalColor}</span>
                    </div>
                    <div className="flex-1">
                      <Input
                        type="color"
                        value={recoloration.newColor}
                        onChange={(e) => updateRecoloration(index, "newColor", e.target.value)}
                        className="h-8 w-full"
                      />
                    </div>
                    <Button
                      onClick={() => removeRecoloration(index)}
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 w-8 h-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleApplyChanges}>Apply Changes</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
