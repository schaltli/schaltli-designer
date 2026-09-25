/**
 * Label renderer - static text label. Draws via the shared text-box
 * renderer (render-text-box.ts) also used by MQTT data fields, so a label
 * and a data field's box/text pixels can never drift apart again.
 */

import type { ScreenObject, ProjectFont } from "@/components/project-editor"
import { BDFFont } from "@/lib/bdffont"
import { resolveIn, type PlaceholderScope } from "@/lib/placeholders"
import { drawTextBox } from "./render-text-box"

export function renderLabel(
  ctx: CanvasRenderingContext2D,
  obj: ScreenObject,
  fonts: ProjectFont[],
  isSelected: boolean,
  zoom: number,
  bdfFontCache: Map<string, BDFFont>,
  /** Resolves `{topic:…}` and the like; without one the text is drawn as written. */
  placeholders?: PlaceholderScope,
  colorDepth?: string,
  requestRedraw?: () => void
): void {
  const rawText = obj.properties.text || "Label"
  const text = resolveIn(rawText, placeholders)

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
