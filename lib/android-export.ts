import JSZip from "jszip"
import { AssetExporter } from "./asset-export"
import { decodeSVGContent } from "./svg-utils"
import type { Project } from "@/components/project-editor"

// Exports a project targeting an "android" platform DDF (see
// lib/device-description.ts's DeviceDescriptionFile.device.platform) as a
// generic JSON + PNG bundle, instead of the firmware-specific BMP/PBM +
// project.json AssetExporter/ExportDialog produce. There's no firmware repo
// consuming this - Android needs no bitmap quantization (colorDepth is
// always effectively 24bit) and no device-specific upload protocol, so this
// intentionally does not reuse ExportDialog's project.json shape verbatim;
// it's close (same screens/objects structure) but points at .png assets and
// real .ttf font files instead of .bmp/.pbm and embedded BDF text.
export async function exportAndroidProject(project: Project): Promise<Blob> {
  const zip = new JSZip()
  const assets = zip.folder("assets")
  if (!assets) throw new Error("Failed to create assets folder")

  const exporter = new AssetExporter({
    colorDepth: "24bit",
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
  })

  // One flattened background PNG per screen (background color/image + any
  // static box/line/icon objects baked in - same content the firmware
  // export's BMP background has, just PNG instead of a quantized bitmap).
  // Dynamic objects (labels, MQTT-bound fields, buttons, tab-controls) stay
  // out of the image and are described in project.json below instead, for
  // a real Android UI toolkit to render and update live.
  const screenBackgrounds = new Map<string, string>() // screenId -> asset path
  for (const screen of project.screens) {
    const canvas = await exporter.renderScreenBackground(screen, project)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!blob) continue
    const filename = `${screen.id}.png`
    assets.file(filename, blob)
    screenBackgrounds.set(screen.id, `assets/${filename}`)
  }

  // Icon assets as their original SVGs, not pre-flattened bitmaps - unlike
  // e-paper firmware, a real Android renderer can composite/recolor vector
  // icons itself (needed for e.g. MQTTIconField picking one of several
  // icons live at runtime, which is never baked into a flattened
  // background).
  const iconPaths = new Map<string, string>() // assetId -> asset path
  for (const asset of project.assets) {
    if (asset.type !== "icon" || !asset.data) continue
    const filename = `icons/${asset.id}.svg`
    assets.file(filename, decodeSVGContent(asset.data))
    iconPaths.set(asset.id, `assets/${filename}`)
  }

  // TTF fonts as real .ttf files (an Android app needs an actual font file
  // to bundle/load, not an inline data: URL) - BDF-format fonts have no
  // browser-registered equivalent and aren't expected on an android-
  // platform device, so they're referenced by id only, without a file.
  // Deduped by internal/family name: a DDF commonly declares several sized
  // "Roboto 12px"/"Roboto 16px"/etc. entries that all point at the exact
  // same underlying .ttf (the size is just declared metadata, same as BDF
  // fonts already work) - writing each one out separately would bloat the
  // bundle with identical multi-hundred-KB copies for no reason.
  const writtenFontFiles = new Map<string, string>() // internalName/name -> asset path
  const fontEntries = project.fonts.map((font) => {
    if (font.format !== "ttf" || !font.data?.startsWith("data:")) {
      return { id: font.id, displayName: font.displayName, size: font.size }
    }
    const familyKey = font.internalName ?? font.name
    let assetPath = writtenFontFiles.get(familyKey)
    if (!assetPath) {
      const base64 = font.data.split(",")[1] ?? ""
      const filename = `fonts/${familyKey}.ttf`
      assets.file(filename, base64, { base64: true })
      assetPath = `assets/${filename}`
      writtenFontFiles.set(familyKey, assetPath)
    }
    // internalName/ascent/descent/format aren't read by the Android app
    // itself (Compose loads the font file directly, no family-name
    // matching needed) - included anyway so the export stays self-
    // contained for hil/android/orchestrator.js, which renders the same
    // reference via the designer's app/test-render harness and needs the
    // same font metadata that harness's ctx.font/baseline math uses.
    return {
      id: font.id,
      displayName: font.displayName,
      size: font.size,
      path: assetPath,
      internalName: familyKey,
      ascent: font.ascent,
      descent: font.descent,
      format: "ttf" as const,
    }
  })

  const exportProject = {
    platform: "android",
    name: project.name,
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
    fonts: fontEntries,
    topics: project.topics,
    screens: project.screens.map((screen) => ({
      id: screen.id,
      name: screen.name,
      backgroundColor: screen.backgroundColor,
      backgroundImage: screenBackgrounds.get(screen.id),
      // "none" is a designer-only sentinel (see
      // lib/hardware-button-actions.ts) meaning "explicitly does nothing" -
      // never meant to reach an export; an absent key already means that to
      // every consumer. Android export doesn't resolve master-screen
      // inheritance the way lib/project-zip.ts's device export does (it
      // doesn't merge master objects into a screen either - a pre-existing,
      // separate gap), so this only strips the sentinel rather than also
      // inlining inherited actions.
      buttonActions: screen.buttonActions
        ? Object.fromEntries(Object.entries(screen.buttonActions).filter(([, action]) => action.type !== "none"))
        : undefined,
      objects: screen.objects.map((obj) => {
        if (obj.type === "MQTTIconField" && obj.properties.valueIconPairs) {
          return {
            ...obj,
            properties: {
              ...obj.properties,
              valueIconPairs: obj.properties.valueIconPairs.map((pair: any) => ({
                ...pair,
                path: iconPaths.get(pair.id),
              })),
            },
          }
        }
        if (obj.type === "icon") {
          return { ...obj, path: iconPaths.get(obj.id) }
        }
        return obj
      }),
    })),
    exportedAt: new Date().toISOString(),
  }

  zip.file("project.json", JSON.stringify(exportProject, null, 2))

  return zip.generateAsync({ type: "blob" })
}
