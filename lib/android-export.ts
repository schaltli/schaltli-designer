import JSZip from "jszip"
import { AssetExporter } from "./asset-export"
import { decodeSVGContent, tintedIconDataUrl, iconCacheKey } from "./svg-utils"
import { mergeMasterAndScreenObjects } from "./object-order"
import { mapObjectsDeep } from "./object-tree"
import { resolveMasterScreen, resolveBackgroundColor, resolveBackgroundImage } from "./master-screen"
import { resolveButtonAction } from "./hardware-button-actions"
import { createPlaceholderContext, processPlaceholders } from "./placeholder-utils"
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
//
// What it does share with lib/project-zip.ts is every place the *designer*
// resolves something so the consumer never has to know the mechanism exists:
// master-screen inheritance, hardware-button (and therefore swipe) actions,
// and {screen}/{project} placeholders are all flattened away here. The
// Android app, like a firmware, only ever sees a finished screen.

/** Filenames come from an icon's cache key, which carries a "#rrggbb" tint. */
function iconFilenameFor(cacheKey: string): string {
  return `icons/${cacheKey.replace(/[^a-zA-Z0-9_-]/g, "-")}.svg`
}

export async function exportAndroidProject(project: Project): Promise<Blob> {
  const zip = new JSZip()
  const assets = zip.folder("assets")
  if (!assets) throw new Error("Failed to create assets folder")

  const exporter = new AssetExporter({
    colorDepth: "24bit",
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
  })

  // Master screens never appear as their own screen - each screen that
  // references one via masterScreenId gets that master's objects, background
  // and button actions merged into it instead, exactly as lib/project-zip.ts
  // does for a firmware. Until this existed, a project that put its shared
  // artwork on a master exported to Android as a set of empty screens, and
  // there was nothing in the bundle to say why.
  const realScreens = project.screens.filter((screen) => !screen.isMaster)
  const resolvedScreens = realScreens.map((screen) => {
    const masterScreen = resolveMasterScreen(screen, project.screens)
    return {
      screen,
      masterScreen,
      objects: mergeMasterAndScreenObjects(masterScreen?.objects ?? [], screen.objects),
      backgroundColor: resolveBackgroundColor(screen, masterScreen).color,
      backgroundImageAssetId: resolveBackgroundImage(screen, masterScreen).assetId,
    }
  })

  // One flattened background PNG per screen (background color/image + any
  // static box/line/icon objects baked in - same content the firmware
  // export's BMP background has, just PNG instead of a quantized bitmap).
  // Dynamic objects (labels, MQTT-bound fields, buttons, switches, arcs,
  // tab-controls) stay out of the image and are described in project.json
  // below instead, for a real Android UI toolkit to render and update live.
  const screenBackgrounds = new Map<string, string>() // screenId -> asset path
  for (const resolved of resolvedScreens) {
    // The *resolved* screen, not the authored one: createFlattenedBackground
    // reads backgroundColor/backgroundImageAssetId straight off what it is
    // handed, so inheritance has to be applied before it gets there.
    const screenForBake = {
      ...resolved.screen,
      backgroundColor: resolved.backgroundColor,
      backgroundImageAssetId: resolved.backgroundImageAssetId,
    }
    const canvas = await exporter.renderScreenBackground(screenForBake, project, resolved.objects)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!blob) continue
    const filename = `${resolved.screen.id}.png`
    assets.file(filename, blob)
    screenBackgrounds.set(resolved.screen.id, `assets/${filename}`)
  }

  // Icon assets as their original SVGs, not pre-flattened bitmaps - unlike
  // e-paper firmware, a real Android renderer can composite/recolor vector
  // icons itself (needed for e.g. MQTTIconField picking one of several icons
  // live at runtime, which is never baked into a flattened background).
  //
  // Written per *usage* rather than per asset, because an icon's colour
  // belongs to the object that placed it: the same bulb asset can be one
  // Switch's white icon and another's orange one. Tinting happens here,
  // through the designer's own tintedIconDataUrl - the alternative was a
  // second implementation of applyIconColor's rules (is this SVG tintable,
  // repaint or set a root fill, flatten or not) inside the Android app,
  // which is exactly the kind of second copy that drifts.
  const iconFiles = new Map<string, string>() // cache key -> asset path
  const iconPathFor = (
    assetId: string | undefined,
    color?: string | null,
    flatten?: boolean,
  ): string | undefined => {
    if (!assetId) return undefined
    const asset = project.assets.find((a) => a.id === assetId && a.type === "icon")
    if (!asset?.data) return undefined
    const key = iconCacheKey(asset.id, color, flatten)
    let assetPath = iconFiles.get(key)
    if (!assetPath) {
      const filename = iconFilenameFor(key)
      assets.file(filename, decodeSVGContent(tintedIconDataUrl(asset.data, color, flatten)))
      assetPath = `assets/${filename}`
      iconFiles.set(key, assetPath)
    }
    return assetPath
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
    screens: resolvedScreens.map(({ screen, masterScreen, objects, backgroundColor }) => {
      // Resolved against the real target screen, not the master - a label
      // defined once on a master and merged into several screens must
      // resolve {screen} to whichever screen it actually ended up on,
      // matching how the live canvas resolves it per displayed screen.
      const placeholderContext = createPlaceholderContext(
        screen.name,
        project.screenWidth,
        project.screenHeight,
        project.name,
      )

      // Every button the screen or its master says anything about. The
      // device-side list (four swipe ids on a touch device, see
      // lib/device-description.ts) is not consulted: a binding that exists
      // is a binding the author made, and an id this platform never reports
      // simply never fires.
      const buttonIds = new Set([
        ...Object.keys(screen.buttonActions ?? {}),
        ...Object.keys(masterScreen?.buttonActions ?? {}),
      ])
      const buttonActions: Record<string, unknown> = {}
      for (const buttonId of buttonIds) {
        // Resolves local-override, then master, then nothing - and resolves
        // the explicit "none" away to nothing, which an absent key already
        // means to every consumer.
        const { action } = resolveButtonAction(screen, masterScreen, buttonId)
        if (action) buttonActions[buttonId] = action
      }

      return {
        id: screen.id,
        name: screen.name,
        backgroundColor,
        backgroundImage: screenBackgrounds.get(screen.id),
        buttonActions: Object.keys(buttonActions).length > 0 ? buttonActions : undefined,
        // Deep, not just the top level: a Switch or an MQTTIconField inside
        // a tab-control's panel needs its icon paths written back exactly as
        // one at the top level does. The firmware export learned this on
        // 2026-08-27, when the bitmaps were baked but the paths pointing at
        // them stayed empty for everything inside a container.
        objects: mapObjectsDeep(objects, (obj: any) => {
          if (obj.type === "label") {
            // Placeholder tokens ({screen}/{project}/{export_date}/...) are
            // resolved live only by the designer's own renderers; a consumer
            // that has never heard of them renders "{screen}" literally.
            // Baked in here for the same reason the firmware export bakes
            // them.
            const text = obj.properties.text
              ? processPlaceholders(obj.properties.text, placeholderContext)
              : obj.properties.text
            return { ...obj, properties: { ...obj.properties, text } }
          }
          if (obj.type === "MQTTIconField" && obj.properties.valueIconPairs) {
            return {
              ...obj,
              properties: {
                ...obj.properties,
                valueIconPairs: obj.properties.valueIconPairs.map((pair: any) => ({
                  ...pair,
                  // `thenShowIcon` is the asset the rule points at; `id` is
                  // the rule's own identity. The renderers read the former.
                  path: iconPathFor(
                    pair.thenShowIcon ?? pair.id,
                    obj.properties.iconColor,
                    obj.properties.iconColorFlatten,
                  ),
                })),
              },
            }
          }
          if (obj.type === "Switch" && obj.properties.states) {
            return {
              ...obj,
              properties: {
                ...obj.properties,
                states: obj.properties.states.map((state: any) => ({
                  ...state,
                  path: iconPathFor(
                    state.iconAssetId,
                    obj.properties.iconColor,
                    obj.properties.iconColorFlatten,
                  ),
                  // Only written when the author really picked a second
                  // picture. Absent means "same either way", which is what
                  // the renderers already fall back to.
                  activePath: iconPathFor(
                    state.activeIconAssetId,
                    obj.properties.iconColor,
                    obj.properties.iconColorFlatten,
                  ),
                })),
              },
            }
          }
          if (obj.type === "SoftwareButton") {
            return {
              ...obj,
              path: iconPathFor(
                obj.properties.iconAssetId,
                obj.properties.iconColor,
                obj.properties.iconColorFlatten,
              ),
            }
          }
          if (obj.type === "icon") {
            return {
              ...obj,
              path: iconPathFor(
                obj.properties.assetId,
                obj.properties.iconColor,
                obj.properties.iconColorFlatten,
              ),
            }
          }
          return obj
        }),
      }
    }),
    exportedAt: new Date().toISOString(),
  }

  zip.file("project.json", JSON.stringify(exportProject, null, 2))

  return zip.generateAsync({ type: "blob" })
}
