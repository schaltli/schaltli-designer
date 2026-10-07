/**
 * Label renderer - static text label. Draws via the shared text-box
 * renderer (render-text-box.ts) also used by MQTT data fields, so a label
 * and a data field's box/text pixels can never drift apart again.
 */

import type { ScreenObject, ProjectFont } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import type { PlaceholderScope } from "@/lib/placeholders"
import { objectText } from "@/lib/object-text"
import { drawTextBox } from "./render-text-box"

export function renderLabel(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  fonts: ProjectFont[],
  isSelected: boolean,
  zoom: number,
  bdfFontCache: Map<string, BDFFont>,
  /** Where its live values and placeholders get their values; without one they show as before anything arrived. */
  placeholders?: PlaceholderScope,
  colorDepth?: string,
  requestRedraw?: () => void
): void {
  const rawText = obj.properties.text || "Label"
  const text = objectText(obj, rawText, placeholders)

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
