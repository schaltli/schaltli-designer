import type { ScreenmanFont } from "@/components/screenman-editor"

// Registers TTF ScreenmanFonts with the browser via the FontFace API so
// canvas `ctx.font = "...px <name>"` actually resolves to them, instead of
// silently falling back to a system font with the same declared family
// name. Module-level state (survives across renders/project reloads within
// the same page) since FontFace.load() is real network/parse work -
// re-registering the same font on every redraw would be wasteful.
const fontState = new Map<string, "loading" | "loaded" | "failed">()

function familyNameOf(font: ScreenmanFont): string {
  return font.internalName ?? font.name
}

// Synchronous check for renderers: is this font ready to draw with *this
// frame*, or should they fall back to a generic font and let a redraw pick
// up the real one once it's loaded (see ensureTtfFontRegistered below)?
export function isTtfFontLoaded(font: ScreenmanFont): boolean {
  return fontState.get(familyNameOf(font)) === "loaded"
}

// Fire-and-forget: starts loading the font if it isn't already
// loading/loaded/failed, and calls onLoaded() once it succeeds - mirrors
// the requestRedraw-on-load pattern render-icon.ts already uses for
// asynchronously-loaded icon images. Renderers call this every frame they
// need a not-yet-loaded TTF font; it's a no-op once the font is settled.
export function ensureTtfFontRegistered(font: ScreenmanFont, onLoaded: () => void): void {
  if (font.format !== "ttf" || !font.data) return
  const familyName = familyNameOf(font)
  if (fontState.has(familyName)) return
  fontState.set(familyName, "loading")

  const face = new FontFace(familyName, `url(${font.data})`)
  face
    .load()
    .then(() => {
      document.fonts.add(face)
      fontState.set(familyName, "loaded")
      requestAnimationFrame(onLoaded)
    })
    .catch((error) => {
      console.error(`[ttf-font-registry] Failed to load font "${familyName}":`, error)
      fontState.set(familyName, "failed")
    })
}
