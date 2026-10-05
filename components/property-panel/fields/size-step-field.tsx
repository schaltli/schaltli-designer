"use client"

/**
 * An object's size step, where the device gives a scale
 * (docs/2026-09-30-size-scale.md): S, M or L in millimetres instead of a
 * number of pixels, for the one dimension the step sets - a bar's width
 * across, a dial's diameter. An object that measures none of them - every
 * object made before the scale, most likely - shows as Custom with its size,
 * and Snap moves it to the nearest step. The same shape as TextStyleField.
 */

import type { ProjectFont, ScreenObject } from "@/components/project-editor"
import {
  SIZE_STEPS,
  nearestStep,
  stepKindOf,
  stepOf,
  stepSizeOf,
  stepUpdates,
  type SizeStep,
} from "@/lib/size-scale"
import { ButtonGroupRow } from "./button-group-row"
import { SelectField } from "./select-field"

// Written out, for the handbook (e2e/handbook-labels.spec.ts).
const STEP_LABELS: Record<SizeStep, string> = { xs: "XS", s: "S", m: "M", l: "L" }
const STEP_OPTIONS = SIZE_STEPS.map((step) => ({ value: step, label: STEP_LABELS[step] }))

export interface SizeStepFieldProps {
  object: ScreenObject
  pixelsPerMm: number
  fonts: ProjectFont[]
  onChange: (updates: Partial<ScreenObject>) => void
  hint?: string
}

export function SizeStepField({ object, pixelsPerMm, fonts, onChange, hint }: SizeStepFieldProps) {
  const kind = stepKindOf(object.type)
  const size = stepSizeOf(object)
  if (!kind || size === undefined) return null
  const choose = (step: SizeStep) => {
    const updates = stepUpdates(object, step, pixelsPerMm, fonts)
    if (updates) onChange(updates)
  }
  const current = stepOf(object, pixelsPerMm)

  if (!current) {
    const snapTo = nearestStep(kind, size, pixelsPerMm)
    return (
      <>
        <SelectField
          id="sizeStep"
          label="Size"
          value={undefined}
          placeholder={`Custom (${size} px)`}
          options={STEP_OPTIONS}
          onChange={(value) => choose(value as SizeStep)}
          hint={hint}
        />
        <ButtonGroupRow label="" buttons={[{ label: `Snap to ${STEP_LABELS[snapTo]}`, onClick: () => choose(snapTo) }]} />
      </>
    )
  }

  return (
    <SelectField
      id="sizeStep"
      label="Size"
      value={current}
      options={STEP_OPTIONS}
      onChange={(value) => choose(value as SizeStep)}
      hint={hint}
    />
  )
}
