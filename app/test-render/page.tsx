"use client"

import { useEffect, useRef } from "react"
import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import { setupBDFCanvas } from "@/lib/font-utils"
import { projectSeparators } from "@/lib/placeholders"
import { renderScreenObjects, placeholderScope } from "@/lib/render-screen"
import { buildDeviceProjectZip } from "@/lib/project-zip"
import { exportAndroidProject } from "@/lib/android-export"
import { arcPixelBands, blendBands, fromRgb565, makeArcSector, toRgb565, ARC_COVERAGE_MAX } from "@/lib/arc-raster"
import { pillPixelBands, type PillBand } from "@/lib/pill-raster"
import {
  levelEmptyTrack,
  levelFillsFromEnd,
  levelFontMetrics,
  levelHandleRect,
  levelHasHandle,
  levelHeaderHeight,
  levelIsVertical,
  levelLayout,
  levelSegments,
  levelShowsNumber,
  levelThickness,
  levelTrackLook,
  levelTrackRect,
  levelValueWidth,
} from "@/lib/level-shape"
import {
  switchContainer,
  switchContent,
  switchCorner,
  switchFontMetrics,
  switchForm,
  switchKnob,
  switchKnobLook,
  switchLabelBox,
  switchLook,
  switchRingFill,
  switchSegments,
  switchStateIsOn,
  switchTrack,
} from "@/lib/switch-shape"
import { levelValueFromPoint } from "@/components/canvas/renderers/render-level-indicator"
import { arcValueFromPoint } from "@/components/canvas/renderers/render-arc-level"
import { switchStateIndexForTap } from "@/components/canvas/renderers/render-switch"
import { arcCaps, arcHandleBand, renderArcLevel } from "@/components/canvas/renderers/render-arc-level"
import { extractJsonField, splitTopicPath } from "@/lib/json-path"
import { tintedIconDataUrl, iconCacheKey } from "@/lib/svg-utils"
import { BUTTON_ICON_INK, buttonIconKey } from "@/components/canvas/renderers/render-software-button"
import { isArcType, isSwitchType, migrateProject } from "@/lib/object-types"
import { darkVariantOf } from "@/lib/themes"

// Headless render harness for hardware-in-the-loop testing (see DEVICE_GUIDE.md).
// Not part of the normal app UI - a Playwright-driven Node script calls
// window.__renderScreenForTest via page.evaluate() to get a PNG data URL of a
// single screen, rendered at exactly screenWidth x screenHeight with no
// adornment, grid, selection handles, or shadow - just the object content,
// so it's directly pixel-comparable against a device snapshot.
//
// Topic values are supplied explicitly per call (topicOverrides), not read
// from topic.examples[0] - the wrap-around multi-example test strategy needs
// a different value per screenshot, not just the first example.

interface RenderTestProject {
  name: string
  screenWidth: number
  screenHeight: number
  fonts: (ProjectFont & { data?: string })[]
  assets: ProjectAsset[]
  topics: { topic: string; examples?: string[] }[]
  screens: {
    id: string
    name: string
    backgroundColor?: string
    objects: ScreenObject[]
  }[]
  // Projects exported from the app carry settings.colorDepth (e.g. "1bit").
  // When set, colors are quantized the same way the device would before
  // rendering, so this headless harness stays pixel-comparable against a
  // real 1-bit e-paper snapshot instead of showing literal grays it can't
  // display.
  settings?: { colorDepth?: string }
}

interface RenderTestRequest {
  project: RenderTestProject
  screenIndex: number
  topicOverrides: Record<string, string>
  // Draw at N times the project's own size, the way a phone draws it: text
  // and vector shapes are rasterised natively at the larger size - smooth,
  // the way Compose draws them - while baked bitmaps keep coming up
  // unsmoothed, the way Coil's FilterQuality.None blows them up. That split
  // is the whole point; rendering at 1x and enlarging afterwards compares a
  // blocky glyph against a smooth one.
  //
  // Whole numbers only. At a fractional ratio a canvas re-render and the
  // device's own bitmap sampling drift apart - see matchDeviceScaling in
  // hil/android/orchestrator.js, where that was measured.
  scale?: number
  // "rgb565" makes the reference image show only colours the target panel
  // can actually hold - see quantizeCanvasToRgb565 below. Omitted for
  // devices whose framebuffer is not 16-bit.
  quantize?: "rgb565" | "1bit"
  /**
   * What a finger asked for and nothing has confirmed: a level's marker, a
   * switch's ring. Keyed by the topic an answer would arrive on, exactly as
   * the editor's own preview keys it.
   */
  askedValues?: Record<string, string>
  /**
   * "dark" draws an exported project the way a device does while the theme
   * is dark: every XDark in place of its X (lib/themes.ts darkVariantOf).
   * Omitted, the light fields are drawn, as always.
   */
  variant?: "light" | "dark"
}

