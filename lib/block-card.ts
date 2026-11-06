/**
 * A block as a card (docs/2026-11-03-card-blocks.md; of one part too since
 * 2026-11-06, docs/2026-11-05-quick-blocks.md): a free
 * area with the look Card, its name docked at the top - with its icon, the
 * two as a small table of one row - and its parts below, the table
 * blockTable builds without its name column, docked Fill across the card.
 * As tall as its heading, the gap and its parts need inside the padding.
 */

import type { ScreenObject } from "@/components/project-editor"
import { blockTable, type BausteinBuildResult } from "@/lib/bausteine"
import { cardSettingsOf } from "@/lib/card"
import { layoutObjects, naturalWidth, type LayoutScale } from "@/lib/layout"
import { SNAP_GAP_MM } from "@/lib/snap-table"

type Piece = Omit<ScreenObject, "id" | "zIndex">

const docked = (piece: Piece, dock: "top" | "fill", zIndex: number): Piece & { zIndex: number } => ({
  ...piece,
  x: 0,
  y: 0,
  zIndex,
  properties: { ...piece.properties, dock },
})

// Ids for laying a piece out once, to measure it: docking places by id.
function withIds(piece: Piece, prefix: string): ScreenObject {
  let n = 0
  const walk = (o: Piece): ScreenObject => ({ ...o, id: `${prefix}-${n++}`, zIndex: (o as ScreenObject).zIndex ?? 0, ...(o.children ? { children: o.children.map(walk) } : {}) }) as ScreenObject
  return walk(piece)
}

/** The width a block's parts need: their table's, as narrow as it goes. */
export function blockPartsWidth(built: BausteinBuildResult, scale: LayoutScale): number {
  const controls = built.objects.slice(built.labelCount ?? 0)
  return naturalWidth(withIds(blockTable({ ...built, objects: controls, labelCount: 0 }), "width"), scale)
}

/**
 * The card a block is placed as: its parts `width` wide, as
 * the block was built - or as wide as they need, up to `maxWidth` (the room
 * the screen has for them) - the card its padding wider on each side.
 *
 * At `width` alone a part wider than that - a block's four modes side by
 * side - made the parts' table wider than the card, and docked Fill it was
 * left out: the card came empty, on the 4" and the 4.3B alike (the user,
 * 2026-11-04).
 */
export function blockCard(built: BausteinBuildResult, width: number, scale: LayoutScale, maxWidth = Infinity): Piece {
  const padding = Math.round(cardSettingsOf({ cards: scale.cards }).paddingMm * scale.pixelsPerMm)
  const count = built.labelCount ?? 0
  const name = built.objects.slice(0, count)
  const controls = built.objects.slice(count)
  width = Math.max(width, Math.min(blockPartsWidth(built, scale), maxWidth))
  // The heading docks first: highest in the object list, highest zIndex.
  const heading =
    name.length > 1 ? docked(blockTable({ ...built, objects: name, labelCount: name.length }), "top", 2) : name.length === 1 ? docked(name[0], "top", 2) : null
  const parts = docked(blockTable({ ...built, objects: controls, labelCount: 0 }), "fill", 1)
  const card: Piece = {
    type: "free",
    x: 0,
    y: 0,
    width: width + 2 * padding,
    height: 0,
    properties: { look: "card" },
    children: [...(heading ? [heading] : []), parts] as ScreenObject[],
  }
  // Laid out at a height with room to spare: what it holds ends where its
  // content does; the card ends the padding below that.
  const [laid] = layoutObjects([withIds({ ...card, height: 100000 }, "measure")], scale)
  const bottom = Math.max(0, ...(laid.children ?? []).map((c) => c.y + c.height))
  return { ...card, height: bottom + padding }
}

/**
 * The width a block's parts are built at, so its card is half the screen
 * (blockCardHalf): the half less the card's padding on each side - what a
 * slider or a bar takes as its length.
 */
export function blockPartsRoom(screenWidth: number, scale: LayoutScale): number {
  const padding = Math.round(cardSettingsOf({ cards: scale.cards }).paddingMm * scale.pixelsPerMm)
  return Math.max(1, blockCardHalf(screenWidth, scale) - 2 * padding)
}

/**
 * Half the screen for a block's card: two of them side by side, snapped into
 * a table, fit it - the margin left at each side and the table's gap between
 * them taken off first. Two plain halves stood a few pixels over its edge.
 */
export function blockCardHalf(screenWidth: number, scale: LayoutScale): number {
  const gap = Math.round(SNAP_GAP_MM * scale.pixelsPerMm)
  return Math.floor((screenWidth - 2 * BLOCK_SCREEN_MARGIN - gap) / 2)
}

/** A text size a row of buttons can be set in, smallest last. */
export type SmallerStyle = (style: "large" | "standard") => Record<string, unknown> | undefined

/** What a block's card leaves free at each side of the screen at its widest. */
export const BLOCK_SCREEN_MARGIN = 8

/**
 * The card a prebuilt is placed as, of one part or several (the user,
 * 2026-11-06): half as wide as the screen `screenWidth` wide, wider where its
 * parts need it, at most the screen less a margin each side - on the 4" a
 * light half the screen and a block of four modes nearly all of it, on a tablet both
 * half. Where its parts need more than that - a block's four modes in the
 * label size on the 4" - its rows of buttons are set a text size smaller,
 * and another, until they fit (the user, 2026-11-04). What still does not
 * fit stands in the card, cut at its edge (lib/dock.ts).
 */
export function fittedBlockCard(built: BausteinBuildResult, scale: LayoutScale, screenWidth: number, smaller?: SmallerStyle): Piece {
  const padding = Math.round(cardSettingsOf({ cards: scale.cards }).paddingMm * scale.pixelsPerMm)
  const room = screenWidth - 2 * BLOCK_SCREEN_MARGIN - 2 * padding
  const width = blockPartsRoom(screenWidth, scale)
  let objects = built.objects
  for (const style of ["large", "standard"] as const) {
    if (!smaller || blockPartsWidth({ ...built, objects }, scale) <= room) break
    const font = smaller(style)
    if (!font) break
    objects = objects.map((o) => (o.type === "button-group" ? { ...o, properties: { ...o.properties, ...font } } : o))
  }
  return blockCard({ ...built, objects }, width, scale, room)
}
