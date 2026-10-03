"use client"

import { ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The ribbon's Table group (docs/2026-10-03-table-editing.md): shown at the
 * ribbon's end while the context is in a table - a table selected, an object
 * in a table, an empty cell picked - as Word's table tab is. The path to
 * where you are, each level a button that selects it, and the commands for
 * the cell in context.
 */

export type TableCommand =
  | "row-above"
  | "row-below"
  | "delete-row"
  | "column-left"
  | "column-right"
  | "delete-column"
  | "merge-right"
  | "merge-down"
  | "split"

/** What each command is called, in the ribbon and in the context menu. */
export const TABLE_COMMANDS: { group: string; commands: { command: TableCommand; label: string }[] }[] = [
  {
    group: "Rows",
    commands: [
      { command: "row-above", label: "Row above" },
      { command: "row-below", label: "Row below" },
      { command: "delete-row", label: "Delete row" },
    ],
  },
  {
    group: "Columns",
    commands: [
      { command: "column-left", label: "Column left" },
      { command: "column-right", label: "Column right" },
      { command: "delete-column", label: "Delete column" },
    ],
  },
  {
    group: "Cells",
    commands: [
      { command: "merge-right", label: "Merge right" },
      { command: "merge-down", label: "Merge down" },
      { command: "split", label: "Split" },
    ],
  },
]

export interface TableGroupProps {
  /** The tables from the screen down, outermost first. */
  path: string[]
  /** The cell in context, counted from 0; none when a table itself is selected. */
  cell: { row: number; column: number } | null
  /** Which commands can do something here; the others are off. */
  enabled: Record<TableCommand, boolean>
  onSelectLevel: (tableId: string) => void
  onCommand: (command: TableCommand) => void
}

export function TableGroup({ path, cell, enabled, onSelectLevel, onCommand }: TableGroupProps) {
  return (
    <div className="flex flex-col items-center justify-between px-2 border-l border-border ml-1 pl-3" data-testid="table-group">
      <div className="flex items-stretch gap-2">
        {TABLE_COMMANDS.map(({ group, commands }) => (
          <div key={group} className="flex flex-col gap-0.5" role="group" aria-label={group}>
            {commands.map(({ command, label }) => (
              <Button
                key={command}
                variant="ghost"
                size="sm"
                className="h-[18px] justify-start px-1.5 text-[10px] font-normal"
                disabled={!enabled[command]}
                onClick={() => onCommand(command)}
              >
                {label}
              </Button>
            ))}
          </div>
        ))}
      </div>
      <nav className="mt-1 flex items-center text-[10px] text-muted-foreground whitespace-nowrap" aria-label="Table path" data-testid="table-path">
        {path.map((id, i) => {
          const last = i === path.length - 1 && !cell
          return (
            <span key={id} className="flex items-center">
              {i > 0 && <ChevronRight className="size-3" aria-hidden />}
              <button
                type="button"
                className={cn("rounded px-1 hover:bg-accent hover:text-accent-foreground", last && "font-semibold text-foreground")}
                aria-current={last ? "true" : undefined}
                data-table-level={id}
                onClick={() => onSelectLevel(id)}
              >
                Table
              </button>
            </span>
          )
        })}
        {cell && (
          <span className="flex items-center">
            <ChevronRight className="size-3" aria-hidden />
            <span className="px-1 font-semibold text-foreground">
              Cell {cell.row + 1}, {cell.column + 1}
            </span>
          </span>
        )}
      </nav>
    </div>
  )
}