// Every icon-drawing renderer (render-icon.ts, render-mqtt-field.ts,
// render-software-button.ts) only draws an icon it finds already sitting in
// iconImageCache with img.complete/naturalWidth set - on a cache miss it
// kicks off `new Image(); img.src = <svg data url>` and returns without
// drawing anything, relying on img.onload to requestRedraw() and pick it up
// on a LATER paint. That's fine for the live interactive canvas (there's
// always another frame), but __renderScreenForTest below calls
// renderScreenObjects exactly once and takes a synchronous
// canvas.toDataURL() snapshot immediately after - on every call, since
// iconImageCache is a fresh Map every time (topicOverrides differ per
// call, so nothing should persist across calls beyond this one pass). Every
// icon or MQTTIconField object was silently rendering as blank, comparing
// device snapshots against a reference that never had the icon on it at
// all (found 2026-08-10 building the M5 Dial HIL fixture - the exact same
// gap was already latent in the e-paper fixture's own MQTTIconField
// coverage, just never noticed because nothing visually diffed it before
// now). Fixed by walking the screen for every icon asset it references and
// pre-loading + awaiting decode() for each one into iconImageCache BEFORE
// the synchronous render pass, so every renderer's cache-hit path (already
// exercised by the live canvas on a second paint) is what actually runs
// here, not the miss path.
// Rounds a finished render down to a 16-bit RGB565 framebuffer, the way
// the panel itself does on the way to the glass.
//
// `settings.colorDepth` does not cover this. That value quantizes the
// *colours an object is drawn in* (applyColorDepth, "1bit" only today), and
// every fixture colour is deliberately chosen as an RGB565 fixed point so
// the question never arises. Anti-aliased edges are what breaks that: the
// greys along a rounded corner are produced by the rasterizer, not chosen
// by anyone, and they land wherever they land. On a 24-bit reference they
// stay there; on the device they cannot.
//
// Measured on the Waveshare's SoftwareButton corners (2026-08-25): 46 of 52
// differing pixels were this and nothing else - the device's value was
// exactly the reference's value rounded to 5/6/5. Comparing an 8-bit
// reference against a 16-bit panel means every anti-aliased pixel in the
// fixture is a guaranteed mismatch, which is why the fixture had been
// carefully built to contain none.
//
// Deliberately the last thing that happens, on the finished canvas rather
// than on the colours going in: the loss happens at the framebuffer, so
// modelling it anywhere earlier would be modelling a different thing.
// The same idea for a 1-bit panel: reduce the finished render to what the
// glass can physically hold.
//
// `settings.colorDepth: "1bit"` does not cover this, exactly as it does not
// for RGB565. That value quantizes the *colours objects are drawn in*
// (lib/color-depth.ts), and every fixture colour is already black or white.
// What it cannot touch is the grey the rasterizer produces along an
// anti-aliased edge, which nobody chose and which an e-paper cannot show.
//
// Measured on the e-paper's MQTTIconField stencil (2026-09-12): 636 differing
// pixels, all of them the soft outline of a shape both sides otherwise drew
// identically.
//
// Thresholds on the red channel at 0x80, which is not a considered choice
// about luminance but a copy of the firmware's own ScreenRenderer::
// parseColor() - see lib/color-depth.ts's quantizeColorFor1Bit, which mirrors
// the same quirk for object colours. Matching the device's behaviour is the
// point; being more correct than it would only produce differences.
function quantizeCanvasTo1Bit(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] < 0x80 ? 0 : 255
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
  }
  ctx.putImageData(image, 0, 0)
}

function quantizeCanvasToRgb565(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    // Truncate to the panel's bit depth, then expand back the way hardware
    // does - the high bits repeat into the low ones, so full white stays
    // full white instead of drifting down to 248.
    const r = data[i] >> 3
    const g = data[i + 1] >> 2
    const b = data[i + 2] >> 3
    data[i] = (r << 3) | (r >> 2)
    data[i + 1] = (g << 2) | (g >> 4)
    data[i + 2] = (b << 3) | (b >> 2)
  }
  ctx.putImageData(image, 0, 0)
}

