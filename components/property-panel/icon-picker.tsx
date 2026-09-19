"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Search, X } from "lucide-react"
import type { ProjectAsset } from "../project-editor"

/**
 * The "pick an icon / here is the one you picked / clear it" row.
 *
 * Extracted when the level indicator gained a header icon (2026-09-19). The
 * Software Button has its own copy of this markup and keeps it for now - the
 * point of extracting was to avoid a third copy, not to refactor a working
 * panel in the same change.
 */
export function IconPicker({
  label,
  assetId,
  projectAssets,
  onSelect,
  onClear,
}: {
  label: string
  assetId: string | null | undefined
  projectAssets: ProjectAsset[]
  onSelect?: () => void
  onClear: () => void
}) {
  const asset = assetId ? projectAssets.find((a) => a.id === assetId) : undefined

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2 p-2 bg-muted rounded">
        {assetId ? (
          <>
            <div className="w-8 h-8 bg-background rounded border flex items-center justify-center flex-shrink-0">
              {asset?.data ? (
                <div
                  className="w-6 h-6 [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: svgMarkup(asset.data) }}
                />
              ) : (
                <span className="text-xs">📄</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{asset?.name || "Unknown Asset"}</div>
              <div className="text-xs text-muted-foreground">{asset?.type?.toUpperCase() || "UNKNOWN"}</div>
            </div>
            {onSelect && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0 hover:bg-background/50"
                onClick={onSelect}
                title="Change icon"
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 hover:bg-background/50"
              onClick={onClear}
              title="Clear icon"
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <div className="flex-1 text-xs text-muted-foreground">No icon selected</div>
            {onSelect && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0 hover:bg-background/50"
                onClick={onSelect}
                title="Select icon"
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The asset's SVG source, however it was stored, or a placeholder square. */
function svgMarkup(data: string): string {
  try {
    if (data.startsWith("data:image/svg+xml;base64,")) return atob(data.split(",")[1])
    if (data.startsWith("data:image/svg+xml,")) return decodeURIComponent(data.split(",")[1])
    return data
  } catch {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><rect width="20" height="20" x="2" y="2" rx="2"/></svg>'
  }
}
