/**
 * The colours a newly placed control starts with, chosen by the device's
 * colour depth.
 *
 * A light grey border and a green bar look right on a colour LCD and wrong on
 * e-ink, where the panel wants a black frame on white. Until 2026-09-13 the
 * defaults were literals spread through project-editor.tsx's creation switch,
 * so every device got the LCD's look and an e-paper project started by
 * repainting every object by hand.
 *
 * Keyed on colour depth rather than on the device, which was the first
 * proposal and the wrong axis: the 1-bit e-paper and the 4-bit PaperS3 want
 * the same thing, the two 24-bit boards want the other thing, and a table per
 * device is five tables that can disagree about what a button looks like,
 * plus a sixth to write whenever a device is added. Depth is already in every
 * DDF and needs no new field.
 *
 * Roles rather than a colour per control type: thirteen types times several
 * fields is forty-odd entries to keep in step, and no control has yet wanted
 * a different background from its neighbour. If one ever does, it gets its
 * own role here rather than its own table.
 *
 * These are *creation* defaults. They are written into the project, so a
 * project keeps the colours it was drawn with and a later change here does
 * not repaint it. That follows from a project being bound to one device
 * anyway (settings.deviceId is a hard block, see docs/device-contract.md),
 * which makes "adapts when you switch device" a case that does not arise -
 * and buys predictability instead: what the file says is what you see.
 *
 * Separate from lib/color-depth.ts's quantization, which is about what a
 * panel *can* show. This is about what looks right on it. A colour picked by
 * hand still goes through the quantizer; these values are already on it.
 */
export interface ControlPalette {
  /** An object's own background, where it has one. */
  background: string
  /** The thin line around a field or a button - quieter than a stroke. */
  border: string
  /** Text on the object's own background. */
  text: string
  /** Text drawn over a filled area, so it cannot share the text colour. */
  textOnFill: string
  /** A drawn line or outline that is the object itself: line, box. */
  stroke: string
  /** The part of a gauge that represents the value. */
  fill: string
  /** The part of a gauge that does not: the arc's unfilled ring. */
  track: string
  /** The arc's setpoint mark. */
  marker: string
  /** A state marker: the Switch's active bar. */
  accent: string
}

const COLOR_24BIT: ControlPalette = {
  // Exactly the literals that were in project-editor.tsx before this file
  // existed, so nothing changes for a device that can show them.
  background: "#ffffff",
  border: "#cccccc",
  text: "#000000",
  textOnFill: "#ffffff",
  stroke: "#000000",
  // Material 3's primary and secondary container, chosen by the user on
  // 2026-09-19 over keeping the greens. Noted because it was raised and
  // chosen anyway: these are Google's brand colours, and this is the one
  // place to change that.
  fill: "#6750A4",
  // Light, not the #303030 this was: the unfilled part of a gauge is now a
  // tinted run rather than a dark ring behind a bright one, which is what
  // lets a bar read as one shape instead of a box with a rectangle in it.
  track: "#E8DEF8",
  // Dark, because the track it sits on is now light. Over the fill it is
  // darker-on-dark and so quieter than the white it replaced - acceptable
  // while the arc has no gap around its marker; the bar solves this with the
  // handle's overhang instead.
  marker: "#1D192B",
  // Follows the fill: a page with a slider and a Switch should not have two
  // different "this one is active" colours.
  accent: "#6750A4",
}

// Sixteen greys, all of them on the ramp lib/color-depth.ts snaps to
// (multiples of 17), so nothing here is moved by the quantizer afterwards.
const GREY_4BIT: ControlPalette = {
  background: "#ffffff",
  border: "#000000",
  text: "#000000",
  textOnFill: "#ffffff",
  stroke: "#000000",
  fill: "#000000",
  // Light enough to read as "not filled yet" and still visible against white.
  track: "#dddddd",
  // Mid grey, so the setpoint is legible against both the black fill and the
  // light track.
  marker: "#888888",
  accent: "#000000",
  // The track's own #dddddd is visible on white, so no frame is needed.
}

const MONO_1BIT: ControlPalette = {
  background: "#ffffff",
  border: "#000000",
  text: "#000000",
  textOnFill: "#ffffff",
  stroke: "#000000",
  fill: "#000000",
  // Invisible on purpose: with two colours, an unfilled ring drawn in the
  // only other one is a solid black circle that hides the value. The arc
  // shows its filled part and nothing else.
  track: "#ffffff",
  // Cannot be told from the fill, and no colour choice fixes that - one bit
  // has no third value. The setpoint needs a shape of its own on this depth.
  //
  // Since 2026-09-19 the *bar* has one: its handle stands out of the track on
  // both sides, and the gap around it is white, so shape carries what colour
  // cannot. The arc still has no such shape and so still cannot show one.
  marker: "#000000",
  accent: "#000000",
}

export function controlPalette(colorDepth: string | undefined): ControlPalette {
  switch (colorDepth) {
    case "1bit":
      return MONO_1BIT
    case "4bit":
      return GREY_4BIT
    default:
      return COLOR_24BIT
  }
}