// One entry per (asset, color) the screen actually asks for, not per asset:
// the same icon can appear twice in one screen painted differently, so the
// color belongs in the key. Keyed by iconCacheKey, which is what every
// renderer looks the image up by.
function collectIconPreloads(
  objects: ScreenObject[],
): Map<string, { assetId: string; color?: string; flatten?: boolean }> {
  const wanted = new Map<string, { assetId: string; color?: string; flatten?: boolean }>()
  const walk = (objs: ScreenObject[]) => {
    for (const obj of objs) {
      const color = obj.properties?.iconColor
      const flatten = obj.properties?.iconColorFlatten
      const want = (assetId: unknown) => {
        if (typeof assetId !== "string" || !assetId) return
        wanted.set(iconCacheKey(assetId, color, flatten), { assetId, color, flatten })
      }

      if (obj.type === "icon") want(obj.properties?.assetId)
      // A button's icon is loaded in black and coloured as it is drawn, so
      // the one image serves every style and state (render-software-button.ts).
      if (obj.type === "button") {
        const id = obj.properties?.iconAssetId
        if (typeof id === "string" && id)
          wanted.set(buttonIconKey(id), { assetId: id, color: BUTTON_ICON_INK, flatten: true })
      } else {
        want(obj.properties?.iconAssetId)
      }

      const valueIconPairs = obj.properties?.valueIconPairs
      if (Array.isArray(valueIconPairs)) {
        for (const pair of valueIconPairs) want(pair?.thenShowIcon)
      }

      // A Switch's per-state icons, which this preloader missed entirely
      // until 2026-08-25 - the marker spec's states carry no icons, so
      // nothing noticed. Without them the first render of a Switch draws
      // no icon at all, since renderSwitch only ever reads the cache.
      const states = obj.properties?.states
      if (Array.isArray(states)) {
        for (const state of states) {
          // A Switch's icons are loaded in black and coloured as they are drawn,
          // like a button's (render-switch.ts).
          for (const id of [state?.iconAssetId, state?.activeIconAssetId]) {
            if (typeof id !== "string" || !id) continue
            if (isSwitchType(obj.type)) wanted.set(buttonIconKey(id), { assetId: id, color: BUTTON_ICON_INK, flatten: true })
            else want(id)
          }
        }
      }

      if (obj.children && obj.children.length > 0) walk(obj.children)
    }
  }
  walk(objects)
  return wanted
}

async function preloadIconImages(
  objects: ScreenObject[],
  projectAssets: ProjectAsset[],
  iconImageCache: Map<string, HTMLImageElement>,
): Promise<void> {
  await Promise.all(
    [...collectIconPreloads(objects)].map(async ([cacheKey, req]) => {
      const asset = projectAssets.find((a) => a.id === req.assetId)
      if (!asset || asset.type !== "icon" || !asset.data) return

      const img = new Image()
      img.crossOrigin = "anonymous"
      img.src = tintedIconDataUrl(asset.data, req.color, req.flatten)
      try {
        await img.decode()
      } catch {
        // Bad/unparseable asset data - leave it uncached, same as this
        // renderer's own onerror path already tolerates on the live canvas.
        return
      }
      iconImageCache.set(cacheKey, img)
    }),
  )
}

