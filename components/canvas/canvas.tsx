"use client"

import type React from "react"
import { useEffect, useRef, useCallback, useState } from "react"
import { FieldTopicSelectionDialog } from "../field-topic-selection-dialog"
import type {
  ScreenmanScreen,
  ScreenmanObject,
  SnapGuide,
  ScreenmanAsset,
  ColorRecoloration,
  Topic,
  ScreenmanFont, // Added ScreenmanFont import
} from "../screenman-editor"
import type { SnapResult } from "../screenman-editor" // Declare SnapResult here
import { processPlaceholders, createPlaceholderContext } from "@/lib/placeholder-utils"
import { BDFFont } from "@/lib/bdffont" // Added BDFFont import

interface CanvasProps {
  screen: ScreenmanScreen
  selectedObjectIds: string[]
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  onSelectObjects: (ids: string[]) => void
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
  onDeleteObject: (id: string) => void
  snapGuides: SnapGuide[]
  zoom: number
  offset: { x: number; y: number }
  onZoomChange: (zoom: number) => void
  onOffsetChange: (offset: { x: number; y: number }) => void
  activeTool: "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator"
  onAddObject: (object: Omit<ScreenmanObject, "id" | "zIndex">) => void
  onToolChange: (
    tool: "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator",
  ) => void
  selectedIconAssetId?: string
  onIconToolClick?: (position: { x: number; y: number }) => void
  projectAssets?: ScreenmanAsset[]
  topics: Topic[]
  fonts: ScreenmanFont[] // Added fonts to destructuring
  onManageTopics: () => void
  onCopy?: () => void
  onPaste?: () => void
  hasClipboard?: boolean
}

type InteractionMode = "select" | "drag" | "resize" | "create" | "line-endpoint" | "selection-rectangle"
type ResizeHandle = "nw" | "ne" | "sw" | "se"
type LineHandle = "start" | "end"

interface DragState {
  mode: InteractionMode
  objectId: string | null
  startPos: { x: number; y: number }
  startObjectPos: { x: number; y: number; width: number; height: number }
  resizeHandle?: ResizeHandle
  lineHandle?: LineHandle
  creatingType?: "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator"
  selectionRect?: { x: number; y: number; width: number; height: number }
}

interface PendingFieldCreation {
  type: "MqttDataField" | "MQTTIconField" | "level-indicator"
  x: number
  y: number
  width: number
  height: number
}

const calculateOptimalGridColor = (backgroundColor: string): string => {
  // Convert hex to RGB
  const hex = backgroundColor.replace("#", "")
  const r = Number.parseInt(hex.substr(0, 2), 16)
  const g = Number.parseInt(hex.substr(2, 2), 16)
  const b = Number.parseInt(hex.substr(4, 2), 16)

  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255

  // For light backgrounds, use a darker grid color
  // For dark backgrounds, use a lighter grid color
  if (luminance > 0.5) {
    // Light background - use darker grid with moderate contrast
    const gridValue = Math.max(0, Math.floor(luminance * 255 - 80))
    return `rgb(${gridValue}, ${gridValue}, ${gridValue})`
  } else {
    // Dark background - use lighter grid with moderate contrast
    const gridValue = Math.min(255, Math.floor(luminance * 255 + 120))
    return `rgb(${gridValue}, ${gridValue}, ${gridValue})`
  }
}

