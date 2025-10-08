"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { ScreenmanProject } from "./screenman-editor"
import JSZip from 'jszip'
import { 
  convertImageToColorDepth, 
  bitmapToPBM, 
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
      
      // Collect all asset usages with their resolutions from all screens
      const assetUsages = new Map<string, Set<string>>() // assetId -> Set of resolutions
      const assetIdToFilename = new Map<string, string>() // assetId -> primary filename for JSON updates
      
      console.log("[v0] Export: Scanning for asset usages...")
      console.log("[v0] Export: Project screens:", project.screens.length)
      console.log("[v0] Export: Project assets:", project.assets.map(a => ({ id: a.id, name: a.name, type: a.type })))
      
      // Scan all screens for asset usages
      for (const screen of project.screens) {
        console.log("[v0] Export: Processing screen:", screen.name, "objects:", screen.objects.length)
        for (const obj of screen.objects) {
          console.log("[v0] Export: Checking object:", { 
            type: obj.type, 
            assetId: (obj as any).assetId, 
            iconAssetId: (obj as any).iconAssetId, 
            width: (obj as any).width, 
            height: (obj as any).height,
            properties: (obj as any).properties
          })
          
          const properties = (obj as any).properties
          
          // Check for icon assets
          if (obj.type === "icon" && properties?.assetId) {
            const resolution = `${(obj as any).width}x${(obj as any).height}`
            console.log("[v0] Export: Found icon usage:", { assetId: properties.assetId, resolution })
            if (!assetUsages.has(properties.assetId)) {
              assetUsages.set(properties.assetId, new Set())
            }
            assetUsages.get(properties.assetId)!.add(resolution)
          }
          // Check for MQTT icon fields
          if (obj.type === "MQTTIconField" && properties?.iconAssetId) {
            const resolution = `${(obj as any).width}x${(obj as any).height}`
            console.log("[v0] Export: Found MQTT icon usage:", { iconAssetId: properties.iconAssetId, resolution })
            if (!assetUsages.has(properties.iconAssetId)) {
              assetUsages.set(properties.iconAssetId, new Set())
            }
            assetUsages.get(properties.iconAssetId)!.add(resolution)
          }
          
          // Check for MQTT icon field value-icon pairs
          if (obj.type === "MQTTIconField" && properties?.valueIconPairs) {
            const resolution = `${(obj as any).width}x${(obj as any).height}`
            const valueIconPairs = properties.valueIconPairs || []
            
            for (const pair of valueIconPairs) {
              if (pair.thenShowIcon) {
                console.log("[v0] Export: Found MQTT icon rule usage:", { iconAssetId: pair.thenShowIcon, resolution })
                if (!assetUsages.has(pair.thenShowIcon)) {
                  assetUsages.set(pair.thenShowIcon, new Set())
                }
                assetUsages.get(pair.thenShowIcon)!.add(resolution)
              }
            }
          }
        }
      }
      
      console.log("[v0] Export: Found asset usages:", Array.from(assetUsages.entries()).map(([id, resolutions]) => ({
        assetId: id,
        resolutions: Array.from(resolutions)
      })))
      
      // If no asset usages found, process all icon assets for debugging
      if (assetUsages.size === 0) {
        console.log("[v0] Export: No asset usages found, processing all icon assets for debugging")
        for (const asset of project.assets) {
          if (asset.type === "icon") {
            assetUsages.set(asset.id, new Set(["64x64"]))
            console.log("[v0] Export: Added icon asset for debugging:", { assetId: asset.id, name: asset.name })
          }
        }
      }
      
      // Process each asset usage
      let processCount = 0
      const totalUsages = Array.from(assetUsages.values()).reduce((sum, resolutions) => sum + resolutions.size, 0)
      
      for (const [assetId, resolutions] of assetUsages) {
        const asset = project.assets.find(a => a.id === assetId)
        if (!asset) {
          console.warn(`[v0] Export: Asset ${assetId} not found in project assets`)
          continue
        }
        
        console.log("[v0] Export: Processing asset:", { id: asset.id, name: asset.name, type: asset.type, resolutions: Array.from(resolutions) })
        
        // Create directory for this asset
        const assetDirName = asset.id
        const assetDir = assetsFolder.folder(assetDirName)
        
        let isFirstResolution = true
        
        for (const resolution of resolutions) {
          processCount++
          const [width, height] = resolution.split('x').map(Number)
          
          setExportProgress(`Converting ${asset.name} at ${resolution} (${processCount}/${totalUsages})...`)
          
          try {
            let imageData: ImageData
            
            if (asset.type === "icon") {
              console.log("[v0] Export: Processing icon asset at resolution:", resolution)
              // Rasterize SVG icon at specific resolution
              const svgString = asset.data
              imageData = await rasterizeSVG(svgString, width, height)
            } else {
              console.log("[v0] Export: Processing non-icon asset at resolution:", resolution)
              // Load bitmap from data URL
              imageData = await loadImageFromDataURL(asset.data)
            }
            
            // Convert to target color depth
            const bitmapData = convertImageToColorDepth(imageData, colorDepth)
            
            // Convert to PBM format
            const pbmData = bitmapToPBM(bitmapData)
            
            console.log("[v0] Export: Created PBM file:", `${resolution}.pbm`, "for asset:", asset.name, "at resolution:", resolution)
            
            // Store the mapping for JSON updates (use first resolution as primary)
            if (isFirstResolution) {
              assetIdToFilename.set(asset.id, `${assetDirName}/${resolution}.pbm`)
              isFirstResolution = false
            }
            
            // Add to zip in asset directory
            assetDir?.file(`${resolution}.pbm`, pbmData)
            
          } catch (error) {
            console.error(`Failed to convert asset ${asset.name} at ${resolution}:`, error)
            console.error('Error details:', {
              assetId: asset.id,
              assetType: asset.type,
              assetName: asset.name,
              resolution,
              errorMessage: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            })
            // Continue with other resolutions
          }
        }
      }
      
      setExportProgress("Adding fonts...")
      
      // Create fonts folder
      const fontsFolder = zip.folder("fonts")
      if (!fontsFolder) throw new Error("Failed to create fonts folder")
      
      // Add TTF font files
      for (const font of project.fonts) {
        try {
          if (font.url) {
            const response = await fetch(font.url)
            if (response.ok) {
              const fontData = await response.arrayBuffer()
              const fileName = `${font.name.replace(/\s+/g, '_')}_${font.size}px.ttf`
              fontsFolder.file(fileName, fontData)
            }
          }
        } catch (error) {
          console.warn(`Failed to add font ${font.name}:`, error)
        }
      }
      
      // Add fonts readme
      fontsFolder.file("README.txt", "Font files in TTF format for embedded displays.\n")
      
      // Add project JSON file at root level with updated asset references
      setExportProgress("Adding project data...")
      
      // Create a deep copy of the project and update asset references
      const exportProject = JSON.parse(JSON.stringify(project))
      
      // Remove the assets array completely from export
      delete exportProject.assets
      
      // Remove font data from export - only keep metadata and paths
      exportProject.fonts = exportProject.fonts.map((font: any) => ({
        id: font.id,
        name: font.name,
        size: font.size,
        url: font.url ? `fonts/${font.name.replace(/\s+/g, '_')}_${font.size}px.ttf` : undefined,
        baselineOffset: font.baselineOffset
        // Remove 'url' field which contains the data URL
      }))
      
      // Update asset references in objects to use correct resolution paths
      exportProject.screens = exportProject.screens.map((screen: any) => ({
        ...screen,
        objects: screen.objects.map((obj: any) => {
          let updatedObj = { ...obj }
          
          const properties = (obj as any).properties
          
          // Handle icon objects
          if (obj.type === "icon" && properties?.assetId && assetUsages.has(properties.assetId)) {
            const resolution = `${(obj as any).width}x${(obj as any).height}`
            const assetDirName = properties.assetId
            updatedObj.path = `assets/${assetDirName}/${resolution}.pbm`
            // Remove the original assetId from properties
            if (updatedObj.properties) {
              delete updatedObj.properties.assetId
            }
          }
          
          // Handle MQTT icon fields
          if (obj.type === "MQTTIconField" && properties?.iconAssetId && assetUsages.has(properties.iconAssetId)) {
            const resolution = `${(obj as any).width}x${(obj as any).height}`
            const assetDirName = properties.iconAssetId
            updatedObj.iconPath = `assets/${assetDirName}/${resolution}.pbm`
            // Remove the original iconAssetId from properties
            if (updatedObj.properties) {
              delete updatedObj.properties.iconAssetId
            }
          }
          
          return updatedObj
        })
      }))
      
      // Also update background image references
      exportProject.screens = exportProject.screens.map((screen: any) => {
        if (screen.backgroundImageAssetId && assetUsages.has(screen.backgroundImageAssetId)) {
          // For background images, use the first available resolution
          const resolutions = Array.from(assetUsages.get(screen.backgroundImageAssetId)!)
          const resolution = resolutions[0] // Use first resolution
          const assetDirName = screen.backgroundImageAssetId
          return {
            ...screen,
            backgroundImagePath: `assets/${assetDirName}/${resolution}.pbm`,
            // Remove the original backgroundImageAssetId
            backgroundImageAssetId: undefined
          }
        }
        return screen
      })
      
      const projectJson = JSON.stringify(exportProject, null, 2)
      zip.file("project.json", projectJson)
      
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