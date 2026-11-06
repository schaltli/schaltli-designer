/**
 * Toggle Button renderer (docs/2026-11-06-toggle-button.md): one tile in the
 * look of the state it shows - lib/toggle-button-shape.ts's numbers, which
 * the export writes for a device to draw. Drawn as a device draws it: the
 * face through the Switch's rasteriser, the disc and the ring as further
 * runs, the icon in the ink colour, one or two lines of text.
 *
 * The reported state decides the look; a request nobody has confirmed puts
 * the ring round it; nothing reported is the quiet look with «?».
 */
import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import { rasterisedIconOnBaseline } from "@/lib/svg-utils"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import type { BDFFont } from "@/lib/bdffont"
import type { PillBand } from "@/lib/pill-raster"
import type { ButtonFace } from "@/lib/button-shape"
import { toggleLooks, toggleName, TOGGLE_RING, type ToggleLook, type ToggleLooks } from "@/lib/toggle-button-shape"
import { buttonIconKey, buttonIconUrl, colouredIcon } from "./render-software-button"
import { getActiveSwitchStateIndex, getAskedSwitchStateIndex } from "./render-switch"
import { loadBdfFont } from "./render-text-box"
import { paintPills } from "./paint-pills"

export interface RenderToggleButtonOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  iconImageCache: Map<string, HTMLImageElement>
  bdfFontCache: Map<string, BDFFont>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  getAskedValueFromTopic?: (topicName: string | undefined) => string
  requestRedraw: () => void
  colorDepth?: string
  /** What the tile stands on; white when absent. */
  screenBackgroundColor?: string
  /** Held down in the preview: the pressed face. */
  pressed?: boolean
  /**
   * The state to draw instead of the one the topic reports, -1 for none -
   * what the export draws each state with to cut out its icon.
   */
  forceState?: number
}

type Run = { band: PillBand; colour: string | null }

const box = (x: number, y: number, w: number, h: number, r: number): PillBand => ({ x, y, w, h, rLow: r, rHigh: r })

/**
 * The runs of one face, in priority order (paint-pills.ts): the disc first,
 * then the face - with the ring in place of its edge while a request is
 * outstanding, the face's own fill kept inside it, as a group's ring keeps
 * the chosen pill's.
 */
export function toggleRuns(x: number, y: number, w: number, h: number, look: ToggleLook, face: ButtonFace, pressed: boolean, ring: string | null): Run[] {
  const runs: Run[] = []
  if (look.disc && look.disc.r > 0) {
    const d = look.disc
    const fill = pressed ? d.pressed : d.normal
    const edge = d.edge ? (pressed ? d.edge.pressed : d.edge.normal) : null
    // A ring where the tint cannot be seen (1 bit): the inside first, 1 px in.
    if (edge && d.r > 1) runs.push({ band: box(x + d.cx - d.r + 1, y + d.cy - d.r + 1, 2 * d.r - 2, 2 * d.r - 2, d.r - 1), colour: fill })
    runs.push({ band: box(x + d.cx - d.r, y + d.cy - d.r, 2 * d.r, 2 * d.r, d.r), colour: edge ?? fill })
  }
  const edge = ring ?? face.outline
  const t = ring ? TOGGLE_RING : 1
  if (edge) {
    const r = Math.max(0, face.r - t)
    runs.push({ band: box(x + t, y + t, w - 2 * t, h - 2 * t, r), colour: face.fill })
    runs.push({ band: box(x, y, w, h, face.r), colour: edge })
  } else if (face.fill) {
    runs.push({ band: box(x, y, w, h, face.r), colour: face.fill })
  }
  return runs
}

function iconOf(options: RenderToggleButtonOptions, id: string | undefined): HTMLImageElement | null {
  if (!id) return null
  const asset = options.projectAssets.find((a) => a.id === id)
  if (!asset || asset.type !== "icon" || !asset.data) return null
  const key = buttonIconKey(asset.id)
  let img = options.iconImageCache.get(key)
  if (!img) {
    img = new Image()
    img.crossOrigin = "anonymous"
    options.iconImageCache.set(key, img)
    const pending = img
    pending.onload = () => {
      if (pending.complete && pending.naturalWidth > 0) requestAnimationFrame(() => options.requestRedraw())
    }
    pending.onerror = () => options.iconImageCache.delete(key)
    pending.src = buttonIconUrl(asset)
  }
  return img
}

