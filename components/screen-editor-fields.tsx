"use client"

import { useState } from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MasterScreenIcon } from "@/components/icons/master-screen-icon"
import type { ProjectScreen } from "./project-editor"

interface ScreenEditorFieldsProps {
  screen: ProjectScreen
  allScreens: ProjectScreen[]
  // Structural, not the nominal ProjectAsset[] - project-settings-dialog.tsx
  // passes project.assets, which (pre-existing, unrelated to this
  // component) doesn't type-check cleanly against the real ProjectAsset
  // type there. Only id/name/data are actually read below.
  projectAssets: Array<{ id: string; name: string; data?: string }>
  onRename: (name: string) => void
  onSetMaster: (masterScreenId: string | undefined) => void
  onSetShowMaster: (showMaster: boolean) => void
  onOpenIconSelector: () => void
  onClearIcon: () => void
}

// Rename/icon/master-assignment for a single screen - the part of Project
// Settings > Screens' per-row editor that still makes sense outside a list
// of every screen (move up/down/duplicate/delete need that surrounding
// list, so they stay Settings-only). Shared between that Screens tab and
// the object tree's "Screen" root (property-panel.tsx's ScreenProperties,
// clicking the root just clears object selection - see project-editor.tsx's
// onSelectObject(null)) so both are guaranteed to behave identically -
// 2026-08-16.
export function ScreenEditorFields({
  screen,
  allScreens,
  projectAssets,
  onRename,
  onSetMaster,
  onSetShowMaster,
  onOpenIconSelector,
  onClearIcon,
}: ScreenEditorFieldsProps) {
  // Own local edit buffer, not lifted to the caller - unlike the Screens
  // tab's editedScreenNames map (needed there because many rows are being
  // typed into within the same render tree), only one screen is ever being
  // renamed through this component at a time.
  const [editedName, setEditedName] = useState<string | null>(null)
  const displayName = editedName ?? screen.name
  const trimmedName = (editedName ?? "").trim()
  const isDuplicate =
    editedName !== null &&
    trimmedName.length > 0 &&
    allScreens.some((s) => s.id !== screen.id && s.name.trim().toLowerCase() === trimmedName.toLowerCase())

  const commitRename = () => {
    if (editedName === null) return
    const trimmed = editedName.trim()
    if (trimmed && trimmed !== screen.name && !isDuplicate) {
      onRename(trimmed)
    }
    setEditedName(null)
  }

  const masterScreens = allScreens.filter((s) => s.isMaster)
  const iconAsset = projectAssets.find((a) => a.id === screen.iconAssetId)

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          {screen.isMaster && (
            <span
              className="inline-flex items-center gap-1 shrink-0 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
              title="Master screen"
            >
              <MasterScreenIcon className="h-3 w-3" />
              Master
            </span>
          )}
          <Input
            value={displayName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={commitRename}
            className="h-8 text-sm"
          />
        </div>
        {isDuplicate && (
          <p className="text-xs text-destructive">The name &quot;{trimmedName}&quot; is already taken</p>
        )}
      </div>

      {/* Not meaningful on a master screen itself - see
          ProjectScreen.iconAssetId's own comment. */}
      {!screen.isMaster && (
        <div className="flex items-center gap-2">
          {iconAsset?.data && (
            <div
              className="w-8 h-8 bg-muted rounded border flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5 shrink-0"
              title={`Screen icon: ${iconAsset.name}`}
              dangerouslySetInnerHTML={{
                __html: (() => {
                  try {
                    if (iconAsset.data.startsWith("data:image/svg+xml;base64,")) {
                      return atob(iconAsset.data.split(",")[1])
                    }
                    if (iconAsset.data.startsWith("data:image/svg+xml,")) {
                      return decodeURIComponent(iconAsset.data.split(",")[1])
                    }
                    return iconAsset.data
                  } catch {
                    return '<svg viewBox="0 0 24 24" fill="currentColor"><rect width="20" height="20" x="2" y="2" rx="2"/></svg>'
                  }
                })(),
              }}
            />
          )}
          <Button type="button" variant="outline" size="sm" onClick={onOpenIconSelector} className="gap-1.5">
            <Search className="h-3.5 w-3.5" />
            {iconAsset ? "Change" : "Select icon"}
          </Button>
          {screen.iconAssetId && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearIcon}
              className="h-8 w-8 p-0"
              title="Clear screen icon"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      {!screen.isMaster && masterScreens.length > 0 && (
        <div className="flex items-center gap-3">
          <Select
            value={screen.masterScreenId ?? "none"}
            onValueChange={(value) => onSetMaster(value === "none" ? undefined : value)}
          >
            <SelectTrigger className="h-7 text-xs w-40">
              <SelectValue placeholder="No master" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No master</SelectItem>
              {masterScreens.map((master) => (
                <SelectItem key={master.id} value={master.id}>
                  {master.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {screen.masterScreenId && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={screen.showMaster !== false}
                onChange={(e) => onSetShowMaster(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Show master
            </label>
          )}
        </div>
      )}
    </div>
  )
}
