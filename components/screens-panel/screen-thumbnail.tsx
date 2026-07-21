"use client"

import { useEffect, useRef } from "react"
import type { ScreenmanScreen, ScreenmanFont, ScreenmanAsset, Topic } from "@/components/screenman-editor"
import type { BDFFont } from "@/lib/bdffont"
import { setupBDFCanvas } from "@/lib/font-utils"
import { createPlaceholderContext } from "@/lib/placeholder-utils"
import { sortObjectsByDrawingOrder } from "@/lib/object-order"
import { renderScreenObjects } from "@/lib/render-screen"

interface ScreenThumbnailProps {
  screen: ScreenmanScreen
  screenWidth: number
  screenHeight: number
  projectName: string
  fonts: ScreenmanFont[]
  projectAssets: ScreenmanAsset[]
  topics: Topic[]
  colorDepth?: string
  width: number // CSS width in px; height follows the project's own aspect ratio
}

// A live, read-only preview of a screen's actual content - same renderers
// canvas.tsx and the HIL test harness use (lib/render-screen.ts), just
// drawn once per change instead of interactively. Font/icon caches live in
// refs so they survive re-renders (an icon's Image object shouldn't reload
// every time the project changes elsewhere).
export function ScreenThumbnail({
  screen,
  screenWidth,
  screenHeight,
  projectName,
  fonts,
  projectAssets,
  topics,
  colorDepth,
  width,
}: ScreenThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bdfFontCacheRef = useRef<Map<string, BDFFont>>(new Map())
  const iconImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const height = Math.round((width * screenHeight) / Math.max(1, screenWidth))

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
      ctx.fillStyle = screen.backgroundColor || "#ffffff"
      ctx.fillRect(0, 0, screenWidth, screenHeight)

      const getPreviewValueFromTopic = (topicName: string | undefined): string => {
        if (!topicName) return "No topic selected"
        const topic = topics.find((t) => t.topic === topicName)
        if (!topic || !topic.examples || topic.examples.length === 0) return ""
        return topic.examples[0]?.trim() || ""
      }

      const placeholderContext = createPlaceholderContext(screen.name, screenWidth, screenHeight, projectName)
      const objects = sortObjectsByDrawingOrder(screen.objects)

      renderScreenObjects(ctx, objects, {
        fonts,
        projectAssets,
        topics,
        colorDepth,
        bdfFontCache: bdfFontCacheRef.current,
        iconImageCache: iconImageCacheRef.current,
        getPreviewValueFromTopic,
        placeholderContext,
        requestRedraw: render,
      })
    }

    render()
    return () => {
      cancelled = true
    }
  }, [screen, screenWidth, screenHeight, projectName, fonts, projectAssets, topics, colorDepth])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px`, display: "block", background: "#ffffff" }}
    />
  )
}
