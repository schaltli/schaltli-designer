/**
 * Color depth simulation for embedded displays.
 *
 * The designer canvas is full RGB, but 1-bit e-paper devices can only show
 * pure black or white per pixel. Drawing a literal CSS color like "#cccccc"
 * (light gray) looks fine in the browser but the device quantizes it to one
 * of the two - so a strict pixel comparison against a real device snapshot
 * will never match unless the designer quantizes the same way first.
 */

/**
 * Mirrors the firmware's ScreenRenderer::parseColor() exactly (not a "more
 * correct" luminance formula) - pixel parity requires matching the device's
 * actual behavior, including its quirks: pure black/white pass through,
 * anything else falls back to checking whether the red channel's high
 * nibble is 0-7 (roughly < 0x80) to decide black, otherwise white.
 */
export function quantizeColorFor1Bit(color: string): string {
  const c = color.trim().toLowerCase()
  if (c === "#000000" || c === "black" || c === "#000") return "#000000"
  if (c === "#ffffff" || c === "white" || c === "#fff") return "#ffffff"
  if (c.length >= 7 && c[0] === "#") {
    const redNibble = c[1]
    if (redNibble >= "0" && redNibble <= "7") return "#000000"
  }
  return "#ffffff"
}

/**
 * Applies quantizeColorFor1Bit only when the project's declared colorDepth
 * is "1bit". "transparent" and empty values pass through unquantized -
 * transparency isn't a color to threshold, and object border colors default
 * to it (see render-label.ts/render-mqtt-field.ts's "transparent" checks).
 */
export function applyColorDepth(color: string | undefined | null, colorDepth: string | undefined): string {
  if (!color || color === "transparent") return color || ""
  if (colorDepth !== "1bit") return color
  return quantizeColorFor1Bit(color)
}
