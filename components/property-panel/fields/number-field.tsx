"use client"

/**
 * A number, with its unit inside the field and its name as a drag handle.
 *
 * One control for every number: stroke width, corner radius, thickness and
 * marker width were a `<Slider>` in three panels and a number input in two,
 * for the same kind of value. Sliders lost (docs/2026-09-20-property-panel.md,
 * decision 8): one needs its own line under the name, about 26 px, and lands
 * on a value worse.
 *
 * What a slider was good for comes back here instead - dragging the *name*
 * left and right scrubs the value, the way Figma and Blender do it. Pointer
 * events rather than mouse events, so it works with a finger on the van's
 * own panel too.
 */

import { useCallback, useId, useRef } from "react"
import { FieldBox, FIELD, Ornament, PropertyRow } from "./field-shell"
import { cn } from "@/lib/utils"

export interface NumberFieldProps {
  label: string
  value: number | undefined
  onChange: (value: number) => void
  unit?: string
  hint?: string
  min?: number
  max?: number
  /** What one step of the drag, or one press of an arrow key, is worth. */
  step?: number
  /** Shown while the field is empty. */
  placeholder?: string
  id?: string
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  hint,
  min,
  max,
  step = 1,
  placeholder,
  id,
}: NumberFieldProps) {
  const auto = useId()
  const fieldId = id ?? auto
  const drag = useRef<{ x: number; from: number; moved: boolean } | null>(null)

  const clamp = useCallback(
    (n: number) => {
      let out = n
      if (typeof min === "number" && out < min) out = min
      if (typeof max === "number" && out > max) out = max
      // Keeps a 0.5 step from drifting into 0.30000000000000004.
      return Math.round(out * 1e6) / 1e6
    },
    [min, max],
  )

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Only a plain press with the primary button, so a right-click menu and
    // a modifier-click still behave.
    if (e.button !== 0) return
    drag.current = { x: e.clientX, from: value ?? 0, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    // A few pixels of slack, so a click on the name still focuses the field
    // rather than nudging the value by one.
    if (!d.moved && Math.abs(dx) < 3) return
    d.moved = true
    onChange(clamp(d.from + Math.round(dx / 2) * step))
  }

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.moved) {
      // The drag was the gesture: do not also focus the field under it.
      e.preventDefault()
    }
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <PropertyRow
      label={label}
      hint={hint}
      htmlFor={fieldId}
      labelProps={{
        onPointerDown,
        onPointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        className: "cursor-ew-resize select-none touch-none",
        title: "Drag to change",
      }}
    >
      <FieldBox>
        <input
          id={fieldId}
          type="number"
          className={cn(FIELD, unit && "pr-8")}
          value={value ?? ""}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const parsed = Number.parseFloat(e.target.value)
            if (Number.isFinite(parsed)) onChange(clamp(parsed))
          }}
        />
        {unit ? (
          <Ornament>
            <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>
          </Ornament>
        ) : null}
      </FieldBox>
    </PropertyRow>
  )
}

export interface NumberPairProps {
  label: string
  values: [number | undefined, number | undefined]
  onChange: (index: 0 | 1, value: number) => void
  unit?: string
  hint?: string
  min?: number
  max?: number
  step?: number
  /**
   * What each box is, when the two are not interchangeable - an arc's "Min"
   * and "Max". The row is still one property with one name; this is what a
   * screen reader reads on the box itself, and what the completeness harvest
   * records instead of a blank.
   */
  names?: readonly [string, string]
}

/** Two numbers that are one property: an arc's two angles, say. */
export function NumberPair({ label, values, onChange, unit, hint, min, max, step = 1, names }: NumberPairProps) {
  const auto = useId()
  const box = (i: 0 | 1) => (
    <FieldBox key={i} className="flex-1">
      <input
        id={i === 0 ? auto : undefined}
        aria-label={names?.[i]}
        type="number"
        className={cn(FIELD, unit && "pr-8")}
        value={values[i] ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const parsed = Number.parseFloat(e.target.value)
          if (Number.isFinite(parsed)) onChange(i, parsed)
        }}
      />
      {unit ? (
        <Ornament>
          <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>
        </Ornament>
      ) : null}
    </FieldBox>
  )
  return (
    <PropertyRow label={label} hint={hint} htmlFor={auto}>
      <div className="flex gap-2">
        {box(0)}
        {box(1)}
      </div>
    </PropertyRow>
  )
}
