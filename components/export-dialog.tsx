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
      
      console.log(`[ExportDialog] Processed ${assetResult.flattenedBackgrounds.length} flattened backgrounds, ${assetResult.iconUsages.length} icon usages, and ${assetResult.softwareButtons.length} software buttons`)
      
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
      
      // Add software button images (both normal and active)
      for (const button of assetResult.softwareButtons) {
        assetsFolder.file(button.normalFilename, button.normalData)
        assetsFolder.file(button.activeFilename, button.activeData)
      }
      
      // Create project.json with metadata only (no embedded asset data)
      
      // Create a map of objectId to icon path for quick lookup
      const iconPathMap = new Map<string, string>()
      for (const iconUsage of assetResult.iconUsages) {
        iconPathMap.set(iconUsage.objectId, `assets/${iconUsage.filename}`)
      }
      
      // Create a map of objectId to button paths for quick lookup
      const buttonPathMap = new Map<string, { pathNormal: string; pathActive: string }>()
      for (const button of assetResult.softwareButtons) {
        buttonPathMap.set(button.objectId, {
          pathNormal: `assets/${button.normalFilename}`,
          pathActive: `assets/${button.activeFilename}`
        })
      }
      
      const exportProject = {
        name: project.name,
        screenWidth: project.screenWidth,
        screenHeight: project.screenHeight,
        adornment: project.adornment,
        adornmentDrawingArea: project.adornmentDrawingArea,
        topics: project.topics,
        hardwareButtons: project.hardwareButtons,
        // Include fonts with their internal names for embedded system reference
        fonts: (project.fonts || []).map(font => ({
          id: font.id,
          name: font.name,
          displayName: font.displayName,
          internalName: font.internalName, // u8g2 font name for embedded systems
          size: font.size,
          ascent: font.ascent,
          descent: font.descent,
        })),
        screens: project.screens.map(screen => {
          // Find the flattened background for this screen
          const flatBg = assetResult.flattenedBackgrounds.find(bg => bg.screenId === screen.id)

          return {
            id: screen.id,
            name: screen.name,
            backgroundColor: screen.backgroundColor,
            path: flatBg ? `assets/${flatBg.filename}` : undefined,
            // Was missing entirely - every screen's hardware-button
            // configuration silently never reached the firmware, which is
            // why button0/1 kept using their old hardcoded prev/next
            // behavior regardless of what the designer's button panel said
            // (2026-07-25 finding, hardware button dispatch work).
            buttonActions: screen.buttonActions,
            // No type allowlist here - this used to filter out any object
            // type not on a hardcoded list (MQTTIconField/MqttDataField/
            // label/field/level-indicator/SoftwareButton), silently
            // dropping box/line/icon/tab-control/panel from every real
            // export even though the firmware fully renders all of them.
            // The list was never updated as new object types were added
            // over time - exactly the kind of allowlist that's guaranteed
            // to drift. supportedObjectTypes (from the device's DDF)
            // already answers "does THIS device render this type", so
            // there's no need for export to keep its own separate,
            // easily-forgotten copy of that answer (2026-07-25 finding,
            // caught while verifying tab-control/panel export - every HIL
            // test this session had used hand-built project.json content
            // that bypassed this dialog entirely, so it went uncaught).
            objects: screen.objects
              .map(obj => {
                // For label and MqttDataField, ensure correct height based on font
                if (obj.type === 'label' || obj.type === 'MqttDataField') {
                  const fontMeta = project.fonts?.find((f: any) => f.id === obj.properties.fontId)
                  if (fontMeta) {
                    // Use the calculated height (ascent + descent) from font object
                    const correctHeight = fontMeta.size || (fontMeta.ascent || 0) + (fontMeta.descent || 0)
                    return {
                      ...obj,
                      height: correctHeight
                    }
                  }
                }
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
                // For SoftwareButton, add pathNormal and pathActive properties
                // Note: action property is already included via ...obj spread
                if (obj.type === 'SoftwareButton') {
                  const buttonPaths = buttonPathMap.get(obj.id)
                  return {
                    ...obj, // Includes all properties including action
                    pathNormal: buttonPaths?.pathNormal || undefined,
                    pathActive: buttonPaths?.pathActive || undefined
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
