"use client"

/**
 * A table shape's picture (lib/layout-templates.ts), for the Table tool's
 * menu (docs/2026-10-03-free-screens.md): its columns and a few rows of a
 * name and a control, so what it is shows before it is chosen.
 */

import { shapeColumns, type TableShapeId } from "@/lib/layout-templates"
import type { TableColumn } from "@/lib/table"

const W = 44
const H = 30

/** Where a picture's column lines go: an auto column a third, shares by their parts. */
function splits(columns: TableColumn[]): number[] {
  const fixed = columns.map((c) => (c.width === "auto" ? W / 3 : 0))
  const shares = columns.map((c) => (typeof c.width === "object" && "share" in c.width ? c.width.share : 0))
  const rest = W - fixed.reduce((a, b) => a + b, 0)
  const total = shares.reduce((a, b) => a + b, 0)
  const widths = columns.map((_, i) => fixed[i] || (total > 0 ? (rest * shares[i]) / total : 0))
  const out: number[] = []
  let x = 0
  for (let i = 0; i < widths.length - 1; i++) out.push((x += widths[i]))
  return out
}

export function TableShapePicture({ id }: { id: TableShapeId }) {
  const columns = shapeColumns(id)
  return (
    <svg width={W + 2} height={H + 2} viewBox={`-1 -1 ${W + 2} ${H + 2}`} aria-hidden className="text-muted-foreground">
      <rect x={0} y={0} width={W} height={H} rx={2} fill="none" stroke="currentColor" strokeWidth={1} />
      {
        <>
          {splits(columns).map((x) => (
            <line key={x} x1={x} y1={0} x2={x} y2={H} stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 1.5" />
          ))}
          {[H / 3, (2 * H) / 3].map((y) => (
            <line key={y} x1={0} y1={y} x2={W} y2={y} stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 1.5" />
          ))}
          {/* What goes in: a name and a control, row by row. */}
          {[0, 1, 2].map((row) => {
            const y = row * (H / 3) + H / 6
            const lines = [0, ...splits(columns), W]
            return lines.slice(0, -1).map((left, c) => (
              <rect
                key={`${row}-${c}`}
                x={left + 2}
                y={y - 1.5}
                width={Math.max(2, (lines[c + 1] - left) * (columns.length === 2 && c === 0 && columns[0].width === "auto" ? 0.6 : 0.75) - 2)}
                height={3}
                rx={1.5}
                fill="currentColor"
                opacity={c === columns.length - 1 && columns.length > 1 ? 0.8 : 0.45}
              />
            ))
          })}
        </>
      }
    </svg>
  )
}
