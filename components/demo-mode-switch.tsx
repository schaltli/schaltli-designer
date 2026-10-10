"use client"

// The demo's switch between the preview and the designer, under the device
// (2026-10-10): a visitor could not tell which of the two was on - the
// toolbar's Preview button says it only while it is pressed. Red, so it is
// found, and both words always there, so it says where you are. It floats
// halfway between the device's lower edge and the bottom of the canvas where
// there is room for it (2026-10-10), else it sits in a strip of its own under
// the canvas, on the same felt in the preview, and never covers the device.

import { Pencil, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { FELT_EDGE } from "@/lib/backdrops"

/** The strip's height, and the room the switch needs to float: 44 px and a margin. */
export const DEMO_SWITCH_ROOM = 68

/**
 * Where the switch goes: the middle of the room under the device, in CSS
 * pixels from the canvas's top, or null for the strip. `bottom` and `height`
 * are the device's lower edge and the canvas's height as measured with the
 * strip shown or not (`withStrip`) - the room is reckoned as without it, so
 * the answer does not change with its own effect.
 */
export function demoSwitchFloat(bottom: number, height: number, withStrip: boolean): number | null {
  // The strip takes DEMO_SWITCH_ROOM off the canvas, and the device, centred,
  // moves up by half of it.
  const free = withStrip ? bottom + DEMO_SWITCH_ROOM / 2 : bottom
  const room = withStrip ? height - bottom + DEMO_SWITCH_ROOM / 2 : height - bottom
  return room >= DEMO_SWITCH_ROOM ? free + room / 2 : null
}

export function DemoModeSwitch({
  preview,
  onPreview,
  onDesigner,
  floatAt,
}: {
  preview: boolean
  onPreview: () => void
  onDesigner: () => void
  // Over the canvas at this height (demoSwitchFloat); null: in the strip.
  floatAt: number | null
}) {
  const segment = (on: boolean) =>
    cn(
      "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-full transition-colors",
      on ? "bg-red-600 text-white shadow" : "text-red-600 hover:bg-red-600/10",
    )
  return (
    <div
      className={
        floatAt === null
          ? "shrink-0 flex justify-center py-3"
          : "absolute left-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
      }
      style={
        floatAt !== null
          ? { top: floatAt }
          : preview
            ? FELT_EDGE
            : { backgroundColor: "rgb(var(--canvas-container-bg))" }
      }
      data-place={floatAt === null ? "strip" : "float"}
    >
      <div
        role="group"
        aria-label="Preview or designer"
        data-testid="demo-mode-switch"
        className="flex gap-1 rounded-full border-2 border-red-600 bg-white p-1 shadow-lg"
      >
        <button
          type="button"
          aria-pressed={preview}
          className={segment(preview)}
          onClick={preview ? undefined : onPreview}
        >
          <Play className="h-4 w-4" />
          Preview
        </button>
        <button
          type="button"
          aria-pressed={!preview}
          className={segment(!preview)}
          onClick={preview ? onDesigner : undefined}
        >
          <Pencil className="h-4 w-4" />
          Designer
        </button>
      </div>
    </div>
  )
}