export function Canvas({
  screen,
  selectedObjectIds,
  onSelectObject,
  onSelectObjects,
  onUpdateObject,
  onDeleteObject,
  snapGuides,
  zoom,
  offset,
  onZoomChange,
  onOffsetChange,
  activeTool,
  onAddObject,
  onToolChange,
  selectedIconAssetId,
  onIconToolClick,
  projectAssets = [],
  topics,
  fonts, // Added fonts to destructuring
  onManageTopics,
  onCopy,
  onPaste,
  hasClipboard = false,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const [activeSnapLines, setActiveSnapLines] = useState<{ type: "vertical" | "horizontal"; position: number }[]>([])
  const [backgroundImageElement, setBackgroundImageElement] = useState<HTMLImageElement | null>(null)
  const iconImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const bdfFontCacheRef = useRef<Map<string, BDFFont>>(new Map()) // Added BDF font cache

  const [pendingFieldCreation, setPendingFieldCreation] = useState<PendingFieldCreation | null>(null)
  const [showTopicSelectionDialog, setShowTopicSelectionDialog] = useState(false)

  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)

  const SNAP_TOLERANCE = 4

  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return

      const rect = container.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      draw()
    }

    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)
    return () => window.removeEventListener("resize", resizeCanvas)
  }, [])

  useEffect(() => {
    if (screen.backgroundImageAssetId) {
      const backgroundAsset = projectAssets.find((asset) => asset.id === screen.backgroundImageAssetId)
      if (backgroundAsset && backgroundAsset.type === "image") {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          setBackgroundImageElement(img)
          draw()
        }
        img.onerror = () => {
          console.error("Failed to load background image asset:", backgroundAsset.name)
          setBackgroundImageElement(null)
        }
        img.src = backgroundAsset.data
      } else {
        console.warn("Background asset not found or not an image:", screen.backgroundImageAssetId)
        setBackgroundImageElement(null)
      }
    } else {
      setBackgroundImageElement(null)
    }
  }, [screen.backgroundImageAssetId, projectAssets])

  useEffect(() => {
    draw()
  }, [screen.objects, selectedObjectIds, hoveredObjectId, zoom, offset, dragState, backgroundImageElement, snapGuides]) // Added snapGuides to dependency array to force redraw when snap guides change

  useEffect(() => {
    // Clear the entire icon cache when assets change
    // This ensures that when asset colors are modified, icons will reload with the new colors
    iconImageCacheRef.current.clear()
    console.log("[v0] Cleared icon cache due to asset changes")
    requestAnimationFrame(() => {
      draw()
    })
  }, [projectAssets])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      // Prevent default browser zoom
      e.preventDefault()

      // Calculate zoom direction (negative deltaY = zoom in, positive = zoom out)
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1

      // Calculate new zoom level with limits (0.25x to 4x)
      const newZoom = Math.max(0.25, Math.min(4, zoom + zoomDelta))

      // Get mouse position relative to canvas
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Calculate the point in screen coordinates before zoom
      const screenX = (container.clientWidth / zoom - screen.width) / 2 + offset.x
      const screenY = (container.clientHeight / zoom - screen.height) / 2 + offset.y
      const pointX = mouseX / zoom - screenX
      const pointY = mouseY / zoom - screenY

      // Calculate new offset to keep the point under the cursor
      const newScreenX = (container.clientWidth / newZoom - screen.width) / 2
      const newScreenY = (container.clientHeight / newZoom - screen.height) / 2
      const newOffsetX = mouseX / newZoom - pointX - newScreenX
      const newOffsetY = mouseY / newZoom - pointY - newScreenY

      // Update zoom and offset
      onZoomChange(newZoom)
      onOffsetChange({ x: newOffsetX, y: newOffsetY })
    }

    // Add event listener with passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false })

    return () => {
      container.removeEventListener("wheel", handleWheel)
    }
  }, [zoom, offset, screen.width, screen.height, onZoomChange, onOffsetChange])

  const calculateSnap = useCallback(
    (
      obj: { x: number; y: number; width: number; height: number },
      otherObjects: ScreenmanObject[],
      isResize = false,
    ): SnapResult => {
      let snapX = obj.x
      let snapY = obj.y
      const snapWidth = obj.width
      const snapHeight = obj.height
      const snapLines: { type: "vertical" | "horizontal"; position: number }[] = []

      snapGuides.forEach((guide) => {
        if (guide.type === "vertical") {
          // Snap to vertical guide lines
          if (Math.abs(obj.x - guide.position) <= SNAP_TOLERANCE) {
            snapX = Math.round(guide.position)
            snapLines.push({ type: "vertical", position: guide.position })
          }
          // Snap right edge to vertical guide
          else if (Math.abs(obj.x + obj.width - guide.position) <= SNAP_TOLERANCE) {
            snapX = Math.round(guide.position - obj.width)
            snapLines.push({ type: "vertical", position: guide.position })
          }
          // Snap center to vertical guide
          else if (Math.abs(obj.x + obj.width / 2 - guide.position) <= SNAP_TOLERANCE) {
            snapX = Math.round(guide.position - obj.width / 2)
            snapLines.push({ type: "vertical", position: guide.position })
          }
        } else {
          // Snap to horizontal guide lines
          if (Math.abs(obj.y - guide.position) <= SNAP_TOLERANCE) {
            snapY = Math.round(guide.position)
            snapLines.push({ type: "horizontal", position: guide.position })
          }
          // Snap bottom edge to horizontal guide
          else if (Math.abs(obj.y + obj.height - guide.position) <= SNAP_TOLERANCE) {
            snapY = Math.round(guide.position - obj.height)
            snapLines.push({ type: "horizontal", position: guide.position })
          }
          // Snap center to horizontal guide
          else if (Math.abs(obj.y + obj.height / 2 - guide.position) <= SNAP_TOLERANCE) {
            snapY = Math.round(guide.position - obj.height / 2)
            snapLines.push({ type: "horizontal", position: guide.position })
          }
        }
      })

      return {
        x: snapX,
        y: snapY,
        width: snapWidth,
        height: snapHeight,
        snapLines,
      }
    },
    [SNAP_TOLERANCE, snapGuides],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transformation matrix
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // The container already provides the background color

    ctx.save()
    ctx.scale(zoom, zoom)

    const screenX = (canvas.width / zoom - screen.width) / 2 + offset.x
    const screenY = (canvas.height / zoom - screen.height) / 2 + offset.y
    ctx.translate(screenX, screenY)

    ctx.fillStyle = screen.backgroundColor || "#ffffff"
    ctx.fillRect(0, 0, screen.width, screen.height)

    // Draw shadow effect for the screen
    ctx.save()
    ctx.shadowColor = "rgba(0, 0, 0, 0.2)"
    ctx.shadowBlur = 8 / zoom
    ctx.shadowOffsetX = 2 / zoom
    ctx.shadowOffsetY = 2 / zoom
    ctx.fillStyle = screen.backgroundColor || "#ffffff"
    ctx.fillRect(0, 0, screen.width, screen.height)
    ctx.restore()

    // Draw background image AFTER the background color and shadow
    if (backgroundImageElement) {
      ctx.save()
      ctx.drawImage(backgroundImageElement, 0, 0, screen.width, screen.height)
      ctx.restore()
    }

    ctx.strokeStyle = "#999999"
    ctx.lineWidth = 1 / zoom
    ctx.strokeRect(0, 0, screen.width, screen.height)

    const gridColor =
      screen.gridColor || (screen.backgroundColor ? calculateOptimalGridColor(screen.backgroundColor) : "#cccccc")

    snapGuides.forEach((guide) => {
      ctx.strokeStyle = gridColor
      ctx.lineWidth = 1 / zoom // Ensure line width is exactly 1px regardless of zoom
      ctx.beginPath()

      if (guide.type === "vertical") {
        // Position at exact pixel boundary for crisp lines
        const x = Math.floor(guide.position) + 0.5
        ctx.moveTo(x, 0)
        ctx.lineTo(x, screen.height)
      } else {
        // Position at exact pixel boundary for crisp lines
        const y = Math.floor(guide.position) + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(screen.width, y)
      }

      ctx.stroke()
    })

    activeSnapLines.forEach((line) => {
      ctx.strokeStyle = "rgb(var(--canvas-snap-guide))"
      ctx.lineWidth = 1 / zoom // Ensure active snap line width is exactly 1px regardless of zoom
      ctx.beginPath()

      if (line.type === "vertical") {
        // Position at exact pixel boundary for crisp lines
        const x = Math.floor(line.position) + 0.5
        ctx.moveTo(x, 0)
        ctx.lineTo(x, screen.height)
      } else {
        // Position at exact pixel boundary for crisp lines
        const y = Math.floor(line.position) + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(screen.width, y)
      }

      ctx.stroke()
    })

    const placeholderContext = createPlaceholderContext(
      screen.name,
      screen.width,
      screen.height,
      "Screenman Project", // TODO: Pass actual project name from props
    )

    screen.objects
      .sort((a, b) => a.zIndex - b.zIndex)
      .forEach((obj) => {
        const isSelected = selectedObjectIds.includes(obj.id)
        const isHovered = obj.id === hoveredObjectId && !isSelected
        drawObject(ctx, obj, isSelected, isHovered, zoom, placeholderContext)
      })

    if (dragState?.mode === "selection-rectangle" && dragState.selectionRect) {
      const { x, y, width, height } = dragState.selectionRect

      // Draw selection rectangle background
      ctx.fillStyle = "rgba(59, 130, 246, 0.1)" // Blue with low opacity
      ctx.fillRect(x, y, width, height)

      // Draw selection rectangle border
      ctx.strokeStyle = "#3b82f6" // Blue border
      ctx.lineWidth = 1 / zoom
      ctx.setLineDash([4 / zoom, 4 / zoom]) // Dashed line
      ctx.strokeRect(x, y, width, height)
      ctx.setLineDash([]) // Reset line dash
    }

    if (dragState?.mode === "create" && dragState.creatingType) {
      const { x, y, width, height } = dragState.startObjectPos
      if (width !== 0 || height !== 0) {
        if (dragState.creatingType === "line") {
          // Draw line preview with final appearance (no dashing)
          const lineObj = screen.objects.find((obj) => obj.type === "line") || {
            properties: { color: "#000000", strokeWidth: 2, strokeStyle: "solid" },
          }

          ctx.strokeStyle = lineObj.properties.color || "#000000"
          ctx.lineWidth = (lineObj.properties.strokeWidth || 2) / zoom

          // Apply stroke style if specified
          if (lineObj.properties.strokeStyle === "dashed") {
            ctx.setLineDash([8 / zoom, 4 / zoom])
          } else if (lineObj.properties.strokeStyle === "dotted") {
            ctx.setLineDash([2 / zoom, 4 / zoom])
          } else {
            ctx.setLineDash([]) // Solid line
          }

          ctx.beginPath()
          ctx.moveTo(dragState.startPos.x, dragState.startPos.y)
          ctx.lineTo(dragState.startPos.x + width, dragState.startPos.y + height)
          ctx.stroke()
          ctx.setLineDash([]) // Reset line dash
        } else if (Math.abs(width) > 0 && Math.abs(height) > 0) {
          if (dragState.creatingType === "MqttDataField") {
            // Draw field preview with final appearance
            ctx.fillStyle = "#ffffff" // Default field background
            ctx.fillRect(x, y, width, height)

            ctx.strokeStyle = "#cccccc" // Default field border
            ctx.lineWidth = 1
            ctx.strokeRect(x, y, width, height)

            // No text preview needed - field will be empty until user selects a topic
          } else if (dragState.creatingType === "MQTTIconField") {
            // Draw field preview with final appearance
            ctx.fillStyle = "#ffffff" // Default field background
            ctx.fillRect(x, y, width, height)

            ctx.strokeStyle = "#cccccc" // Default field border
            ctx.lineWidth = 1
            ctx.strokeRect(x, y, width, height)

            // Add placeholder text preview
            ctx.fillStyle = "#000000"
            ctx.font = `14px Arial`
            ctx.textAlign = "left"
            ctx.textBaseline = "middle"
            const previewText = "🔥 Icon Field"
            ctx.fillText(previewText, x + 8, y + height / 2)
          } else if (dragState.creatingType === "box") {
            // Draw box preview with final appearance
            ctx.fillStyle = "#e5e5e5" // Default box fill
            ctx.fillRect(x, y, width, height)

            ctx.strokeStyle = "#000000" // Default box stroke
            ctx.lineWidth = 1 / zoom
            ctx.strokeRect(x, y, width, height)
          } else if (dragState.creatingType === "label") {
            // Draw label preview with final appearance
            ctx.fillStyle = "#ffffff" // White background like field
            ctx.fillRect(x, y, width, height)

            ctx.strokeStyle = "#cccccc" // Light gray border like field
            ctx.lineWidth = 1 / zoom
            ctx.strokeRect(x, y, width, height)

            ctx.fillStyle = "#000000"
            ctx.font = `14px Arial`
            ctx.textAlign = "left"
            ctx.textBaseline = "top"

            const text = "Label"
            const lines = text.split("\n")
            const lineHeight = 14 * 1.2

            // Measure font metrics to get ascent
            const metrics = ctx.measureText("M")
            const ascent = metrics.actualBoundingBoxAscent || 14 * 0.8 // Fallback to ~80% of font size

            lines.forEach((line, index) => {
              ctx.fillText(line, x, y + index * lineHeight)
            })
          } else if (dragState.creatingType === "icon") {
            // Draw icon preview with final appearance
            ctx.fillStyle = "#000000"
            ctx.font = `${Math.min(width, height) * 0.6}px Arial`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText("📱", x + width / 2, y + height / 2)
          } else if (dragState.creatingType === "level-indicator") {
            // Draw level indicator preview
            ctx.fillStyle = "#ffffff" // Default background
            ctx.fillRect(x, y, width, height)
            ctx.strokeStyle = "#cccccc" // Default border
            ctx.lineWidth = 1 / zoom
            ctx.strokeRect(x, y, width, height)

            // Placeholder text
            ctx.fillStyle = "#000000"
            ctx.font = `12px Arial`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText("50%", x + width / 2, y + height / 2)
          }
        }
      }
    }

    ctx.restore()
  }, [
    screen,
    selectedObjectIds,
    hoveredObjectId,
    snapGuides,
    activeSnapLines,
    zoom,
    offset,
    dragState,
    backgroundImageElement,
  ])

  const formatFieldValue = (value: string, properties: Record<string, any>): string => {
    const displayAs = properties.displayAs || "Display as-is"

    // For number formatting
    if (displayAs === "Formatted Number") {
      let formattedValue = value

      // Apply number formatting if the value is numeric
      const numericValue = Number.parseFloat(value)
      if (!isNaN(numericValue)) {
        // Apply decimal places formatting
        if (typeof properties.numberOfDecimals === "number") {
          formattedValue = numericValue.toFixed(properties.numberOfDecimals)
        } else {
          formattedValue = numericValue.toString()
        }

        // Apply thousands separator
        if (properties.thousandsSeparator) {
          const parts = formattedValue.split(".")
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!d))/g, properties.thousandsSeparator)
          formattedValue = parts.join(".")
        }

        // Apply prefix and postfix
        const prefix = properties.prefix || ""
        const postfix = properties.postfix || ""
        return `${prefix}${formattedValue}${postfix}`
      }

      return formattedValue
    }

    // Default: Display as-is
    return value || "No topic selected"
  }

  const getPreviewValueFromTopic = (topicId: string): string => {
    if (!topicId) return "No topic selected"

    const topic = topics.find((t) => t.id === topicId)
    if (!topic) return "No topic selected"

    if (!topic.examples || topic.examples.length === 0) {
      return `Topic ${topic.name || topic.topic} has no Examples`
    }

    // Take the first example from the array
    const firstExample = topic.examples[0]?.trim()
    return firstExample || `Topic ${topic.name || topic.topic} has no Examples`
  }

  const calculateLevelIndicatorFill = (value: number, calibrationPoints: any[]): number => {
    if (!calibrationPoints || calibrationPoints.length === 0) {
      return 0
    }

    // Sort calibration points by value
    const sortedPoints = [...calibrationPoints].sort((a, b) => a.value - b.value)

    // If value is below the lowest point, return 0
    if (value <= sortedPoints[0].value) {
      return sortedPoints[0].barSizePercent
    }

    // If value is above the highest point, return 100
    if (value >= sortedPoints[sortedPoints.length - 1].value) {
      return sortedPoints[sortedPoints.length - 1].barSizePercent
    }

    // Find the two points to interpolate between
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const point1 = sortedPoints[i]
      const point2 = sortedPoints[i + 1]

      if (value >= point1.value && value <= point2.value) {
        // Linear interpolation
        const ratio = (value - point1.value) / (point2.value - point1.value)
        return point1.barSizePercent + ratio * (point2.barSizePercent - point1.barSizePercent)
      }
    }

    return 0
  }

  const drawObject = (
    ctx: CanvasRenderingContext2D,
    obj: ScreenmanObject,
    isSelected: boolean,
    isHovered: boolean,
    zoom: number,
    placeholderContext?: ReturnType<typeof createPlaceholderContext>,
  ) => {
    switch (obj.type) {
      case "box":
        ctx.fillStyle = obj.properties.fillColor || "#e5e5e5"
        if (obj.properties.cornerRadius) {
          drawRoundedRect(ctx, obj.x, obj.y, obj.width, obj.height, obj.properties.cornerRadius)
          ctx.fill()
        } else {
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
        }

        if (obj.properties.strokeColor && obj.properties.strokeWidth > 0) {
          ctx.strokeStyle = obj.properties.strokeColor
          ctx.lineWidth = (obj.properties.strokeWidth || 1) / zoom
          if (obj.properties.cornerRadius) {
            drawRoundedRect(ctx, obj.x, obj.y, obj.width, obj.height, obj.properties.cornerRadius)
            ctx.stroke()
          } else {
            ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
          }
        }
        break

      case "label":
        const labelBgColor = obj.properties.backgroundColor || "#ffffff"
        if (labelBgColor !== "transparent") {
          ctx.fillStyle = labelBgColor
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
        }

        const labelBorderColor = obj.properties.borderColor || "#cccccc"
        if (labelBorderColor !== "transparent") {
          ctx.strokeStyle = labelBorderColor
          ctx.lineWidth = 1 / zoom
          ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
        }

        const rawText = obj.properties.text || "Label"
        const text = placeholderContext ? processPlaceholders(rawText, placeholderContext) : rawText
        const lines = text.split("\n")

        // Check if label has a fontId and try to use BDF font
        const fontId = obj.properties.fontId
        let bdfFont: BDFFont | null = null

        if (fontId) {
          // Try to get from cache first
          bdfFont = bdfFontCacheRef.current.get(fontId) || null

          // If not in cache, try to parse and cache it
          if (!bdfFont) {
            const font = fonts.find((f) => f.id === fontId)
            if (font && font.data) {
              try {
                bdfFont = new BDFFont(font.data)
                bdfFontCacheRef.current.set(fontId, bdfFont)
              } catch (error) {
                console.error("[v0] Failed to parse BDF font:", error)
                bdfFont = null
              }
            }
          }
        }

        ctx.fillStyle = obj.properties.color || "#000000"

        if (bdfFont) {
          // Use BDF font rendering
          const fontHeight = bdfFont.FONTBOUNDINGBOX?.h || 16
          const lineHeight = fontHeight * 1.2

          lines.forEach((line, index) => {
            // Calculate text width for alignment
            const textMetrics = bdfFont!.measureText(line)
            let textX = obj.x

            // Handle text alignment
            const textAlign = obj.properties.textAlign || "left"
            if (textAlign === "center") {
              textX = obj.x + (obj.width - textMetrics.width) / 2
            } else if (textAlign === "right") {
              textX = obj.x + obj.width - textMetrics.width
            }

            // Get font ascent from BDF font properties
            const fontAscent = bdfFont!.properties["FONT_ASCENT"] || bdfFont!.properties["ASCENT"] || 14

            const baselineY = obj.y + fontAscent + index * lineHeight

            // Draw the text using BDF font
            bdfFont!.drawText(ctx, line, textX, baselineY)
          })
        } else {
          // Fall back to standard font rendering
          ctx.font = `${obj.properties.fontWeight || "normal"} ${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
          ctx.textAlign = (obj.properties.textAlign || "left") as CanvasTextAlign
          ctx.textBaseline = "top"

          const lineHeight = (obj.properties.fontSize || 14) * 1.2

          const metrics = ctx.measureText("M")
          const fontSize = obj.properties.fontSize || 14
          const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8 // Fallback to ~80% of font size

          let textX = obj.x // No padding for left alignment
          if (obj.properties.textAlign === "center") {
            textX = obj.x + obj.width / 2
          } else if (obj.properties.textAlign === "right") {
            textX = obj.x + obj.width // No padding for right alignment
          }

          lines.forEach((line, index) => {
            ctx.fillText(line, textX, obj.y + index * lineHeight)
          })
        }
        break

      case "MqttDataField":
      case "MQTTIconField":
      case "field":
        const fieldBgColor = obj.properties.backgroundColor || "#ffffff"
        if (fieldBgColor !== "transparent") {
          ctx.fillStyle = fieldBgColor
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
        }

        const fieldBorderColor = obj.properties.borderColor || "#cccccc"
        if (fieldBorderColor !== "transparent") {
          ctx.strokeStyle = fieldBorderColor
          ctx.lineWidth = 1
          ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
        }

        const displayAs = obj.properties.displayAs || "Display as-is"
        // Updated to use topicId from properties
        const rawFieldValue =
          getPreviewValueFromTopic(obj.properties.topicId) || obj.properties.topicId || "No topic selected"

        const mqttFontId = obj.properties.fontId
        let mqttBdfFont: BDFFont | null = null

        if (mqttFontId) {
          // Try to get from cache first
          mqttBdfFont = bdfFontCacheRef.current.get(mqttFontId) || null

          // If not in cache, try to parse and cache it
          if (!mqttBdfFont) {
            const mqttFont = fonts.find((f) => f.id === mqttFontId)
            if (mqttFont && mqttFont.data) {
              try {
                mqttBdfFont = new BDFFont(mqttFont.data)
                bdfFontCacheRef.current.set(mqttFontId, mqttBdfFont)
              } catch (error) {
                console.error("[v0] Failed to parse BDF font for MQTT field:", error)
                mqttBdfFont = null
              }
            }
          }
        }

        // Handle icon-based display modes
        if (obj.type === "MQTTIconField" || displayAs === "Display as Icon" || displayAs === "Show Range Icon") {
          // Find matching value-icon pair
          const valueIconPairs = obj.properties.valueIconPairs || []
          const numericValue = Number.parseFloat(rawFieldValue)
          const matchingPair = valueIconPairs.find((pair: any) => {
            if (pair.comparisonOperator && pair.value !== undefined) {
              // New format: comparison operator matching
              const operator = pair.comparisonOperator
              const compareValue = pair.value

              if (operator === "=") {
                // For equality, support both text and numeric comparison
                return (
                  rawFieldValue === String(compareValue) ||
                  (!isNaN(numericValue) && numericValue === Number(compareValue))
                )
              } else {
                // For other operators, only numeric comparison
                if (isNaN(numericValue)) return false
                const numCompareValue = Number(compareValue)

                switch (operator) {
                  case ">":
                    return numericValue > numCompareValue
                  case ">=":
                    return numericValue >= numCompareValue
                  case "<":
                    return numericValue < numCompareValue
                  case "<=":
                    return numericValue <= numCompareValue
                  default:
                    return false
                }
              }
            } else if (pair.ifGreaterOrEqualThan !== undefined && pair.andLessThan !== undefined) {
              // Legacy format: range match (keep for backward compatibility)
              if (isNaN(numericValue)) return false
              return numericValue >= pair.ifGreaterOrEqualThan && numericValue < pair.andLessThan
            } else if (pair.value !== undefined) {
              // Legacy format: exact value match (keep for backward compatibility)
              return pair.value === rawFieldValue
            }
            return false
          })

          if (matchingPair && matchingPair.thenShowIcon) {
            // Render icon from asset
            const asset = projectAssets.find((a) => a.id === matchingPair.thenShowIcon)
            if (asset && asset.type === "icon" && asset.data) {
              // Use similar icon rendering logic as icon objects
              const cacheKey = matchingPair.thenShowIcon
              let img = iconImageCacheRef.current.get(cacheKey)

              if (!img) {
                img = new Image()
                img.crossOrigin = "anonymous"
                iconImageCacheRef.current.set(cacheKey, img)

                img.onload = () => {
                  if (img!.complete && img!.naturalWidth > 0) {
                    requestAnimationFrame(() => {
                      draw()
                    })
                  }
                }

                img.onerror = () => {
                  iconImageCacheRef.current.delete(cacheKey)
                }

                let svgContent = asset.data
                if (asset.data.startsWith("data:image/svg+xml;base64,")) {
                  svgContent = atob(asset.data.split(",")[1])
                } else if (asset.data.startsWith("data:image/svg+xml,")) {
                  svgContent = decodeURIComponent(asset.data.split(",")[1])
                } else {
                  svgContent = asset.data
                }

                const modifiedDataUrl = `data:image/svg+xml;base64,${btoa(svgContent)}`
                img.src = modifiedDataUrl
              }

              if (img.complete && img.naturalWidth > 0) {
                try {
                  // Center the icon in the field
                  const iconSize = Math.min(obj.width - 16, obj.height - 16) // Leave 8px padding on each side
                  const iconX = obj.x + (obj.width - iconSize) / 2
                  const iconY = obj.y + (obj.height - iconSize) / 2
                  ctx.drawImage(img, iconX, iconY, iconSize, iconSize)
                } catch (error) {
                  if (obj.type !== "MQTTIconField") {
                    if (mqttBdfFont) {
                      ctx.fillStyle = obj.properties.textColor || "#000000"
                      const textMetrics = mqttBdfFont.measureText(rawFieldValue)
                      const fontAscent = mqttBdfFont.properties["FONT_ASCENT"] || mqttBdfFont.properties["ASCENT"] || 14
                      const textX = obj.x + (obj.width - textMetrics.width) / 2
                      const baselineY = obj.y + fontAscent
                      mqttBdfFont.drawText(ctx, rawFieldValue, textX, baselineY)
                    } else {
                      ctx.fillStyle = obj.properties.textColor || "#000000"
                      ctx.font = `${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
                      ctx.textAlign = "center"
                      ctx.textBaseline = "middle"
                      ctx.fillText(rawFieldValue, obj.x + obj.width / 2, obj.y + obj.height / 2)
                    }
                  }
                }
              } else {
                if (obj.type !== "MQTTIconField") {
                  if (mqttBdfFont) {
                    ctx.fillStyle = obj.properties.textColor || "#000000"
                    const textMetrics = mqttBdfFont.measureText(rawFieldValue)
                    const fontAscent = mqttBdfFont.properties["FONT_ASCENT"] || mqttBdfFont.properties["ASCENT"] || 14
                    const textX = obj.x + (obj.width - textMetrics.width) / 2
                    const baselineY = obj.y + fontAscent
                    mqttBdfFont.drawText(ctx, rawFieldValue, textX, baselineY)
                  } else {
                    ctx.fillStyle = obj.properties.textColor || "#000000"
                    ctx.font = `${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
                    ctx.textAlign = "center"
                    ctx.textBaseline = "middle"
                    ctx.fillText(rawFieldValue, obj.x + obj.width / 2, obj.y + obj.height / 2)
                  }
                }
              }
            } else {
              if (obj.type !== "MQTTIconField") {
                if (mqttBdfFont) {
                  ctx.fillStyle = obj.properties.textColor || "#000000"
                  const textMetrics = mqttBdfFont.measureText(rawFieldValue)
                  const fontAscent = mqttBdfFont.properties["FONT_ASCENT"] || mqttBdfFont.properties["ASCENT"] || 14
                  const textX = obj.x + (obj.width - textMetrics.width) / 2
                  const baselineY = obj.y + fontAscent
                  mqttBdfFont.drawText(ctx, rawFieldValue, textX, baselineY)
                } else {
                  ctx.fillStyle = obj.properties.textColor || "#000000"
                  ctx.font = `${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
                  ctx.textAlign = "center"
                  ctx.textBaseline = "middle"
                  ctx.fillText(rawFieldValue, obj.x + obj.width / 2, obj.y + obj.height / 2)
                }
              }
            }
          } else {
            if (obj.type === "MQTTIconField") {
              // No matching rule found - render nothing (field stays empty)
            } else {
              // Display as-is or no matching icon
              if (mqttBdfFont) {
                ctx.fillStyle = obj.properties.textColor || "#000000"
                const textMetrics = mqttBdfFont.measureText(rawFieldValue)
                const fontAscent = mqttBdfFont.properties["FONT_ASCENT"] || mqttBdfFont.properties["ASCENT"] || 14
                const textX = obj.x + (obj.width - textMetrics.width) / 2
                const baselineY = obj.y + fontAscent
                mqttBdfFont.drawText(ctx, rawFieldValue, textX, baselineY)
              } else {
                ctx.fillStyle = obj.properties.textColor || "#000000"
                ctx.font = `${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText(rawFieldValue, obj.x + obj.width / 2, obj.y + obj.height / 2)
              }
            }
          }
        } else {
          // Text-based display modes (Display as-is, Formatted Number)
          const formattedFieldValue = formatFieldValue(rawFieldValue, obj.properties)

          if (mqttBdfFont) {
            ctx.fillStyle = obj.properties.textColor || "#000000"
            const textMetrics = mqttBdfFont.measureText(formattedFieldValue)
            const fontAscent = mqttBdfFont.properties["FONT_ASCENT"] || mqttBdfFont.properties["ASCENT"] || 14

            let fieldTextX = obj.x
            const textAlign = obj.properties.textAlign || "left"
            if (textAlign === "center") {
              fieldTextX = obj.x + (obj.width - textMetrics.width) / 2
            } else if (textAlign === "right") {
              fieldTextX = obj.x + obj.width - textMetrics.width
            }

            const baselineY = obj.y + fontAscent
            mqttBdfFont.drawText(ctx, formattedFieldValue, fieldTextX, baselineY)
          } else {
            // Fallback to standard font rendering
            ctx.fillStyle = obj.properties.textColor || "#000000"
            ctx.font = `${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
            ctx.textAlign = (obj.properties.textAlign || "left") as CanvasTextAlign
            ctx.textBaseline = "middle"

            let fieldTextX = obj.x + 8 // Default left alignment with padding
            if (obj.properties.textAlign === "center") {
              fieldTextX = obj.x + obj.width / 2
            } else if (obj.properties.textAlign === "right") {
              fieldTextX = obj.x + obj.width - 8 // Right alignment with padding
            }

            ctx.fillText(formattedFieldValue, fieldTextX, obj.y + obj.height / 2)
          }
        }
        break

      case "line":
        ctx.strokeStyle = obj.properties.color || "#000000"
        ctx.lineWidth = (obj.properties.strokeWidth || 1) / zoom

        if (obj.properties.strokeStyle === "dashed") {
          ctx.setLineDash([8 / zoom, 4 / zoom])
        } else if (obj.properties.strokeStyle === "dotted") {
          ctx.setLineDash([2 / zoom, 4 / zoom])
        }

        ctx.beginPath()
        ctx.moveTo(obj.x, obj.y)
        ctx.lineTo(obj.x + obj.width, obj.y + obj.height)
        ctx.stroke()
        ctx.setLineDash([])
        break

      case "icon":
        if (obj.properties.backgroundColor && obj.properties.backgroundColor !== "transparent") {
          ctx.fillStyle = obj.properties.backgroundColor
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
        }

        if (obj.properties.assetId) {
          const asset = projectAssets.find((a) => a.id === obj.properties.assetId)

          if (asset && asset.type === "icon" && asset.data) {
            // The asset data now contains the final SVG with any color changes applied
            const cacheKey = asset.id

            let img = iconImageCacheRef.current.get(cacheKey)

            if (!img) {
              img = new Image()
              img.crossOrigin = "anonymous"

              iconImageCacheRef.current.set(cacheKey, img)

              img.onload = () => {
                if (img!.complete && img!.naturalWidth > 0) {
                  requestAnimationFrame(() => {
                    draw()
                  })
                }
              }

              img.onerror = () => {
                iconImageCacheRef.current.delete(cacheKey)
              }

              // Use the asset data directly - it already contains any color modifications
              let svgContent = asset.data
              if (asset.data.startsWith("data:image/svg+xml;base64,")) {
                svgContent = atob(asset.data.split(",")[1])
              } else if (asset.data.startsWith("data:image/svg+xml,")) {
                svgContent = decodeURIComponent(asset.data.split(",")[1])
              } else {
                svgContent = asset.data
              }

              const modifiedDataUrl = `data:image/svg+xml;base64,${btoa(svgContent)}`
              img.src = modifiedDataUrl
            }

            if (img.complete && img.naturalWidth > 0) {
              try {
                ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height)
              } catch (error) {}
            }
          }
        }
        break

      case "level-indicator":
        const levelBgColor = obj.properties.backgroundColor || "#ffffff"
        if (levelBgColor !== "transparent") {
          ctx.fillStyle = levelBgColor
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
        }

        const levelBorderColor = obj.properties.borderColor || "#cccccc"
        if (levelBorderColor !== "transparent") {
          ctx.strokeStyle = levelBorderColor
          ctx.lineWidth = 1 / zoom
          ctx.strokeRect(obj.x, obj.y, obj.width, obj.height)
        }

        // Get current value from topic
        // Updated to use topicId from properties
        const rawLevelValue = getPreviewValueFromTopic(obj.properties.topicId) || "50"
        const numericLevelValue = Number.parseFloat(rawLevelValue) || 0

        // Calculate fill percentage based on calibration points
        const calibrationPoints = obj.properties.calibrationPoints || [
          { value: 0, barSizePercent: 0 },
          { value: 100, barSizePercent: 100 },
        ]
        const fillPercent = calculateLevelIndicatorFill(numericLevelValue, calibrationPoints)

        // Draw the level indicator bar
        const barDirection = obj.properties.barDirection || "left-to-right"
        const fillColor = obj.properties.fillColor || "#4CAF50"
        const padding = 4

        ctx.fillStyle = fillColor

        const innerX = obj.x + padding
        const innerY = obj.y + padding
        const innerWidth = obj.width - padding * 2
        const innerHeight = obj.height - padding * 2

        switch (barDirection) {
          case "left-to-right":
            const fillWidth = (innerWidth * fillPercent) / 100
            ctx.fillRect(innerX, innerY, fillWidth, innerHeight)
            break
          case "right-to-left":
            const rightFillWidth = (innerWidth * fillPercent) / 100
            ctx.fillRect(innerX + innerWidth - rightFillWidth, innerY, rightFillWidth, innerHeight)
            break
          case "bottom-to-top":
            const fillHeight = (innerHeight * fillPercent) / 100
            ctx.fillRect(innerX, innerY + innerHeight - fillHeight, innerWidth, fillHeight)
            break
          case "top-to-bottom":
            const topFillHeight = (innerHeight * fillPercent) / 100
            ctx.fillRect(innerX, innerY, innerWidth, topFillHeight)
            break
        }

        // Draw the value text
        const levelFontId = obj.properties.fontId
        let levelBdfFont: BDFFont | null = null

        if (levelFontId) {
          // Try to get from cache first
          levelBdfFont = bdfFontCacheRef.current.get(levelFontId) || null

          // If not in cache, try to parse and cache it
          if (!levelBdfFont) {
            const levelFont = fonts.find((f) => f.id === levelFontId)
            if (levelFont && levelFont.data) {
              try {
                levelBdfFont = new BDFFont(levelFont.data)
                bdfFontCacheRef.current.set(levelFontId, levelBdfFont)
              } catch (error) {
                console.error("[v0] Failed to parse BDF font for level indicator:", error)
                levelBdfFont = null
              }
            }
          }
        }

        const displayValue = obj.properties.displayValue || "value"
        if (displayValue !== "none") {
          const displayText = displayValue === "percentage" ? `${Math.round(fillPercent)}%` : rawLevelValue

          ctx.fillStyle = obj.properties.textColor || "#000000"

          if (levelBdfFont) {
            const textMetrics = levelBdfFont.measureText(displayText)
            const fontAscent = levelBdfFont.properties["FONT_ASCENT"] || levelBdfFont.properties["ASCENT"] || 14
            const textX = obj.x + (obj.width - textMetrics.width) / 2
            const baselineY = obj.y + obj.height / 2 + fontAscent / 2

            levelBdfFont.drawText(ctx, displayText, textX, baselineY)
          } else {
            // Fallback to canvas text rendering
            ctx.font = `${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(displayText, obj.x + obj.width / 2, obj.y + obj.height / 2)
          }
        }

        break
    }

    if (isHovered) {
      if (obj.type === "line") {
        ctx.strokeStyle = "rgba(var(--canvas-selection) / 0.5)"
        ctx.lineWidth = Math.max(3 / zoom, (obj.properties.strokeWidth || 1) / zoom + 2 / zoom) // Make it slightly thicker than the original line

        if (obj.properties.strokeStyle === "dashed") {
          ctx.setLineDash([8 / zoom, 4 / zoom])
        } else if (obj.properties.strokeStyle === "dotted") {
          ctx.setLineDash([2 / zoom, 4 / zoom])
        } else {
          ctx.setLineDash([])
        }

        ctx.beginPath()
        ctx.moveTo(obj.x, obj.y)
        ctx.lineTo(obj.x + obj.width, obj.y + obj.height)
        ctx.stroke()
        ctx.setLineDash([]) // Reset line dash
      } else {
        ctx.strokeStyle = "rgb(var(--canvas-selection) / 0.5)"
        ctx.lineWidth = 1 / zoom
        ctx.strokeRect(obj.x - 1 / zoom, obj.y - 1 / zoom, obj.width + 2 / zoom, obj.height + 2 / zoom)
      }
    }

    if (isSelected) {
      if (obj.type === "line") {
        const handleSize = 8 / zoom
        const handles = getLineHandles(obj, handleSize)

        ctx.fillStyle = "#3b82f6" // Blue color for better visibility
        ctx.strokeStyle = "#ffffff" // White border
        ctx.lineWidth = 1 / zoom

        handles.forEach((handle) => {
          ctx.fillRect(handle.x, handle.y, handleSize, handleSize)
          ctx.strokeRect(handle.x, handle.y, handleSize, handleSize)
        })
      } else {
        const handleSize = 8 / zoom
        const handles = getResizeHandles(obj, handleSize)

        ctx.fillStyle = "#3b82f6" // Blue color for better visibility
        ctx.strokeStyle = "#ffffff" // White border
        ctx.lineWidth = 1 / zoom

        handles.forEach((handle) => {
          ctx.fillRect(handle.x, handle.y, handleSize, handleSize)
          ctx.strokeRect(handle.x, handle.y, handleSize, handleSize)
        })
      }
    }
  }

  const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ) => {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  const getResizeHandles = (obj: ScreenmanObject, handleSize: number) => {
    const half = handleSize / 2
    return [
      { x: obj.x - half, y: obj.y - half, handle: "nw" as ResizeHandle },
      { x: obj.x + obj.width - half, y: obj.y - half, handle: "ne" as ResizeHandle },
      { x: obj.x + obj.width - half, y: obj.y + obj.height - half, handle: "se" as ResizeHandle },
      { x: obj.x - half, y: obj.y + obj.height - half, handle: "sw" as ResizeHandle },
    ]
  }

  const getLineHandles = (obj: ScreenmanObject, handleSize: number) => {
    const half = handleSize / 2
    return [
      { x: obj.x - half, y: obj.y - half, handle: "start" as LineHandle },
      { x: obj.x + obj.width - half, y: obj.y + obj.height - half, handle: "end" as LineHandle },
    ]
  }

  const isPointOnLine = (lineObj: ScreenmanObject, x: number, y: number, tolerance = 5): boolean => {
    if (lineObj.type !== "line") return false

    const x1 = lineObj.x
    const y1 = lineObj.y
    const x2 = lineObj.x + lineObj.width
    const y2 = lineObj.y + lineObj.height

    const A = x - x1
    const B = y - y1
    const C = x2 - x1
    const D = y2 - y1

    const dot = A * C + B * D
    const lenSq = C * C + D * D

    if (lenSq === 0) {
      return Math.sqrt(A * A + B * B) <= tolerance / zoom
    }

    const param = dot / lenSq

    let xx, yy

    if (param < 0) {
      xx = x1
      yy = y1
    } else if (param > 1) {
      xx = x2
      yy = y2
    } else {
      xx = x1 + param * C
      yy = y1 + param * D
    }

    const dx = x - xx
    const dy = y - yy
    return Math.sqrt(dx * dx + dy * dy) <= tolerance / zoom
  }

  const findObjectAt = (x: number, y: number) => {
    return [...screen.objects]
      .sort((a, b) => b.zIndex - a.zIndex)
      .find((obj) => {
        if (obj.type === "line") {
          return isPointOnLine(obj, x, y)
        } else {
          return x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height
        }
      })
  }

  const findResizeHandle = (obj: ScreenmanObject, x: number, y: number): ResizeHandle | null => {
    const handleSize = 8 / zoom
    const handles = getResizeHandles(obj, handleSize)

    for (const handle of handles) {
      if (x >= handle.x && x <= handle.x + handleSize && y >= handle.y && y <= handle.y + handleSize) {
        return handle.handle
      }
    }

    return null
  }

  const findLineHandle = (obj: ScreenmanObject, x: number, y: number): LineHandle | null => {
    if (obj.type !== "line") return null

    const handleSize = 8 / zoom
    const handles = getLineHandles(obj, handleSize)

    for (const handle of handles) {
      const centerX = handle.x + handleSize / 2
      const centerY = handle.y + handleSize / 2
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
      if (distance <= handleSize / 2) {
        return handle.handle
      }
    }

    return null
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCanvasCoordinates(e.clientX, e.clientY)
    const isCtrlOrCmd = e.ctrlKey || e.metaKey
    const isShift = e.shiftKey

    if (activeTool === "icon") {
      if (onIconToolClick) {
        onIconToolClick(coords)
      }
      return
    }

    if (activeTool !== "select") {
      setDragState({
        mode: "create",
        objectId: null,
        startPos: coords,
        startObjectPos: { x: coords.x, y: coords.y, width: 0, height: 0 },
        creatingType: activeTool,
      })
      return
    }

    const clickedObject = findObjectAt(coords.x, coords.y)

    if (clickedObject) {
      const isAlreadySelected = selectedObjectIds.includes(clickedObject.id)

      if (isCtrlOrCmd || isShift) {
        // Modifier key pressed - add/remove from selection
        onSelectObject(clickedObject.id, true)
      } else if (!isAlreadySelected) {
        // No modifier key and object not selected - single select it
        onSelectObject(clickedObject.id, false)
      }
      // If no modifier key but object is already selected, preserve the current selection for dragging

      // Only allow dragging/resizing if this object is selected (either already or just selected)
      const willBeSelected = isAlreadySelected || !(isCtrlOrCmd || isShift)
      if (willBeSelected) {
        if (clickedObject.type === "line") {
          const lineHandle = findLineHandle(clickedObject, coords.x, coords.y)
          if (lineHandle) {
            setDragState({
              mode: "line-endpoint",
              objectId: clickedObject.id,
              startPos: coords,
              startObjectPos: {
                x: clickedObject.x,
                y: clickedObject.y,
                width: clickedObject.width,
                height: clickedObject.height,
              },
              lineHandle,
            })
            return
          }
        } else {
          const resizeHandle = findResizeHandle(clickedObject, coords.x, coords.y)
          if (resizeHandle) {
            setDragState({
              mode: "resize",
              objectId: clickedObject.id,
              startPos: coords,
              startObjectPos: {
                x: clickedObject.x,
                y: clickedObject.y,
                width: clickedObject.width,
                height: clickedObject.height,
              },
              resizeHandle,
            })
            return
          }
        }

        setDragState({
          mode: "select",
          objectId: clickedObject.id,
          startPos: coords,
          startObjectPos: {
            x: clickedObject.x,
            y: clickedObject.y,
            width: clickedObject.width,
            height: clickedObject.height,
          },
        })
      }
    } else {
      if (isCtrlOrCmd || isShift) {
        // Don't clear selection when using modifier keys on empty space
        return
      } else {
        onSelectObject(null)
        setDragState({
          mode: "selection-rectangle",
          objectId: null,
          startPos: coords,
          startObjectPos: { x: coords.x, y: coords.y, width: 0, height: 0 },
          selectionRect: { x: coords.x, y: coords.y, width: 0, height: 0 },
        })
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const coords = getCanvasCoordinates(e.clientX, e.clientY)

    if (!dragState) {
      const hoveredObject = findObjectAt(coords.x, coords.y)
      setHoveredObjectId(hoveredObject?.id || null)

      const canvas = canvasRef.current
      if (!canvas) return

      if (activeTool !== "select" && activeTool !== "background") {
        canvas.style.cursor = "crosshair"
      } else if (hoveredObject && selectedObjectIds.includes(hoveredObject.id)) {
        if (hoveredObject.type === "line") {
          const lineHandle = findLineHandle(hoveredObject, coords.x, coords.y)
          if (lineHandle) {
            canvas.style.cursor = "grab"
          } else {
            canvas.style.cursor = "move"
          }
        } else {
          const resizeHandle = findResizeHandle(hoveredObject, coords.x, coords.y)
          if (resizeHandle) {
            const cursors: Record<ResizeHandle, string> = {
              nw: "nw-resize",
              ne: "ne-resize",
              sw: "sw-resize",
              se: "se-resize",
            }
            canvas.style.cursor = cursors[resizeHandle]
          } else {
            canvas.style.cursor = "move"
          }
        }
      } else if (hoveredObject) {
        canvas.style.cursor = "pointer"
      } else {
        canvas.style.cursor = "default"
      }
      return
    }

    const deltaX = coords.x - dragState.startPos.x
    const deltaY = coords.y - dragState.startPos.y

    const dragThreshold = 3 / zoom // 3 pixels at current zoom level
    const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    if (dragState.mode === "selection-rectangle") {
      const width = deltaX
      const height = deltaY
      const x = Math.min(dragState.startPos.x, coords.x)
      const y = Math.min(dragState.startPos.y, coords.y)

      setDragState({
        ...dragState,
        selectionRect: {
          x,
          y,
          width: Math.abs(width),
          height: Math.abs(height),
        },
      })
      return
    }

    if (dragState.mode === "create" && dragState.creatingType) {
      if (dragState.creatingType === "line") {
        setDragState({
          ...dragState,
          startObjectPos: {
            x: dragState.startPos.x,
            y: dragState.startPos.y,
            width: deltaX,
            height: deltaY,
          },
        })
      } else {
        const width = Math.abs(deltaX)
        const height = Math.abs(deltaY)
        const x = Math.min(dragState.startPos.x, coords.x)
        const y = Math.min(dragState.startPos.y, coords.y)

        setDragState({
          ...dragState,
          startObjectPos: { x, y, width, height },
        })
      }
    } else if (dragState.mode === "select" && dragState.objectId && dragDistance > dragThreshold) {
      setDragState({
        ...dragState,
        mode: "drag",
      })
    } else if (dragState.mode === "drag" && dragState.objectId) {
      const selectedObjects = screen.objects.filter((obj) => selectedObjectIds.includes(obj.id))
      const draggedObject = selectedObjects.find((obj) => obj.id === dragState.objectId)

      if (draggedObject) {
        const rawX = dragState.startObjectPos.x + deltaX
        const rawY = dragState.startObjectPos.y + deltaY

        const otherObjects = screen.objects.filter((obj) => !selectedObjectIds.includes(obj.id))
        const snapResult = calculateSnap(
          { x: rawX, y: rawY, width: dragState.startObjectPos.width, height: dragState.startObjectPos.height },
          otherObjects,
        )

        const newX = Math.round(Math.max(0, Math.min(screen.width - dragState.startObjectPos.width, snapResult.x)))
        const newY = Math.round(Math.max(0, Math.min(screen.height - dragState.startObjectPos.height, snapResult.y)))

        // Calculate the offset for this specific object
        const offsetX = newX - draggedObject.x
        const offsetY = newY - draggedObject.y

        console.log("[v0] Multi-selection drag:", {
          selectedCount: selectedObjects.length,
          draggedObjectId: dragState.objectId,
          offsetX,
          offsetY,
          selectedObjectIds: selectedObjectIds,
        })

        setActiveSnapLines(snapResult.snapLines)

        // Update all selected objects with the same offset
        selectedObjects.forEach((obj) => {
          const constrainedX = Math.max(0, Math.min(screen.width - obj.width, obj.x + offsetX))
          const constrainedY = Math.max(0, Math.min(screen.height - obj.height, obj.y + offsetY))
          console.log("[v0] Updating object:", obj.id, "from", { x: obj.x, y: obj.y }, "to", {
            x: constrainedX,
            y: constrainedY,
          })
          onUpdateObject(obj.id, { x: constrainedX, y: constrainedY })
        })
      }
    } else if (dragState.mode === "line-endpoint" && dragState.objectId && dragState.lineHandle) {
      const { x, y, width, height } = dragState.startObjectPos
      let newX = x,
        newY = y,
        newWidth = width,
        newHeight = height

      if (dragState.lineHandle === "start") {
        newX = coords.x
        newY = coords.y
        newWidth = x + width - newX
        newHeight = y + height - newY
      } else if (dragState.lineHandle === "end") {
        newWidth = coords.x - x
        newHeight = coords.y - y
      }

      const otherObjects = screen.objects.filter((obj) => obj.id !== dragState.objectId)
      const snapResult = calculateSnap({ x: newX, y: newY, width: newWidth, height: newHeight }, otherObjects, false)

      if (dragState.lineHandle === "start") {
        newX = snapResult.x
        newY = snapResult.y
        newWidth = x + width - newX
        newHeight = y + height - newY
      } else if (dragState.lineHandle === "end") {
        const endX = x + newWidth
        const endY = y + newHeight

        let snappedEndX = endX
        let snappedEndY = endY

        snapGuides.forEach((guide) => {
          if (guide.type === "vertical" && Math.abs(endX - guide.position) <= SNAP_TOLERANCE) {
            snappedEndX = Math.round(guide.position)
          } else if (guide.type === "horizontal" && Math.abs(endY - guide.position) <= SNAP_TOLERANCE) {
            snappedEndY = Math.round(guide.position)
          }
        })

        newWidth = snappedEndX - x
        newHeight = snappedEndY - y
      }

      newX = Math.round(Math.max(0, Math.min(screen.width, newX)))
      newY = Math.round(Math.max(0, Math.min(screen.height, newY)))

      if (newX + newWidth < 0) newWidth = -newX
      if (newX + newWidth > screen.width) newWidth = screen.width - newX
      if (newY + newHeight < 0) newHeight = -newY
      if (newY + newHeight > screen.height) newHeight = screen.height - newY

      setActiveSnapLines(snapResult.snapLines)
      onUpdateObject(dragState.objectId, {
        x: newX,
        y: newY,
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      })
    } else if (dragState.mode === "resize" && dragState.objectId && dragState.resizeHandle) {
      const { x, y, width, height } = dragState.startObjectPos
      const handle = dragState.resizeHandle
      let newX = x,
        newY = y,
        newWidth = width,
        newHeight = height

      const resizingObject = screen.objects.find((obj) => obj.id === dragState.objectId)
      const isIcon = resizingObject?.type === "icon"

      switch (handle) {
        case "nw":
          newX = Math.round(Math.min(x + width - 10, x + deltaX))
          newY = Math.round(Math.min(y + height - 10, y + deltaY))
          newWidth = Math.round(width - (newX - x))
          newHeight = Math.round(height - (newY - y))

          if (isIcon) {
            const size = Math.max(newWidth, newHeight)
            newWidth = size
            newHeight = size
            newX = x + width - size
            newY = y + height - size
          }
          break
        case "ne":
          newY = Math.round(Math.min(y + height - 10, y + deltaY))
          newWidth = Math.round(Math.max(10, width + deltaX))
          newHeight = Math.round(height - (newY - y))

          if (isIcon) {
            const size = Math.max(newWidth, newHeight)
            newWidth = size
            newHeight = size
            newY = y + height - size
          }
          break
        case "sw":
          newX = Math.round(Math.min(x + width - 10, x + deltaX))
          newWidth = Math.round(width - (newX - x))
          newHeight = Math.round(Math.max(10, height + deltaY))

          if (isIcon) {
            const size = Math.max(newWidth, newHeight)
            newWidth = size
            newHeight = size
            newX = x + width - size
          }
          break
        case "se":
          newWidth = Math.round(Math.max(10, width + deltaX))
          newHeight = Math.round(Math.max(10, height + deltaY))

          if (isIcon) {
            const size = Math.max(newWidth, newHeight)
            newWidth = size
            newHeight = size
          }
          break
      }

      const snapLines: { type: "vertical" | "horizontal"; position: number }[] = []

      switch (handle) {
        case "nw":
          snapGuides.forEach((guide) => {
            if (guide.type === "vertical" && Math.abs(newX - guide.position) <= SNAP_TOLERANCE) {
              const snapDelta = guide.position - newX
              newX = Math.round(guide.position)
              newWidth = Math.round(width - snapDelta)
              snapLines.push({ type: "vertical", position: guide.position })
            }
            if (guide.type === "horizontal" && Math.abs(newY - guide.position) <= SNAP_TOLERANCE) {
              const bottomEdge = y + height
              newY = Math.round(guide.position)
              newHeight = Math.round(bottomEdge - newY)
              snapLines.push({ type: "horizontal", position: guide.position })
            }
          })
          break
        case "ne":
          snapGuides.forEach((guide) => {
            if (guide.type === "vertical" && Math.abs(newX + newWidth - guide.position) <= SNAP_TOLERANCE) {
              newWidth = Math.round(guide.position - newX)
              snapLines.push({ type: "vertical", position: guide.position })
            }
            if (guide.type === "horizontal" && Math.abs(newY - guide.position) <= SNAP_TOLERANCE) {
              const bottomEdge = y + height
              newY = Math.round(guide.position)
              newHeight = Math.round(bottomEdge - newY)
              snapLines.push({ type: "horizontal", position: guide.position })
            }
          })
          break
        case "sw":
          snapGuides.forEach((guide) => {
            if (guide.type === "vertical" && Math.abs(newX - guide.position) <= SNAP_TOLERANCE) {
              const snapDelta = guide.position - newX
              newX = Math.round(guide.position)
              newWidth = Math.round(width - snapDelta)
              snapLines.push({ type: "vertical", position: guide.position })
            }
            if (guide.type === "horizontal" && Math.abs(newY + newHeight - guide.position) <= SNAP_TOLERANCE) {
              newHeight = Math.round(guide.position - newY)
              snapLines.push({ type: "horizontal", position: guide.position })
            }
          })
          break
        case "se":
          snapGuides.forEach((guide) => {
            if (guide.type === "vertical" && Math.abs(newX + newWidth - guide.position) <= SNAP_TOLERANCE) {
              newWidth = Math.round(guide.position - newX)
              snapLines.push({ type: "vertical", position: guide.position })
            }
            if (guide.type === "horizontal" && Math.abs(newY + newHeight - guide.position) <= SNAP_TOLERANCE) {
              newHeight = Math.round(guide.position - newY)
              snapLines.push({ type: "horizontal", position: guide.position })
            }
          })
          break
      }

      const hasVerticalSnap = snapLines.some((line) => line.type === "vertical")
      const hasHorizontalSnap = snapLines.some((line) => line.type === "horizontal")

      if (!hasVerticalSnap) {
        const constrainedX = Math.round(Math.max(0, Math.min(screen.width - newWidth, newX)))
        newX = constrainedX
      }
      if (!hasHorizontalSnap) {
        const constrainedY = Math.round(Math.max(0, Math.min(screen.height - newHeight, newY)))
        newY = constrainedY
      }

      newWidth = Math.round(Math.max(10, newWidth))
      newHeight = Math.round(Math.max(10, newHeight))

      setActiveSnapLines(snapLines)
      onUpdateObject(dragState.objectId, {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      })
    }
  }

  const handleMouseUp = () => {
    if (dragState?.mode === "selection-rectangle" && dragState.selectionRect) {
      const { x, y, width, height } = dragState.selectionRect

      // Find all objects that intersect with the selection rectangle
      const intersectingObjects = screen.objects.filter((obj) => {
        // Check if object intersects with selection rectangle
        return !(obj.x + obj.width < x || obj.x > x + width || obj.y + obj.height < y || obj.y > y + height)
      })

      if (intersectingObjects.length > 0) {
        onSelectObjects(intersectingObjects.map((obj) => obj.id))
      }
    }

    if (dragState?.mode === "create" && dragState.creatingType) {
      const { x, y, width, height } = dragState.startObjectPos

      const minSize = 5
      let isValidSize = false

      if (dragState.creatingType === "line") {
        const distance = Math.sqrt(width * width + height * height)
        isValidSize = distance > minSize
      } else {
        isValidSize = Math.abs(width) > minSize && Math.abs(height) > minSize
      }

      if (isValidSize) {
        if (dragState.creatingType === "MQTTIconField") {
          const mqttIconFieldObject: Omit<ScreenmanObject, "id" | "zIndex"> = {
            type: "MQTTIconField",
            x: pendingFieldCreation ? pendingFieldCreation.x : Math.round(x),
            y: pendingFieldCreation ? pendingFieldCreation.y : Math.round(y),
            width: pendingFieldCreation ? pendingFieldCreation.width : Math.round(Math.abs(width)),
            height: pendingFieldCreation ? pendingFieldCreation.height : Math.round(Math.abs(height)),
            properties: {
              topicId: "", // Empty topic - user can set later in properties panel
              valueIconPairs: [],
              fontId: fonts && fonts.length > 0 ? fonts[0].id : undefined,
              backgroundColor: "#ffffff",
              borderColor: "#cccccc",
              textColor: "#000000",
              textAlign: "left",
            },
          }

          console.log("[v0] Canvas creating MQTTIconField directly with no topic")
          onAddObject(mqttIconFieldObject)
          onToolChange("select")
        } else if (dragState.creatingType === "level-indicator") {
          const levelIndicatorObject: Omit<ScreenmanObject, "id" | "zIndex"> = {
            type: "level-indicator",
            x: pendingFieldCreation ? pendingFieldCreation.x : Math.round(x),
            y: pendingFieldCreation ? pendingFieldCreation.y : Math.round(y),
            width: pendingFieldCreation ? pendingFieldCreation.width : Math.round(Math.abs(width)),
            height: pendingFieldCreation ? pendingFieldCreation.height : Math.round(Math.abs(height)),
            properties: {
              topicId: "", // Empty topic - user can set later in properties panel
              barDirection: "left-to-right",
              calibrationPoints: [
                { value: 0, barSizePercent: 0 },
                { value: 100, barSizePercent: 100 },
              ],
              displayValue: "value",
              backgroundColor: "#ffffff",
              borderColor: "#cccccc",
              fillColor: "#4CAF50",
              textColor: "#000000",
              fontSize: 12,
            },
          }

          console.log("[v0] Canvas creating level indicator with topic ID:", dragState.creatingType)
          console.log("[v0] Level indicator object being passed to onAddObject:", levelIndicatorObject)
          onAddObject(levelIndicatorObject)
          onToolChange("select")
          setPendingFieldCreation(null) // Clear pending creation state
        } else if (dragState.creatingType === "MqttDataField") {
          const mqttFieldObject: Omit<ScreenmanObject, "id" | "zIndex"> = {
            type: "MqttDataField",
            x: pendingFieldCreation ? pendingFieldCreation.x : Math.round(x),
            y: pendingFieldCreation ? pendingFieldCreation.y : Math.round(y),
            width: pendingFieldCreation ? pendingFieldCreation.width : Math.round(Math.abs(width)),
            height: pendingFieldCreation ? pendingFieldCreation.height : Math.round(Math.abs(height)),
            properties: {
              displayAs: "Display as-is",
              topicId: "", // Empty topic - user will select later
              valueIconPairs: [],
              fontId: fonts && fonts.length > 0 ? fonts[0].id : undefined,
              backgroundColor: "#ffffff",
              borderColor: "#cccccc",
              textColor: "#000000",
              textAlign: "left",
              prefix: "",
              postfix: "",
              numberOfDecimals: undefined,
              thousandsSeparator: "",
            },
          }

          console.log("[v0] Canvas creating MqttDataField directly with no topic")
          console.log("[v0] MqttDataField object being passed to onAddObject:", mqttFieldObject)
          onAddObject(mqttFieldObject)
          onToolChange("select")
          setPendingFieldCreation(null) // Clear pending creation state
        } else {
          const defaultObjects: Record<"label" | "icon" | "line" | "box", Omit<ScreenmanObject, "id" | "zIndex">> = {
            label: {
              type: "label",
              x: Math.round(x),
              y: Math.round(y),
              width: Math.round(Math.abs(width)),
              height: Math.round(Math.abs(height)),
              properties: {
                text: "Label",
                fontId: fonts && fonts.length > 0 ? fonts[0].id : undefined,
                fontSize: 14,
                color: "#000000",
                textAlign: "left",
                fontWeight: "normal",
                backgroundColor: "#ffffff",
                borderColor: "#cccccc",
              },
            },
            icon: {
              type: "icon",
              x: Math.round(x),
              y: Math.round(y),
              width: Math.round(Math.abs(width)),
              height: Math.round(Math.abs(height)),
              properties: {
                assetId: selectedIconAssetId || null,
                iconName: "default",
                recolorations: [] as ColorRecoloration[],
                backgroundColor: "transparent",
              },
            },
            line: {
              type: "line",
              x: Math.round(dragState.startPos.x),
              y: Math.round(dragState.startPos.y),
              width: Math.round(width),
              height: Math.round(height),
              properties: {
                color: "#000000",
                strokeWidth: 2,
                strokeStyle: "solid",
              },
            },
            box: {
              type: "box",
              x: Math.round(x),
              y: Math.round(y),
              width: Math.round(Math.abs(width)),
              height: Math.round(Math.abs(height)),
              properties: {
                fillColor: "#e5e5e5",
                strokeColor: "#000000",
                strokeWidth: 1,
                cornerRadius: 0,
              },
            },
          }

          const objectType = dragState.creatingType as keyof typeof defaultObjects
          if (objectType in defaultObjects) {
            onAddObject(defaultObjects[objectType])
            onToolChange("select")
          }
        }
      }
    }

    setDragState(null)
    setActiveSnapLines([])
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.cursor = activeTool !== "select" ? "crosshair" : "default"
    }
  }

  const handleTopicSelected = (topicId: string | undefined) => {
    console.log("[v0] Canvas handleTopicSelected called with topicId:", topicId)
    if (!pendingFieldCreation) return

    const selectedTopic = topicId ? topics.find((t) => t.id === topicId) : undefined
    const topicValue = topicId || ""

    if (pendingFieldCreation.type === "level-indicator") {
      const levelIndicatorObject: Omit<ScreenmanObject, "id" | "zIndex"> = {
        type: "level-indicator",
        x: pendingFieldCreation.x,
        y: pendingFieldCreation.y,
        width: pendingFieldCreation.width,
        height: pendingFieldCreation.height,
        properties: {
          topicId: topicValue,
          barDirection: "left-to-right",
          calibrationPoints: [
            { value: 0, barSizePercent: 0 },
            { value: 100, barSizePercent: 100 },
          ],
          displayValue: "value",
          backgroundColor: "#ffffff",
          borderColor: "#cccccc",
          fillColor: "#4CAF50",
          textColor: "#000000",
          fontSize: 12,
        },
      }

      console.log("[v0] Canvas creating level indicator with topic ID:", topicValue)
      console.log("[v0] Level indicator object being passed to onAddObject:", levelIndicatorObject)
      onAddObject(levelIndicatorObject)
      onToolChange("select")
      setPendingFieldCreation(null)
      return
    }

    const fieldObject: Omit<ScreenmanObject, "id" | "zIndex"> = {
      type: pendingFieldCreation.type === "MqttDataField" ? "MqttDataField" : pendingFieldCreation.type,
      x: pendingFieldCreation.x,
      y: pendingFieldCreation.y,
      width: pendingFieldCreation.width,
      height: pendingFieldCreation.height,
      properties: {
        ...(pendingFieldCreation.type !== "MQTTIconField" && {
          displayAs: "Display as-is",
        }),
        topicId: topicValue, // Updated from 'topic' to 'topicId' to match interface
        valueIconPairs: [],
        fontId: fonts && fonts.length > 0 ? fonts[0].id : undefined,
        backgroundColor: "#ffffff",
        borderColor: "#cccccc",
        textColor: "#000000",
        textAlign: "left",
        prefix: "",
        postfix: "",
        numberOfDecimals: undefined,
        thousandsSeparator: "",
      },
    }

    console.log("[v0] Canvas creating field with topic ID:", topicValue)
    console.log("[v0] Field object being passed to onAddObject:", fieldObject)
    onAddObject(fieldObject)
    onToolChange("select")
    setPendingFieldCreation(null)
  }

  const handleTopicSelectionClose = () => {
    console.log("[v0] Canvas topic selection dialog closed")
    setShowTopicSelectionDialog(false)
    setPendingFieldCreation(null)
  }

  const handleManageTopicsFromDialog = () => {
    console.log("[v0] Canvas manage topics called from dialog")
    onManageTopics()
    setPendingFieldCreation(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Delete" && selectedObjectIds.length > 0) {
      selectedObjectIds.forEach((id) => onDeleteObject(id))
    } else if (e.key === "Escape") {
      onSelectObject(null)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
  }

  const handleCloseContextMenu = () => {
    setContextMenuPosition(null)
  }

  const handleCopyFromMenu = () => {
    if (onCopy) {
      onCopy()
    }
    handleCloseContextMenu()
  }

  const handlePasteFromMenu = () => {
    if (onPaste) {
      onPaste()
    }
    handleCloseContextMenu()
  }

  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const screenX = (canvas.width / zoom - screen.width) / 2 + offset.x
    const screenY = (canvas.height / zoom - screen.height) / 2 + offset.y
    const x = Math.round((clientX - rect.left) / zoom - screenX)
    const y = Math.round((clientY - rect.top) / zoom - screenY)

    return { x, y }
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      style={{ backgroundColor: "rgb(var(--canvas-container-bg))" }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
      />

      {contextMenuPosition && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={handleCloseContextMenu}
            onContextMenu={(e) => {
              e.preventDefault()
              handleCloseContextMenu()
            }}
          />
          <div
            className="fixed z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[160px]"
            style={{
              left: contextMenuPosition.x,
              top: contextMenuPosition.y,
            }}
          >
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleCopyFromMenu}
              disabled={selectedObjectIds.length === 0}
            >
              Copy
            </button>
            <button
              className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handlePasteFromMenu}
              disabled={!hasClipboard}
            >
              Paste
            </button>
          </div>
        </>
      )}

      <FieldTopicSelectionDialog
        open={showTopicSelectionDialog}
        onClose={handleTopicSelectionClose}
        onSelectTopic={handleTopicSelected}
        onManageTopics={handleManageTopicsFromDialog}
        topics={topics}
        fieldType="numeric"
      />
    </div>
  )
}
