/**
 * Text field renderer - a topic's text in a field a finger can type into
 * (lib/text-field.ts, tasks/ha-text-plan.md).
 *
 * Material's filled text field, reduced to what every device can draw the
 * same: a rounded container in «Panel», a 2-px line along its bottom in the
 * accent, and the text in «Text», cut at the inner edge. The container and
 * the line are the integer rasteriser's (fillRoundRect), the one the
 * firmware and the app port, so no corner pixel is left to disagree over.
 */

import type { ScreenObject, ProjectFont } from "@/components/project-editor"
import type { BDFFont } from "@/lib/bdffont"
import { applyColorDepth } from "@/lib/color-depth"
import { fontMetricsOf } from "@/lib/level-shape"
import { hasNoValue } from "@/lib/render-screen"
import { ensureTtfFontRegistered, isTtfFontLoaded } from "@/lib/ttf-font-registry"
import { shownText, textFieldBaseline, textFieldGeometry, HIDDEN_CHAR } from "@/lib/text-field"
import { loadBdfFont } from "./render-text-box"
import { fillRoundRect } from "./render-box"

export interface RenderTextFieldOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenObject
  fonts: ProjectFont[]
  bdfFontCache: Map<string, BDFFont>
  getPreviewValueFromTopic: (topicName: string | undefined) => string
  getAskedValueFromTopic?: (topicName: string | undefined) => string
  colorDepth?: string
  requestRedraw?: () => void
}

/**
 * The text the field shows: what was sent, until the topic reports back, as
 * a slider shows its handle (decision 6); then what the topic says. Without
 * a read topic the write topic is read instead: it keeps what was sent -
 * Home Assistant's optimistic text.
 */
export function textFieldValue(
  obj: ScreenObject,
  getPreviewValueFromTopic: (topicName: string | undefined) => string,
  getAskedValueFromTopic: (topicName: string | undefined) => string,
): string {
  const topic = (obj.properties.topic as string | undefined) || (obj.properties.writeTopic as string | undefined)
  if (!topic) return ""
  const asked = getAskedValueFromTopic(topic)
  if (!hasNoValue(asked)) return asked
  const value = getPreviewValueFromTopic(topic)
  return hasNoValue(value) ? "" : value
}

export function renderTextField(options: RenderTextFieldOptions): void {
  const { ctx, obj, fonts, bdfFontCache, colorDepth } = options
  const x = Math.round(obj.x)
  const y = Math.round(obj.y)
  const w = Math.max(1, Math.round(obj.width))
  const h = Math.max(1, Math.round(obj.height))
  const g = textFieldGeometry(w, h)
  const field = applyColorDepth(obj.properties.fieldColor || "#e7e0ec", colorDepth)
  const ink = applyColorDepth(obj.properties.textColor || "#1d1b20", colorDepth)
  const line = applyColorDepth(obj.properties.lineColor || "#6750a4", colorDepth)

  fillRoundRect(ctx, x, y, w, h, g.radius, field)
  if (w > 2 * g.radius) fillRoundRect(ctx, x + g.radius, y + g.lineY, w - 2 * g.radius, g.lineHeight, 0, line)

  const value = textFieldValue(obj, options.getPreviewValueFromTopic, options.getAskedValueFromTopic ?? (() => ""))
  if (value === "") return

  const fontMeta = fonts?.find((f) => f.id === obj.properties.fontId)
  const bdfFont = loadBdfFont(obj, fonts, bdfFontCache)
  const hasBullet = bdfFont ? Boolean(bdfFont.glyphs[HIDDEN_CHAR.codePointAt(0)!]) : true
  const text = shownText(value, obj.properties.hidden === true, hasBullet)
  const m = fontMetricsOf(fontMeta, 14)
  const baseline = y + textFieldBaseline(h, m.ascent, m.descent)

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + g.pad, y, Math.max(0, w - 2 * g.pad), h)
  ctx.clip()
  ctx.fillStyle = ink
  if (bdfFont) {
    bdfFont.drawText(ctx, text, x + g.pad, baseline)
  } else {
    const isTtf = fontMeta?.format === "ttf"
    if (isTtf && fontMeta && !isTtfFontLoaded(fontMeta)) ensureTtfFontRegistered(fontMeta, options.requestRedraw ?? (() => {}))
    const family = isTtf && fontMeta ? `"${fontMeta.internalName ?? fontMeta.name}"` : "sans-serif"
    ctx.font = `normal ${fontMeta?.size || 14}px ${family}`
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(text, x + g.pad, baseline)
  }
  ctx.restore()
}
