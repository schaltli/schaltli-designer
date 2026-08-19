// The non-Android project zip assembly, extracted from
// components/export-dialog.tsx (2026-08-01) so components/deploy-dialog.tsx
// can build the exact same zip a manual "Export Project" download would
// produce, without duplicating this logic. Android projects use a
// different bundle entirely (lib/android-export.ts's exportAndroidProject)
// and are out of scope for the MQTT deploy flow - see the deploy plan's
// scope note.

import type { HardwareButtonAction, Project } from "@/components/project-editor"
import JSZip from "jszip"
import { AssetExporter, type AssetExportOptions } from "@/lib/asset-export"
import { mergeMasterAndScreenObjects } from "@/lib/object-order"
import { resolveButtonAction, resolveMasterScreen } from "@/lib/hardware-button-actions"
import { resolveBackgroundColor, resolveBackgroundImage } from "@/lib/master-screen"
import { SYSTEM_GENERATION_STRING } from "@/lib/system-generation"

// PROJECT_SCHEMA_VERSION and EXPORT_SCHEMA_VERSION lived here until
// 2026-08-19. Both are now the single SYSTEM_GENERATION in
// lib/system-generation.ts, written as `systemGeneration` into both the
// editable project file and the device export - see that module's comment
// and docs/nested-provenance.md's "Version compatibility".

// Builds exactly the zip "Download Project" (project-editor.tsx's
// downloadProject) writes: project.json (the editable model) + assets/ +
// fonts/ + the embedded DDF as _source/ddf.zip (zip-in-zip, docs/nested-
// provenance.md's "Nesting is zip-in-zip" decision). Extracted out of
// downloadProject (2026-08-15) so buildDeviceProjectZip() below can embed
// this exact same artifact into a device export as _source/project.zip -
// the other half of nested provenance, without which a device has nothing
// editable to hand back on recovery.
export async function buildEditableProjectZip(project: Project): Promise<Blob> {
  // Kept out of projectData/project.json - it lives as its own zip entry
  // below (_source/ddf.zip), not duplicated as base64 text inside the JSON.
  // `version` is a dead field this format used to write next to
  // schemaVersion (removed 2026-08-19, read by nothing); stripped rather
  // than merely no longer written, because uploadProject() keeps unknown
  // top-level keys on the in-memory project, so the spread below would
  // otherwise round-trip it out of every pre-2026-08-19 project forever.
  // Not in the Project type at all, hence the cast.
  const { embeddedDdfZipBase64, version: _deadVersionField, ...projectWithoutEmbeddedDdf } =
    project as Project & { version?: string }
  const projectData = {
    ...projectWithoutEmbeddedDdf,
    screens: project.screens.map((screen) => ({
      ...screen,
      objects: screen.objects.map((obj) => {
        // Remove valueIconPairs from MqttDataField objects (only MQTTIconField should have it)
        if (obj.type === "MqttDataField") {
          const { valueIconPairs, ...cleanedProperties } = obj.properties as any
          return {
            ...obj,
            properties: cleanedProperties,
          }
        }
        return obj
      }),
    })),
    // Modify assets to remove data field and add path field
    assets: project.assets.map((asset, index) => {
      // Get proper file extension based on MIME type
      let extension = "bin"
      if (asset.data.startsWith("data:")) {
        const [header] = asset.data.split(",")
        const mimeType = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream"

        if (mimeType.includes("svg")) {
          extension = "svg"
        } else if (mimeType.includes("png")) {
          extension = "png"
        } else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
          extension = "jpg"
        } else if (mimeType.includes("gif")) {
          extension = "gif"
        } else if (mimeType.includes("webp")) {
          extension = "webp"
        } else if (mimeType.includes("bmp")) {
          extension = "bmp"
        } else if (mimeType.includes("tiff")) {
          extension = "tiff"
        }
      }

      // Create a meaningful filename
      let fileName = asset.name
      fileName = fileName.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim()

      if (!fileName || fileName.length < 2) {
        fileName = `${asset.type}_${index + 1}`
      }

      if (!fileName.toLowerCase().endsWith(`.${extension}`)) {
        fileName = `${fileName}.${extension}`
      }

      // Return asset without data field, but with path field
      return {
        id: asset.id,
        name: asset.name,
        type: asset.type,
        size: asset.size,
        path: `assets/${fileName}`, // Added path field pointing to assets folder
      }
    }),
    fonts: (project.fonts || []).map((font) => {
      // BDF font model: {id,name,displayName,path,size,data,internalName,ascent,descent}
      return {
        id: font.id,
        name: font.name,
        displayName: font.displayName,
        path: font.path,
        size: font.size,
        internalName: font.internalName,
        ascent: font.ascent,
        descent: font.descent,
      }
    }),
    hardwareButtons: project.hardwareButtons || [],
    // Include metadata
    exportedAt: new Date().toISOString(),
    systemGeneration: SYSTEM_GENERATION_STRING,
  }

  const zip = new JSZip()
  zip.file("project.json", JSON.stringify(projectData, null, 2))

  // Zip-in-zip, not a flattened merge - see docs/nested-provenance.md's
  // "Nesting is zip-in-zip" decision (2026-08-15). Opaque blob entry, never
  // unpacked into the outer archive's own file tree, so nothing about the
  // DDF can drift and recovery is always "extract one entry" rather than a
  // reconstruction step.
  if (embeddedDdfZipBase64) {
    zip.file("_source/ddf.zip", embeddedDdfZipBase64, { base64: true })
  }

  const assetsFolder = zip.folder("assets")
  if (assetsFolder) {
    project.assets.forEach((asset, index) => {
      // Extract the actual file data from data URLs
      if (asset.data.startsWith("data:")) {
        const [header, base64Data] = asset.data.split(",")
        const mimeType = header.match(/data:([^;]+)/)?.[1] || "application/octet-stream"

        // Get proper file extension based on MIME type
        let extension = "bin"
        if (mimeType.includes("svg")) {
          extension = "svg"
        } else if (mimeType.includes("png")) {
          extension = "png"
        } else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
          extension = "jpg"
        } else if (mimeType.includes("gif")) {
          extension = "gif"
        } else if (mimeType.includes("webp")) {
          extension = "webp"
        } else if (mimeType.includes("bmp")) {
          extension = "bmp"
        } else if (mimeType.includes("tiff")) {
          extension = "tiff"
        }

        // Create a meaningful filename
        let fileName = asset.name

        // Clean the filename to remove invalid characters
        fileName = fileName.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim()

        // If the name is empty or too generic, use asset type + index
        if (!fileName || fileName.length < 2) {
          fileName = `${asset.type}_${index + 1}`
        }

        // Ensure the filename doesn't already have the extension
        if (!fileName.toLowerCase().endsWith(`.${extension}`)) {
          fileName = `${fileName}.${extension}`
        }

        // Convert base64 to binary and add to zip
        assetsFolder.file(fileName, base64Data, { base64: true })
      } else {
        // Handle non-data URL assets (if any) - save as text files
        const cleanName = asset.name.replace(/[^a-zA-Z0-9\-_\s]/g, "").trim() || `asset_${index + 1}`
        assetsFolder.file(`${cleanName}.txt`, asset.data)
      }
    })
  }

  const fontsFolder = zip.folder("fonts")
  if (fontsFolder && project.fonts) {
    project.fonts.forEach((font) => {
      // BDF fonts: save the BDF data
      if (font.data && font.path) {
        const fileName = font.path.replace("fonts/", "")
        fontsFolder.file(fileName, font.data)
      }
    })
  }

  // DEFLATE, not JSZip's STORE default - the same oversight
  // buildDeviceProjectZip() had until 2026-08-11. A project zip is
  // dominated by its BDF fonts (569KB of combined-test-project.zip's 674KB)
  // and a large project.json, all of which are text and compress hard:
  // measured 674KB -> 79KB, 88% smaller, on that same fixture. Reading is
  // unaffected either way, since JSZip handles both on load.
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
}

