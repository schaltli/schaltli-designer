import JSZip from "jszip"
import { AssetExporter } from "./asset-export"
import { decodeSVGContent, tintedIconDataUrl, iconCacheKey } from "./svg-utils"
import { mergeMasterAndScreenObjects } from "./object-order"
import { mapObjectsDeep } from "./object-tree"
import { resolveMasterScreen, resolveBackgroundColor, resolveBackgroundImage } from "./master-screen"
import { resolveButtonAction } from "./hardware-button-actions"
import { createPlaceholderContext, processPlaceholders } from "./placeholder-utils"
import type { Project } from "@/components/project-editor"
import { isLevelType, isSwitchType } from "@/lib/object-types"
import { levelLayout } from "@/lib/level-shape"
import { rasterisedIconOnBaseline } from "@/lib/svg-utils"
import {
  buttonIconKey,
  buttonIconUrl,
  colouredIcon,
  drawSoftwareButton,
} from "@/components/canvas/renderers/render-software-button"
import {
  switchFontMetrics,
  switchForm,
  switchKnob,
  switchKnobLook,
  switchLook,
} from "@/lib/switch-shape"

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
      // No file to ship, but its vertical measure still travels: a level
      // indicator's header is laid out from ascent/descent, and an entry
      // without them would be laid out from four fifths of the size instead
      // (LevelShape.kt's fontMetricsOf) - a header one row off, on a
      // platform where nothing else would explain it.
      return {
        id: font.id,
        displayName: font.displayName,
        size: font.size,
        ascent: font.ascent,
        descent: font.descent,
      }
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
      // What the browser measured this face's capitals at when it was added.
      // The app's own level indicator builds its header line from this
      // (LevelShape.kt's fontMetricsOf), so leaving it out put the phone's
      // text a row off the reference image. A DDF-declared font has none,
      // and both sides then fall back to four fifths of the size.
      baselineOffset: font.baselineOffset,
      format: "ttf" as const,
    }
  })

  // A Switch's state icons, baked.
  //
  // Every other icon in this bundle is an SVG the app hands to its image
  // loader. A Switch's cannot be: it is drawn in an ink that follows from the
  // state (the container's ink where the state is not the chosen one, the
  // pill's where it is), at a size that follows from the object's font, and
  // with its own margin trimmed away so the ink stands on the text's baseline
  // rather than floating above it (rasterisedIconOnBaseline). All of that is
  // rules this repo owns, and a second implementation of them in the app
  // would be a second set of pixels to keep in step.
  //
  // So it is baked here, through the preview's own rasteriser, exactly the
  // way lib/asset-export.ts bakes the same icons for a firmware: what the
  // phone blits and what the designer drew are then the same pixels, and the
  // app's job is a blit. Two variants per state, because the ink differs.
  const bakedFiles = new Map<string, string>() // bake key -> asset path
  const bakedIcons = new Map<string, string>() // `${objectId}:${index}:normal|active` -> asset path
  const bakeIcon = async (assetId: string | undefined, size: number, ink: string): Promise<string | undefined> => {
    if (!assetId || size <= 0) return undefined
    const asset = project.assets.find((a) => a.id === assetId && a.type === "icon")
    if (!asset?.data) return undefined
    const bakeKey = `${assetId}@${size}@${ink}`
    const already = bakedFiles.get(bakeKey)
    if (already) return already

    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return undefined
    const img = new Image()
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = buttonIconUrl(asset)
    })
    if (img.naturalWidth === 0) return undefined
    const key = buttonIconKey(asset.id)
    const raster = rasterisedIconOnBaseline(img, size, size, key)
    if (!raster) return undefined
    // Transparent everywhere the icon is not: the app draws this over the
    // pill or the knob, so the backdrop is not baked in (a firmware's is,
    // because it blits opaque bitmaps).
    ctx.drawImage(colouredIcon(raster, key, ink), 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
    if (!blob) return undefined
    const filename = `icons/${bakeKey.replace(/[^a-zA-Z0-9_-]/g, "-")}.png`
    assets.file(filename, new Uint8Array(await blob.arrayBuffer()))
    const assetPath = `assets/${filename}`
    bakedFiles.set(bakeKey, assetPath)
    return assetPath
  }

  const everyObject = (objects: any[]): any[] =>
    (objects || []).flatMap((obj) => [obj, ...everyObject(obj.children)])

  /**
   * A SoftwareButton, baked whole - both of its states.
   *
   * The same decision as the Switch's icons one step further, and the same
   * one every firmware already gets (lib/asset-export.ts): a Material button
   * is a pill whose radius changes under a finger, in one of three styles
   * whose colours are derived from the button's own colour and what it stands
   * on, with an icon trimmed to its ink beside a label measured in the
   * project's font. Drawing that a second time in Kotlin would be a second
   * set of pixels to keep in step - and its anti-aliased edge would be
   * Skia's rather than the browser's, which is a difference no tolerance
   * hides at a corner.
   *
   * Transparent outside the pill, unlike a firmware's copy: this platform can
   * blend, so the edge meets whatever is really behind it rather than a baked
   * copy of the background.
   */
  /**
   * The icon a level indicator's header line can carry.
   *
   * Baked like the rest, and for the reason the others are: it is drawn as
   * tall as a capital of the object's own font and trimmed to its own ink, so
   * that it stands on the header's baseline as a letter of the name rather
   * than floating above it as a picture beside it (rasterisedIconOnBaseline).
   * Until 2026-09-22 the export wrote no file for it at all and the app drew
   * nothing - a bar with an icon simply lost it on the way to the phone.
   *
   * Tinted rather than flattened, unlike a Switch's: a level's icon takes the
   * author's own `iconColor` wherever it appears, so there is one variant and
   * the ink is decided here.
   */
  const bakedLevelIcons = new Map<string, string>()
  const bakeLevelIcon = async (obj: any): Promise<void> => {
    const rect = levelLayout(obj, project.fonts).icon
    if (!rect || rect.w <= 0) return
    const asset = project.assets.find((a: any) => a.id === obj.properties?.iconAssetId && a.type === "icon")
    if (!asset?.data) return

    const canvas = document.createElement("canvas")
    canvas.width = rect.w
    canvas.height = rect.h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const key = iconCacheKey(asset.id, obj.properties.iconColor, obj.properties.iconColorFlatten)
    const img = new Image()
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
      img.src = tintedIconDataUrl(asset.data, obj.properties.iconColor, obj.properties.iconColorFlatten)
    })
    if (img.naturalWidth === 0) return
    const raster = rasterisedIconOnBaseline(img, rect.w, rect.h, key)
    if (!raster) return
    ctx.drawImage(raster, 0, 0)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
    if (!blob) return
    const filename = `icons/${key}@${rect.w}.png`.replace(/[^a-zA-Z0-9_./-]/g, "-")
    if (!bakedFiles.has(filename)) {
      assets.file(filename, new Uint8Array(await blob.arrayBuffer()))
      bakedFiles.set(filename, `assets/${filename}`)
    }
    bakedLevelIcons.set(obj.id, `assets/${filename}`)
  }

  const bakedButtons = new Map<string, { normal: string; pressed: string }>()
  const bakeButton = async (obj: any, background: string): Promise<void> => {
    const w = Math.max(1, Math.round(obj.width))
    const h = Math.max(1, Math.round(obj.height))
    const x = Math.round(obj.x)
    const y = Math.round(obj.y)

    let icon: HTMLImageElement | null = null
    const asset = obj.properties?.iconAssetId
      ? project.assets.find((a: any) => a.id === obj.properties.iconAssetId && a.type === "icon")
      : null
    if (asset?.data) {
      const img = new Image()
      await new Promise<void>((resolve) => {
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = buttonIconUrl(asset)
      })
      if (img.naturalWidth > 0) icon = img
    }

    const bdfFontCache = new Map<string, any>()
    const drawState = async (pressed: boolean): Promise<string | undefined> => {
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) return undefined
      ctx.translate(-x, -y)
      drawSoftwareButton({
        ctx,
        obj,
        fonts: project.fonts || [],
        bdfFontCache,
        colorDepth: "24bit",
        background,
        pressed,
        icon,
      })
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
      if (!blob) return undefined
      const filename = `buttons/${obj.id}${pressed ? "-pressed" : ""}.png`.replace(/[^a-zA-Z0-9_./-]/g, "-")
      assets.file(filename, new Uint8Array(await blob.arrayBuffer()))
      return `assets/${filename}`
    }

    const normal = await drawState(false)
    const pressed = await drawState(true)
    if (normal && pressed) bakedButtons.set(obj.id, { normal, pressed })
  }

  for (const { objects, backgroundColor } of resolvedScreens) {
    for (const obj of everyObject(objects)) {
      if (obj.type === "button") {
        await bakeButton(obj, backgroundColor)
        continue
      }
      if (isLevelType(obj.type)) {
        await bakeLevelIcon(obj)
        continue
      }
      if (!isSwitchType(obj.type)) continue
      const states = obj.properties?.states || []
      if (states.length === 0) continue
      const knobForm = switchForm(obj) === "knob"
      const look = switchLook(obj, backgroundColor, "24bit")
      const knobOn = switchKnobLook(obj, backgroundColor, "24bit", true)
      const knobOff = switchKnobLook(obj, backgroundColor, "24bit", false)
      // The size each form actually draws at: a capital's height inside a
      // button, three fifths of the knob on a switch.
      const size = knobForm
        ? Math.max(1, Math.trunc((2 * switchKnob(obj, states.length, 0, { on: true }).r * 3) / 5))
        : Math.max(1, switchFontMetrics(obj, project.fonts).capHeight)
      const normalInk = knobForm ? knobOff.onKnob : look.onSurface
      const activeInk = knobForm ? knobOn.onKnob : look.onChosen
      for (let i = 0; i < states.length; i++) {
        const state = states[i]
        const normal = await bakeIcon(state.iconAssetId, size, normalInk)
        const active = await bakeIcon(state.activeIconAssetId ?? state.iconAssetId, size, activeInk)
        if (normal) bakedIcons.set(`${obj.id}:${i}:normal`, normal)
        if (active) bakedIcons.set(`${obj.id}:${i}:active`, active)
      }
    }
  }

  const exportProject = {
    platform: "android",
    name: project.name,
    screenWidth: project.screenWidth,
    screenHeight: project.screenHeight,
    // Which way up the device is meant to be, exactly as the firmware bundle
    // carries it (lib/project-zip.ts). screenWidth/Height above are already
    // the post-rotation values, but they cannot say this on their own: a
    // quarter turn swaps them and a half turn does not, so 0 and 180 are the
    // same pair of numbers. The app holds its activity in the matching one of
    // the four orientations rather than following the phone's sensor - a
    // panel is mounted, not held.
    rotation: project.settings.rotation ?? 0,
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
          if (obj.type === "text") {
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
          if (obj.type === "live-icon" && obj.properties.valueIconPairs) {
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
          if (isSwitchType(obj.type) && obj.properties.states) {
            return {
              ...obj,
              properties: {
                ...obj.properties,
                states: obj.properties.states.map((state: any, index: number) => ({
                  ...state,
                  // The two baked variants, not the SVG: `path` is this state
                  // drawn in the ink it takes when it is not the chosen one,
                  // `activePath` the same picture (or the author's second
                  // one) in the ink it takes when it is. The app picks by
                  // which state is chosen and blits; see the baking above.
                  path: bakedIcons.get(`${obj.id}:${index}:normal`),
                  activePath: bakedIcons.get(`${obj.id}:${index}:active`),
                })),
              },
            }
          }
          if (obj.type === "button") {
            // The whole button, in both of its states - not its icon. What
            // the app blits is what the designer drew, pill, label, icon and
            // all; see the baking above.
            const baked = bakedButtons.get(obj.id)
            return { ...obj, path: baked?.normal, pressedPath: baked?.pressed }
          }
          if (isLevelType(obj.type) && bakedLevelIcons.has(obj.id)) {
            // The header's icon, at the size the header draws it and trimmed
            // to its ink - see the baking above.
            return { ...obj, path: bakedLevelIcons.get(obj.id) }
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
