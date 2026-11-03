/**
 * A block of several parts as a card (docs/2026-11-03-card-blocks.md): a free
 * area with the look Card, its name docked at the top - with its icon, the
 * two as a small table of one row - and its parts below, the table
 * blockTable builds without its name column, docked Fill across the card.
 * As tall as its heading, the gap and its parts need inside the padding.
 */

import type { ScreenObject } from "@/components/project-editor"
import { blockTable, type BausteinBuildResult } from "@/lib/bausteine"
import { cardSettingsOf } from "@/lib/card"
import { layoutObjects, type LayoutScale } from "@/lib/layout"

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

/**
 * The card a block of several parts is placed as: its parts `width` wide, as
 * the block was built, the card its padding wider on each side.
 */
export function blockCard(built: BausteinBuildResult, width: number, scale: LayoutScale): Piece {
  const padding = Math.round(cardSettingsOf({ cards: scale.cards }).paddingMm * scale.pixelsPerMm)
  const count = built.labelCount ?? 0
  const name = built.objects.slice(0, count)
  const controls = built.objects.slice(count)
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
