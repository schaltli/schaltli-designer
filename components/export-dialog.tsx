"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { ScreenmanProject } from "./screenman-editor"
import JSZip from 'jszip'
import { 
  convertImageToColorDepth, 
  bitmapToXBM, 
  loadImageFromDataURL, 
  rasterizeSVG,
  type ImageData 
} from "@/lib/asset-converter"

const FileCode = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" x2="8" y1="13" y2="13" />
    <line x1="16" x2="8" y1="17" y2="17" />
    <polyline points="10,9 9,9 8,9" />
  </svg>
)

interface ExportDialogProps {
  project: ScreenmanProject
  children: React.ReactNode
}

export function ExportDialog({ project, children }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState("")
  const [isOpen, setIsOpen] = useState(false)

  const handleZipExport = async () => {
    try {
      setIsExporting(true)
      setExportProgress("Creating export package...")
      
      const zip = new JSZip()
      const colorDepth = project.settings.colorDepth || "24bit"
      
      // Create assets folder
      const assetsFolder = zip.folder("assets")
      if (!assetsFolder) throw new Error("Failed to create assets folder")
      
      setExportProgress("Converting assets...")
      
      // Process each asset
      for (let i = 0; i < project.assets.length; i++) {
        const asset = project.assets[i]
        setExportProgress(`Converting ${asset.name} (${i + 1}/${project.assets.length})...`)
        
        try {
          let imageData: ImageData
          
          if (asset.type === "icon") {
            // Rasterize SVG icon
            const svgString = asset.data
            // Use a reasonable default size for icons
            imageData = await rasterizeSVG(svgString, 64, 64)
          } else {
            // Load bitmap from data URL
            imageData = await loadImageFromDataURL(asset.data)
          }
          
          // Convert to target color depth
          const bitmapData = convertImageToColorDepth(imageData, colorDepth)
          
          // Convert to XBM format
          const xbmName = asset.name.replace(/[^a-zA-Z0-9_]/g, '_')
          const xbmContent = bitmapToXBM(bitmapData, xbmName)
          
          // Add to zip
          assetsFolder.file(`${xbmName}.xbm`, xbmContent)
          
        } catch (error) {
          console.warn(`Failed to convert asset ${asset.name}:`, error)
          // Continue with other assets
        }
      }
      
      setExportProgress("Adding fonts...")
      
      // Create fonts folder
      const fontsFolder = zip.folder("fonts")
      if (!fontsFolder) throw new Error("Failed to create fonts folder")
      
      // Add BDF font files
      for (const font of project.fonts) {
        try {
          const response = await fetch(font.path)
          if (response.ok) {
            const fontData = await response.text()
            fontsFolder.file(`${font.name}.bdf`, fontData)
          }
        } catch (error) {
          console.warn(`Failed to add font ${font.name}:`, error)
        }
      }
      
      // Add fonts readme
      fontsFolder.file("README.txt", "Font files in BDF format for embedded displays.\n")
      
      setExportProgress("Generating zip file...")
      
      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: "blob" })
      
      setExportProgress("Downloading...")
      
      // Download zip file
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${project.name || "screenman-project"}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setExportProgress("Export complete!")
      
      // Close dialog after a short delay
      setTimeout(() => {
        setIsOpen(false)
        setIsExporting(false)
        setExportProgress("")
      }, 1000)
      
    } catch (error) {
      console.error("Export failed:", error)
      setExportProgress(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Export your project as a zip file containing converted assets and fonts ready for embedded display projects.
          </div>

          {exportProgress && (
            <div className="space-y-2">
              <div className="text-sm font-medium">{exportProgress}</div>
              {isExporting && (
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: "100%" }}></div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">
              <strong>Assets:</strong> Converted to {project.settings.colorDepth || "24bit"} color depth in XBM format
            </div>
            <div className="text-xs text-muted-foreground">
              <strong>Fonts:</strong> BDF font files for embedded displays
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isExporting}>
              Cancel
            </Button>
            <Button onClick={handleZipExport} disabled={isExporting}>
              {isExporting ? "Exporting..." : "Export ZIP"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}