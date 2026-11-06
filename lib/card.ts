/**
 * A card (docs/2026-11-03-card.md): a free area whose look comes from one
 * place in the project, Settings › Cards - corner radius, edge and padding -
 * and its colours from the theme: fill Panel, edge Outline, or Accent for
 * the accent card. Roles, never hex, so light and dark switch on the device.
 *
 * The layout pass writes a look's values into the area's own properties
 * (withCardLook), so the editor, the preview, the export and the HIL
 * reference read a card as any free area with a fill and an edge.
 */

import type { ScreenObject } from "@/components/project-editor"

export type CardLook = "card" | "card-accent"
export const CARD_LOOKS: readonly CardLook[] = ["card", "card-accent"]

export interface CardSettings {
  radiusMm: number
  edgePx: number
  accentEdgePx: number
  paddingMm: number
  /**
   * Every button's corner radius (docs/2026-11-04-native-buttons.md, module
   * button-radius); unset: a pill, as before. Not a card's, but where a
   * project's corners are set.
   */
  buttonRadiusMm?: number
}

/** The defaults (the user, 2026-11-03): about CamperUI's on the 4". */
export const CARD_DEFAULTS: CardSettings = { radiusMm: 2, edgePx: 1, accentEdgePx: 2, paddingMm: 2 }

const number = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback)

/** A project's card settings, each unset value at its default. */
export function cardSettingsOf(settings: { cards?: Partial<CardSettings> } | undefined): CardSettings {
  const c = settings?.cards ?? {}
  return {
    radiusMm: number(c.radiusMm, CARD_DEFAULTS.radiusMm),
    edgePx: number(c.edgePx, CARD_DEFAULTS.edgePx),
    accentEdgePx: number(c.accentEdgePx, CARD_DEFAULTS.accentEdgePx),
    paddingMm: number(c.paddingMm, CARD_DEFAULTS.paddingMm),
    ...(typeof c.buttonRadiusMm === "number" && Number.isFinite(c.buttonRadiusMm) && c.buttonRadiusMm >= 0 ? { buttonRadiusMm: c.buttonRadiusMm } : {}),
  }
}

/**
 * A button with the project's button radius written into it, in px
 * (`properties.buttonRadius`), the way a card gets its look's values: the
 * editor, the preview, the reference render and the export all read the
 * object. Taken out again when the setting is cleared - a pill.
 */
export function withButtonRadius(button: ScreenObject, cards: CardSettings, pixelsPerMm: number): ScreenObject {
  // A Toggle Button is a button with a look per state (docs/2026-11-06-toggle-button.md).
  if (button.type !== "button" && button.type !== "toggle-button") return button
  const p = button.properties ?? {}
  const wanted = typeof cards.buttonRadiusMm === "number" ? Math.round(cards.buttonRadiusMm * pixelsPerMm) : undefined
  if (p.buttonRadius === wanted) return button
  if (wanted === undefined) {
    if (!("buttonRadius" in p)) return button
    const { buttonRadius: _gone, ...rest } = p
    return { ...button, properties: rest }
  }
  return { ...button, properties: { ...p, buttonRadius: wanted } }
}

export function cardLookOf(obj: ScreenObject): CardLook | undefined {
  const look = obj.properties?.look
  return look === "card" || look === "card-accent" ? look : undefined
}

/** The properties a look sets on a free area, at a scale. */
export function cardProperties(look: CardLook, cards: CardSettings, pixelsPerMm: number) {
  return {
    fillColor: "panel",
    strokeColor: look === "card-accent" ? "accent" : "outline",
    strokeWidth: look === "card-accent" ? cards.accentEdgePx : cards.edgePx,
    cornerRadius: Math.round(cards.radiusMm * pixelsPerMm),
    padding: cards.paddingMm,
  }
}

/**
 * A free area with its look's values written into its properties; the same
 * object where they are there already, or where it has no look - which also
 * leaves an area set back to None with the values it had last, its own.
 */
export function withCardLook(area: ScreenObject, cards: CardSettings, pixelsPerMm: number): ScreenObject {
  if (area.type !== "free") return area
  const look = cardLookOf(area)
  if (!look) return area
  const wanted = cardProperties(look, cards, pixelsPerMm)
  const p = area.properties ?? {}
  if ((Object.keys(wanted) as Array<keyof typeof wanted>).every((key) => p[key] === wanted[key])) return area
  return { ...area, properties: { ...p, ...wanted } }
}
