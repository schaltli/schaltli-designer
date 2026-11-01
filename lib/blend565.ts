import type { Rgb565 } from "@/lib/arc-raster"
import { blend565 } from "@/lib/level-glow"

/**
 * A 4-bit font's coverage (0-15) of `ink` over `under`, in RGB565 - the blend
 * every device draws text with (docs/device-contract.md, «Font depth»;
 * docs/2026-11-01-4bit-fonts.md, decision 7). Coverage becomes an alpha out
 * of 256, floor((c * 256 + 7) / 15), mixed as the level glow mixes. 0 leaves
 * `under`, 15 is `ink` exactly.
 *
 * Written once more in the firmware (src/project/GlyphPixels.h,
 * blendCoverage565); both are checked against lib/fixtures/blend565-cases.json.
 */
export function blendCoverage565(under: Rgb565, ink: Rgb565, coverage: number): Rgb565 {
  if (coverage <= 0) return under
  if (coverage >= 15) return ink
  return blend565(under, ink, Math.floor((coverage * 256 + 7) / 15))
}
