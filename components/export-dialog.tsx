"use client"

import type React from "react"
import { useState } from "react"
import type { ScreenmanProject } from "./screenman-editor"
import JSZip from 'jszip'
import { AssetExporter, type AssetExportOptions } from "@/lib/asset-export"

interface ExportDialogProps {
  project: ScreenmanProject
  children: React.ReactNode
}

export function ExportDialog({ project, children }: ExportDialogProps) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    if (isExporting) return
    
    try {
      console.log('='.repeat(80))
      console.log('PROJECT EXPORT - STARTING')
      console.log('='.repeat(80))
      
      setIsExporting(true)
      
      // Create the main zip file
      const zip = new JSZip()
      
      // Create export options using project's color depth
      const exportOptions: AssetExportOptions = {
        colorDepth: project.settings.colorDepth || '24bit',
        screenWidth: project.screenWidth,
        screenHeight: project.screenHeight
      }

      console.log('[ExportDialog] Export options:', exportOptions)
      console.log('[ExportDialog] Project name:', project.name)
      console.log('[ExportDialog] Project screens:', project.screens?.length)
      console.log('[ExportDialog] Project assets:', project.assets?.length)
      console.log('[ExportDialog] Using color depth from project settings:', exportOptions.colorDepth)
      
      // Use AssetExporter to process and add assets
      const exporter = new AssetExporter(exportOptions)
      const assetResult = await exporter.exportAssets(project)
      
      console.log(`[ExportDialog] Processed ${assetResult.flattenedBackgrounds.length} flattened backgrounds and ${assetResult.iconUsages.length} icon usages`)
      
      // Create assets folder and add processed assets
      const assetsFolder = zip.folder('assets')
      if (!assetsFolder) throw new Error('Failed to create assets folder')
      
      // Add flattened backgrounds
      for (const flatBg of assetResult.flattenedBackgrounds) {
        assetsFolder.file(flatBg.filename, flatBg.data)
      }
      
      // Add icon usages
      for (const iconUsage of assetResult.iconUsages) {
        assetsFolder.file(iconUsage.filename, iconUsage.data)
      }
      
      // Create project.json with metadata only (no embedded asset data)
      
      // Create a map of objectId to icon path for quick lookup
      const iconPathMap = new Map<string, string>()
      for (const iconUsage of assetResult.iconUsages) {
        iconPathMap.set(iconUsage.objectId, `assets/${iconUsage.filename}`)
      }
      
      const exportProject = {
        name: project.name,
        screenWidth: project.screenWidth,
        screenHeight: project.screenHeight,
        adornment: project.adornment,
        adornmentDrawingArea: project.adornmentDrawingArea,
        topics: project.topics,
        hardwareButtons: project.hardwareButtons,
        // Filter screens to only include dynamic objects (MQTT Icon Fields, MQTT Data Fields, Level Indicators)
        screens: project.screens.map(screen => {
          // Find the flattened background for this screen
          const flatBg = assetResult.flattenedBackgrounds.find(bg => bg.screenId === screen.id)
          
          return {
            id: screen.id,
            name: screen.name,
            backgroundColor: screen.backgroundColor,
            path: flatBg ? `assets/${flatBg.filename}` : undefined,
            objects: screen.objects
              .filter(obj => 
                obj.type === 'MQTTIconField' || 
                obj.type === 'MqttDataField' || 
                obj.type === 'field' || // Legacy field type
                obj.type === 'level-indicator'
              )
              .map(obj => {
                // For MQTTIconField, add paths to valueIconPairs
                if (obj.type === 'MQTTIconField' && obj.properties.valueIconPairs) {
                  return {
                    ...obj,
                    properties: {
                      ...obj.properties,
                      valueIconPairs: obj.properties.valueIconPairs.map((pair: any) => ({
                        ...pair,
                        path: iconPathMap.get(pair.id) || undefined
                      }))
                    }
                  }
                }
                // For regular icon objects, add path property
                if (obj.type === 'icon') {
                  return {
                    ...obj,
                    path: iconPathMap.get(obj.id) || undefined
                  }
                }
                return obj
              })
          }
        }),
        // Metadata
        exportedAt: new Date().toISOString(),
        exportColorDepth: exportOptions.colorDepth,
        version: "1.0.0"
      }
      
      zip.file("project.json", JSON.stringify(exportProject, null, 2))
      
      // Generate and download zip file
      const zipBlob = await zip.generateAsync({ type: "blob" })
      
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${project.name || "screenman-project"}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      console.log('Export complete!')
      setIsExporting(false)
      
    } catch (error) {
      console.error("Export failed:", error)
      alert(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      setIsExporting(false)
    }
  }

  return (
    <div onClick={handleExport} style={{ display: 'inline-block', cursor: isExporting ? 'wait' : 'pointer' }}>
      {children}
    </div>
  )
}
