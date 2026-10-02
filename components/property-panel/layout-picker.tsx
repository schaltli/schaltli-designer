"use client"

/**
 * The Layout field of a screen (docs/2026-10-02-layout-tables.md): the
 * layouts side by side, each with a small picture of its table - or of a
 * free screen - so what it is shows before it is chosen, as PowerPoint's
 * slide layouts do.
 */

import { LAYOUT_TEMPLATES, templateColumns, type LayoutTemplateId } from "@/lib/layout-templates"
import type { TableColumn } from "@/lib/table"
import { cn } from "@/lib/utils"

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

function Picture({ id }: { id: LayoutTemplateId }) {
  const columns = templateColumns(id)
  return (
    <svg width={W + 2} height={H + 2} viewBox={`-1 -1 ${W + 2} ${H + 2}`} aria-hidden className="text-muted-foreground">
      <rect x={0} y={0} width={W} height={H} rx={2} fill="none" stroke="currentColor" strokeWidth={1} />
      {columns ? (
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
      ) : (
        <>
          <rect x={5} y={5} width={14} height={6} rx={1.5} fill="currentColor" opacity={0.45} />
          <rect x={22} y={14} width={16} height={7} rx={1.5} fill="currentColor" opacity={0.8} />
          <rect x={8} y={21} width={10} height={4} rx={1.5} fill="currentColor" opacity={0.45} />
        </>
      )}
    </svg>
  )
}

export function LayoutPicker({ value, onChange }: { value: LayoutTemplateId | "custom"; onChange: (id: LayoutTemplateId) => void }) {
  return (
    <div id="screenLayout" role="radiogroup" aria-label="Layout" className="grid grid-cols-4 gap-1">
      {LAYOUT_TEMPLATES.map((t) => {
        const chosen = value === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            data-layout={t.id}
            title={t.label}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[10.5px] leading-tight",
              chosen ? "border-primary bg-primary/5 text-foreground" : "border-transparent text-muted-foreground hover:border-border",
            )}
          >
            <Picture id={t.id} />
            <span className="text-center">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
