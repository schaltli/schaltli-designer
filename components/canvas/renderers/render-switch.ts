/**
 * Switch renderer - an n-state segmented control, one segment per
 * obj.properties.states entry. Read-bound: the active segment is whichever
 * state's readValue matches the current value of obj.properties.topic (design-
 * time preview value here, the real retained MQTT value on a device) - exact
 * trimmed-string match, same comparison style as evaluateCondition()'s "=="
 * in lib/render-screen.ts. No match (including "no topic bound yet" or "no
 * retained value received yet") means no segment is drawn active, matching
 * the loop's live-editing behavior. This is a static, read-only preview: the
 * tap-to-select interaction, the pending/loading indicator, and the 3s
 * timeout rollback are all live round-trip behavior that only exists once a
 * device is actually running - see the 2026-08-12 Switch design discussion
 * in this session for why none of that belongs on the design-time canvas.
 *
 * Segment labels use the same real BDF/TTF glyph rendering as
 * render-text-box.ts (loadBdfFont/drawTextBox) rather than SoftwareButton's
 * generic-canvas-text approximation - a font choice that only changed the
 * numeric size without changing the glyph shape read as "the font selector
 * doesn't do anything" (2026-08-13 finding). Segment labels are short and
 * single-line, so this only needs the centered-single-line subset of that
 * logic, not the full multi-line/selection-baseline machinery.
 */

import type { ScreenObject, ProjectFont, ProjectAsset } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { getFontAscent, getFontDescent } from "@/lib/font-utils"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"

export interface SwitchState {
  id: string
  label: string
  readValue: string
  writeValue: string
  iconAssetId?: string
}

interface RenderSwitchOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  projectAssets: ProjectAsset[]
  isSelected: boolean
  zoom: number
  iconImageCache: Map<string, HTMLImageElement>
  bdfFontCache: Map<string, BDFFont>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  requestRedraw: () => void
}

export function getActiveSwitchStateIndex(
  obj: ScreenObject,
  getPreviewValueFromTopic: (topicName: string | undefined) => string,
): number {
  const states: SwitchState[] = obj.properties.states || []
  if (!obj.properties.topic) return -1
  const topicValue = getPreviewValueFromTopic(obj.properties.topic).trim()
  return states.findIndex((s) => (s.readValue ?? "").trim() === topicValue)
}

// Same guard as render-text-box.ts's loadBdfFont: BDFFont's parser doesn't
// throw on non-BDF input, so a TTF font's base64 data would otherwise
// "successfully" parse into a font with nothing to draw instead of falling
// through to the TTF branch.
function loadBdfFont(fontId: string | undefined, fonts: ProjectFont[], bdfFontCache: Map<string, BDFFont>): BDFFont | null {
  if (!fontId) return null
  const cached = bdfFontCache.get(fontId)
  if (cached) return cached

  const font = fonts.find((f) => f.id === fontId)
  if (!font || !font.data || font.format === "ttf") return null

  try {
    const bdfFont = new BDFFont(font.data)
    bdfFontCache.set(fontId, bdfFont)
    return bdfFont
  } catch {
    return null
  }
}

// Draws `label` centered horizontally within [centerX - maxWidth/2, centerX + maxWidth/2].
// `anchorTop` is either a fixed top Y (text starts there, used below an icon) or
// undefined to center vertically within the segment's full height instead.
function drawSegmentLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  centerX: number,
  maxWidth: number,
  segmentTop: number,
  segmentHeight: number,
  anchorTop: number | undefined,
  fontId: string | undefined,
  fonts: ProjectFont[],
  bdfFontCache: Map<string, BDFFont>,
  requestRedraw: () => void,
): void {
  const fontMeta = fonts.find((f) => f.id === fontId)
  const bdfFont = loadBdfFont(fontId, fonts, bdfFontCache)

  if (bdfFont && fontMeta) {
    const ascent = getFontAscent(fontMeta)
    const descent = getFontDescent(fontMeta)
    const baselineY =
      anchorTop !== undefined ? anchorTop + ascent : segmentTop + (segmentHeight - (ascent + descent)) / 2 + ascent
    const textWidth = bdfFont.measureText(label).width
    const textX = Math.round(centerX - Math.min(textWidth, maxWidth) / 2)
    bdfFont.drawText(ctx, label, textX, Math.round(baselineY))
    return
  }

  if (fontMeta?.format === "ttf") {
    if (!isTtfFontLoaded(fontMeta)) {
      ensureTtfFontRegistered(fontMeta, requestRedraw)
    }
    const familyName = fontMeta.internalName ?? fontMeta.name
    ctx.font = `${fontMeta.size}px "${familyName}"`
    ctx.textAlign = "center"
    ctx.textBaseline = anchorTop !== undefined ? "top" : "middle"
    ctx.fillText(label, centerX, anchorTop !== undefined ? anchorTop : segmentTop + segmentHeight / 2, maxWidth)
    return
  }

  // No font resolved at all (no fontId, or a dangling reference) - generic
  // fallback so the designer stays usable/previewable, matching
  // render-text-box.ts's own final fallback.
  ctx.font = "11px sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = anchorTop !== undefined ? "top" : "middle"
  ctx.fillText(label, centerX, anchorTop !== undefined ? anchorTop : segmentTop + segmentHeight / 2, maxWidth)
}

