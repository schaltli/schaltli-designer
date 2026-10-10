"use client"

// The demo's switch between the preview and the designer, under the device
// (2026-10-10): a visitor could not tell which of the two was on - the
// toolbar's Preview button says it only while it is pressed. Red, so it is
// found, and both words always there, so it says where you are. A strip of
// its own under the canvas, on the same felt in the preview, so it never
// covers the device when the window is small.

import { Pencil, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { FELT_EDGE } from "@/lib/backdrops"

export function DemoModeSwitch({
  preview,
  onPreview,
  onDesigner,
}: {
  preview: boolean
  onPreview: () => void
  onDesigner: () => void
}) {
  const segment = (on: boolean) =>
    cn(
      "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-full transition-colors",
      on ? "bg-red-600 text-white shadow" : "text-red-600 hover:bg-red-600/10",
    )
  return (
    <div
      className="shrink-0 flex justify-center py-3"
      style={preview ? FELT_EDGE : { backgroundColor: "rgb(var(--canvas-container-bg))" }}
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
