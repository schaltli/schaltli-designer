"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"

const ChevronDown = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const Plus = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
)

const Settings = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const Copy = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
)

const Trash2 = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </svg>
)

import type { ScreenmanProject } from "./screenman-editor"

interface ScreensDropdownProps {
  project: ScreenmanProject
  currentScreenId: string
  onScreenChange: (screenId: string) => void
  onProjectUpdate: (project: ScreenmanProject) => void
}

export function ScreensDropdown({ project, currentScreenId, onScreenChange, onProjectUpdate }: ScreensDropdownProps) {
  const [showNewScreenDialog, setShowNewScreenDialog] = useState(false)
  const [showManageDialog, setShowManageDialog] = useState(false)
  const [newScreenName, setNewScreenName] = useState("")
  const [editedScreenNames, setEditedScreenNames] = useState<Record<string, string>>({})

  const currentScreen = project.screens.find((s) => s.id === currentScreenId)

  const isScreenNameDuplicate = (name: string, excludeScreenId?: string) => {
    const normalizedName = name.trim().toLowerCase()
    return project.screens.some(
      (screen) => screen.id !== excludeScreenId && screen.name.toLowerCase() === normalizedName,
    )
  }

  const addScreen = (name?: string) => {
    const screenName = name || `Screen ${project.screens.length + 1}`

    if (isScreenNameDuplicate(screenName)) {
      return
    }

    const projectWidth = project.screens.length > 0 ? project.screens[0].width : 400
    const projectHeight = project.screens.length > 0 ? project.screens[0].height : 300

    const newScreen = {
      id: `screen-${project.nextId}`,
      name: screenName,
      width: projectWidth,
      height: projectHeight,
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
        return {
          ...obj,
          id: `obj-${currentNextId}`,
        }
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
    onProjectUpdate({
      ...project,
      screens: updatedScreens,
    })

    if (currentScreenId === screenId) {
      onScreenChange(updatedScreens[0].id)
    }
  }

  const updateScreenName = (screenId: string, name: string) => {
    if (isScreenNameDuplicate(name, screenId)) {
      return
    }

    onProjectUpdate({
      ...project,
      screens: project.screens.map((screen) => (screen.id === screenId ? { ...screen, name } : screen)),
    })
  }

  const moveScreen = (screenId: string, direction: "up" | "down") => {
    const currentIndex = project.screens.findIndex((s) => s.id === screenId)
    if (currentIndex === -1) return

    const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1
    if (newIndex < 0 || newIndex >= project.screens.length) return

    const newScreens = [...project.screens]
    const [movedScreen] = newScreens.splice(currentIndex, 1)
    newScreens.splice(newIndex, 0, movedScreen)

    onProjectUpdate({
      ...project,
      screens: newScreens,
    })
  }

  const handleScreenNameChange = (screenId: string, newName: string) => {
    setEditedScreenNames((prev) => ({ ...prev, [screenId]: newName }))
  }

  const handleScreenNameBlur = (screenId: string) => {
    const newName = editedScreenNames[screenId]
    const originalName = project.screens.find((s) => s.id === screenId)?.name

    if (!newName || newName === originalName) {
      return
    }

    if (!isScreenNameDuplicate(newName, screenId)) {
      onProjectUpdate({
        ...project,
        screens: project.screens.map((screen) => (screen.id === screenId ? { ...screen, name: newName } : screen)),
      })
    } else {
      setEditedScreenNames((prev) => ({ ...prev, [screenId]: originalName || "" }))
    }
  }

  const getScreenName = (screenId: string) => {
    return editedScreenNames[screenId] ?? project.screens.find((s) => s.id === screenId)?.name ?? ""
  }

  useEffect(() => {
    if (showManageDialog) {
      const initialNames: Record<string, string> = {}
      project.screens.forEach((screen) => {
        initialNames[screen.id] = screen.name
      })
      setEditedScreenNames(initialNames)
    } else {
      setEditedScreenNames({})
    }
  }, [showManageDialog, project.screens])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 px-3 text-sm font-medium">
            {currentScreen?.name || "Select Screen"}
            <ChevronDown className="ml-2 h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {project.screens.map((screen) => {
            const isSelected = screen.id === currentScreenId

            return (
              <DropdownMenuItem
                key={screen.id}
                onClick={() => {
                  onScreenChange(screen.id)
                }}
                className={isSelected ? "bg-accent" : ""}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{screen.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {screen.width} × {screen.height} • {screen.objects.length} objects
                  </span>
                </div>
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowNewScreenDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add New Screen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowManageDialog(true)}>
            <Settings className="mr-2 h-4 w-4" />
            Manage Screens
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* New Screen Dialog */}
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
              New screen will use the project size:{" "}
              {project.screens.length > 0 ? `${project.screens[0].width} × ${project.screens[0].height}` : "400 × 300"}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  addScreen(newScreenName || undefined)
                }}
                className="flex-1"
                disabled={newScreenName.trim() && isScreenNameDuplicate(newScreenName)}
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

      {/* Manage Screens Dialog */}
      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Screens</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {project.screens.map((screen, index) => {
                const currentName = getScreenName(screen.id)
                const isDuplicate = currentName.trim() && isScreenNameDuplicate(currentName, screen.id)

                return (
                  <div key={screen.id} className="flex items-center gap-2 p-2 border rounded">
                    <div className="flex-1">
                      <Input
                        value={currentName}
                        onChange={(e) => handleScreenNameChange(screen.id, e.target.value)}
                        onBlur={() => handleScreenNameBlur(screen.id)}
                        className="h-8 text-sm"
                      />
                      {isDuplicate && (
                        <p className="text-xs text-destructive mt-1">
                          The name &quot;{currentName}&quot; is already taken
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {screen.width} × {screen.height} • {screen.objects.length} objects
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveScreen(screen.id, "up")}
                        disabled={index === 0}
                        className="h-6 w-6 p-0"
                      >
                        ↑
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveScreen(screen.id, "down")}
                        disabled={index === project.screens.length - 1}
                        className="h-6 w-6 p-0"
                      >
                        ↓
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => duplicateScreen(screen.id)}
                        className="h-6 w-6 p-0"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      {project.screens.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteScreen(screen.id)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
          <div className="flex justify-end">
            <Button onClick={() => setShowManageDialog(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
