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
import { Plus, MoreVertical, Copy, Trash2, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ScreenmanProject } from "../screenman-editor"
import { ScreenThumbnail } from "./screen-thumbnail"

interface ScreensPanelProps {
  project: ScreenmanProject
  currentScreenId: string
  onScreenChange: (screenId: string) => void
  onProjectUpdate: (project: ScreenmanProject) => void
  onOpenProjectSettings?: (tab: string) => void
  // Preview mode simulates runtime behavior - the project itself must stay
  // read-only while it's active, so adding a new screen is disabled.
  previewMode?: boolean
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
}: ScreensPanelProps) {
  const [showNewScreenDialog, setShowNewScreenDialog] = useState(false)
  const [newScreenName, setNewScreenName] = useState("")

  const isScreenNameDuplicate = (name: string, excludeScreenId?: string) => {
    const normalizedName = name.trim().toLowerCase()
    return project.screens.some(
      (screen) => screen.id !== excludeScreenId && screen.name.toLowerCase() === normalizedName,
    )
  }

  const addScreen = (name?: string) => {
    const screenName = name || `Screen ${project.screens.length + 1}`
    if (isScreenNameDuplicate(screenName)) return

    const newScreen = {
      id: `screen-${project.nextId}`,
      name: screenName,
      objects: [],
    }

    onProjectUpdate({
      ...project,
      nextId: project.nextId + 1,
      screens: [...project.screens, newScreen],
    })

    onScreenChange(newScreen.id)
    setShowNewScreenDialog(false)
    setNewScreenName("")
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
    const updatedScreens = project.screens.filter((screen) => screen.id !== screenId)
    onProjectUpdate({ ...project, screens: updatedScreens })
    if (currentScreenId === screenId) {
      onScreenChange(updatedScreens[0].id)
    }
  }

  return (
    <div className="w-60 shrink-0 border-r border-border bg-card flex flex-col min-h-0">
      <div className="h-9 shrink-0 border-b border-border flex items-center justify-between px-2">
        <span className="text-xs font-medium text-muted-foreground">Screens</span>
        {!previewMode && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            title="Add screen"
            onClick={() => setShowNewScreenDialog(true)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
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
          {project.screens.map((screen, index) => {
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
                  <span
                    className={cn(
                      "text-xs w-5 pt-0.5 text-right shrink-0 tabular-nums",
                      isSelected ? "text-foreground font-medium" : "text-muted-foreground",
                    )}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "border-4 rounded overflow-hidden bg-white",
                        isSelected ? "border-primary" : "border-border",
                      )}
                    >
                      <ScreenThumbnail
                        screen={screen}
                        screenWidth={project.screenWidth}
                        screenHeight={project.screenHeight}
                        projectName={project.name}
                        fonts={project.fonts}
                        projectAssets={project.assets}
                        topics={project.topics}
                        colorDepth={project.settings.colorDepth}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5 px-0.5">{screen.name}</div>
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
          })}
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
            <DialogTitle>New Screen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="screenName" className="text-sm">
                Screen Name
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
    </div>
  )
}
