"use client"

/**
 * X, Y, width and height - four fields on one line, last in every panel.
 *
 * This block was copied word for word into twelve files, sat last in eight
 * panels, first in three, in the middle of one, and was missing from the
 * MQTT data line entirely - which was not merely untidy: that object falls
 * back to `{x, y}` → `{x+width, y+height}` when it has no explicit points
 * (getLinePoints in render-line.ts), so it was positioned by values its own
 * panel offered no way to edit.
 *
 * It is last because these are the values a finger drags on the canvas, and
 * its section starts collapsed for the same reason. Four across rather than
 * two rows of two, with the caption under each field: at 124 px of name
 * column there is room, and it costs one row instead of two.
 *
 * A dimension the program works out - a text's height from its font, an
 * icon's second side, an arc's size - is grey, carries a lock and says why.
 * They used to be `disabled` with no explanation at all.
 */

import { Lock } from "lucide-react"
import { FIELD, FieldHint } from "./field-shell"
import { cn } from "@/lib/utils"

export type FrameKey = "x" | "y" | "width" | "height"

export interface FrameFieldsProps {
  x: number
  y: number
  width: number
  height: number
  onChange: (key: FrameKey, value: number) => void
  /** Which of the four the program works out rather than the author. */
  locked?: readonly FrameKey[]
  /** Why they are locked. Shown on the question mark beside "Frame". */
  lockedHint?: string
  /**
   * An arc is inscribed in a square, so it has a size rather than a width
   * and a height. Renames the third caption and hides the fourth's own.
   */
  captions?: Partial<Record<FrameKey, string>>
}

const ORDER: readonly FrameKey[] = ["x", "y", "width", "height"]
const DEFAULT_CAPTIONS: Record<FrameKey, string> = { x: "X", y: "Y", width: "W", height: "H" }

export function FrameFields({ x, y, width, height, onChange, locked = [], lockedHint, captions }: FrameFieldsProps) {
  const values: Record<FrameKey, number> = { x, y, width, height }
  return (
    <div className="flex flex-col gap-1 @[380px]/panel:flex-row @[380px]/panel:gap-1">
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium leading-tight text-muted-foreground @[380px]/panel:w-[124px] @[380px]/panel:pt-[7px]">
        Frame
        {lockedHint ? <FieldHint text={lockedHint} /> : null}
      </span>
      <div className="min-w-0 flex-1 @[380px]/panel:max-w-[360px]">
        <div className="flex gap-1">
          {ORDER.map((key) => {
            // `x`, `y`, `width`, `height` - the ids the twelve copies of this
            // block carried before it was one, and the ids the suite reaches
            // for (e2e/resize-snap-opposite-edge.spec.ts,
            // e2e/integer-coordinates.spec.ts). Only one property panel is on
            // screen at a time, so they stay unique.
            const id = key
            const isLocked = locked.includes(key)
            return (
              <div key={key} className="min-w-0 flex-1">
                <input
                  id={id}
                  type="number"
                  readOnly={isLocked}
                  value={Number.isFinite(values[key]) ? values[key] : ""}
                  onChange={(e) => {
                    if (isLocked) return
                    const parsed = Number.parseInt(e.target.value, 10)
                    // A width of 0 is an object nobody can find again, so the
                    // two sizes floor at 1 while a position may be 0.
                    const floor = key === "width" || key === "height" ? 1 : 0
                    onChange(key, Number.isFinite(parsed) ? parsed : floor)
                  }}
                  className={cn(FIELD, "px-1 text-center", isLocked && "text-muted-foreground")}
                />
                <label
                  htmlFor={id}
                  className="mt-[3px] flex items-center justify-center gap-[3px] text-[10.5px] font-medium text-muted-foreground"
                >
                  {captions?.[key] ?? DEFAULT_CAPTIONS[key]}
                  {isLocked ? <Lock className="size-2.5 opacity-50" /> : null}
                </label>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** What the collapsed Frame heading says on its right. */
export function frameSummary(x: number, y: number, width: number, height: number): string {
  return `${Math.round(x)}, ${Math.round(y)} · ${Math.round(width)} × ${Math.round(height)}`
}