export function renderSwitch(options: RenderSwitchOptions): void {
  const { ctx, obj, fonts, projectAssets, iconImageCache, bdfFontCache, getPreviewValueFromTopic, requestRedraw } = options

  const states: SwitchState[] = obj.properties.states || []
  const backgroundColor = obj.properties.backgroundColor || "#ffffff"
  const activeBackgroundColor = obj.properties.activeBackgroundColor || "#2563eb"
  const borderColor = obj.properties.borderColor || "#cccccc"
  const textColor = obj.properties.textColor || "#000000"
  const activeTextColor = obj.properties.activeTextColor || "#ffffff"

  // Outer border around the whole control, drawn regardless of state count
  // so an empty/misconfigured Switch is still visible and selectable.
  ctx.strokeStyle = borderColor
  ctx.lineWidth = 1
  ctx.strokeRect(obj.x + 0.5, obj.y + 0.5, obj.width - 1, obj.height - 1)

  if (states.length === 0) {
    ctx.fillStyle = "#999999"
    ctx.font = "11px sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("No states defined", obj.x + obj.width / 2, obj.y + obj.height / 2)
    return
  }

  const activeIndex = getActiveSwitchStateIndex(obj, getPreviewValueFromTopic)
  const segmentWidth = obj.width / states.length
  const fontId = obj.properties.fontId as string | undefined

  states.forEach((state, index) => {
    const segX = obj.x + index * segmentWidth
    const isActive = index === activeIndex

    ctx.fillStyle = isActive ? activeBackgroundColor : backgroundColor
    ctx.fillRect(segX, obj.y, segmentWidth, obj.height)

    // Divider between segments (not before the first one - the outer
    // border already covers that edge).
    if (index > 0) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(Math.round(segX) + 0.5, obj.y)
      ctx.lineTo(Math.round(segX) + 0.5, obj.y + obj.height)
      ctx.stroke()
    }

    const centerX = segX + segmentWidth / 2
    const asset = state.iconAssetId ? projectAssets.find((a) => a.id === state.iconAssetId) : undefined
    const hasIcon = !!(asset && asset.data)
    const label = state.label || ""

    let iconBottom = obj.y
    if (hasIcon) {
      const iconSize = Math.min(segmentWidth - 8, obj.height * 0.5)
      const iconX = centerX - iconSize / 2
      const iconY = obj.y + 4
      iconBottom = iconY + iconSize + 2

      const cacheKey = `${asset!.id}_optimized`
      let img = iconImageCache.get(cacheKey)
      if (!img) {
        img = new Image()
        img.crossOrigin = "anonymous"
        iconImageCache.set(cacheKey, img)
        img.onload = () => {
          if (img!.complete && img!.naturalWidth > 0) {
            requestAnimationFrame(() => requestRedraw())
          }
        }
        img.onerror = () => iconImageCache.delete(cacheKey)
        img.src = asset!.data
      }

      if (img.complete && img.naturalWidth > 0) {
        try {
          ctx.drawImage(img, iconX, iconY, iconSize, iconSize)
        } catch {
          // Image not decodable yet - skip this frame, redraw fires on load
        }
      }
    }

    if (label) {
      ctx.fillStyle = isActive ? activeTextColor : textColor
      drawSegmentLabel(
        ctx,
        label,
        centerX,
        segmentWidth - 4,
        obj.y,
        obj.height,
        hasIcon ? iconBottom : undefined,
        fontId,
        fonts,
        bdfFontCache,
        requestRedraw,
      )
    }
  })
}
