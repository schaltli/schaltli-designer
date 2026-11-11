/**
 * Toggle Button renderer (docs/2026-11-06-toggle-button.md,
 * docs/2026-11-11-led-look.md): a calm tile with its name and a light that
 * says the state - lib/toggle-button-shape.ts's numbers, which the export
 * writes for a device to draw. Drawn as a device draws it: the tile and the
 * light through the Switch's rasteriser, the icon in the ink, the name, the
 * state's label and the window's word as text.
 *
 * The reported state decides the light; a request nobody has confirmed
 * makes it pulse at half strength, saying what was asked; nothing reported
 * is the light off with «?».
 */
import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import { rasterisedIconOnBaseline } from "@/lib/svg-utils"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import type { BDFFont } from "@/lib/bdffont"
import type { PillBand } from "@/lib/pill-raster"
import type { ButtonFace } from "@/lib/button-shape"
import { ASKED_HALF_MS, lightFill, toggleLooks, toggleName, type ToggleLook, type ToggleLooks } from "@/lib/toggle-button-shape"
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
  /** False where the device animates nothing (screen.motion: false): asked stands still. */
  motion?: boolean
  /** The time the pulse is drawn at; now when absent. */
  now?: number
}

type Run = { band: PillBand; colour: string | null }

const box = (x: number, y: number, w: number, h: number, r: number): PillBand => ({ x, y, w, h, rLow: r, rHigh: r })

/**
 * The runs of one face, in priority order (paint-pills.ts): the light first
 * - inside a 1-px ring where it needs one -, then the tile, its edge and its
 * fill.
 */
export function toggleRuns(x: number, y: number, w: number, h: number, look: ToggleLook, face: ButtonFace, light: string): Run[] {
  const runs: Run[] = []
  const l = look.light
  if (l.w > 0 && l.h > 0) {
    if (l.outline && l.w > 2 && l.h > 2) runs.push({ band: box(x + l.x + 1, y + l.y + 1, l.w - 2, l.h - 2, Math.max(0, l.r - 1)), colour: light })
    runs.push({ band: box(x + l.x, y + l.y, l.w, l.h, l.r), colour: l.outline ?? light })
  }
  if (face.outline) {
    runs.push({ band: box(x + 1, y + 1, w - 2, h - 2, Math.max(0, face.r - 1)), colour: face.fill })
    runs.push({ band: box(x, y, w, h, face.r), colour: face.outline })
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
  const asking = asked >= 0 && asked !== active
  // While asked, the light says what was asked for.
  const look = asking ? looks.states[asked] : active >= 0 ? looks.states[active] : looks.none
  if (!look) return looks
  const pressed = options.pressed === true
  const face = pressed ? look.pressed : look.normal
  const motion = options.motion !== false
  const now = options.now ?? Date.now()
  const light = lightFill(look, asking, motion, now)
  if (asking && motion) setTimeout(() => options.requestRedraw(), ASKED_HALF_MS - (now % ASKED_HALF_MS) + 5)

  paintPills(ctx, toggleRuns(x, y, w, h, look, face, light), background, options.colorDepth)

  // The state's icon before the name, in the ink.
  const iconId = (asking ? states[asked] : active >= 0 ? states[active] : undefined)?.iconAssetId
  const image = look.icon ? iconOf(options, iconId) : null
  if (look.icon && image && image.complete && image.naturalWidth > 0) {
    const key = buttonIconKey(String(iconId))
    const raster = rasterisedIconOnBaseline(image, look.icon.size, look.icon.size, key)
    if (raster) ctx.drawImage(colouredIcon(raster, key, face.ink), x + look.icon.x, y + look.icon.y)
  }

  const fontId = String(obj.properties.fontId ?? "")
  const name = toggleName(obj)
  // The name - or, an LED without a name, the state's label in its place.
  const first = name ?? (look.light.label ? undefined : look.label)
  if (first !== undefined) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x + look.clipX, y, look.clipW, h)
    ctx.clip()
    ctx.fillStyle = face.ink
    font(fontId).draw(first, x + look.textX, y + look.baseline)
    ctx.restore()
  }
  if (look.second) {
    ctx.save()
    ctx.fillStyle = look.second.ink
    font(look.second.fontId).draw(look.label, x + look.second.textX, y + look.second.baseline)
    ctx.restore()
  }
  const word = look.light.label
  if (word) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x + look.light.x, y + look.light.y, look.light.w, look.light.h)
    ctx.clip()
    ctx.fillStyle = asking ? word.askedInk : word.ink
    font(word.fontId).draw(word.text, x + word.textX, y + word.baseline)
    ctx.restore()
  }
  return looks
}
