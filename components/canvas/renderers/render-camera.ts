import type { ScreenObject } from "@/components/project-editor"

/**
 * A Camera on the canvas: a neutral stand-in the size of its picture. What a
 * device shows comes from the camera (docs/2026-11-09-camera.md).
 */
export function renderCamera(ctx: CanvasRenderingContext2D, obj: Pick<ScreenObject, "x" | "y" | "width" | "height">): void {
  const { x, y, width, height } = obj
  ctx.save()
  ctx.fillStyle = "#2a2d33"
  ctx.fillRect(x, y, width, height)

  // A camera, drawn from the rectangle it stands in.
  const cx = x + width / 2
  const cy = y + height / 2
  const body = Math.min(width, height) * 0.4
  ctx.fillStyle = "#8a9099"
  ctx.fillRect(cx - body / 2, cy - body / 3, body, (body * 2) / 3)
  ctx.fillRect(cx - body / 6, cy - body / 3 - body / 8, body / 3, body / 8)
  ctx.fillStyle = "#2a2d33"
  ctx.beginPath()
  ctx.arc(cx, cy, body / 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
