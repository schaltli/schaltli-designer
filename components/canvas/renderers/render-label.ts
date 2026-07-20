/**
 * Label renderer - handles text label rendering with BDF fonts
 */

import type { ScreenmanObject, ScreenmanFont } from "@/components/screenman-editor"
import { BDFFont } from "@/lib/bdffont"
import { processPlaceholders, type PlaceholderContext } from "@/lib/placeholder-utils"
import { getFontHeight, getFontAscent, getFontDescent, getBDFFontAscent, getBDFFontDescent, getBDFFontHeight, alignToPixel, setupBDFCanvas, calculateBDFBaseline, setupPixelPerfectRendering, alignToPixelBoundary, forceIntegerCoordinates } from "@/lib/font-utils"
import { applyColorDepth } from "@/lib/color-depth"

export function renderLabel(
  ctx: CanvasRenderingContext2D,
  obj: ScreenmanObject,
  fonts: ScreenmanFont[],
  isSelected: boolean,
  zoom: number,
  bdfFontCache: Map<string, BDFFont>,
  placeholderContext?: PlaceholderContext,
  colorDepth?: string
): void {
  // Get font info to calculate proper bounding box height
  const fontId = obj.properties.fontId
  let boundingBoxHeight = obj.height // Default to object height
  
  if (fontId) {
    const font = fonts.find((f) => f.id === fontId)
    if (font) {
      // Use font object's size property (ascent + descent)
      boundingBoxHeight = getFontHeight(font)
    }
  }
  
  // Draw background with pixel-perfect positioning
  const labelBgColor = obj.properties.backgroundColor || "#ffffff"
  if (labelBgColor !== "transparent") {
    ctx.save()
    setupPixelPerfectRendering(ctx)
    ctx.fillStyle = applyColorDepth(labelBgColor, colorDepth)
    ctx.fillRect(forceIntegerCoordinates(obj.x), forceIntegerCoordinates(obj.y), forceIntegerCoordinates(obj.width), forceIntegerCoordinates(boundingBoxHeight))
    ctx.restore()
  }

  // Draw border with pixel-perfect positioning
  const labelBorderColor = obj.properties.borderColor !== undefined && obj.properties.borderColor !== null 
    ? obj.properties.borderColor 
    : "#cccccc"
  if (labelBorderColor !== "transparent") {
    ctx.save()
    ctx.strokeStyle = applyColorDepth(labelBorderColor, colorDepth)
    ctx.lineWidth = 1 // Fixed 1px border that scales with zoom
    // A 1px stroke centered on an integer coordinate straddles the pixel
    // boundary and gets anti-aliased across two rows/columns instead of
    // landing on one crisp pixel - offsetting by 0.5 (alignToPixelBoundary)
    // centers it on the pixel instead. Width/height shrink by 1 so the
    // stroke's outer edge lands on the same pixel column/row the fillRect
    // above already occupies, rather than one pixel further out.
    ctx.strokeRect(
      alignToPixelBoundary(Math.round(obj.x)),
      alignToPixelBoundary(Math.round(obj.y)),
      Math.round(obj.width) - 1,
      Math.round(boundingBoxHeight) - 1
    )
    ctx.restore()
  }
  // If border color is transparent, don't draw a border

  // Process text and split into lines
  const rawText = obj.properties.text || "Label"
  const text = placeholderContext ? processPlaceholders(rawText, placeholderContext) : rawText
  const lines = text.split("\n")

  // Check if label has a fontId and try to use BDF font
  let bdfFont: BDFFont | null = null

  console.log("=== RENDER LABEL DEBUG ===")
  console.log("Label object:", { id: obj.id, type: obj.type, fontId })
  console.log("Available fonts:", fonts.map(f => ({ id: f.id, name: f.name, hasData: !!f.data, dataLength: f.data?.length })))
  console.log("Font cache size:", bdfFontCache.size)
  console.log("Font cache keys:", Array.from(bdfFontCache.keys()))

  if (fontId) {
    console.log(`Looking for fontId: "${fontId}"`)
    
    // Try to get from cache first
    bdfFont = bdfFontCache.get(fontId) || null

    if (bdfFont) {
      console.log(`✓ Found BDF font in cache for fontId: "${fontId}"`)
    } else {
      console.log(`✗ BDF font NOT in cache for fontId: "${fontId}", trying to load...`)
      
      // If not in cache, try to parse and cache it
      const font = fonts.find((f) => f.id === fontId)
      console.log("Font lookup result:", font ? { id: font.id, name: font.name, hasData: !!font.data } : "NOT FOUND")
      
      if (font && font.data) {
        try {
          console.log(`Parsing BDF font "${font.name}" (data length: ${font.data.length})`)
          bdfFont = new BDFFont(font.data)
          bdfFontCache.set(fontId, bdfFont)
          console.log(`✓ BDF font parsed and cached successfully for fontId: "${fontId}"`)
        } catch (error) {
          console.error(`✗ Failed to parse BDF font "${font.name}":`, error)
          bdfFont = null
        }
      } else {
        console.error(`✗ Font not found or has no data. fontId: "${fontId}", found: ${!!font}, hasData: ${!!font?.data}`)
      }
    }
  } else {
    console.log("✗ No fontId specified for label")
  }
  
  console.log("Final bdfFont status:", bdfFont ? "LOADED" : "NULL")
  console.log("=== END DEBUG ===\n")

  // NEW RENDERING ORDER: 1. Baseline first, 2. Text, 3. Handles
  
  // 1. Draw baseline indicator first (if selected)
  if (isSelected && zoom > 0.5) {
    const fontMeta = fonts.find((f) => f.id === obj.properties.fontId)
    if (fontMeta && bdfFont) {
      const fontAscent = getFontAscent(fontMeta)
      const fontDescent = getFontDescent(fontMeta)
      const calculatedHeight = getFontHeight(fontMeta)
      
      // Calculate the actual baseline position based on how BDF fonts are rendered
      const baselineY = obj.y + fontAscent
      

      ctx.save()
      
      // Draw baseline with handle color
      ctx.strokeStyle = "#3b82f6" // Blue color (same as handles)
      ctx.lineWidth = 1 / zoom // Scale line width with zoom
      ctx.setLineDash([]) // Solid line
      ctx.beginPath()
      // Use integer coordinates for crisp lines
      ctx.moveTo(Math.round(obj.x), Math.round(baselineY))
      ctx.lineTo(Math.round(obj.x + obj.width), Math.round(baselineY))
      ctx.stroke()
      
      // Draw font metrics text
      ctx.fillStyle = "#666666" // Gray color for metrics
      ctx.font = `10px monospace`
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      const metricsText = `Height: ${calculatedHeight}px (${fontAscent}+${fontDescent}), Ascent: ${fontAscent}px`
      ctx.fillText(metricsText, alignToPixelBoundary(obj.x), alignToPixelBoundary(baselineY + 3))
      
      ctx.restore()
    }
  }

  // 2. Draw text
  ctx.fillStyle = applyColorDepth(obj.properties.color || "#000000", colorDepth)

  if (bdfFont) {
    console.log("✓ RENDERING WITH BDF FONT")
    // Canvas is already set up for pixel-perfect rendering at the canvas level
    ctx.save()

    // Clip glyph drawing to the label's own bounds. Text that's wider than
    // its box (a long string, or a font-metric measurement that's slightly
    // off) would otherwise bleed ink past the box edge - invisible in most
    // cases but a real, visible artifact once the overflow is only a
    // pixel or two, and a real mismatch source in HIL pixel comparisons
    // (2026-07-20) since the real device doesn't clip either and the two
    // renderers' text-width measurements don't always agree to the pixel.
    ctx.beginPath()
    ctx.rect(Math.round(obj.x), Math.round(obj.y), Math.round(obj.width), Math.round(boundingBoxHeight))
    ctx.clip()

    // Use BDF font rendering with pixel-perfect alignment
    const fontHeight = bdfFont.FONTBOUNDINGBOX?.h || 16
    const lineHeight = fontHeight * 1.2

    console.log(`BDF Font properties:`, {
      fontHeight,
      lineHeight,
      fontAscent: bdfFont.properties["FONT_ASCENT"] || bdfFont.properties["ASCENT"],
      textColor: obj.properties.color || "#000000",
      linesCount: lines.length
    })
    console.log("All BDF properties:", JSON.stringify(bdfFont.properties, null, 2))

    lines.forEach((line, index) => {
      // Calculate text width for alignment
      const textMetrics = bdfFont!.measureText(line)
      let textX = forceIntegerCoordinates(obj.x)

      // Handle text alignment
      const textAlign = obj.properties.textAlign || "left"
      if (textAlign === "center") {
        textX = forceIntegerCoordinates(obj.x + (obj.width - textMetrics.width) / 2)
      } else if (textAlign === "right") {
        textX = forceIntegerCoordinates(obj.x + obj.width - textMetrics.width)
      } else {
        textX = forceIntegerCoordinates(obj.x)
      }

      // Get font ascent from font object (pre-calculated during font loading)
      const fontMeta = fonts.find((f) => f.id === fontId)
      const fontAscent = fontMeta?.ascent || bdfFont!.properties["FONT_ASCENT"] || bdfFont!.properties["ASCENT"] || 14

      const baselineY = forceIntegerCoordinates(obj.y + fontAscent + index * lineHeight)

      console.log(`Drawing line ${index}: "${line}" at (${textX}, ${baselineY})`)
      
      // Draw the text using BDF font
      bdfFont!.drawText(ctx, line, textX, baselineY)
    })
    
    // Restore canvas state
    ctx.restore()
  } else {
    console.log("✗ FALLING BACK TO STANDARD FONT RENDERING")
    // Fall back to standard font rendering
    ctx.font = `${obj.properties.fontWeight || "normal"} ${obj.properties.fontSize || 14}px ${obj.properties.fontFamily || "Arial"}`
    ctx.textAlign = (obj.properties.textAlign || "left") as CanvasTextAlign
    ctx.textBaseline = "top"

    const lineHeight = (obj.properties.fontSize || 14) * 1.2

    let textX = obj.x
    if (obj.properties.textAlign === "center") {
      textX = obj.x + obj.width / 2
    } else if (obj.properties.textAlign === "right") {
      textX = obj.x + obj.width
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(Math.round(obj.x), Math.round(obj.y), Math.round(obj.width), Math.round(boundingBoxHeight))
    ctx.clip()
    lines.forEach((line, index) => {
      ctx.fillText(line, textX, obj.y + index * lineHeight)
    })
    ctx.restore()

    // Draw baseline indicator for standard fonts (if selected)
    if (isSelected && zoom > 0.5) {
      const fontSize = obj.properties.fontSize || 14
      const fontAscent = Math.round(fontSize * 0.8) // Estimate ascent as 80% of font size
      const baselineY = obj.y + fontAscent

      ctx.save()
      
      // Draw baseline with handle color
      ctx.strokeStyle = "#3b82f6" // Blue color (same as handles)
      ctx.lineWidth = 1 / zoom // Scale line width with zoom
      ctx.setLineDash([]) // Solid line
      ctx.beginPath()
      // Use integer coordinates for crisp lines
      ctx.moveTo(Math.round(obj.x), Math.round(baselineY))
      ctx.lineTo(Math.round(obj.x + obj.width), Math.round(baselineY))
      ctx.stroke()
      
      // Draw font metrics text
      ctx.fillStyle = "#666666" // Gray color for metrics
      ctx.font = `10px monospace`
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      const metricsText = `Height: ${fontSize}px, Ascent: ${fontAscent}px (est)`
      ctx.fillText(metricsText, alignToPixel(obj.x), alignToPixel(baselineY + 3))
      
      ctx.restore()
    }
  }

  // 3. Draw handles at the end of the baseline (if selected)
  if (isSelected && zoom > 0.5) {
    const fontMeta = fonts.find((f) => f.id === obj.properties.fontId)
    let baselineY: number
    
    if (fontMeta && bdfFont) {
      // For BDF fonts, use actual ascent from font object
      const fontAscent = getFontAscent(fontMeta)
      baselineY = obj.y + fontAscent
    } else {
      // For standard fonts, estimate ascent
      const fontSize = obj.properties.fontSize || 14
      const fontAscent = Math.round(fontSize * 0.8)
      baselineY = obj.y + fontAscent
    }
    
    const handleSize = 8 / zoom
    const half = handleSize / 2
    
    ctx.save()
    
    // Style handles like other handles
    ctx.fillStyle = "#3b82f6" // Blue fill
    ctx.strokeStyle = "#ffffff" // White stroke
    ctx.lineWidth = 1 / zoom
    
    // Draw handles at the start and end of the baseline
    const leftHandleX = obj.x - half
    const rightHandleX = obj.x + obj.width - half
    const handleY = baselineY - half
    
    // Left handle
    ctx.fillRect(leftHandleX, handleY, handleSize, handleSize)
    ctx.strokeRect(leftHandleX, handleY, handleSize, handleSize)
    
    // Right handle
    ctx.fillRect(rightHandleX, handleY, handleSize, handleSize)
    ctx.strokeRect(rightHandleX, handleY, handleSize, handleSize)
    
    ctx.restore()
  }
}
