/**
 * Box renderer - handles rectangle/box rendering with optional rounded corners
 */

import type { ScreenmanObject } from "@/components/screenman-editor"

interface RenderBoxOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  zoom: number
}

export function renderBox(options: RenderBoxOptions): void {
  const { ctx, obj, zoom } = options

  // Draw fill
  ctx.fillStyle = obj.properties.fillColor || "#e5e5e5"
  if (obj.properties.cornerRadius) {
    drawRoundedRect(ctx, obj.x, obj.y, obj.width, obj.height, obj.properties.cornerRadius)
    ctx.fill()
  } else {
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
  }

  // Draw stroke/border
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
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
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
