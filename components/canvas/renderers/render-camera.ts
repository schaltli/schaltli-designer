import type { ScreenObject } from "@/components/project-editor"

/**
 * A Camera on the canvas: a neutral stand-in the size of its picture. In the
 * preview, the camera's own picture where the browser can fetch it
 * (docs/2026-11-09-camera.md): one image after another, as a device does.
 */

type CameraObject = Pick<ScreenObject, "id" | "x" | "y" | "width" | "height" | "properties">

/** One Camera's preview, kept between draws. */
export interface CameraPreviewEntry {
  url: string
  loading: boolean
  shown: HTMLImageElement | null
  shownAt: number
}

export interface CameraPreview {
  cache: Map<string, CameraPreviewEntry>
  requestRedraw: () => void
}

const STALE_MS = 1000

/**
 * What a browser can load: an `<img>` cannot send a username and password, and
 * an https page may not load an http image.
 */
export function browserCanLoad(url: string, username: string | undefined, pageProtocol: string): boolean {
  if (!/^https?:\/\//i.test(url) || username) return false
  return !(pageProtocol === "https:" && /^http:/i.test(url))
}

function pictureFor(obj: CameraObject, preview: CameraPreview): HTMLImageElement | null {
  const url: string = obj.properties?.url ?? ""
  if (typeof window === "undefined" || !browserCanLoad(url, obj.properties?.username, window.location.protocol)) return null
  let entry = preview.cache.get(obj.id)
  if (!entry || entry.url !== url) {
    entry = { url, loading: false, shown: null, shownAt: 0 }
    preview.cache.set(obj.id, entry)
  }
  const current = entry
  if (!current.loading) {
    current.loading = true
    const image = new Image()
    // Without it a picture from another address taints the canvas, and the
    // next getImageData - a switch's pills, a gauge's arc - throws. A camera
    // that sends no Access-Control-Allow-Origin keeps the stand-in.
    image.crossOrigin = "anonymous"
    image.onload = () => {
      current.shown = image
      current.shownAt = Date.now()
      current.loading = false
      preview.requestRedraw()
    }
    image.onerror = () => {
      current.loading = false
      window.setTimeout(preview.requestRedraw, STALE_MS)
    }
    image.src = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`
  }
  return current.shown && Date.now() - current.shownAt <= STALE_MS ? current.shown : null
}

export function renderCamera(ctx: CanvasRenderingContext2D, obj: CameraObject, preview?: CameraPreview): void {
  const { x, y, width, height } = obj
  ctx.save()
  ctx.fillStyle = "#2a2d33"
  ctx.fillRect(x, y, width, height)

  const picture = preview ? pictureFor(obj, preview) : null
  if (picture) {
    // Whole and centred, never enlarged: what a device does.
    const scale = Math.min(1, width / picture.naturalWidth, height / picture.naturalHeight)
    const w = picture.naturalWidth * scale
    const h = picture.naturalHeight * scale
    ctx.drawImage(picture, x + (width - w) / 2, y + (height - h) / 2, w, h)
    ctx.restore()
    return
  }

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
