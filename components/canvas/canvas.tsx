"use client"

import type React from "react"
import { useEffect, useRef, useCallback, useState } from "react"
import type {
  ScreenmanScreen,
  ScreenmanObject,
  SnapGuide,
  ScreenmanAsset,
  ColorRecoloration,
  Topic,
  ScreenmanFont,
  HardwareButton,
} from "../screenman-editor"
import { processPlaceholders, createPlaceholderContext } from "@/lib/placeholder-utils"
import { getBaselineY, calculateTextObjectHeight } from "@/lib/font-utils"
// Renderer imports
import { renderLabel } from "./renderers/render-label"
import { renderMqttField } from "./renderers/render-mqtt-field"
import { renderLevelIndicator } from "./renderers/render-level-indicator"
import { renderIcon } from "./renderers/render-icon"
import { renderBox } from "./renderers/render-box"
import { renderLine } from "./renderers/render-line"

// Interaction imports
import {
  findObjectAtPoint,
  getCanvasCoordinates,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleKeyDown,
  type DragState,
  type MouseHandlerContext,
  type KeyboardHandlerContext,
  type SnapResult,
} from "./interactions"

export interface CanvasProps {
  screen: ScreenmanScreen
  selectedObjectIds: string[]
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  onSelectObjects: (ids: string[]) => void
  onUpdateObject: (objectId: string, updates: Partial<ScreenmanObject>) => void
  onDeleteObject: (objectId: string) => void
  snapGuides: SnapGuide[]
  zoom: number
  offset: { x: number; y: number }
  onZoomChange: (zoom: number) => void
  onOffsetChange: (offset: { x: number; y: number }) => void
  activeTool: "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator" | "background"
  onAddObject: (object: Omit<ScreenmanObject, "id" | "zIndex">) => void
  onToolChange: (
    tool: "select" | "MqttDataField" | "MQTTIconField" | "label" | "icon" | "line" | "box" | "level-indicator" | "background",
  ) => void
  selectedIconAssetId?: string
  onIconToolClick: (position: { x: number; y: number }) => void
  projectAssets: ScreenmanAsset[]
  topics: Topic[]
  fonts: ScreenmanFont[]
  hardwareButtons: HardwareButton[]
  onHardwareButtonClick?: (button: HardwareButton) => void
  onManageTopics: () => void
  onMqttDiscovery: () => void
  onCopy: () => void
  onPaste: () => void
  hasClipboard: boolean
  screenWidth: number
  screenHeight: number
  adornment?: string
  adornmentDrawingArea?: {
    x: number
    y: number
    width: number
    height: number
    svgViewBox: { x: number; y: number; width: number; height: number }
  }
}

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "baseline-left" | "baseline-right"
type LineHandle = "start" | "end"

// Helper function removed - now in render-box.ts

