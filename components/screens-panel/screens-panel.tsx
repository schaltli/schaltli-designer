"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, MoreVertical, Copy, Trash2, Settings, LayoutTemplate, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Project, ProjectAsset } from "../project-editor"
import { ScreenThumbnail } from "./screen-thumbnail"
import { readOffscreenColor, useAdornmentImage } from "@/hooks/use-adornment-image"
import { IconSelectorModal } from "../icon-selector-modal"

interface ScreensPanelProps {
  project: Project
  currentScreenId: string
  onScreenChange: (screenId: string) => void
  onProjectUpdate: (project: Project) => void
  onOpenProjectSettings?: (tab: string) => void
  // Preview mode simulates runtime behavior - the project itself must stay
  // read-only while it's active, so adding a new screen is disabled.
  previewMode?: boolean
  // For the New Screen dialog's own icon picker (a separate, locally-owned
  // IconSelectorModal instance, not project-editor.tsx's shared one - that
  // one's "screen-icon" context needs an existing screenId, but a screen
  // being created here doesn't have one yet until Create Screen is clicked).
  onAddAsset?: (asset: ProjectAsset) => void
  // Must be the real functional setProject((prev) => ...), not
  // `onProjectUpdate({...project, nextId: project.nextId+1})` built from
  // this component's own `project` prop - IconSelectorModal calls
  // onAddAsset() then onIncrementNextId() synchronously back-to-back in
  // the same event handler, before React re-renders, so a `project` value
  // captured at this component's last render is already stale by the time
  // onIncrementNextId fires and would silently clobber the asset onAddAsset
  // just added (found live 2026-08-11 - the New Screen dialog's own icon
  // picker "worked" but the picked icon never actually appeared anywhere).
  onIncrementNextId?: () => void
  // Bottom-bar toggle (project-editor.tsx), applied identically here and on
  // the main canvas so the two views never disagree about what the device
  // actually shows.
  showAdornment?: boolean
}