export default function TestRenderPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    ;(window as any).__renderScreenForTest = async (req: RenderTestRequest): Promise<string> => {
      const { project, screenIndex, topicOverrides, quantize, askedValues } = req
      const screen = req.variant === "dark" ? darkVariantOf(project.screens[screenIndex]) : project.screens[screenIndex]
      if (!screen) {
        throw new Error(`No screen at index ${screenIndex} (project has ${project.screens.length})`)
      }

      const scale = req.scale ?? 1
      if (!Number.isInteger(scale) || scale < 1) {
        throw new Error(`scale must be a whole number >= 1, got ${req.scale}`)
      }
      if (scale !== 1 && quantize) {
        // The quantisers read the canvas back at the project's own size, so
        // the two cannot be combined without one of them lying. Nothing needs
        // both: quantising is for panels that render 1:1, scaling is for a
        // phone that does not.
        throw new Error("scale and quantize cannot be used together")
      }

      const canvas = canvasRef.current
      if (!canvas) throw new Error("Canvas not mounted")
      canvas.width = project.screenWidth * scale
      canvas.height = project.screenHeight * scale

      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("No 2d context")

      setupBDFCanvas(ctx)
      // Everything below keeps drawing in the project's own coordinates; the
      // transform is what turns a glyph into one rasterised at the size it
      // will be shown at. setupBDFCanvas has already turned smoothing off, so
      // bitmaps still come up hard-edged.
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, project.screenWidth, project.screenHeight)
      ctx.fillStyle = screen.backgroundColor || "#ffffff"
      ctx.fillRect(0, 0, project.screenWidth, project.screenHeight)

      // topicName may be a plain topic or a "<topic>#<path>" composite
      // referencing a field of a JSON payload (see lib/json-path.ts).
      // topicOverrides is always keyed by the real topic (the orchestrator
      // publishes full JSON payloads there, same as MQTT would), so the
      // override lookup happens on realTopicName, with any path extracted
      // afterward - same two-step resolution as
      // lib/render-screen.ts's getPreviewValueFromTopic.
      const getPreviewValueFromTopic = (topicName: string | undefined): string => {
        if (!topicName) return "No topic selected"
        const { topic: realTopicName, path } = splitTopicPath(topicName)

        let rawValue: string | undefined
        if (realTopicName in topicOverrides) {
          rawValue = topicOverrides[realTopicName]
          // An override of "" is a topic nothing has arrived on, rendered
          // the way the device renders it (hasNoValue() in lib/render-screen)
          // - not the editor's "has no Examples" placeholder. Conformance's
          // "before any value" case asks for exactly this.
          if (rawValue.trim() === "") return ""
        } else {
          const topic = project.topics.find((t) => t.topic === realTopicName)
          rawValue = topic?.examples?.[0]?.trim()
        }

        if (!rawValue) return `Topic ${realTopicName} has no Examples`
        if (!path) return rawValue

        const extracted = extractJsonField(rawValue, path)
        return extracted !== undefined ? extracted : `Field "${path}" not found in ${realTopicName}`
      }

      const bdfFontCache = new Map<string, BDFFont>()
      const iconImageCache = new Map<string, HTMLImageElement>()
      const fonts = project.fonts as ProjectFont[]
      // Placeholders resolve against the same values the objects use: an
      // override where the caller gives one - "" meaning nothing has arrived,
      // as on a device - else the topic's first example.
      const placeholderValues: Record<string, string> = {}
      for (const t of project.topics ?? []) {
        const value = t.topic in topicOverrides ? topicOverrides[t.topic] : t.examples?.[0]
        if (value !== undefined && value.trim() !== "") placeholderValues[t.topic] = value
      }
      const placeholderSettings = (project.settings ?? {}) as { deviceName?: string; decimalSeparator?: string; thousandsSeparator?: string }
      const placeholders = placeholderScope({
        topics: (project.topics ?? []) as any,
        liveValues: placeholderValues,
        projectName: project.name,
        device: { model: placeholderSettings.deviceName },
        separators: projectSeparators(placeholderSettings),
      })

      const colorDepth = project.settings?.colorDepth

      // A project that was exported for a device carries no assets at all -
      // its icons are files by then (hil/android/orchestrator.js builds them
      // back, but a caller that does not should draw a screen without icons
      // rather than throw).
      await preloadIconImages(screen.objects, project.assets ?? [], iconImageCache)

      renderScreenObjects(ctx, screen.objects, {
        fonts,
        projectAssets: project.assets ?? [],
        topics: project.topics as any,
        colorDepth,
        bdfFontCache,
        iconImageCache,
        getPreviewValueFromTopic,
        // What a finger asked for and nothing has answered yet, if the caller
        // says so: a level's marker, a switch's ring.
        getAskedValueFromTopic: (topicName) => (topicName && askedValues ? askedValues[topicName] || "" : ""),
        placeholders,
        requestRedraw: () => {},
        screenBackgroundColor: screen.backgroundColor || "#ffffff",
      })

      if (quantize === "rgb565") {
        quantizeCanvasToRgb565(ctx, project.screenWidth, project.screenHeight)
      } else if (quantize === "1bit") {
        quantizeCanvasTo1Bit(ctx, project.screenWidth, project.screenHeight)
      }

      return canvas.toDataURL("image/png")
    }

    // The arc-level rasterizer, exposed so a spec can pin its output down
    // without a browser page of its own.
    //
    // This one is unusual for this app in that it is worth testing as pure
    // arithmetic rather than through the interface: it exists twice, here
    // and in each firmware, and the two copies have to agree bit for bit or
    // an anti-aliased ring edge drifts. The HIL pixel diff proves that
    // eventually, but only once there is hardware and a port to run against.
    // A table of known coverage values catches a drifting port at the moment
    // it is written, and pins the algorithm so a later tidy-up cannot
    // quietly change what a ring looks like.
    //
    // Going through the page rather than importing the module directly in a
    // Node test keeps the suite's rule intact - what is tested is the real
    // bundle the designer ships, not a separately resolved copy of it.
    ;(window as any).__arcRasterForTest = (req: {
      size: number
      thickness: number
      trackStart64: number
      trackSweep64: number
      fillStart64: number
      fillSweep64: number
      /** Where the setpoint handle lies, in 1/64 degrees; absent means none. */
      handleAt64?: number
      /** Which band owns each rounded end - the fill reaches it, or the track. */
      startCapFilled?: boolean
      endCapFilled?: boolean
      /** The track drawn as its own outline, as a 1-bit panel needs. */
      framed?: boolean
      /** How far the ring sits inside the object's edge - the handle's room. */
      inset?: number
      pixels: [number, number][]
    }) => {
      // Caps and handle come from the renderer's own helpers rather than
      // from a copy here: half a pixel of cap is exactly what the
      // comparison exists to catch, and a second implementation of it in
      // the harness could only ever agree with itself.
      const inset = req.inset ?? 0
      const { startCap, endCap } = arcCaps(
        req.size,
        req.thickness,
        inset,
        req.trackStart64,
        req.trackSweep64,
      )
      const geom = {
        size: req.size,
        thickness: req.thickness,
        inset,
        track: makeArcSector(req.trackStart64, req.trackSweep64),
        fill: makeArcSector(req.fillStart64, req.fillSweep64),
        startCap,
        endCap,
        startCapFilled: req.startCapFilled ?? false,
        endCapFilled: req.endCapFilled ?? false,
        handle:
          req.handleAt64 === undefined
            ? null
            : arcHandleBand(req.size, req.thickness, inset, req.handleAt64, req.trackSweep64),
        framed: req.framed ?? false,
      }
      return req.pixels.map(([px, py]) => arcPixelBands(geom, px, py))
    }
    // The second half of the same rasterizer: what a pixel's band counts
    // turn into once they are mixed.
    //
    // Separate from __arcRasterForTest rather than folded into it because
    // the two answer different questions and one existing caller
    // (e2e/arc-raster.spec.ts) already depends on that one's shape. This one
    // exists so a port can be checked end to end - the geometry AND the
    // 5/6/5 quantisation, rounding and bit-replication that follow it, which
    // is where a platform with 8-bit colour is most tempted to be "more
    // correct" than the reference and thereby differ from it.
    //
    // Returns one 0xRRGGBB per pixel, the value that reaches a framebuffer.
    // The third band was renamed marker -> handle on 2026-09-22, when the
    // wedge became the bar's own handle laid across the ring. This function
    // kept reading `b.marker`, which is now undefined: `covered` went NaN,
    // every channel went NaN, and fromRgb565's shifts collapsed NaN to 0. So
    // every recorded colour has been 0 since that rename - through four
    // re-recordings, because nobody looked at the numbers, only at whether
    // the file had been written. The Android port found it by failing
    // against it: #000000 expected where 16/16 track has to be #295d29.
    ;(window as any).__arcBlendForTest = (req: {
      track: string
      fill: string
      handle: string
      background: string
      bands: { fill: number; track: number; handle: number }[]
    }): number[] => {
      const trackColour = toRgb565(req.track)
      const fillColour = toRgb565(req.fill)
      const handleColour = toRgb565(req.handle)
      const background = toRgb565(req.background)
      return req.bands.map((b) => {
        const covered = b.fill + b.track + b.handle
        const mixed = blendBands(
          [
            { colour: fillColour, count: b.fill },
            { colour: trackColour, count: b.track },
            { colour: handleColour, count: b.handle },
          ],
          background,
          ARC_COVERAGE_MAX - covered,
        )
        const out = fromRgb565(mixed)
        return (out.r << 16) | (out.g << 8) | out.b
      })
    }
    // The pill rasterizer, probed the same way and for the same reason: it
    // is the second piece of rendering that exists once here and once in
    // every firmware, and a sub-sample counted into the wrong run is exactly
    // what a picture cannot show (lib/pill-raster.ts).
    //
    // Returns, per pixel, how many of its sixteen sub-samples fell into each
    // band - in the order the bands were given, which is their priority.
    ;(window as any).__pillRasterForTest = (req: {
      bands: PillBand[]
      pixels: [number, number][]
    }): number[][] => req.pixels.map(([x, y]) => pillPixelBands(req.bands, x, y))

    // Draws arc-level objects on their own, without a project around them.
    //
    // The object type is wired into the normal render pipeline like any
    // other, but a ring is the one thing here whose *look* has to be judged
    // before the wiring exists - and later, whose look has to be judgeable
    // again after a change to the rasterizer, without building a project to
    // see it. Returns a PNG data URL of a sheet of them.
    ;(window as any).__renderArcSheetForTest = (req: {
      width: number
      height: number
      background: string
      items: { obj: any; values?: Record<string, string> }[]
    }): string => {
      const canvas = document.createElement("canvas")
      canvas.width = req.width
      canvas.height = req.height
      const ctx = canvas.getContext("2d")!
      ctx.fillStyle = req.background
      ctx.fillRect(0, 0, req.width, req.height)

      for (const item of req.items) {
        renderArcLevel({
          ctx,
          obj: item.obj,
          fonts: [],
          topics: [],
          zoom: 1,
          bdfFontCache: new Map(),
          getPreviewValueFromTopic: (t?: string) => (t && item.values ? (item.values[t] ?? "") : ""),
          screenBackgroundColor: req.background,
          requestRedraw: () => {},
        })
      }
      return canvas.toDataURL("image/png")
    }
    // The real device export, driven from a script.
    //
    // A HIL fixture used to be hand-written as project.json and zipped by a
    // plain Node script - fine for everything a firmware renders live, and
    // that was every object type until a SoftwareButton turned up. That one
    // is not rendered live anywhere: the designer's export composites its
    // border, shadow and label into a bitmap and ships that, and the
    // firmware blits it or draws nothing at all. A hand-built fixture
    // therefore produced a state no real deploy can produce - the device
    // drew nothing while the reference renderer drew the button - and the
    // first HIL run to look at it reported 11710 differing pixels against a
    // device that was behaving correctly (2026-08-25).
    //
    // Baking that bitmap by hand in the builder would put a second,
    // drifting copy of asset-export.ts's compositing next to the first. So
    // the fixture goes through the real thing instead. It has to happen in
    // a browser: the bake is a canvas operation, there is no headless path.
    //
    // Returns base64 rather than a Blob - page.evaluate() can only hand
    // back structured-cloneable values, and a Blob is not one.
    ;(window as any).__buildDeviceZipForTest = async (project: any): Promise<string> => {
      const blob = await buildDeviceProjectZip(project)
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ""
      // Chunked: String.fromCharCode.apply blows the argument limit on a zip
      // of any real size.
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      return btoa(binary)
    }
    // The same thing for an android-platform target, and for the same
    // reason: hil/android's fixture has to be the bundle a real export
    // produces, not a hand-written approximation of one. The flattened
    // background PNG behind every screen is a canvas bake with no headless
    // path either, and it is where master-screen inheritance and every
    // static object actually land.
    // What a level indicator is: where every piece of it sits, and what
    // colour each piece is.
    //
    // Recorded for the Android port the way the arc rasterizer is, and for
    // the same reason: the rules exist twice over (lib/level-shape.ts here,
    // the app's own copy over there), and two copies of a rule are two
    // chances to disagree. A HIL run notices a disagreement only once a
    // phone is connected and a fixture installed, and then only as a
    // percentage of differing pixels; this says which number is wrong, in
    // milliseconds, with no hardware at all.
    //
    // Geometry and colour together, because on this control they are not
    // separable: the empty part of the track is the fill's own colour mixed
    // into the background the whole thing stands on, so getting the
    // background wrong changes the shape's colours and nothing else.
    ;(window as any).__levelShapeForTest = (req: {
      type: string
      x: number
      y: number
      width: number
      height: number
      properties?: Record<string, unknown>
      fonts?: ProjectFont[]
      percent: number
      setpointPercent?: number
      background: string
      colorDepth?: string
    }) => {
      const obj = {
        id: "probe",
        type: req.type,
        zIndex: 1,
        x: req.x,
        y: req.y,
        width: req.width,
        height: req.height,
        properties: req.properties ?? {},
      } as never
      const fonts = req.fonts ?? []
      const handle = levelHasHandle(obj)
        ? levelHandleRect(obj, req.setpointPercent ?? req.percent, fonts)
        : null
      return {
        vertical: levelIsVertical(obj),
        fillsFromEnd: levelFillsFromEnd(obj),
        thickness: levelThickness(obj),
        hasHandle: levelHasHandle(obj),
        showsNumber: levelShowsNumber(obj),
        headerHeight: levelHeaderHeight(obj, fonts),
        valueWidth: levelValueWidth(obj, fonts),
        metrics: levelFontMetrics(obj, fonts),
        layout: levelLayout(obj, fonts),
        track: levelTrackRect(obj, fonts),
        emptyTrack: levelEmptyTrack(obj, fonts),
        // The handle is part of the segment arithmetic, not an afterthought:
        // a track with one is split around it (levelSegments takes the rect,
        // not a percentage).
        segments: levelSegments(obj, req.percent, handle, fonts),
        handle,
        trackLook: levelTrackLook(
          String(req.properties?.fillColor ?? "#4CAF50"),
          req.background,
          req.colorDepth,
        ),
      }
    }
    // What a Switch is: every rectangle it is made of, and every colour it
    // is painted with.
    //
    // Recorded for the Android port the way the level indicator is, and for
    // the same reason: the rules exist twice over (lib/switch-shape.ts here,
    // SwitchShape.kt over there), and two copies of a rule are two chances to
    // disagree.
    //
    // The colours are half the point. Everything a Switch is painted with is
    // derived from ONE colour the author sets and from what the control
    // stands on - a blend for the container, a Material tone rule for the ink
    // on it, the slider's own tint for the quiet pair - so a port that gets
    // the derivation wrong draws the right shapes in the wrong colours, which
    // no geometry check would see.
    //
    // Text is not measured here. Where a label sits depends on how wide it is,
    // and that is Skia's answer over there and the browser's here; the width
    // is an INPUT to this (`textWidth`), so what is compared is the layout
    // rule rather than two font engines.
    ;(window as any).__switchShapeForTest = (req: {
      type: string
      x: number
      y: number
      width: number
      height: number
      properties?: Record<string, unknown>
      fonts?: ProjectFont[]
      stateCount: number
      /** Which state is reported, which was asked for, which is held down. */
      activeIndex?: number
      askedIndex?: number
      pressedIndex?: number
      /** The measured width of the label being laid out, in project units. */
      textWidth?: number
      hasIcon?: boolean
      background: string
      colorDepth?: string
    }) => {
      const obj = {
        id: "probe",
        type: req.type,
        zIndex: 1,
        x: req.x,
        y: req.y,
        width: req.width,
        height: req.height,
        properties: req.properties ?? {},
      } as never
      const fonts = req.fonts ?? []
      const count = Math.max(1, req.stateCount)
      const states = ((req.properties?.states as { showAsOn?: boolean }[]) ?? [])
      const active = req.activeIndex ?? -1
      const on = active >= 0 && !!states[active] && switchStateIsOn(states[active])
      const metrics = switchFontMetrics(obj, fonts)
      const textWidth = req.textWidth ?? 0
      const hasIcon = !!req.hasIcon
      const knobForm = switchForm(obj) === "knob"
      const segments = switchSegments(obj, count)
      const track = switchTrack(obj, count)
      const labelBox = switchLabelBox(obj, count)
      const shown = (req.askedIndex ?? -1) >= 0 ? (req.askedIndex as number) : active
      const look = switchLook(obj, req.background, req.colorDepth)
      return {
        form: switchForm(obj),
        metrics,
        corner: switchCorner(Math.trunc(req.width), Math.trunc(req.height)),
        container: switchContainer(obj),
        segments,
        // What a ring on each button would enclose. A ring is its outer pill
        // with the inside taken back, so the colour under it is decided rather
        // than inherited - and on the button that is BOTH the reported state
        // and the one a finger asked for, the two readings differ: its own
        // colour (right) or the container's surface (what the designer drew
        // until 2026-09-22). Recorded per button and not only for the one
        // ringed now, so the rule is pinned whichever button is asked for.
        ringFills: segments.map((_, i) => switchRingFill(look, i === active)),
        track,
        labelBox,
        // Every slot the knob can stand in, and the one it stands in now.
        // Every slot at both sizes, because the size is what says whether
        // the state it stands for means "on".
        knobs: Array.from({ length: count }, (_, i) => switchKnob(obj, count, i, { on })),
        quietKnobs: Array.from({ length: count }, (_, i) => switchKnob(obj, count, i)),
        pressedKnob: switchKnob(obj, count, Math.max(0, shown), { on, pressed: true }),
        shownIndex: shown,
        // Laid out in whichever box this form puts its content in.
        content: switchContent(knobForm ? labelBox : segments[0], metrics, hasIcon, textWidth),
        look,
        knobLook: switchKnobLook(obj, req.background, req.colorDepth, on),
        knobLookOff: switchKnobLook(obj, req.background, req.colorDepth, false),
        on,
      }
    }
    // What a finger at a point MEANS - the other half of a control, and the
    // half a picture cannot show.
    //
    // The Android HIL taps the phone and checks what it publishes. Without
    // these it would have to carry its own copy of the mapping to check
    // against, which would make it a test of two guesses agreeing rather
    // than of the app agreeing with the designer. A tap on a bar has to
    // become the same value here, on a panel, and on the phone, or the same
    // finger sets three different things (2026-09-22).
    ;(window as any).__tapMeaningForTest = (req: {
      type: string
      x: number
      y: number
      width: number
      height: number
      properties?: Record<string, unknown>
      fonts?: ProjectFont[]
      /** Where the finger landed, in the object's own absolute units. */
      atX: number
      atY: number
      /** Which state the control currently reports; -1 for none. */
      activeIndex?: number
    }) => {
      const obj = {
        id: "probe",
        type: req.type,
        zIndex: 1,
        x: req.x,
        y: req.y,
        width: req.width,
        height: req.height,
        properties: req.properties ?? {},
      } as never
      const fonts = req.fonts ?? []
      if (isSwitchType(req.type)) {
        const index = switchStateIndexForTap(obj, req.atX, req.activeIndex ?? -1)
        const states = (req.properties?.states as { writeValue?: string }[]) ?? []
        return { stateIndex: index, writeValue: states[index]?.writeValue ?? null }
      }
      // A ring answers by angle and a bar by position: two mappings, and the
      // designer checks the type before it chooses one, so this does too.
      if (isArcType(req.type)) return { value: arcValueFromPoint(obj, req.atX, req.atY) }
      return { value: levelValueFromPoint(obj, req.atX, req.atY, fonts) }
    }
    ;(window as any).__buildAndroidZipForTest = async (project: any): Promise<string> => {
      const blob = await exportAndroidProject(project)
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ""
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      }
      return btoa(binary)
    }
    // The reader's half of the export's XDark rule, for the parity golden the
    // app and the firmware check their own ports against
    // (hil/android/fixtures/build-theme-variant-golden.js).
    ;(window as any).__darkVariantOfForTest = (value: unknown) => darkVariantOf(value)

    // A project as the designer opens it - hex colours become theme roles
    // (lib/themes.ts migrateColorsToRoles) - so a HIL fixture written before
    // themes can be exported with its dark variant (hil/*/orchestrator.js
    // --dark).
    ;(window as any).__migrateProjectForTest = (project: any) => migrateProject(structuredClone(project))

    ;(window as any).__testRenderReady = true

    return () => {
      delete (window as any).__renderScreenForTest
      delete (window as any).__arcRasterForTest
      delete (window as any).__arcBlendForTest
      delete (window as any).__pillRasterForTest
      delete (window as any).__levelShapeForTest
      delete (window as any).__switchShapeForTest
      delete (window as any).__tapMeaningForTest
      delete (window as any).__buildDeviceZipForTest
      delete (window as any).__buildAndroidZipForTest
      delete (window as any).__darkVariantOfForTest
      delete (window as any).__migrateProjectForTest
      delete (window as any).__testRenderReady
    }
  }, [])

  return (
    <div style={{ background: "#333", minHeight: "100vh", padding: 16 }}>
      <p style={{ color: "#fff", fontFamily: "monospace", fontSize: 12 }}>
        Headless render harness - see DEVICE_GUIDE.md. Not part of the normal app.
      </p>
      <canvas ref={canvasRef} style={{ background: "#fff" }} />
    </div>
  )
}
