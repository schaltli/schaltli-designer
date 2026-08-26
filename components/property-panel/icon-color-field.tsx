"use client"

import { useMemo } from "react"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { decodeSVGContent, getIconColorInfo } from "@/lib/svg-utils"
import type { ProjectAsset } from "../project-editor"

interface IconColorFieldProps {
  /**
   * Every icon asset this object can draw: one for an Icon or SoftwareButton,
   * one per state for a Switch, one per rule for an MQTTIconField. They share
   * a single color - see the Switch, which has one textColor for all its
   * states for the same reason.
   */
  assetIds: Array<string | null | undefined>
  projectAssets: ProjectAsset[]
  iconColor?: string
  iconColorFlatten?: boolean
  onUpdate: (key: string, value: any) => void
  colorDepth: "1bit" | "4bit" | "24bit"
  screens?: Array<{
    objects: Array<{ properties: Record<string, any> }>
    backgroundColor?: string
    gridColor?: string
  }>
}

/**
 * The "Icon Color" field, shared by the four object types that draw an icon.
 *
 * Most library icons are monochrome black, which is invisible on a dark
 * screen - the reason this exists at all (2026-08-25). The color lives on the
 * object rather than in the asset, so the same icon serves a pale screen and
 * a dark one without a second copy in the project.
 *
 * Unset means the icon keeps whatever the SVG says, so every project made
 * before this field existed renders exactly as it did.
 */
export function IconColorField({
  assetIds,
  projectAssets,
  iconColor,
  iconColorFlatten,
  onUpdate,
  colorDepth,
  screens,
}: IconColorFieldProps) {
  const { anyIcon, multiColorNames } = useMemo(() => {
    const seen = new Set<string>()
    const multiColorNames: string[] = []
    let anyIcon = false

    for (const id of assetIds) {
      if (!id || seen.has(id)) continue
      seen.add(id)
      const asset = projectAssets.find((a) => a.id === id)
      if (!asset?.data) continue
      anyIcon = true
      try {
        if (!getIconColorInfo(decodeSVGContent(asset.data)).tintable) {
          multiColorNames.push(asset.name || asset.id)
        }
      } catch {
        // Unreadable asset - treat as tintable and let the render decide
      }
    }

    return { anyIcon, multiColorNames }
  }, [assetIds, projectAssets])

  // No icon chosen yet: a color field for nothing would just be noise.
  if (!anyIcon) return null

  return (
    <div className="space-y-2">
      <ColorDepthAwarePicker
        label="Icon Color"
        value={iconColor || "transparent"}
        onChange={(value) => onUpdate("iconColor", value === "transparent" ? undefined : value)}
        colorDepth={colorDepth}
        allowTransparent={true}
        transparentLabel="Icon's own color"
        screens={screens}
      />

      {/* Says so instead of failing quietly: a genuinely multi-color icon
          ignores the color above, and without this the field would look
          broken. Flattening is offered but never assumed - turning a
          deliberately colorful icon into a silhouette is not something to
          do behind someone's back. */}
      {iconColor && multiColorNames.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 space-y-1.5">
          <p className="text-[11px] leading-snug text-amber-900">
            {multiColorNames.length === 1
              ? `"${multiColorNames[0]}" has colors of its own and keeps them.`
              : `${multiColorNames.length} of these icons have colors of their own and keep them.`}
          </p>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-amber-900">
            <input
              type="checkbox"
              checked={iconColorFlatten === true}
              onChange={(e) => onUpdate("iconColorFlatten", e.target.checked || undefined)}
              className="h-3.5 w-3.5"
            />
            Flatten to one color
          </label>
        </div>
      )}
    </div>
  )
}