/** Writes and measures in a project font, BDF or TTF, as every renderer does. */
function textIn(options: RenderToggleButtonOptions, fontId: string) {
  const { ctx, obj, fonts, bdfFontCache } = options
  const meta = fonts.find((f) => f.id === fontId)
  const bdf = loadBdfFont({ ...obj, properties: { ...obj.properties, fontId } }, fonts, bdfFontCache)
  const browserFont = () => {
    const ttf = meta?.format === "ttf"
    if (ttf && meta && !isTtfFontLoaded(meta)) ensureTtfFontRegistered(meta, options.requestRedraw)
    const family = ttf && meta ? `"${meta.internalName ?? meta.name}"` : "sans-serif"
    ctx.font = `${obj.properties.fontWeight || "normal"} ${meta?.size || 14}px ${family}`
  }
  return {
    measure(text: string): number {
      if (bdf) return Math.ceil(bdf.measureText(text).width)
      ctx.save()
      browserFont()
      const w = Math.ceil(ctx.measureText(text).width)
      ctx.restore()
      return w
    },
    draw(text: string, x: number, baseline: number) {
      if (bdf) {
        bdf.drawText(ctx, text, x, baseline)
        return
      }
      browserFont()
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.fillText(text, x, baseline)
    },
  }
}

/** Draws the tile; returns its looks, which the export writes for a device. */
export function renderToggleButton(options: RenderToggleButtonOptions): ToggleLooks {
  const { ctx, obj } = options
  const x = Math.round(obj.x)
  const y = Math.round(obj.y)
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  const background = options.screenBackgroundColor || "#ffffff"
  const fontIds = new Map<string, ReturnType<typeof textIn>>()
  const font = (id: string) => {
    let f = fontIds.get(id)
    if (!f) fontIds.set(id, (f = textIn(options, id)))
    return f
  }
  const looks = toggleLooks(obj, background, options.colorDepth, options.fonts, (text, fontId) => font(fontId).measure(text))

  const states = obj.properties.states ?? []
  const forced = options.forceState !== undefined
  const active = forced ? options.forceState! : getActiveSwitchStateIndex(obj, options.getPreviewValueFromTopic)
  const asked = forced ? -1 : getAskedSwitchStateIndex(obj, options.getAskedValueFromTopic)
  const look = active >= 0 ? looks.states[active] : looks.none
  if (!look) return looks
  const pressed = options.pressed === true
  const face = pressed ? look.pressed : look.normal
  const ring = asked >= 0 && asked !== active ? looks.ring : null

  paintPills(ctx, toggleRuns(x, y, w, h, look, face, pressed, ring), background, options.colorDepth)

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + look.clipX, y, look.clipW, h)
  if (look.disc) ctx.rect(x, y, w, h)
  ctx.clip()

  const iconId = active >= 0 ? states[active]?.iconAssetId : undefined
  const image = look.icon ? iconOf(options, iconId) : null
  if (look.icon && image && image.complete && image.naturalWidth > 0) {
    const key = buttonIconKey(String(iconId))
    const raster = rasterisedIconOnBaseline(image, look.icon.size, look.icon.size, key)
    if (raster) ctx.drawImage(colouredIcon(raster, key, face.ink), x + look.icon.x, y + look.icon.y)
  }
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + look.clipX, y, look.clipW, h)
  ctx.clip()
  ctx.fillStyle = face.ink
  const fontId = String(obj.properties.fontId ?? "")
  const name = toggleName(obj)
  if (look.second && name !== undefined) {
    font(fontId).draw(name, x + look.textX, y + look.baseline)
    font(look.second.fontId).draw(look.label, x + look.second.textX, y + look.second.baseline)
  } else {
    font(fontId).draw(look.label, x + look.textX, y + look.baseline)
  }
  ctx.restore()
  return looks
}
