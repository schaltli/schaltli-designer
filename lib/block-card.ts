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

/**
 * A part's tile (lib/bausteine.ts buildEntry: `blockTile`), made a card: its
 * name - and a slider's value beside it, on the right - docked at the top,
 * the control docked Fill below, as tall as these need inside the padding.
 * A switcher's panels are walked, so a part shown only in one mode gets its
 * tile too. Anything else stays as it is.
 */
function partTile(piece: Piece, width: number, padding: number, scale: LayoutScale): Piece {
  if (piece.type === "switcher" || piece.type === "panel" || (piece.type === "table" && !piece.properties?.blockTile)) {
    if (!piece.children) return piece
    return { ...piece, ...(piece.type === "switcher" ? { width } : {}), children: piece.children.map((c) => partTile(c as Piece, width, padding, scale) as ScreenObject) }
  }
  if (!piece.properties?.blockTile) return piece.type === "toggle-button" || piece.type === "button-group" || piece.type === "slider" ? { ...piece, width } : piece
  const kids = (piece.children ?? []) as Piece[]
  const control = kids[kids.length - 1]
  const heads = kids.slice(0, -1)
  const heading =
    heads.length > 1
      ? docked(blockTable({ objects: heads, topics: [], labelCount: heads.length } as BausteinBuildResult), "top", 2)
      : heads.length === 1
        ? docked(heads[0], "top", 2)
        : null
  const card: Piece = {
    type: "free",
    x: piece.x,
    y: piece.y,
    width,
    height: 0,
    // Its place in a switcher panel's table, kept.
    properties: { ...(piece.properties?.cell ? { cell: piece.properties.cell } : {}), look: "card" },
    children: [...(heading ? [heading] : []), docked(control, "fill", 1)] as ScreenObject[],
  }
  const [laid] = layoutObjects([withIds({ ...card, height: 100000 }, "tile")], scale)
  const bottom = Math.max(0, ...(laid.children ?? []).map((c) => c.y + c.height))
  return { ...card, height: bottom + padding }
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
  // Measured with the topics the block brings too: they reach the project
  // only once it is let go, and a value read from one is as wide as it can
  // read («99 °C»), not as its unit alone.
  const brought = (built.topics ?? []).filter((t) => !(scale.topics ?? []).some((k) => k.topic === t.topic))
  if (brought.length > 0) scale = { ...scale, topics: [...(scale.topics ?? []), ...brought] }
  const padding = Math.round(cardSettingsOf({ cards: scale.cards }).paddingMm * scale.pixelsPerMm)
  const count = built.labelCount ?? 0
  const name = built.objects.slice(0, count)
  const controls = built.objects.slice(count)
  // A Toggle Button alone is its own tile, its name in it: no card round it
  // (docs/2026-11-11-led-look.md, decisions 1 and 9).
  if (count === 0 && controls.length === 1 && controls[0].type === "toggle-button") {
    return { ...controls[0], x: 0, y: 0, width: width + 2 * padding }
  }
  // Several parts each in a tile of their own, the block without a heading
  // and without a card round them: a table of tiles, as wide as a card.
  // Across the room the screen has (a description's block: as wide as the screen
  // less its margins); two parts side by side halve it, so every edge lines
  // up with the tiles across both.
  if (built.partTiles) {
    const whole = (Number.isFinite(maxWidth) ? maxWidth : width) + 2 * padding
    const gap = Math.round(SNAP_GAP_MM * scale.pixelsPerMm)
    const half = Math.floor((whole - gap) / 2)
    const tiled = controls.map((piece, i) => {
      const w = built.partColumns?.[i] === 1 || built.partColumns?.[i] === 2 ? half : whole
      return partTile({ ...piece, width: w }, w, padding, scale)
    })
    const table = blockTable({ ...built, objects: tiled, labelCount: 0 })
    // Two columns of equal width across the whole width, so the two side
    // by side end where the tiles across both do. In a free area without a
    // look of its own - no fill, no edge, no padding - so the block is one
    // object to carry, snap and select, as a card is.
    // Not docked: a table wider than the area - two dials side by side on
    // the knob's 360 px - stands in it, cut at its edge, rather than left out.
    const tiles = { ...table, x: 0, y: 0, zIndex: 1, properties: { ...table.properties, equalColumns: true, widthMm: whole / scale.pixelsPerMm } }
    const area: Piece = {
      type: "free",
      x: 0,
      y: 0,
      width: whole,
      height: 0,
      properties: { blockTiles: true, strokeWidth: 0, padding: 0 },
      children: [tiles] as unknown as ScreenObject[],
    }
    const [laid] = layoutObjects([withIds({ ...area, height: 100000 }, "tiles")], scale)
    // Ids of its own for every piece while it is carried: two tiles at one
    // height are ordered by id (lib/object-order.ts). The editor gives them
    // fresh ones when the block is let go.
    return withIds({ ...area, height: Math.max(0, ...(laid.children ?? []).map((c) => c.y + c.height)) }, "block-tile")
  }
  width = Math.max(width, Math.min(blockPartsWidth(built, scale), maxWidth))
  // A fill read along: across both columns, the room the
  // screen has (docs/2026-11-11-value-cards.md, decision 5).
  if (built.wide && Number.isFinite(maxWidth)) width = maxWidth
  // A slider's value beside its name only where the two fit the card
  // (docs/2026-11-11-led-look.md, decision 9); otherwise the slider shows it
  // itself again, as before.
  const valueAt = name.findIndex((piece) => piece.properties?.headingValue)
  if (valueAt >= 0) {
    const gap = Math.round(SNAP_GAP_MM * scale.pixelsPerMm)
    const need = name.reduce((sum, piece, i) => sum + naturalWidth(withIds(piece, `h${i}`), scale), 0) + gap * (name.length - 1)
    if (need > width) {
      name.splice(valueAt, 1)
      for (let i = 0; i < controls.length; i++) {
        const fallback = controls[i].properties?.headingValueFallback
        if (fallback !== undefined) controls[i] = { ...controls[i], properties: { ...controls[i].properties, displayValue: fallback } }
      }
    }
  }
  // The heading docks first: highest in the object list, highest zIndex.
  const heading =
    name.length > 1 ? docked(blockTable({ ...built, objects: name, labelCount: name.length }), "top", 2) : name.length === 1 ? docked(name[0], "top", 2) : null
  const table = blockTable({ ...built, objects: controls, labelCount: 0 })
  // A value beside its sparkline: its column kept as wide as a sign, two
  // digits and a decimal with the unit read, so the number is never cut
  // and the line takes the rest (docs/2026-11-11-value-cards.md, decision 7).
  const value = controls[0]
  if (controls.length === 2 && controls[1].type === "chart" && value.type === "text") {
    const unit = String(value.properties?.text ?? "").replace(/^.*\}/, "")
    const sample = withIds({ ...value, properties: { ...value.properties, text: `-00.0${unit}`, liveValues: undefined } }, "v")
    const columns = [{ mm: naturalWidth(sample, scale) / scale.pixelsPerMm }, {}]
    table.properties = { ...table.properties, columns }
  }
  const parts = docked(table, "fill", 1)
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
  // A description's tiles across the screen: a choice's words one size
  // under the names above them, as the drafts set them (docs/2026-11-11-
  // led-look.md) - inside the tiles and the switcher's panels too.
  if (built.partTiles && smaller) {
    const font = smaller("standard")
    const deep = (o: Piece): Piece =>
      o.type === "button-group" && font ? { ...o, properties: { ...o.properties, ...font } } : o.children ? { ...o, children: o.children.map((c) => deep(c as Piece) as ScreenObject) } : o
    return blockCard({ ...built, objects: objects.map(deep) }, width, scale, room)
  }
  for (const style of ["large", "standard"] as const) {
    if (!smaller || blockPartsWidth({ ...built, objects }, scale) <= room) break
    const font = smaller(style)
    if (!font) break
    objects = objects.map((o) => (o.type === "button-group" ? { ...o, properties: { ...o.properties, ...font } } : o))
  }
  return blockCard({ ...built, objects }, width, scale, room)
}
