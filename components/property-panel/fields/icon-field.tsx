"use client"

/**
 * Pick an icon, see the one picked, clear it. One implementation.
 *
 * There were four: components/property-panel/icon-picker.tsx (used by the
 * level indicator alone), an `IconPickerField` living inside
 * switch-properties.tsx, and an inline block each in icon-properties.tsx and
 * software-button-properties.tsx. They disagreed about everything small -
 * "No icon selected" against "No icon", a muted card against a bordered one,
 * ghost buttons against outline ones, and whether a filled slot still offers
 * the search button at all.
 *
 * The thumbnail leads on the left, like a colour's swatch and for the same
 * reason: it is the value, and the field's own fill carries the column.
 */

import { Search, X } from "lucide-react"
import type { ProjectAsset } from "../../project-editor"
import { FieldBox, FIELD, GHOST_BUTTON, Leading, Ornament, PropertyRow } from "./field-shell"
import { cn } from "@/lib/utils"

export interface IconFieldProps {
  label: string
  /** The asset chosen, if any. */
  assetId: string | null | undefined
  projectAssets: ProjectAsset[]
  /** Opens the icon library. Absent means the slot is read-only. */
  onSelect?: () => void
  onClear: () => void
  hint?: string
  /**
   * What the buttons call the thing, when the row's name is not a noun: a
   * Live Icon rule's slot is labelled "Then", and "Choose then" is not a
   * sentence.
   */
  noun?: string
}

/**
 * The asset's SVG source, however it was stored, or a placeholder square.
 * Three of the four old implementations carried their own copy of this,
 * and the fourth had no `try` around `atob`.
 */
function svgMarkup(data: string): string {
  try {
    if (data.startsWith("data:image/svg+xml;base64,")) return atob(data.split(",")[1])
    if (data.startsWith("data:image/svg+xml,")) return decodeURIComponent(data.split(",")[1])
    return data
  } catch {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><rect width="20" height="20" x="2" y="2" rx="2"/></svg>'
  }
}

export function IconField({ label, assetId, projectAssets, onSelect, onClear, hint, noun }: IconFieldProps) {
  const thing = noun ?? label.toLowerCase()
  const asset = assetId ? projectAssets.find((a) => a.id === assetId) : undefined
  const chosen = Boolean(assetId)
  // Room at the right edge for the buttons that sit there.
  const padRight = chosen ? "pr-[60px]" : "pr-[30px]"

  return (
    <PropertyRow label={label} hint={hint}>
      <FieldBox>
        <span className={cn(FIELD, padRight, chosen && "pl-7")}>
          <span className={cn("min-w-0 flex-1 truncate", !chosen && "font-normal text-muted-foreground")}>
            {chosen ? (asset?.name ?? "Unknown asset") : "None"}
          </span>
        </span>

        {chosen ? (
          <Leading>
            <span className="flex size-[18px] items-center justify-center">
              {asset?.data ? (
                <span
                  className="size-[16px] [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: svgMarkup(asset.data) }}
                />
              ) : (
                <span className="text-[10px]">?</span>
              )}
            </span>
          </Leading>
        ) : null}

        <Ornament className="pointer-events-auto">
          {onSelect ? (
            <button
              type="button"
              onClick={onSelect}
              aria-label={chosen ? `Change ${thing}` : `Choose ${thing}`}
              className={GHOST_BUTTON}
            >
              <Search className="size-3 text-muted-foreground" />
            </button>
          ) : null}
          {chosen ? (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Remove ${thing}`}
              className={GHOST_BUTTON}
            >
              <X className="size-3 text-muted-foreground" />
            </button>
          ) : null}
        </Ornament>
      </FieldBox>
    </PropertyRow>
  )
}
