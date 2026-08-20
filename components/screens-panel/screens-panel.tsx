"use client"

import { useEffect, useRef, useState } from "react"
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
import { Plus, MoreVertical, Copy, Trash2, Settings, LayoutTemplate, Search, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Project, ProjectAsset } from "../project-editor"
import { ScreenThumbnail } from "./screen-thumbnail"
import { readOffscreenColor, useAdornmentImage } from "@/hooks/use-adornment-image"
import { IconSelectorModal } from "../icon-selector-modal"
import { resolveMasterScreen } from "@/lib/master-screen"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { searchIcons, fetchIconSvgData } from "@/lib/icon-search"

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
}

// PowerPoint-style slide panel: a scrollable column of live-rendered screen
// thumbnails on the left. Selecting a screen to edit is
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
}: ScreensPanelProps) {
  // One raster for the whole column, not one per thumbnail. Only the
  // offscreen-corner mask is used here, never the full adornment - see
  // screen-thumbnail.tsx's own comment for why (2026-08-16).
  const { offscreenMaskImage } = useAdornmentImage(project.adornment, readOffscreenColor())
  const { toast } = useToast()
  const [showNewScreenDialog, setShowNewScreenDialog] = useState(false)
  const [newScreenIsMaster, setNewScreenIsMaster] = useState(false)
  const [newScreenName, setNewScreenName] = useState("")
  const [newScreenIconAssetId, setNewScreenIconAssetId] = useState<string | undefined>(undefined)
  const [showNewScreenIconSelector, setShowNewScreenIconSelector] = useState(false)
  // Auto-suggested icon for the New Screen dialog (2026-08-17): as the user
  // types a screen name, it's translated to English (Iconify's index is
  // effectively English-only - see app/api/translate) and searched live,
  // search-as-you-type. Held as raw {name, data, size} - not yet a real
  // ProjectAsset - until Create Screen actually commits it, so retyping the
  // name a dozen times while a match keeps changing doesn't create a dozen
  // orphaned assets and burn through nextId. `iconManuallySet` freezes this
  // once the user has touched the icon controls themselves (pick or clear)
  // - an explicit choice should never be silently overwritten by a later
  // keystroke's suggestion.
  const [autoSuggestedIcon, setAutoSuggestedIcon] = useState<{ name: string; data: string; size: number } | null>(
    null,
  )
  const [autoIconLoading, setAutoIconLoading] = useState(false)
  const [iconManuallySet, setIconManuallySet] = useState(false)
  const autoIconRequestRef = useRef(0)
  // Drag-and-drop screen reordering state - native HTML5 DnD, same
  // convention as object-tree-panel.tsx's row dragging (simplified here:
  // screens have no reparenting concept, just a flat reorder within
  // whichever group - Masters or regular Screens - the dragged row visually
  // belongs to).
  const [draggedScreenId, setDraggedScreenId] = useState<string | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ id: string; position: "before" | "after" } | null>(null)

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
    setAutoSuggestedIcon(null)
    setIconManuallySet(false)
    setShowNewScreenDialog(true)
  }

  // Debounced search-as-you-type: translate the in-progress screen name to
  // English, then search Iconify with the translation, then fetch the top
  // match's real SVG. Doesn't run for master screens (icon isn't meaningful
  // there) or once the user has taken over the icon controls themselves.
  // autoIconRequestRef guards against a slow earlier request overwriting a
  // faster later one (typing "kitchen" fires a request per few letters;
  // "k", "ki", "kit"... could all still be in flight at once).
  useEffect(() => {
    if (!showNewScreenDialog || newScreenIsMaster || iconManuallySet) return
    const term = newScreenName.trim()
    if (term.length < 2) {
      setAutoSuggestedIcon(null)
      setAutoIconLoading(false)
      return
    }

    const requestId = ++autoIconRequestRef.current
    setAutoIconLoading(true)

    const timer = setTimeout(async () => {
      try {
        const translateRes = await fetch(`/api/translate?q=${encodeURIComponent(term)}&target=en`)
        const translateData = translateRes.ok ? await translateRes.json().catch(() => null) : null
        const englishTerm: string = translateData?.translated || term

        const matches = await searchIcons(englishTerm, 1)
        if (requestId !== autoIconRequestRef.current) return

        if (matches.length === 0) {
          setAutoSuggestedIcon(null)
          return
        }
        const { data, size } = await fetchIconSvgData(matches[0])
        if (requestId !== autoIconRequestRef.current) return
        setAutoSuggestedIcon({ name: matches[0].name, data, size })
      } catch {
        // Best-effort - leave whatever was already showing (or nothing).
        // A translation/search hiccup shouldn't block naming the screen.
      } finally {
        if (requestId === autoIconRequestRef.current) setAutoIconLoading(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [newScreenName, newScreenIsMaster, showNewScreenDialog, iconManuallySet])

  const addScreen = (name?: string) => {
    const isMaster = newScreenIsMaster
    const screenName = name || (isMaster ? `Master ${masterScreens.length + 1}` : `Screen ${normalScreens.length + 1}`)
    if (isScreenNameDuplicate(screenName)) return

    let iconAssetId = !isMaster ? newScreenIconAssetId : undefined
    let nextId = project.nextId
    // Finalize a still-pending auto-suggested icon into a real asset only
    // now - not while the user was still typing (that would create/orphan
    // an asset on every keystroke-driven match) - and only when nothing
    // else already claimed the icon slot. Folded into the single
    // onProjectUpdate below rather than calling onAddAsset/onIncrementNextId
    // separately - see this file's own header comment on why chaining those
    // with a stale `project` spread would silently clobber the asset.
    const newAssets: ProjectAsset[] = []
    if (!isMaster && !iconAssetId && autoSuggestedIcon) {
      const existing = project.assets.find((a) => a.type === "icon" && a.name === autoSuggestedIcon.name)
      if (existing) {
        iconAssetId = existing.id
      } else {
        const newAsset: ProjectAsset = { id: `icon-${nextId}`, type: "icon", ...autoSuggestedIcon }
        newAssets.push(newAsset)
        iconAssetId = newAsset.id
        nextId += 1
      }
    }

    const newScreen = {
      id: `screen-${nextId}`,
      name: screenName,
      objects: [],
      // Not meaningful on a master screen - see ProjectScreen.iconAssetId's
      // own comment (masters never appear in screen navigation).
      ...(!isMaster && iconAssetId ? { iconAssetId } : {}),
      ...(isMaster
        ? { isMaster: true }
        : // New normal screens default to the first existing master, if any
          // - see the master-screen grilling decision in the project history.
          { masterScreenId: masterScreens[0]?.id }),
    }
    nextId += 1

    onProjectUpdate({
      ...project,
      nextId,
      assets: newAssets.length > 0 ? [...project.assets, ...newAssets] : project.assets,
      screens: [...project.screens, newScreen],
    })

    onScreenChange(newScreen.id)
    setShowNewScreenDialog(false)
    setNewScreenName("")
    setNewScreenIconAssetId(undefined)
    setAutoSuggestedIcon(null)
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

    const screen = project.screens.find((s) => s.id === screenId)
    if (screen?.isMaster) {
      if (masterScreens.length <= 1) {
        toast({
          title: "Can't delete this master screen",
          description: "Every project needs at least one master screen.",
          variant: "destructive",
        })
        return
      }
      if (project.screens.some((s) => s.masterScreenId === screenId)) {
        toast({
          title: "Can't delete this master screen",
          description: "It still has screens assigned to it - reassign or delete those first.",
          variant: "destructive",
        })
        return
      }
    }

    // A master screen can't reach here with dependents still pointing at it
    // (guarded above), so this cleanup is now purely defensive rather than
    // the primary way dangling references were avoided.
    const updatedScreens = project.screens
      .filter((screen) => screen.id !== screenId)
      .map((screen) => (screen.masterScreenId === screenId ? { ...screen, masterScreenId: undefined } : screen))
    onProjectUpdate({ ...project, screens: updatedScreens })
    if (currentScreenId === screenId) {
      onScreenChange(updatedScreens[0].id)
    }
  }

  // Moves draggedId to sit right before/after targetId in the underlying
  // flat project.screens array. Masters and regular screens render as
  // separate groups (filtered by isMaster below), so a cross-group drop
  // just repositions the dragged screen within the other group's slice of
  // the same array with no visible effect - harmless, not worth guarding
  // against separately.
  const reorderScreens = (draggedId: string, targetId: string, position: "before" | "after") => {
    if (draggedId === targetId) return
    const screens = [...project.screens]
    const fromIndex = screens.findIndex((s) => s.id === draggedId)
    if (fromIndex === -1) return
    const [dragged] = screens.splice(fromIndex, 1)
    let toIndex = screens.findIndex((s) => s.id === targetId)
    if (toIndex === -1) return
    if (position === "after") toIndex += 1
    screens.splice(toIndex, 0, dragged)
    onProjectUpdate({ ...project, screens })
  }

  const resolveMasterObjects = (screen: Project["screens"][number]) => {
    if (screen.isMaster) return []
    return resolveMasterScreen(screen, project.screens)?.objects ?? []
  }

  // Shared by the row label (left of the screen name), the New Screen
  // dialog's own preview, and the auto-suggested-icon preview below - renders
  // an icon's SVG data-URL inline, same decode logic project-settings-dialog
  // .tsx's Screens tab uses.
  const renderIconData = (data: string | undefined, name: string | undefined, sizeClass: string) => {
    if (!data) return null
    return (
      <div
        className={cn(sizeClass, "shrink-0 [&>svg]:w-full [&>svg]:h-full")}
        title={name}
        dangerouslySetInnerHTML={{
          __html: (() => {
            try {
              if (data.startsWith("data:image/svg+xml;base64,")) {
                return atob(data.split(",")[1])
              }
              if (data.startsWith("data:image/svg+xml,")) {
                return decodeURIComponent(data.split(",")[1])
              }
              return data
            } catch {
              return '<svg viewBox="0 0 24 24" fill="currentColor"><rect width="20" height="20" x="2" y="2" rx="2"/></svg>'
            }
          })(),
        }}
      />
    )
  }

  const renderIconThumb = (iconAssetId: string | undefined, sizeClass: string) => {
    const iconAsset = project.assets.find((a) => a.id === iconAssetId)
    return renderIconData(iconAsset?.data, iconAsset?.name, sizeClass)
  }

  const renderScreenRow = (screen: Project["screens"][number]) => {
    const isSelected = screen.id === currentScreenId
    const isDropBefore = dropIndicator?.id === screen.id && dropIndicator.position === "before"
    const isDropAfter = dropIndicator?.id === screen.id && dropIndicator.position === "after"
    return (
      <div
        key={screen.id}
        data-screen-id={screen.id}
        className="group relative"
        draggable={!previewMode}
        onDragStart={(e) => {
          setDraggedScreenId(screen.id)
          e.dataTransfer.effectAllowed = "move"
          e.dataTransfer.setData("text/plain", screen.id)
        }}
        onDragOver={(e) => {
          if (!draggedScreenId || draggedScreenId === screen.id) return
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          const position = e.clientY - rect.top < rect.height / 2 ? "before" : "after"
          setDropIndicator({ id: screen.id, position })
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (draggedScreenId && dropIndicator) {
            reorderScreens(draggedScreenId, dropIndicator.id, dropIndicator.position)
          }
          setDraggedScreenId(null)
          setDropIndicator(null)
        }}
        onDragEnd={() => {
          setDraggedScreenId(null)
          setDropIndicator(null)
        }}
      >
        {isDropBefore && <div className="h-0.5 rounded-full bg-primary mb-0.5" />}
        <button
          type="button"
          onClick={() => onScreenChange(screen.id)}
          className={cn(
            "w-full flex items-start gap-1.5 rounded-md p-1 text-left transition-colors",
            isSelected ? "bg-accent" : "hover:bg-muted",
          )}
        >
          {screen.isMaster ? (
            <span
              className={cn("w-5 pt-0.5 flex justify-end shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
              title="Master screen"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
            </span>
          ) : (
            // No index number here (dropped 2026-08-17) - just an empty
            // spacer so thumbnails still line up with the master icon
            // column above.
            <span className="w-5 shrink-0" />
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
                masterScreen={screen.isMaster ? undefined : resolveMasterScreen(screen, project.screens)}
                screenWidth={project.screenWidth}
                screenHeight={project.screenHeight}
                projectName={project.name}
                fonts={project.fonts}
                projectAssets={project.assets}
                topics={project.topics}
                colorDepth={project.settings.colorDepth}
                offscreenMaskImage={offscreenMaskImage}
                adornmentDrawingArea={project.adornmentDrawingArea}
                adornmentRotation={project.settings.rotation ?? 0}
              />
            </div>
            <div className="flex items-center gap-1 mt-0.5 px-0.5 min-w-0">
              {renderIconThumb(screen.iconAssetId, "w-3 h-3")}
              <div className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">{screen.name}</div>
              {screen.isMaster && (
                <Badge variant="secondary" className="h-3.5 shrink-0 px-1 py-0 text-[9px] leading-none">
                  Master
                </Badge>
              )}
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
        {isDropAfter && <div className="h-0.5 rounded-full bg-primary mt-0.5" />}
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
              {masterScreens.map((screen) => renderScreenRow(screen))}
            </div>
          )}
          {normalScreens.map((screen) => renderScreenRow(screen))}
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
                  {newScreenIconAssetId
                    ? renderIconThumb(newScreenIconAssetId, "w-8 h-8")
                    : autoIconLoading
                      ? <Loader2 className="w-8 h-8 p-1.5 shrink-0 animate-spin text-muted-foreground" />
                      : autoSuggestedIcon
                        ? renderIconData(autoSuggestedIcon.data, autoSuggestedIcon.name, "w-8 h-8")
                        : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNewScreenIconSelector(true)}
                    className="gap-1.5"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {newScreenIconAssetId || autoSuggestedIcon ? "Change" : "Select icon"}
                  </Button>
                  {(newScreenIconAssetId || autoSuggestedIcon) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setNewScreenIconAssetId(undefined)
                        setAutoSuggestedIcon(null)
                        setIconManuallySet(true)
                      }}
                      className="h-8 w-8 p-0"
                      title="Clear screen icon"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {!newScreenIconAssetId && autoSuggestedIcon && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggested based on the screen name - change it or clear it if it's off.
                  </p>
                )}
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
            setAutoSuggestedIcon(null)
            setIconManuallySet(true)
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
