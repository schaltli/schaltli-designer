"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AssetExporter, type AssetExportOptions } from "@/lib/asset-export"
import { DownloadIcon } from "@/components/icons/download-icon"

interface AssetExportDialogProps {
  project: any
  children: React.ReactNode
}

export function AssetExportDialog({ project, children }: AssetExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [selectedColorDepth, setSelectedColorDepth] = useState<'1bit' | '4bit' | '24bit'>('24bit')

  const handleAssetExport = async () => {
    try {
      console.log('='.repeat(80))
      console.log('ASSET EXPORT DIALOG - STARTING EXPORT')
      console.log('='.repeat(80))
      
      setIsExporting(true)
      setExportProgress("Initializing asset export...")
      
      // Create export options based on project settings and user selection
      const exportOptions: AssetExportOptions = {
        colorDepth: selectedColorDepth,
        screenWidth: project.screenWidth,
        screenHeight: project.screenHeight
      }

      console.log('[AssetExportDialog] Export options:', exportOptions)
      console.log('[AssetExportDialog] Project name:', project.name)
      console.log('[AssetExportDialog] Project screens:', project.screens?.length)
      console.log('[AssetExportDialog] Project assets:', project.assets?.length)
      
      // Create asset exporter
      const exporter = new AssetExporter(exportOptions)
      
      setExportProgress("Processing background images...")
      
      // Export assets
      const result = await exporter.exportAssets(project)
      
      setExportProgress(`Exported ${result.backgroundImages.length} background images, ${result.iconUsages.length} icon usages, and ${result.softwareButtons.length} software buttons`)
      
      // Download the zip file
      setExportProgress("Preparing download...")
      
      const url = URL.createObjectURL(result.zipFile)
      const a = document.createElement("a")
      a.href = url
      a.download = `${project.name || "screensmith-project"}-assets-${selectedColorDepth}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      setExportProgress("Asset export complete!")
      
      // Close dialog after a short delay
      setTimeout(() => {
        setIsOpen(false)
        setIsExporting(false)
        setExportProgress("")
      }, 2000)
      
    } catch (error) {
      console.error("Asset export failed:", error)
      setExportProgress(`Asset export failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsExporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DownloadIcon className="h-5 w-5" />
            Export Assets
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            Export project assets with color depth filtering. This creates a separate zip file 
            containing processed background images and pre-rendered icon usages.
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="color-depth" className="text-sm font-medium">
              Color Depth
            </Label>
            <Select
              value={selectedColorDepth}
              onValueChange={(value: '1bit' | '4bit' | '24bit') => setSelectedColorDepth(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select color depth" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1bit">1-bit (Monochrome) - Dithered PBM</SelectItem>
                <SelectItem value="4bit">4-bit (Grayscale) - BMP with grayscale palette</SelectItem>
                <SelectItem value="24bit">24-bit (RGB) - Uncompressed BMP</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              {selectedColorDepth === '1bit' && "Background images resized to screen size and exported as dithered 1-bit PBM files. Icons pre-rendered on their backgrounds."}
              {selectedColorDepth === '4bit' && "Background images resized to screen size and exported as 4-bit grayscale BMP files. Icons pre-rendered on their backgrounds."}
              {selectedColorDepth === '24bit' && "Background images resized to screen size and exported as 24-bit RGB BMP files. Icons pre-rendered on their backgrounds."}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm font-medium">Export Details</Label>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>• Background images: Resized to {project.screenWidth}×{project.screenHeight}px</div>
              <div>• Icons: Each usage gets its own pre-rendered file</div>
              <div>• Aspect ratio may change for background images</div>
              <div>• Icons are rendered on their actual backgrounds</div>
            </div>
          </div>
          
          {exportProgress && (
            <div className="p-3 bg-muted rounded-md">
              <div className="text-sm">{exportProgress}</div>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2">
          <Button 
            variant="outline" 
            onClick={() => setIsOpen(false)}
            disabled={isExporting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleAssetExport}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            <DownloadIcon className="h-4 w-4" />
            {isExporting ? "Exporting..." : "Export Assets"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
