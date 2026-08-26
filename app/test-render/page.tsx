"use client"

import { useEffect, useRef } from "react"
import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import { setupBDFCanvas } from "@/lib/font-utils"
import { createPlaceholderContext } from "@/lib/placeholder-utils"
import { renderScreenObjects } from "@/lib/render-screen"
import { buildDeviceProjectZip } from "@/lib/project-zip"
import { arcPixelBands, makeArcSector } from "@/lib/arc-raster"
import { renderArcLevel } from "@/components/canvas/renderers/render-arc-level"
import { extractJsonField, splitTopicPath } from "@/lib/json-path"
import { tintedIconDataUrl, iconCacheKey } from "@/lib/svg-utils"

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
  // "rgb565" makes the reference image show only colours the target panel
  // can actually hold - see quantizeCanvasToRgb565 below. Omitted for
  // devices whose framebuffer is not 16-bit.
  quantize?: "rgb565"
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
      want(obj.properties?.iconAssetId)

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
          want(state?.iconAssetId)
          want(state?.activeIconAssetId)
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
      const { project, screenIndex, topicOverrides, quantize } = req
      const screen = project.screens[screenIndex]
      if (!screen) {
        throw new Error(`No screen at index ${screenIndex} (project has ${project.screens.length})`)
      }

      const canvas = canvasRef.current
      if (!canvas) throw new Error("Canvas not mounted")
      canvas.width = project.screenWidth
      canvas.height = project.screenHeight

      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("No 2d context")

      setupBDFCanvas(ctx)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
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
      const placeholderContext = createPlaceholderContext(
        screen.name,
        project.screenWidth,
        project.screenHeight,
        project.name,
      )

      const colorDepth = project.settings?.colorDepth

      await preloadIconImages(screen.objects, project.assets, iconImageCache)

      renderScreenObjects(ctx, screen.objects, {
        fonts,
        projectAssets: project.assets,
        topics: project.topics as any,
        colorDepth,
        bdfFontCache,
        iconImageCache,
        getPreviewValueFromTopic,
        placeholderContext,
        requestRedraw: () => {},
        screenBackgroundColor: screen.backgroundColor || "#ffffff",
      })

      if (quantize === "rgb565") {
        quantizeCanvasToRgb565(ctx, project.screenWidth, project.screenHeight)
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
      markerStart64?: number
      markerSweep64?: number
      pixels: [number, number][]
    }) => {
      const geom = {
        size: req.size,
        thickness: req.thickness,
        track: makeArcSector(req.trackStart64, req.trackSweep64),
        fill: makeArcSector(req.fillStart64, req.fillSweep64),
        marker: makeArcSector(req.markerStart64 ?? 0, req.markerSweep64 ?? 0),
      }
      return req.pixels.map(([px, py]) => arcPixelBands(geom, px, py))
    }
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
    ;(window as any).__testRenderReady = true

    return () => {
      delete (window as any).__renderScreenForTest
      delete (window as any).__arcRasterForTest
      delete (window as any).__buildDeviceZipForTest
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
