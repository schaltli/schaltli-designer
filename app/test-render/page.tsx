"use client"

import { useEffect, useRef } from "react"
import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import { setupBDFCanvas } from "@/lib/font-utils"
import { createPlaceholderContext } from "@/lib/placeholder-utils"
import { renderScreenObjects } from "@/lib/render-screen"
import { extractJsonField, splitTopicPath } from "@/lib/json-path"

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
}

export default function TestRenderPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    ;(window as any).__renderScreenForTest = async (req: RenderTestRequest): Promise<string> => {
      const { project, screenIndex, topicOverrides } = req
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
      })

      return canvas.toDataURL("image/png")
    }
    ;(window as any).__testRenderReady = true

    return () => {
      delete (window as any).__renderScreenForTest
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
