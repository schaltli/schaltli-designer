"use client"

import { useEffect, useRef } from "react"
import type { ProjectAsset, ScreenObject } from "@/components/project-editor"
import { renderScreenObjects } from "@/lib/render-screen"
import { applyTheme, resolveRole, type Theme, type Variant } from "@/lib/themes"
import type { BDFFont } from "@/lib/bdffont"

// A light bulb, inline: the preview must not wait on the network. Drawn in
// currentColor, so the icon tint is what colours it.
const BULB_SVG =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function"
    ? btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2m-3 18h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/></svg>',
      )
    : "")

const ASSETS: ProjectAsset[] = [{ id: "theme-preview-bulb", name: "bulb", type: "icon", data: BULB_SVG } as ProjectAsset]

const PERCENT = [
  { value: 0, barSizePercent: 0 },
  { value: 100, barSizePercent: 100 },
]

// A small screen with the three controls the user asked to see a theme on
// (2026-09-25): a dial, a slider and an icon. Device pixels; roles, not hex.
const WIDTH = 200
const HEIGHT = 110
const OBJECTS: ScreenObject[] = [
  {
    id: "preview-dial",
    type: "dial",
    zIndex: 1,
    x: 8,
    y: 8,
    width: 94,
    height: 94,
    properties: {
      topic: "preview/level",
      setpointTopic: "preview/target",
      writeTopic: "preview/set",
      minAngle: 225,
      maxAngle: 135,
      direction: "cw",
      thickness: 9,
      markerWidth: 4,
      backgroundColor: "transparent",
      fillColor: "accent",
      textColor: "text",
      displayValue: "value",
      fontSize: 16,
      calibrationPoints: PERCENT,
    },
  },
  {
    id: "preview-icon",
    type: "icon",
    zIndex: 2,
    x: 134,
    y: 10,
    width: 34,
    height: 34,
    properties: { assetId: "theme-preview-bulb", iconColor: "accent", backgroundColor: "transparent" },
  },
  {
    id: "preview-slider",
    type: "slider",
    zIndex: 3,
    x: 110,
    y: 56,
    width: 84,
    height: 44,
    properties: {
      topic: "preview/dimmer",
      writeTopic: "preview/dimmer/set",
      direction: "left-to-right",
      displayValue: "none",
      fillColor: "accent",
      textColor: "text",
      calibrationPoints: PERCENT,
    },
  },
]

const VALUES: Record<string, string> = {
  "preview/level": "62",
  "preview/target": "75",
  "preview/dimmer": "45",
}

/**
 * One theme in one variant, drawn by the designer's own renderers on a small
 * screen - what the Theme list in a screen's properties shows for each
 * theme (user, 2026-09-25).
 */
export function ThemePreview({
  theme,
  variant,
  colorDepth,
  className = "w-[150px]",
}: {
  theme: Theme
  variant: Variant
  colorDepth: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const bdfFontCache = new Map<string, BDFFont>()
    const iconImageCache = new Map<string, HTMLImageElement>()
    const surface = resolveRole(theme, "surface", variant, colorDepth)

    const render = () => {
      if (cancelled) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.fillStyle = surface
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      renderScreenObjects(ctx, applyTheme(OBJECTS, theme, variant, colorDepth), {
        fonts: [],
        projectAssets: ASSETS,
        topics: [],
        colorDepth,
        bdfFontCache,
        iconImageCache,
        getPreviewValueFromTopic: (topic) => (topic ? (VALUES[topic] ?? "") : ""),
        requestRedraw: render,
        screenBackgroundColor: surface,
      })
    }
    render()
    return () => {
      cancelled = true
    }
  }, [theme, variant, colorDepth])

  return (
    <canvas
      ref={canvasRef}
      width={WIDTH}
      height={HEIGHT}
      data-variant={variant}
      aria-label={`${theme.name}, ${variant === "light" ? "Light" : "Dark"}`}
      className={`rounded border border-gray-300 h-auto ${className}`}
    />
  )
}
