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
import { mergeMasterAndScreenObjects } from "@/lib/object-order"

export async function buildDeviceProjectZip(project: Project): Promise<Blob> {
  const zip = new JSZip()

  const exportOptions: AssetExportOptions = {
    colorDepth: project.settings.colorDepth || "24bit",
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
    needsPageIconsInSize: project.settings.needsPageIconsInSize,
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
  for (const pageIcon of assetResult.pageIcons) {
    assetsFolder.file(pageIcon.filename, pageIcon.data)
  }

  const pageIconPathMap = new Map<string, string>()
  for (const pageIcon of assetResult.pageIcons) {
    pageIconPathMap.set(pageIcon.screenId, `assets/${pageIcon.filename}`)
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
    // Master screens (ProjectScreen.isMaster) never appear as their own
    // device screen - each screen that references one via masterScreenId
    // gets that master's objects merged in here instead (respecting the
    // per-screen "Show master" toggle), so the firmware never needs to know
    // the master mechanism exists at all.
    screens: project.screens
      .filter((screen) => !screen.isMaster)
      .map((screen) => {
        const flatBg = assetResult.flattenedBackgrounds.find((bg) => bg.screenId === screen.id)
        const masterObjects =
          screen.masterScreenId && screen.showMaster !== false
            ? project.screens.find((s) => s.id === screen.masterScreenId && s.isMaster)?.objects ?? []
            : []

        return {
          id: screen.id,
          name: screen.name,
          backgroundColor: screen.backgroundColor,
          path: flatBg ? `assets/${flatBg.filename}` : undefined,
          // Only present when the target device declared needsPageIconsInSize
          // AND this screen has an icon set - absent otherwise (existing
          // firmware that's never seen this field just ignores it, same as
          // any other additive JSON field in this codebase).
          pageIconPath: pageIconPathMap.get(screen.id) || undefined,
          buttonActions: screen.buttonActions,
          objects: mergeMasterAndScreenObjects(masterObjects, screen.objects).map((obj) => {
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
            if (obj.type === "Switch" && obj.properties.states) {
              return {
                ...obj,
                properties: {
                  ...obj.properties,
                  states: obj.properties.states.map((state: any) => ({
                    ...state,
                    path: iconPathMap.get(state.id) || undefined,
                  })),
                },
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

  // JSZip defaults to STORE (no compression) when this isn't specified -
  // was never a deliberate choice here, just never set. DEFLATE shrinks
  // these zips dramatically (found live 2026-08-11: 568KB -> 78KB
  // re-zipping the same extracted content with real compression) - the raw
  // BMP/PGM asset data this bundles compresses very well. Matters beyond
  // just transfer time: the M5 Dial's deploy flow needs the old installed
  // project and the new download to both fit in LittleFS at once (never
  // touches /PROJECT until the download is verified), and that space is
  // tight - see DeployManager.cpp.
  //
  // BUT only for devices confirmed safe to receive one. The M5 Dial's own
  // DEFLATE-extraction crash (device-contract.md, 2026-08-09) was a real
  // miniz bug plus a heap-fragmentation problem, fixed only by vendoring a
  // locally-patched miniz with static (not heap) buffers for the 32KB
  // dictionary window - screenbee-m5dial/lib/miniz/. That fix was never
  // backported to the e-paper reference firmware (MqttEPaperDisplay2),
  // which still fetches an unpatched miniz via its package manager and has
  // none of ProjectInstaller.cpp's static-allocator changes - confirmed by
  // reading its source 2026-08-11. Sending it a DEFLATE-compressed zip
  // today would very likely hit the same crash. Allowlisting the one
  // verified-safe device ID here, rather than assuming safety by default,
  // until the e-paper firmware gets the same fix (or a DDF capability flag
  // makes this self-describing instead of a hardcoded list).
  const DEFLATE_SAFE_DEVICE_IDS = ["m5stack-m5dial-v1-1"]
  const compression = DEFLATE_SAFE_DEVICE_IDS.includes(project.settings.deviceId || "") ? "DEFLATE" : "STORE"
  return zip.generateAsync({ type: "blob", compression, compressionOptions: compression === "DEFLATE" ? { level: 6 } : null })
}
