"use client"

import { useEffect, useRef } from "react"
import type { ProjectScreen, ProjectFont, ProjectAsset, Topic, ScreenObject } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import { setupBDFCanvas } from "@/lib/font-utils"
import { createPlaceholderContext } from "@/lib/placeholder-utils"
import { renderScreenObjects, getPreviewValueFromTopic } from "@/lib/render-screen"
import { mergeMasterAndScreenObjects } from "@/lib/object-order"
import { applyAdornmentTransform } from "@/lib/adornment-rotation"
import { resolveBackgroundColor } from "@/lib/master-screen"

interface ScreenThumbnailProps {
  screen: ProjectScreen
  // The screen's assigned master's objects (already resolved by the caller,
  // respecting the "Show master" toggle), or undefined/empty when none
  // applies - see project-editor.tsx's ProjectScreen.masterScreenId.
  masterObjects?: ScreenObject[]
  // The same master screen masterObjects came from - passed separately
  // (rather than pre-extracting just its backgroundColor) so this component
  // can resolve inheritance the same way canvas.tsx does, via
  // lib/master-screen.ts's resolveBackgroundColor (2026-08-16). No
  // background-*image* inheritance here - thumbnails never draw a
  // background image at all, local or inherited, a pre-existing gap this
  // doesn't touch.
  masterScreen?: ProjectScreen
  screenWidth: number
  screenHeight: number
  projectName: string
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  topics: Topic[]
  colorDepth?: string
  // The already-rasterized adornment, passed in rather than built here: one
  // image is shared by the canvas and every thumbnail (see
  // hooks/use-adornment-image.ts), instead of n screens rasterizing n copies
  // of the same SVG.
  adornmentImage?: HTMLImageElement | null
  adornmentDrawingArea?: { x: number; y: number; width: number; height: number }
  adornmentRotation?: 0 | 90 | 180 | 270
  showAdornment?: boolean
}

// A live, read-only preview of a screen's actual content - same renderers
// canvas.tsx and the HIL test harness use (lib/render-screen.ts), just
// drawn once per change instead of interactively. Font/icon caches live in
// refs so they survive re-renders (an icon's Image object shouldn't reload
// every time the project changes elsewhere).
//
// Sized entirely by CSS (w-full + aspect-ratio) rather than a fixed pixel
// width computed in JS - the slot this renders into must always keep the
// project's own screenWidth:screenHeight ratio, whatever width its parent
// actually has available (which shrinks once the panel's scrollbar
// appears - a fixed px width didn't account for that and could overlap
// it). The canvas's internal resolution still matches the real screen
// dimensions for a crisp render; CSS just scales the element visually.
export function ScreenThumbnail({
  screen,
  masterObjects = [],
  masterScreen,
  screenWidth,
  screenHeight,
  projectName,
  fonts,
  projectAssets,
  topics,
  colorDepth,
  adornmentImage,
  adornmentDrawingArea,
  adornmentRotation = 0,
  showAdornment = true,
}: ScreenThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bdfFontCacheRef = useRef<Map<string, BDFFont>>(new Map())
  const iconImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false

    const render = () => {
      if (cancelled) return
      canvas.width = screenWidth
      canvas.height = screenHeight
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      setupBDFCanvas(ctx)
      ctx.clearRect(0, 0, screenWidth, screenHeight)
      ctx.fillStyle = resolveBackgroundColor(screen, masterScreen).color
      ctx.fillRect(0, 0, screenWidth, screenHeight)

      const placeholderContext = createPlaceholderContext(screen.name, screenWidth, screenHeight, projectName)

      renderScreenObjects(ctx, mergeMasterAndScreenObjects(masterObjects, screen.objects), {
        fonts,
        projectAssets,
        topics,
        colorDepth,
        bdfFontCache: bdfFontCacheRef.current,
        iconImageCache: iconImageCacheRef.current,
        getPreviewValueFromTopic: (topicName) => getPreviewValueFromTopic(topicName, topics),
        placeholderContext,
        requestRedraw: render,
      })

      // Same artwork, same transform, same toggle as the main canvas, so a
      // round device reads as round here too instead of showing corners it
      // physically can't display. The canvas deliberately stays at
      // screenWidth x screenHeight - the adornment simply gets clipped by
      // its edges, which keeps the screenWidth:screenHeight aspect ratio the
      // panel's CSS layout depends on (see this file's header comment).
      if (showAdornment && adornmentImage && adornmentDrawingArea) {
        ctx.save()
        applyAdornmentTransform(ctx, adornmentDrawingArea, adornmentRotation, screenWidth, screenHeight)
        ctx.drawImage(adornmentImage, 0, 0)
        ctx.restore()
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [
    screen,
    masterObjects,
    masterScreen,
    screenWidth,
    screenHeight,
    projectName,
    fonts,
    projectAssets,
    topics,
    colorDepth,
    adornmentImage,
    adornmentDrawingArea,
    adornmentRotation,
    showAdornment,
  ])

  return (
    <div className="w-full bg-white" style={{ aspectRatio: `${screenWidth} / ${screenHeight}` }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  )
}
