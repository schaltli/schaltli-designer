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
 * Snaps a colour to the nearest of a 16-grey ramp, by luminance.
 *
 * For a device whose panel has sixteen grey levels and no colour at all - the
 * M5Stack PaperS3 as of 2026-09-13. Without this the designer previews a
 * green label on a grey box as green, the panel shows both as some grey, and
 * the two can land on the same one: text that is perfectly readable in the
 * design and invisible on the device. No pixel comparison can catch that,
 * because it compares the designer against the device's framebuffer and the
 * panel's own colour mapping happens after both.
 *
 * The exact spacing of the sixteen greys does not matter, and the exact
 * luminance formula does not either - what matters is that one rule decides,
 * everywhere. This one is Rec. 601 in integer arithmetic, and the targets are
 * pure greys (r=g=b), so any later mapping a panel driver applies maps them
 * to themselves.
 *
 * There is deliberately no second implementation to keep in sync. Unlike the
 * 1-bit path, where the firmware quantizes and the designer mirrors its
 * quirk, this runs once - at export time (lib/project-zip.ts) as well as at
 * draw time - so the device simply parses the grey it was handed. The
 * hardest part of a two-sided rounding rule is the second side; here there
 * is none.
 */
export function quantizeColorFor4Bit(color: string): string {
  const c = color.trim().toLowerCase()
  if (c === "black") return "#000000"
  if (c === "white") return "#ffffff"

  let r: number, g: number, b: number
  if (/^#[0-9a-f]{3}$/.test(c)) {
    r = parseInt(c[1] + c[1], 16)
    g = parseInt(c[2] + c[2], 16)
    b = parseInt(c[3] + c[3], 16)
  } else if (/^#[0-9a-f]{6,8}$/.test(c)) {
    r = parseInt(c.slice(1, 3), 16)
    g = parseInt(c.slice(3, 5), 16)
    b = parseInt(c.slice(5, 7), 16)
  } else {
    // Not a colour this can read - a named colour beyond black/white, a
    // gradient, anything. Left alone rather than guessed at, and it will
    // show up as a difference rather than as a silently wrong grey.
    return color
  }

  const luma = (77 * r + 150 * g + 29 * b + 128) >> 8
  const level = Math.floor((luma * 15 + 127) / 255)
  const grey = level * 17
  const hex = grey.toString(16).padStart(2, "0")
  return `#${hex}${hex}${hex}`
}

/**
 * Applies quantizeColorFor1Bit only when the project's declared colorDepth
 * is "1bit". "transparent" and empty values pass through unquantized -
 * transparency isn't a color to threshold, and object border colors default
 * to it (see render-label.ts/render-mqtt-field.ts's "transparent" checks).
 */
export function applyColorDepth(color: string | undefined | null, colorDepth: string | undefined): string {
  if (!color || color === "transparent") return color || ""
  if (colorDepth === "1bit") return quantizeColorFor1Bit(color)
  if (colorDepth === "4bit") return quantizeColorFor4Bit(color)
  return color
}
