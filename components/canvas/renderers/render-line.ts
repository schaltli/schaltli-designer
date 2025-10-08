/**
 * Line renderer - handles line rendering with various stroke styles
 */

import type { ScreenmanObject } from "@/components/screenman-editor"

interface RenderLineOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  zoom: number
}

export function renderLine(options: RenderLineOptions): void {
  const { ctx, obj, zoom } = options

  ctx.strokeStyle = obj.properties.color || "#000000"
  ctx.lineWidth = (obj.properties.strokeWidth || 1) / zoom

  // Set line dash pattern based on stroke style
  if (obj.properties.strokeStyle === "dashed") {
    ctx.setLineDash([8 / zoom, 4 / zoom])
  } else if (obj.properties.strokeStyle === "dotted") {
    ctx.setLineDash([2 / zoom, 4 / zoom])
  }

  // Draw the line
  ctx.beginPath()
  ctx.moveTo(obj.x, obj.y)
  ctx.lineTo(obj.x + obj.width, obj.y + obj.height)
  ctx.stroke()
  
  // Reset line dash
  ctx.setLineDash([])
}
