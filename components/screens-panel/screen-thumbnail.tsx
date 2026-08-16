"use client"

import { useEffect, useRef, useState } from "react"
import type { ProjectScreen, ProjectFont, ProjectAsset, Topic, ScreenObject } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import { setupBDFCanvas } from "@/lib/font-utils"
import { createPlaceholderContext } from "@/lib/placeholder-utils"
import { renderScreenObjects, getPreviewValueFromTopic } from "@/lib/render-screen"
import { mergeMasterAndScreenObjects } from "@/lib/object-order"
import { applyAdornmentTransform } from "@/lib/adornment-rotation"
import { resolveBackgroundColor, resolveBackgroundImage } from "@/lib/master-screen"

interface ScreenThumbnailProps {
  screen: ProjectScreen
  // The screen's assigned master's objects (already resolved by the caller,
  // respecting the "Show master" toggle), or undefined/empty when none
  // applies - see project-editor.tsx's ProjectScreen.masterScreenId.
  masterObjects?: ScreenObject[]
  // The same master screen masterObjects came from - passed separately
  // (rather than pre-extracting just backgroundColor/backgroundImageAssetId)
  // so this component can resolve inheritance the same way canvas.tsx does,
  // via lib/master-screen.ts (2026-08-16).
  masterScreen?: ProjectScreen
  screenWidth: number
  screenHeight: number
  projectName: string
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  topics: Topic[]
  colorDepth?: string
  // Only the offscreen-corner mask (hooks/use-adornment-image.ts's
  // offscreenMaskImage) - not the full adornment. A thumbnail is too small
  // to usefully show bezel/button artwork, but a round device's dead
  // corners still need masking so its thumbnail reads as round too
  // (2026-08-16 - this used to draw the full adornment image, unwanted
  // detail at this scale, gated behind the same "Adornment" toggle as the
  // main canvas; now it's unconditional, since the mask alone is cheap
  // enough to always show and there's no bezel to want an "off" state for).
  offscreenMaskImage?: HTMLImageElement | null
  adornmentDrawingArea?: { x: number; y: number; width: number; height: number }
  adornmentRotation?: 0 | 90 | 180 | 270
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
  offscreenMaskImage,
  adornmentDrawingArea,
  adornmentRotation = 0,
}: ScreenThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bdfFontCacheRef = useRef<Map<string, BDFFont>>(new Map())
  const iconImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const [backgroundImageElement, setBackgroundImageElement] = useState<HTMLImageElement | null>(null)

  const resolvedBackgroundImageAssetId = resolveBackgroundImage(screen, masterScreen).assetId

  // Own effect per thumbnail (unlike offscreenMaskImage, shared once for
  // the whole column) - each screen can resolve to a different asset, local
  // or inherited (2026-08-16 - background images were never drawn here at
  // all before this, a plain oversight, not a deliberate scope cut like the
  // full adornment above).
  useEffect(() => {
    if (!resolvedBackgroundImageAssetId) {
      setBackgroundImageElement(null)
      return
    }
    const asset = projectAssets.find((a) => a.id === resolvedBackgroundImageAssetId)
    if (!asset || asset.type !== "image") {
      setBackgroundImageElement(null)
      return
    }
    let cancelled = false
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (!cancelled) setBackgroundImageElement(img)
    }
    img.onerror = () => {
      if (!cancelled) setBackgroundImageElement(null)
    }
    img.src = asset.data
    return () => {
      cancelled = true
    }
  }, [resolvedBackgroundImageAssetId, projectAssets])

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

      if (backgroundImageElement) {
        ctx.drawImage(backgroundImageElement, 0, 0, screenWidth, screenHeight)
      }

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

      // Same transform as the main canvas's adornment, so the mask lines up
      // with the same screen bounds - see this file's own header comment
      // for why only the mask (not the full adornment) draws here.
      if (offscreenMaskImage && adornmentDrawingArea) {
        ctx.save()
        applyAdornmentTransform(ctx, adornmentDrawingArea, adornmentRotation, screenWidth, screenHeight)
        ctx.drawImage(offscreenMaskImage, 0, 0)
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
    backgroundImageElement,
    offscreenMaskImage,
    adornmentDrawingArea,
    adornmentRotation,
  ])

  return (
    <div className="w-full bg-white" style={{ aspectRatio: `${screenWidth} / ${screenHeight}` }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  )
}
