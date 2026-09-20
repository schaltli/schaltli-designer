/**
 * The colour rules every Material-styled control here shares: what a label on
 * a colour has to be, and how a quieter shade of a colour is made.
 *
 * One place, because the button, the switch and the slider have to agree - a
 * tonal button beside a slider's empty track beside a switch's track are the
 * same colour or they look like three unrelated controls
 * (docs/2026-09-19-button-look.md, decision 2).
 */

import { applyColorDepth } from "@/lib/color-depth"

/** A colour as three whole channels, or null for anything that is not hex. */
export function colorChannels(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(c)) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)]
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(c)) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
  }
  return null
}

export function colorHex(channels: [number, number, number]): string {
  return "#" + channels.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")
}

/**
 * `over` laid on `under` at `percent`. An unreadable colour leaves `under` as
 * it is, which is always a colour that exists rather than a guess.
 */
export function blendColors(under: string, over: string, percent: number): string {
  const u = colorChannels(under)
  const o = colorChannels(over)
  if (!u || !o) return under
  return colorHex(u.map((v, i) => v + Math.round(((o[i] - v) * percent) / 100)) as [number, number, number])
}

/** WCAG's relative luminance. */
export function relativeLuminance(color: string): number {
  const c = colorChannels(color)
  if (!c) return 1
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A colour's tone: its CIELAB lightness L*, which is what Material picks by. */
export function colorTone(color: string): number {
  const y = relativeLuminance(color)
  return y <= 216 / 24389 ? (y * 24389) / 27 : 116 * Math.cbrt(y) - 16
}

/**
 * White on a dark colour, black on a light one - Material's own rule
 * (DynamicColor.tonePrefersLightForeground): white below a tone of 60.
 *
 * Not "whichever has the higher WCAG contrast", which switches at tone 49 and
 * so puts black on Material's own blue, on a red and on a petrol - more
 * contrast by the number, less to the eye (2026-09-19, the user: "zuwenig
 * kontrast zB bei dunkelblau").
 */
export function onColorFor(color: string, colorDepth: string | undefined): string {
  return applyColorDepth(Math.round(colorTone(color)) < 60 ? "#ffffff" : "#000000", colorDepth)
}