// DragState is now imported from interactions module

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
    const hexValue = gridValue.toString(16).padStart(2, '0')
    return `#${hexValue}${hexValue}${hexValue}`
  } else {
    // Dark background - use lighter grid with moderate contrast
    const gridValue = Math.min(255, Math.floor(luminance * 255 + 120))
    const hexValue = gridValue.toString(16).padStart(2, '0')
    return `#${hexValue}${hexValue}${hexValue}`
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
  hardwareButtons = [], // Added hardware buttons to destructuring
  onHardwareButtonClick,
  onManageTopics,
  onMqttDiscovery,
  onCopy,
  onPaste,
  hasClipboard = false,
  screenWidth,
  screenHeight,
  adornment,
  adornmentDrawingArea,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null)
  const [hoveredSvgButtonId, setHoveredSvgButtonId] = useState<string | null>(null)
  const [activeSnapLines, setActiveSnapLines] = useState<{ type: "vertical" | "horizontal"; position: number }[]>([])
  const [backgroundImageElement, setBackgroundImageElement] = useState<HTMLImageElement | null>(null)
  const [adornmentSvgDoc, setAdornmentSvgDoc] = useState<Document | null>(null)
  const iconImageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const adornmentImageRef = useRef<HTMLImageElement | null>(null)
  const ttfFontLoadMapRef = useRef<Map<string, Promise<void>>>(new Map())

  const [pendingFieldCreation, setPendingFieldCreation] = useState<PendingFieldCreation | null>(null)
  const [showTopicSelectionDialog, setShowTopicSelectionDialog] = useState(false)

  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null)

  const SNAP_TOLERANCE = 4

  // Function to detect which SVG button is under the mouse cursor
  const detectSvgButtonAtPoint = useCallback(
    (mouseX: number, mouseY: number): string | null => {
      if (!adornmentSvgDoc || !adornmentDrawingArea) {
        return null
      }

      // Transform mouse coordinates to SVG coordinates
      const {
        x: screenElementX,
        y: screenElementY,
        width: screenElementWidth,
        height: screenElementHeight,
      } = adornmentDrawingArea
      const scaleX = screenWidth / screenElementWidth
      const scaleY = screenHeight / screenElementHeight
      const offsetX = -screenElementX * scaleX
      const offsetY = -screenElementY * scaleY

      // Convert canvas coordinates to SVG coordinates
      const svgX = (mouseX - offsetX) / scaleX
      const svgY = (mouseY - offsetY) / scaleY

      // Check all button elements to see if the point is inside
      // For now, we only support rectangle buttons
      const buttonElements = adornmentSvgDoc.querySelectorAll('rect[id^="button"]')

      for (const element of buttonElements) {
        const id = element.getAttribute("id")
        if (!id || !id.startsWith("button")) continue

        // Only handle rectangle elements
        if (element.tagName.toLowerCase() !== "rect") continue

        let isInside = false

        // Get basic rectangle properties
        const x = Number.parseFloat(element.getAttribute("x") || "0")
        const y = Number.parseFloat(element.getAttribute("y") || "0")
        const width = Number.parseFloat(element.getAttribute("width") || "0")
        const height = Number.parseFloat(element.getAttribute("height") || "0")


        // Handle transforms - for now, we'll handle simple scale transforms
        const transform = element.getAttribute("transform")
        let testX = svgX
        let testY = svgY

        if (transform) {
          // Parse transform="scale(-1,1)" or similar
          const scaleMatch = transform.match(/scale$$([^,]+),\s*([^)]+)$$/)
          if (scaleMatch) {
            const scaleX = Number.parseFloat(scaleMatch[1])
            const scaleY = Number.parseFloat(scaleMatch[2])

            // Apply inverse scale to test coordinates
            testX = svgX / Math.abs(scaleX)
            testY = svgY / Math.abs(scaleY)

            // Handle negative scales by adjusting coordinates
            if (scaleX < 0) {
              testX = -testX
            }
            if (scaleY < 0) {
              testY = -testY
            }

          }
        }

        // Check if point is inside the rectangle
        isInside = testX >= x && testX <= x + width && testY >= y && testY <= y + height

        if (isInside) {
          return id
        }
      }

      return null
    },
    [adornmentSvgDoc, adornmentDrawingArea, screenWidth, screenHeight],
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

    const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
    const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y
    ctx.translate(screenX, screenY)

    ctx.fillStyle = screen.backgroundColor || "#ffffff"
    ctx.fillRect(0, 0, screenWidth, screenHeight)

    // Draw shadow effect for the screen
    ctx.save()
    ctx.shadowColor = "rgba(0, 0, 0, 0.2)"
    ctx.shadowBlur = 8 / zoom
    ctx.shadowOffsetX = 2 / zoom
    ctx.shadowOffsetY = 2 / zoom
    ctx.fillStyle = screen.backgroundColor || "#ffffff"
    ctx.fillRect(0, 0, screenWidth, screenHeight)
    ctx.restore()

    // Draw background image AFTER the background color and shadow
    if (backgroundImageElement) {
      ctx.save()
      ctx.drawImage(backgroundImageElement, 0, 0, screenWidth, screenHeight)
      ctx.restore()
    }

    ctx.strokeStyle = "#999999"
    ctx.lineWidth = 1 / zoom
    ctx.strokeRect(0, 0, screenWidth, screenHeight)

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
        ctx.lineTo(x, screenHeight)
      } else {
        // Position at exact pixel boundary for crisp lines
        const y = Math.floor(guide.position) + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(screenWidth, y)
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
        ctx.lineTo(x, screenHeight)
      } else {
        // Position at exact pixel boundary for crisp lines
        const y = Math.floor(line.position) + 0.5
        ctx.moveTo(0, y)
        ctx.lineTo(screenWidth, y)
      }

      ctx.stroke()
    })

    const placeholderContext = createPlaceholderContext(
      screen.name,
      screenWidth,
      screenHeight,
      "Screenman Project", // TODO: Pass actual project name from props
    )

    screen.objects
      .sort((a, b) => a.zIndex - b.zIndex)
      .forEach((obj) => {
        const isSelected = selectedObjectIds.includes(obj.id)
        const isHovered = obj.id === hoveredObjectId && !isSelected
        drawObject(ctx, obj, isSelected, isHovered, zoom, placeholderContext)
      })

    // Hardware buttons are now drawn as part of the adornment SVG

    // Draw adornment if present (after the drawing area)
    if (adornmentImageRef.current && adornmentDrawingArea) {
      ctx.save()
      try {
        // Calculate transform to align the screen element with the project's drawing area bounds
        const {
          x: screenElementX,
          y: screenElementY,
          width: screenElementWidth,
          height: screenElementHeight,
        } = adornmentDrawingArea

        // Scale factor to map screen element dimensions to project screen dimensions
        const scaleX = screenWidth / screenElementWidth
        const scaleY = screenHeight / screenElementHeight

        // Calculate the offset to position the screen element at the project origin (0,0)
        // We need to translate the SVG so that the screen element's top-left corner is at (0,0)
        const offsetX = -screenElementX * scaleX
        const offsetY = -screenElementY * scaleY

        // Apply the transform
        ctx.translate(offsetX, offsetY)
        ctx.scale(scaleX, scaleY)

        // Draw the entire SVG (it will be scaled and positioned so that screen element aligns with project bounds)
        ctx.drawImage(adornmentImageRef.current, 0, 0)

        if (hoveredSvgButtonId && adornmentSvgDoc) {
          const buttonElement = adornmentSvgDoc.getElementById(hoveredSvgButtonId)

          if (buttonElement && buttonElement.tagName.toLowerCase() === "rect") {
            // Create a light blue overlay for the hovered button
            ctx.save()
            ctx.globalAlpha = 0.3
            ctx.fillStyle = "#87CEEB" // Light blue

            // Get rectangle properties
            const x = Number.parseFloat(buttonElement.getAttribute("x") || "0")
            const y = Number.parseFloat(buttonElement.getAttribute("y") || "0")
            const width = Number.parseFloat(buttonElement.getAttribute("width") || "0")
            const height = Number.parseFloat(buttonElement.getAttribute("height") || "0")

            // Handle transforms for the hover effect
            const transform = buttonElement.getAttribute("transform")

            if (transform) {
              // Parse and apply transform
              const scaleMatch = transform.match(/scale\(([^,]+),\s*([^)]+)\)/)
              if (scaleMatch) {
                const scaleX = Number.parseFloat(scaleMatch[1])
                const scaleY = Number.parseFloat(scaleMatch[2])

                // Apply the same transform to the hover effect
                ctx.save()
                ctx.scale(scaleX, scaleY)
                ctx.fillRect(x, y, width, height)
                ctx.restore()
              } else {
                // If we can't parse the transform, draw without it
                ctx.fillRect(x, y, width, height)
              }
            } else {
              // No transform, draw normally
              ctx.fillRect(x, y, width, height)
            }

            ctx.restore()
          }
        }
        // </CHANGE>
      } catch (error) {
        console.error("Error rendering adornment:", error)
      }
      ctx.restore()
    }

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
    fonts,
    hardwareButtons,
    screenWidth,
    screenHeight,
    adornmentImageRef.current,
    adornmentSvgDoc,
    adornmentDrawingArea,
    hoveredSvgButtonId, // Hover state for redraw
  ])

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

    window.addEventListener("resize", resizeCanvas)
    // Initial resize to set canvas dimensions on load
    resizeCanvas()

    return () => window.removeEventListener("resize", resizeCanvas)
  }, [draw])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.backgroundImageAssetId, projectAssets])
  // </CHANGE>

  useEffect(() => {
    if (adornment) {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => {
        adornmentImageRef.current = img
        draw()
      }
      img.onerror = () => {
        console.error("Failed to load adornment image")
        adornmentImageRef.current = null
      }

      // Set the SVG as source
      let svgData = adornment
      if (adornment.startsWith("data:image/svg+xml;base64,")) {
        svgData = adornment
      } else if (adornment.startsWith("data:image/svg+xml,")) {
        svgData = adornment
      } else {
        svgData = `data:image/svg+xml;base64,${btoa(adornment)}`
      }

      img.src = svgData

      // Parse SVG for interaction detection
      try {
        let svgText = svgData
        if (svgData.startsWith("data:image/svg+xml;base64,")) {
          svgText = atob(svgData.replace("data:image/svg+xml;base64,", ""))
        } else if (svgData.startsWith("data:image/svg+xml,")) {
          svgText = decodeURIComponent(svgData.replace("data:image/svg+xml,", ""))
        }

        const parser = new DOMParser()
        const doc = parser.parseFromString(svgText, "image/svg+xml")
        setAdornmentSvgDoc(doc)
      } catch (error) {
        console.error("Failed to parse adornment SVG for interaction:", error)
        setAdornmentSvgDoc(null)
      }
    } else {
      adornmentImageRef.current = null
      setAdornmentSvgDoc(null)
      draw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adornment])
  // </CHANGE>

  useEffect(() => {
    draw()
  }, [
    screen.objects,
    selectedObjectIds,
    hoveredObjectId,
    zoom,
    offset,
    dragState,
    backgroundImageElement,
    adornmentImageRef.current,
    adornmentSvgDoc,
    adornmentDrawingArea,
    snapGuides,
  ]) // Added snapGuides to dependency array to force redraw when snap guides change

  // Separate effect for hover state changes to avoid infinite loop
  useEffect(() => {
    if (hoveredSvgButtonId !== null) {
      draw()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredSvgButtonId])

  useEffect(() => {
    // Clear the entire icon cache when assets change
    // This ensures that when asset colors are modified, icons will reload with the new colors
    iconImageCacheRef.current.clear()
    // </CHANGE> Removed debug log
    requestAnimationFrame(() => {
      draw()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectAssets])
  // </CHANGE>

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      // Prevent default browser zoom
      e.preventDefault()

      const zoomSpeed = 0.001
      const delta = -e.deltaY * zoomSpeed
      const newZoom = Math.max(0.25, Math.min(2, zoom + delta))

      if (newZoom === zoom) return

      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const screenX = (container.clientWidth / zoom - screenWidth) / 2 + offset.x
      const screenY = (container.clientHeight / zoom - screenHeight) / 2 + offset.y
      const pointX = mouseX / zoom - screenX
      const pointY = mouseY / zoom - screenY

      const newScreenX = (container.clientWidth / newZoom - screenWidth) / 2
      const newScreenY = (container.clientHeight / newZoom - screenHeight) / 2
      const newOffsetX = mouseX / newZoom - pointX - newScreenX
      const newOffsetY = mouseY / newZoom - pointY - newScreenY

      onZoomChange(newZoom)
      onOffsetChange({ x: newOffsetX, y: newOffsetY })
    }

    // Add event listener with passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false })

    return () => {
      container.removeEventListener("wheel", handleWheel)
    }
  }, [zoom, offset, screenWidth, screenHeight, onZoomChange, onOffsetChange])

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
        snapLines,
      }
    },
    [SNAP_TOLERANCE, snapGuides],
  )

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

  const getPreviewValueFromTopic = (topicName: string | undefined): string => {
    if (!topicName) return "No topic selected"

    const topic = topics.find((t) => t.topic === topicName)
    if (!topic) return "No topic selected"

    if (!topic.examples || topic.examples.length === 0) {
      return `Topic ${topic.topic} has no Examples`
    }

    // Take the first example from the array
    const firstExample = topic.examples[0]?.trim()
    return firstExample || `Topic ${topic.topic} has no Examples`
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
    // Use extracted renderers for each object type
    switch (obj.type) {
      case "box":
        renderBox({ ctx, obj, zoom })
        break

      case "label":
        renderLabel(ctx, obj, fonts, isSelected, zoom, ttfFontLoadMapRef.current, placeholderContext)
        break

      case "MqttDataField":
      case "MQTTIconField":
      case "field":
        renderMqttField({
          ctx,
          obj,
          fonts,
          projectAssets,
          topics,
          isSelected,
          zoom,
          ttfFontLoadMap: ttfFontLoadMapRef.current,
          iconImageCache: iconImageCacheRef.current,
          getPreviewValueFromTopic,
          formatFieldValue,
          requestRedraw: draw,
        })
        break

      case "line":
        renderLine({ ctx, obj, zoom })
        break

      case "icon":
        renderIcon({
          ctx,
          obj,
          projectAssets,
          iconImageCache: iconImageCacheRef.current,
          requestRedraw: draw,
        })
        break

      case "level-indicator":
        renderLevelIndicator({
          ctx,
          obj,
          fonts,
          topics,
          zoom,
          ttfFontLoadMap: ttfFontLoadMapRef.current,
          getPreviewValueFromTopic,
        })
        break
    }

    // Draw hover state (moved outside of renderers for consistency)
    if (isHovered) {
      if (obj.type === "line") {
        ctx.strokeStyle = "rgba(var(--canvas-selection) / 0.5)"
        ctx.lineWidth = Math.max(3 / zoom, (obj.properties.strokeWidth || 1) / zoom + 2 / zoom)

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
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = "rgb(var(--canvas-selection) / 0.5)"
        ctx.lineWidth = 1 / zoom
        ctx.strokeRect(obj.x - 1 / zoom, obj.y - 1 / zoom, obj.width + 2 / zoom, obj.height + 2 / zoom)
      }
    }

    // Draw selection handles (moved outside of renderers for consistency)
    if (isSelected) {
      if (obj.type === "line") {
        const handleSize = 8 / zoom
        const handles = getLineHandles(obj, handleSize)

        ctx.fillStyle = "#3b82f6"
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1 / zoom

        handles.forEach((handle) => {
          ctx.fillRect(handle.x, handle.y, handleSize, handleSize)
          ctx.strokeRect(handle.x, handle.y, handleSize, handleSize)
        })
      } else if (obj.type !== "label" && obj.type !== "MqttDataField") {
        // Text objects handle their own baseline handles in their renderers
        const handleSize = 8 / zoom
        const handles = getResizeHandles(obj, handleSize)

        ctx.fillStyle = "#3b82f6"
        ctx.strokeStyle = "#ffffff"
        ctx.lineWidth = 1 / zoom

        handles.forEach((handle) => {
          ctx.fillRect(handle.x, handle.y, handleSize, handleSize)
          ctx.strokeRect(handle.x, handle.y, handleSize, handleSize)
        })
      }
    }
  }

  // Old drawObject implementation removed - all rendering logic moved to separate renderer files

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

  // getBaselineY moved to lib/font-utils.ts

  const getResizeHandles = (obj: ScreenmanObject, handleSize: number) => {
    const half = handleSize / 2
    const handles = []
    
    // Text objects (label, MqttDataField) only get baseline handles, no corner handles
    if (obj.type === "label" || obj.type === "MqttDataField") {
      const baselineY = getBaselineY(obj, fonts)
      handles.push(
        { x: obj.x - half, y: baselineY - half, handle: "baseline-left" as ResizeHandle },
        { x: obj.x + obj.width - half, y: baselineY - half, handle: "baseline-right" as ResizeHandle }
      )
    } else {
      // All other objects get corner handles
      handles.push(
      { x: obj.x - half, y: obj.y - half, handle: "nw" as ResizeHandle },
      { x: obj.x + obj.width - half, y: obj.y - half, handle: "ne" as ResizeHandle },
      { x: obj.x + obj.width - half, y: obj.y + obj.height - half, handle: "se" as ResizeHandle },
        { x: obj.x - half, y: obj.y + obj.height - half, handle: "sw" as ResizeHandle }
      )
    }
    
    return handles
  }

  const getLineHandles = (obj: ScreenmanObject, handleSize: number) => {
    const half = handleSize / 2
    return [
      { x: obj.x - half, y: obj.y - half, handle: "start" as LineHandle },
      { x: obj.x + obj.width - half, y: obj.y + obj.height - half, handle: "end" as LineHandle },
    ]
  }

  // Hardware button detection is now done via SVG button elements

  const isPointOnLine = useCallback(
    (lineObj: ScreenmanObject, x: number, y: number, tolerance = 5): boolean => {
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
    },
    [zoom],
  )

  const findObjectAtPoint = useCallback(
    (x: number, y: number, objects: ScreenmanObject[]) => {
      return [...objects]
        .sort((a, b) => b.zIndex - a.zIndex)
        .find((obj) => {
          if (obj.type === "line") {
            return isPointOnLine(obj, x, y)
          } else {
            return x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height
          }
        })
    },
    [isPointOnLine],
  )

  const findResizeHandle = useCallback(
    (obj: ScreenmanObject, x: number, y: number): ResizeHandle | null => {
      const handleSize = 8 / zoom
      const handles = getResizeHandles(obj, handleSize)

      for (const handle of handles) {
        if (x >= handle.x && x <= handle.x + handleSize && y >= handle.y && y <= handle.y + handleSize) {
          return handle.handle
        }
      }

      return null
    },
    [zoom],
  )

  const findLineHandle = useCallback(
    (obj: ScreenmanObject, x: number, y: number): LineHandle | null => {
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
    },
    [zoom],
  )

  const getCanvasCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }

      const rect = canvas.getBoundingClientRect()
      const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
      const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y
      const x = Math.round((clientX - rect.left) / zoom - screenX)
      const y = Math.round((clientY - rect.top) / zoom - screenY)

      return { x, y }
    },
    [zoom, offset, screenWidth, screenHeight, canvasRef],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const coords = getCanvasCoordinates(e.clientX, e.clientY)
      const isCtrlOrCmd = e.ctrlKey || e.metaKey
      const isShift = e.shiftKey

      // Check for SVG button click first
      const clickedSvgButton = detectSvgButtonAtPoint(coords.x, coords.y)
      if (clickedSvgButton) {
        // Find the corresponding hardware button
        const hardwareButton = hardwareButtons.find((button) => button.svgElementId === clickedSvgButton)
        if (hardwareButton && onHardwareButtonClick) {
          onHardwareButtonClick(hardwareButton)
          return
        }
      }

      if (activeTool === "icon") {
        if (onIconToolClick) {
          onIconToolClick(coords)
        }
        return
      }

      // Hardware button clicks are now handled via SVG button elements above

      if (activeTool !== "select") {
        // Start creating the object with drag state
        setDragState({
          mode: "create",
          objectId: null,
          startPos: coords,
          startObjectPos: { x: coords.x, y: coords.y, width: 0, height: 0 },
          creatingType: activeTool,
        })
        return
      }

      const clickedObject = findObjectAtPoint(coords.x, coords.y, screen.objects)

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
    },
    [
      activeTool,
      detectSvgButtonAtPoint,
      hardwareButtons,
      onHardwareButtonClick,
      getCanvasCoordinates,
      findObjectAtPoint,
      findLineHandle,
      findResizeHandle,
      onSelectObject,
      screen.objects,
      selectedObjectIds,
      setDragState,
      onIconToolClick,
    ],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = (e.clientX - rect.left) / zoom
      const y = (e.clientY - rect.top) / zoom

      const screenX = (canvas.width / zoom - screenWidth) / 2 + offset.x
      const screenY = (canvas.height / zoom - screenHeight) / 2 + offset.y

      const coords = {
        x: x - screenX,
        y: y - screenY,
      }

      if (!dragState) {
        const hoveredObject = findObjectAtPoint(coords.x, coords.y, screen.objects)
        setHoveredObjectId(hoveredObject?.id || null)

        const hoveredSvgButton = detectSvgButtonAtPoint(coords.x, coords.y)
        setHoveredSvgButtonId(hoveredSvgButton || null)
        // </CHANGE>

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
                "baseline-left": "ew-resize",
                "baseline-right": "ew-resize",
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

          // For text objects, calculate snapping based on baseline position
          let snapObject = { x: rawX, y: rawY, width: dragState.startObjectPos.width, height: dragState.startObjectPos.height }
          
          if (draggedObject.type === "label" || draggedObject.type === "MqttDataField") {
            const baselineY = getBaselineY(draggedObject, fonts)
            const baselineOffset = baselineY - draggedObject.y
            // Adjust the snap object to use baseline position for snapping
            snapObject = { 
              x: rawX, 
              y: rawY + baselineOffset, // Use baseline position for snapping
              width: dragState.startObjectPos.width, 
              height: dragState.startObjectPos.height 
            }
          }

          const otherObjects = screen.objects.filter((obj) => !selectedObjectIds.includes(obj.id))
          const snapResult = calculateSnap(snapObject, otherObjects)

          // Adjust the snap result back to object position if we used baseline snapping
          let finalX = snapResult.x
          let finalY = snapResult.y
          
          if (draggedObject.type === "label" || draggedObject.type === "MqttDataField") {
            const baselineY = getBaselineY(draggedObject, fonts)
            const baselineOffset = baselineY - draggedObject.y
            finalY = snapResult.y - baselineOffset // Convert back from baseline position to object position
          }

          const newX = Math.round(Math.max(0, Math.min(screenWidth - dragState.startObjectPos.width, finalX)))
          const newY = Math.round(Math.max(0, Math.min(screenHeight - dragState.startObjectPos.height, finalY)))

          // Calculate the offset for this specific object
          const offsetX = newX - draggedObject.x
          const offsetY = newY - draggedObject.y

          setActiveSnapLines(snapResult.snapLines)

          // Update all selected objects with the same offset
          selectedObjects.forEach((obj) => {
            const constrainedX = Math.max(0, Math.min(screenWidth - obj.width, obj.x + offsetX))
            const constrainedY = Math.max(0, Math.min(screenHeight - obj.height, obj.y + offsetY))
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

        newX = Math.round(Math.max(0, Math.min(screenWidth, newX)))
        newY = Math.round(Math.max(0, Math.min(screenHeight, newY)))

        if (newX + newWidth < 0) newWidth = -newX
        if (newX + newWidth > screenWidth) newWidth = screenWidth - newX
        if (newY + newHeight < 0) newHeight = -newY
        if (newY + newHeight > screenHeight) newHeight = screenHeight - newY

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
          case "baseline-left":
            // Only resize width, keep height fixed for text objects
            newX = Math.round(Math.min(x + width - 10, x + deltaX))
            newWidth = Math.round(width - (newX - x))
            newHeight = height // Keep height unchanged
            break
          case "baseline-right":
            // Only resize width, keep height fixed for text objects
            newWidth = Math.round(Math.max(10, width + deltaX))
            newHeight = height // Keep height unchanged
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
          case "baseline-left":
            snapGuides.forEach((guide) => {
              if (guide.type === "vertical" && Math.abs(newX - guide.position) <= SNAP_TOLERANCE) {
                const snapDelta = guide.position - x // Use original x, not newX
                newX = Math.round(guide.position)
                newWidth = Math.round(width - snapDelta)
                snapLines.push({ type: "vertical", position: guide.position })
              }
            })
            break
          case "baseline-right":
            snapGuides.forEach((guide) => {
              if (guide.type === "vertical" && Math.abs(newX + newWidth - guide.position) <= SNAP_TOLERANCE) {
                newWidth = Math.round(guide.position - newX)
                snapLines.push({ type: "vertical", position: guide.position })
              }
            })
            break
        }

        const hasVerticalSnap = snapLines.some((line) => line.type === "vertical")
        const hasHorizontalSnap = snapLines.some((line) => line.type === "horizontal")

        if (!hasVerticalSnap) {
          const constrainedX = Math.round(Math.max(0, Math.min(screenWidth - newWidth, newX)))
          newX = constrainedX
        }
        if (!hasHorizontalSnap) {
          const constrainedY = Math.round(Math.max(0, Math.min(screenHeight - newHeight, newY)))
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
    },
    [
      dragState,
      selectedObjectIds,
      screen,
      zoom,
      SNAP_TOLERANCE,
      onUpdateObject,
      snapGuides,
      calculateSnap,
      setActiveSnapLines,
      activeTool,
      onSelectObject,
      setDragState,
      hoveredObjectId,
      detectSvgButtonAtPoint,
      findObjectAtPoint,
      findLineHandle,
      findResizeHandle,
      canvasRef,
      screenWidth,
      screenHeight,
      getCanvasCoordinates,
      offset,
    ],
  )

  const handleMouseUp = useCallback(() => {
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
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            properties: {
              topic: "", // Empty topic - user can set later in properties panel
              valueIconPairs: [],
              fontId: fonts && fonts.length > 0 ? fonts[0].id : undefined,
              backgroundColor: "#ffffff",
              borderColor: "#cccccc",
              textColor: "#000000",
              textAlign: "left",
            },
          }

          onAddObject(mqttIconFieldObject)
          onToolChange("select")
        } else if (dragState.creatingType === "level-indicator") {
          const levelIndicatorObject: Omit<ScreenmanObject, "id" | "zIndex"> = {
            type: "level-indicator",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: Math.round(Math.abs(height)),
            properties: {
              topic: "", // Empty topic - user can set later in properties panel
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

          onAddObject(levelIndicatorObject)
          onToolChange("select")
        } else if (dragState.creatingType === "MqttDataField") {
          const mqttFieldObject: Omit<ScreenmanObject, "id" | "zIndex"> = {
            type: "MqttDataField",
            x: Math.round(x),
            y: Math.round(y),
            width: Math.round(Math.abs(width)),
            height: (() => {
              const f = fonts && fonts[0]
              const fontSize = f?.size || 16
              return calculateTextObjectHeight(fontSize)
            })(),
            properties: {
              displayAs: "Display as-is",
              topic: "", // Empty topic - user will select later
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

          onAddObject(mqttFieldObject)
          onToolChange("select")
        } else {
          const defaultObjects: Record<"label" | "icon" | "line" | "box", Omit<ScreenmanObject, "id" | "zIndex">> = {
            label: {
              type: "label",
              x: Math.round(x),
              y: Math.round(y),
              width: Math.round(Math.abs(width)),
              height: (() => {
                const f = fonts && fonts[0]
                const fontSize = f?.size || 16
                return calculateTextObjectHeight(fontSize)
              })(),
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
  }, [
    dragState,
    screen.objects,
    onSelectObjects,
    onAddObject,
    onToolChange,
    activeTool,
    fonts,
    selectedIconAssetId,
    setDragState,
    setActiveSnapLines,
    detectSvgButtonAtPoint,
    hardwareButtons,
    onHardwareButtonClick,
    getCanvasCoordinates,
    findObjectAtPoint,
    findLineHandle,
    findResizeHandle,
    screenWidth,
    screenHeight,
    screen.buttonActions,
    onSelectObject,
    zoom,
    offset,
    SNAP_TOLERANCE,
    onUpdateObject,
    snapGuides,
    calculateSnap,
    onIconToolClick,
    onDeleteObject,
    canvasRef,
  ])


  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Delete" && selectedObjectIds.length > 0) {
        selectedObjectIds.forEach((id) => onDeleteObject(id))
      } else if (e.key === "Escape") {
        onSelectObject(null)
      }
    },
    [selectedObjectIds, onDeleteObject, onSelectObject],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCloseContextMenu = useCallback(() => {
    setContextMenuPosition(null)
  }, [])

  const handleCopyFromMenu = useCallback(() => {
    if (onCopy) {
      onCopy()
    }
    handleCloseContextMenu()
  }, [onCopy, handleCloseContextMenu])

  const handlePasteFromMenu = useCallback(() => {
    if (onPaste) {
      onPaste()
    }
    handleCloseContextMenu()
  }, [onPaste, handleCloseContextMenu])

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

    </div>
  )
}