// PowerPoint-style slide panel: a scrollable column of numbered, live-
// rendered screen thumbnails on the left. Selecting a screen to edit is
// now a click here instead of a dropdown - full management (rename,
// reorder, bulk duplicate/delete) stays in the existing "Manage Screens"
// dialog (Settings icon below), which already does that well; this panel
// only adds the two actions PowerPoint's own slide panel exposes inline
// (duplicate, delete) via a per-thumbnail hover menu.
export function ScreensPanel({
  project,
  currentScreenId,
  onScreenChange,
  onProjectUpdate,
  onOpenProjectSettings,
  previewMode = false,
  onAddAsset,
  onIncrementNextId,
  showAdornment = true,
}: ScreensPanelProps) {
  // One raster for the whole column, not one per thumbnail.
  const { image: adornmentImage } = useAdornmentImage(project.adornment, readOffscreenColor())
  const [showNewScreenDialog, setShowNewScreenDialog] = useState(false)
  const [newScreenIsMaster, setNewScreenIsMaster] = useState(false)
  const [newScreenName, setNewScreenName] = useState("")
  const [newScreenIconAssetId, setNewScreenIconAssetId] = useState<string | undefined>(undefined)
  const [showNewScreenIconSelector, setShowNewScreenIconSelector] = useState(false)

  const masterScreens = project.screens.filter((s) => s.isMaster)
  const normalScreens = project.screens.filter((s) => !s.isMaster)

  const isScreenNameDuplicate = (name: string, excludeScreenId?: string) => {
    const normalizedName = name.trim().toLowerCase()
    return project.screens.some(
      (screen) => screen.id !== excludeScreenId && screen.name.toLowerCase() === normalizedName,
    )
  }

  const openNewScreenDialog = (isMaster: boolean) => {
    setNewScreenIsMaster(isMaster)
    setNewScreenIconAssetId(undefined)
    setShowNewScreenDialog(true)
  }

  const addScreen = (name?: string) => {
    const isMaster = newScreenIsMaster
    const screenName = name || (isMaster ? `Master ${masterScreens.length + 1}` : `Screen ${normalScreens.length + 1}`)
    if (isScreenNameDuplicate(screenName)) return

    const newScreen = {
      id: `screen-${project.nextId}`,
      name: screenName,
      objects: [],
      // Not meaningful on a master screen - see ProjectScreen.iconAssetId's
      // own comment (masters never appear in screen navigation).
      ...(!isMaster && newScreenIconAssetId ? { iconAssetId: newScreenIconAssetId } : {}),
      ...(isMaster
        ? { isMaster: true }
        : // New normal screens default to the first existing master, if any
          // - see the master-screen grilling decision in the project history.
          { masterScreenId: masterScreens[0]?.id }),
    }

    onProjectUpdate({
      ...project,
      nextId: project.nextId + 1,
      screens: [...project.screens, newScreen],
    })

    onScreenChange(newScreen.id)
    setShowNewScreenDialog(false)
    setNewScreenName("")
    setNewScreenIconAssetId(undefined)
  }

  const duplicateScreen = (screenId: string) => {
    const screenToDuplicate = project.screens.find((s) => s.id === screenId)
    if (!screenToDuplicate) return

    let currentNextId = project.nextId
    let duplicateName = `${screenToDuplicate.name} Copy`
    let counter = 1
    while (isScreenNameDuplicate(duplicateName)) {
      counter++
      duplicateName = `${screenToDuplicate.name} Copy ${counter}`
    }

    const newScreen = {
      ...screenToDuplicate,
      id: `screen-${currentNextId}`,
      name: duplicateName,
      objects: screenToDuplicate.objects.map((obj) => {
        currentNextId++
        return { ...obj, id: `obj-${currentNextId}` }
      }),
    }
    currentNextId++

    onProjectUpdate({
      ...project,
      nextId: currentNextId,
      screens: [...project.screens, newScreen],
    })
    onScreenChange(newScreen.id)
  }

  const deleteScreen = (screenId: string) => {
    if (project.screens.length <= 1) return
    // Deleting a master must not leave dangling masterScreenId references on
    // the screens that used it - nullify them rather than blocking the
    // delete (matches how this app already treats other cross-screen
    // references, e.g. dangling "Go to Screen" targets).
    const updatedScreens = project.screens
      .filter((screen) => screen.id !== screenId)
      .map((screen) => (screen.masterScreenId === screenId ? { ...screen, masterScreenId: undefined } : screen))
    onProjectUpdate({ ...project, screens: updatedScreens })
    if (currentScreenId === screenId) {
      onScreenChange(updatedScreens[0].id)
    }
  }

  const resolveMasterObjects = (screen: Project["screens"][number]) => {
    if (screen.isMaster || !screen.masterScreenId || screen.showMaster === false) return []
    return project.screens.find((s) => s.id === screen.masterScreenId && s.isMaster)?.objects ?? []
  }

  // Shared by the row label (left of the screen name) and the New Screen
  // dialog's own preview - renders a screen/pending icon's SVG data inline,
  // same decode logic project-settings-dialog.tsx's Screens tab uses.
  const renderIconThumb = (iconAssetId: string | undefined, sizeClass: string) => {
    const iconAsset = project.assets.find((a) => a.id === iconAssetId)
    if (!iconAsset?.data) return null
    return (
      <div
        className={cn(sizeClass, "shrink-0 [&>svg]:w-full [&>svg]:h-full")}
        title={iconAsset.name}
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
    )
  }

  const renderScreenRow = (screen: Project["screens"][number], index: number | null) => {
    const isSelected = screen.id === currentScreenId
    return (
      <div key={screen.id} className="group relative">
        <button
          type="button"
          onClick={() => onScreenChange(screen.id)}
          className={cn(
            "w-full flex items-start gap-1.5 rounded-md p-1 text-left transition-colors",
            isSelected ? "bg-accent" : "hover:bg-muted",
          )}
        >
          {index !== null ? (
            <span
              className={cn(
                "text-xs w-5 pt-0.5 text-right shrink-0 tabular-nums",
                isSelected ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
          ) : (
            <span
              className={cn("w-5 pt-0.5 flex justify-end shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
              title="Master screen"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                "border-4 rounded overflow-hidden bg-white",
                isSelected ? "border-primary" : "border-border",
              )}
            >
              <ScreenThumbnail
                screen={screen}
                masterObjects={resolveMasterObjects(screen)}
                screenWidth={project.screenWidth}
                screenHeight={project.screenHeight}
                projectName={project.name}
                fonts={project.fonts}
                projectAssets={project.assets}
                topics={project.topics}
                colorDepth={project.settings.colorDepth}
                adornmentImage={adornmentImage}
                adornmentDrawingArea={project.adornmentDrawingArea}
                adornmentRotation={project.settings.rotation ?? 0}
                showAdornment={showAdornment}
              />
            </div>
            <div className="flex items-center gap-1 mt-0.5 px-0.5">
              {renderIconThumb(screen.iconAssetId, "w-3 h-3")}
              <div className="text-[11px] text-muted-foreground truncate">{screen.name}</div>
            </div>
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              className="absolute top-0.5 right-0.5 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shadow"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => duplicateScreen(screen.id)}>
              <Copy className="mr-2 h-3.5 w-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => deleteScreen(screen.id)}
              disabled={project.screens.length <= 1}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className="w-60 shrink-0 border-r border-border bg-card flex flex-col min-h-0">
      <div className="h-9 shrink-0 border-b border-border flex items-center justify-between px-2">
        <span className="text-xs font-medium text-muted-foreground">Screens</span>
        {!previewMode && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Add screen">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openNewScreenDialog(false)}>Add Screen</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewScreenDialog(true)}>
                <LayoutTemplate className="mr-2 h-3.5 w-3.5" />
                Add Master Screen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* A plain native scrollable div, not the shadcn/Radix ScrollArea -
          Radix's own content wrapper renders with `display: table` (so it
          can detect when content needs horizontal scrolling too), which
          doesn't constrain a percentage-width child to the viewport's
          available width the way normal block layout does; padding added
          to clear its overlay scrollbar just grew the whole table instead
          of shrinking the thumbnail, so the border kept touching the
          scrollbar no matter how much padding was added (confirmed by
          walking the computed-style chain - the table wrapper was 331px
          wide inside a 239px viewport). A native scrollbar reserves real
          layout space instead of overlaying content, so a modest pr-3
          safety margin is enough here. */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="pl-2 pr-3 py-2 space-y-2">
          {masterScreens.length > 0 && (
            <div className="space-y-2 pb-2 mb-2 border-b border-border">
              <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Masters
              </div>
              {masterScreens.map((screen) => renderScreenRow(screen, null))}
            </div>
          )}
          {normalScreens.map((screen, index) => renderScreenRow(screen, index))}
        </div>
      </div>

      <div className="p-2 border-t border-border">
        <Button
          size="sm"
          variant="ghost"
          className="w-full h-7 text-xs justify-start"
          onClick={() => onOpenProjectSettings?.("screens")}
        >
          <Settings className="mr-2 h-3.5 w-3.5" />
          Manage Screens
        </Button>
      </div>

      <Dialog open={showNewScreenDialog} onOpenChange={setShowNewScreenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{newScreenIsMaster ? "New Master Screen" : "New Screen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="screenName" className="text-sm">
                {newScreenIsMaster ? "Master Screen Name" : "Screen Name"}
              </Label>
              <Input
                id="screenName"
                value={newScreenName}
                onChange={(e) => setNewScreenName(e.target.value)}
                placeholder="Enter screen name"
                className="mt-1"
              />
              {newScreenName.trim() && isScreenNameDuplicate(newScreenName) && (
                <p className="text-xs text-destructive mt-1">The name &quot;{newScreenName}&quot; is already taken</p>
              )}
            </div>
            {/* Not meaningful for a master screen - see ProjectScreen.iconAssetId's
                own comment (masters never appear in screen navigation). */}
            {!newScreenIsMaster && onAddAsset && onIncrementNextId && (
              <div>
                <Label className="text-sm">Screen Icon (Optional)</Label>
                <div className="flex items-center gap-2 mt-1">
                  {renderIconThumb(newScreenIconAssetId, "w-8 h-8")}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewScreenIconSelector(true)}
                    className="gap-1.5"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {newScreenIconAssetId ? "Change" : "Select icon"}
                  </Button>
                  {newScreenIconAssetId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewScreenIconAssetId(undefined)}
                      className="h-8 w-8 p-0"
                      title="Clear screen icon"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div className="text-sm text-muted-foreground">
              New screen will use the project size: {project.screenWidth} × {project.screenHeight}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => addScreen(newScreenName || undefined)}
                className="flex-1"
                disabled={newScreenName.trim() !== "" && isScreenNameDuplicate(newScreenName)}
              >
                Create Screen
              </Button>
              <Button variant="outline" onClick={() => setShowNewScreenDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {onAddAsset && onIncrementNextId && (
        <IconSelectorModal
          isOpen={showNewScreenIconSelector}
          onClose={() => setShowNewScreenIconSelector(false)}
          onSelectIcon={(assetId) => {
            setNewScreenIconAssetId(assetId)
            setShowNewScreenIconSelector(false)
          }}
          existingAssets={project.assets}
          onAddAsset={onAddAsset}
          nextId={project.nextId}
          onIncrementNextId={onIncrementNextId}
        />
      )}
    </div>
  )
}
