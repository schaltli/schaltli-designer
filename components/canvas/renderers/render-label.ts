/**
 * Label renderer - static text label. Draws via the shared text-box
 * renderer (render-text-box.ts) also used by MQTT data fields, so a label
 * and a data field's box/text pixels can never drift apart again.
 */

import type { ScreenmanObject, ScreenmanFont } from "@/components/screenman-editor"
import { BDFFont } from "@/lib/bdffont"
import { processPlaceholders, type PlaceholderContext } from "@/lib/placeholder-utils"
import { drawTextBox } from "./render-text-box"

export function renderLabel(
  ctx: CanvasRenderingContext2D,
  obj: ScreenmanObject,
  fonts: ScreenmanFont[],
  isSelected: boolean,
  zoom: number,
  bdfFontCache: Map<string, BDFFont>,
  placeholderContext?: PlaceholderContext,
  colorDepth?: string,
  requestRedraw?: () => void
): void {
  const rawText = obj.properties.text || "Label"
  const text = placeholderContext ? processPlaceholders(rawText, placeholderContext) : rawText

  drawTextBox({
    ctx,
    obj,
    text,
    fonts,
    isSelected,
    zoom,
    bdfFontCache,
    colorDepth,
    requestRedraw,
  })
}
