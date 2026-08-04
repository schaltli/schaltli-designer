// The non-Android project zip assembly, extracted from
// components/export-dialog.tsx (2026-08-01) so components/deploy-dialog.tsx
// can build the exact same zip a manual "Export Project" download would
// produce, without duplicating this logic. Android projects use a
// different bundle entirely (lib/android-export.ts's exportAndroidProject)
// and are out of scope for the MQTT deploy flow - see the deploy plan's
// scope note.

import type { Project } from "@/components/project-editor"
import JSZip from "jszip"
import { AssetExporter, type AssetExportOptions } from "@/lib/asset-export"

export async function buildDeviceProjectZip(project: Project): Promise<Blob> {
  const zip = new JSZip()

  const exportOptions: AssetExportOptions = {
    colorDepth: project.settings.colorDepth || "24bit",
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
  }

  const exporter = new AssetExporter(exportOptions)
  const assetResult = await exporter.exportAssets(project)

  const assetsFolder = zip.folder("assets")
  if (!assetsFolder) throw new Error("Failed to create assets folder")

  for (const flatBg of assetResult.flattenedBackgrounds) {
    assetsFolder.file(flatBg.filename, flatBg.data)
  }
  for (const iconUsage of assetResult.iconUsages) {
    assetsFolder.file(iconUsage.filename, iconUsage.data)
  }
  for (const button of assetResult.softwareButtons) {
    assetsFolder.file(button.normalFilename, button.normalData)
    assetsFolder.file(button.activeFilename, button.activeData)
  }

  const iconPathMap = new Map<string, string>()
  for (const iconUsage of assetResult.iconUsages) {
    iconPathMap.set(iconUsage.objectId, `assets/${iconUsage.filename}`)
  }

  const buttonPathMap = new Map<string, { pathNormal: string; pathActive: string }>()
  for (const button of assetResult.softwareButtons) {
    buttonPathMap.set(button.objectId, {
      pathNormal: `assets/${button.normalFilename}`,
      pathActive: `assets/${button.activeFilename}`,
    })
  }

  const exportProject = {
    name: project.name,
    // Lets a device reject a project built for a different device type
    // before applying it - see ScreenRenderer/ProjectLoader's DEVICE_ID
    // check on the firmware side.
    deviceId: project.settings.deviceId,
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
    // How the device is physically mounted (0/90/180/270) - see
    // ProjectSettings.rotation in project-editor.tsx. screenWidth/Height
    // above are already the post-rotation (possibly swapped) values; the
    // device still needs this separately to know which of its own
    // setRotation()-equivalent orientations to apply so its own
    // width()/height() end up matching what's exported here.
    rotation: project.settings.rotation ?? 0,
    adornment: project.adornment,
    adornmentDrawingArea: project.adornmentDrawingArea,
    topics: project.topics,
    hardwareButtons: project.hardwareButtons,
    fonts: (project.fonts || []).map((font) => ({
      id: font.id,
      name: font.name,
      displayName: font.displayName,
      internalName: font.internalName,
      size: font.size,
      ascent: font.ascent,
      descent: font.descent,
    })),
    screens: project.screens.map((screen) => {
      const flatBg = assetResult.flattenedBackgrounds.find((bg) => bg.screenId === screen.id)

      return {
        id: screen.id,
        name: screen.name,
        backgroundColor: screen.backgroundColor,
        path: flatBg ? `assets/${flatBg.filename}` : undefined,
        buttonActions: screen.buttonActions,
        objects: screen.objects.map((obj) => {
          if (obj.type === "label" || obj.type === "MqttDataField") {
            const fontMeta = project.fonts?.find((f: any) => f.id === obj.properties.fontId)
            if (fontMeta) {
              const correctHeight = fontMeta.size || (fontMeta.ascent || 0) + (fontMeta.descent || 0)
              return { ...obj, height: correctHeight }
            }
          }
          if (obj.type === "MQTTIconField" && obj.properties.valueIconPairs) {
            return {
              ...obj,
              properties: {
                ...obj.properties,
                valueIconPairs: obj.properties.valueIconPairs.map((pair: any) => ({
                  ...pair,
                  path: iconPathMap.get(pair.id) || undefined,
                })),
              },
            }
          }
          if (obj.type === "icon") {
            return { ...obj, path: iconPathMap.get(obj.id) || undefined }
          }
          if (obj.type === "SoftwareButton") {
            const buttonPaths = buttonPathMap.get(obj.id)
            return {
              ...obj,
              pathNormal: buttonPaths?.pathNormal || undefined,
              pathActive: buttonPaths?.pathActive || undefined,
            }
          }
          return obj
        }),
      }
    }),
    exportedAt: new Date().toISOString(),
    exportColorDepth: exportOptions.colorDepth,
    version: "1.0.0",
  }

  zip.file("project.json", JSON.stringify(exportProject, null, 2))

  return zip.generateAsync({ type: "blob" })
}