export async function buildDeviceProjectZip(project: Project): Promise<Blob> {
  const zip = new JSZip()

  const exportOptions: AssetExportOptions = {
    colorDepth: project.settings.colorDepth || "24bit",
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
    needsPageIconsInSize: project.settings.needsPageIconsInSize,
  }

  // AssetExporter bakes each screen's background color/image directly from
  // screen.backgroundColor/backgroundImageAssetId - it has no concept of
  // master-screen inheritance, so a screen relying on that needs both
  // fields pre-resolved before it ever sees them (same "designer resolves,
  // downstream tooling stays unaware" pattern as button-action inheritance -
  // see lib/hardware-button-actions.ts's header comment). Only used for this
  // call; the screens.map() below resolves the same two fields again itself
  // for the exported JSON, straight off the original project.
  const projectWithResolvedBackgrounds: Project = {
    ...project,
    screens: project.screens.map((screen) => {
      if (screen.isMaster) return screen
      const masterScreen = resolveMasterScreen(screen, project.screens)
      return {
        ...screen,
        backgroundColor: resolveBackgroundColor(screen, masterScreen).color,
        backgroundImageAssetId: resolveBackgroundImage(screen, masterScreen).assetId,
      }
    }),
  }

  const exporter = new AssetExporter(exportOptions)
  const assetResult = await exporter.exportAssets(projectWithResolvedBackgrounds)

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
  for (const switchIcon of assetResult.switchStateIcons) {
    assetsFolder.file(switchIcon.normalFilename, switchIcon.normalData)
    assetsFolder.file(switchIcon.activeFilename, switchIcon.activeData)
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

  const switchIconPathMap = new Map<string, { path: string; pathActive: string }>()
  for (const switchIcon of assetResult.switchStateIcons) {
    switchIconPathMap.set(switchIcon.objectId, {
      path: `assets/${switchIcon.normalFilename}`,
      pathActive: `assets/${switchIcon.activeFilename}`,
    })
  }

  const exportProject = {
    name: project.name,
    // The same system generation the editable project file carries - one
    // number for every artifact, see lib/system-generation.ts. Firmware
    // gates on this before touching /PROJECT (ProjectInstaller::
    // peekProjectSchemaVersion(), DeviceInfo.h's EXPORT_SCHEMA_VERSION).
    // NOTE: until that firmware rename lands (the plan's step 8), the
    // device's peek finds no `schemaVersion` field and falls back to 1,
    // which still accepts everything correctly - every artifact is
    // generation 1.x. Do not bump `major` before the firmware side reads
    // this field, or the on-device guard would pass a file it can't read.
    systemGeneration: SYSTEM_GENERATION_STRING,
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
    // gets that master's objects AND its own hardware-button actions merged
    // in here instead (respecting the per-screen "Show master" toggle), so
    // the firmware never needs to know the master mechanism exists at all -
    // it only ever sees each screen's own already-resolved buttonActions,
    // exactly like it always has (see lib/hardware-button-actions.ts's
    // header comment for why a "none" action never reaches this object).
    screens: project.screens
      .filter((screen) => !screen.isMaster)
      .map((screen) => {
        const flatBg = assetResult.flattenedBackgrounds.find((bg) => bg.screenId === screen.id)
        const masterScreen = resolveMasterScreen(screen, project.screens)
        const masterObjects = masterScreen?.objects ?? []

        const buttonActions: Record<string, HardwareButtonAction> = {}
        for (const hwButton of project.hardwareButtons ?? []) {
          const { action } = resolveButtonAction(screen, masterScreen, hwButton.id)
          if (action) buttonActions[hwButton.id] = action
        }

        return {
          id: screen.id,
          name: screen.name,
          backgroundColor: resolveBackgroundColor(screen, masterScreen).color,
          path: flatBg ? `assets/${flatBg.filename}` : undefined,
          // Only present when the target device declared needsPageIconsInSize
          // AND this screen has an icon set - absent otherwise (existing
          // firmware that's never seen this field just ignores it, same as
          // any other additive JSON field in this codebase).
          pageIconPath: pageIconPathMap.get(screen.id) || undefined,
          buttonActions: Object.keys(buttonActions).length > 0 ? buttonActions : undefined,
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
                  states: obj.properties.states.map((state: any) => {
                    const iconPaths = switchIconPathMap.get(state.id)
                    return {
                      ...state,
                      path: iconPaths?.path || undefined,
                      pathActive: iconPaths?.pathActive || undefined,
                    }
                  }),
                },
              }
            }
            return obj
          }),
        }
      }),
    exportedAt: new Date().toISOString(),
    exportColorDepth: exportOptions.colorDepth,
  }

  zip.file("project.json", JSON.stringify(exportProject, null, 2))

  // Embeds the full editable project (which itself embeds the DDF) as an
  // opaque blob, zip-in-zip - the other half of nested provenance: a
  // device that only ever gets baked bitmaps/object model above has
  // nothing editable to hand back if the original project file is lost.
  // Never unpacked here or on the device (ProjectInstaller's extraction
  // filter skips anything under _source/), read back whole only on an
  // explicit recovery request. Best-effort by design: if building this
  // fails for any reason, the deploy must still succeed - the device's
  // actual purpose (rendering) can't depend on its own backup succeeding.
  try {
    const editableProjectBytes = await (await buildEditableProjectZip(project)).arrayBuffer()
    zip.file("_source/project.zip", editableProjectBytes)
  } catch (error) {
    console.error("[v0] Failed to embed the editable project into the device export (deploy continues regardless):", error)
  }

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
  // Every device's firmware is required to handle a DEFLATE-compressed
  // project zip (device-contract.md §2.2) - this used to be gated behind a
  // per-device DEFLATE_SAFE_DEVICE_IDS allowlist while that wasn't true yet
  // for the e-paper reference firmware (a real crash/reboot loop,
  // device-contract.md §10, 2026-08-11), but that firmware got the fix and
  // was hardware-verified 2026-08-14, making the requirement universal - so
  // this always compresses now, no allowlist to maintain.
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
}
