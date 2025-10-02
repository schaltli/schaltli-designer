"use client"

import { useState } from "react"
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
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l-.15-.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

import type { ScreenmanProject } from "./screenman-editor"

interface ScreensDropdownProps {
  project: ScreenmanProject
  currentScreenId: string
  onScreenChange: (screenId: string) => void
  onProjectUpdate: (project: ScreenmanProject) => void
  onOpenProjectSettings?: (tab: string) => void // Added prop to open project settings
}

export function ScreensDropdown({
  project,
  currentScreenId,
  onScreenChange,
  onProjectUpdate,
  onOpenProjectSettings,
}: ScreensDropdownProps) {
  const [showNewScreenDialog, setShowNewScreenDialog] = useState(false)
  const [newScreenName, setNewScreenName] = useState("")

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
                    {screen.objects.length} {screen.objects.length === 1 ? "object" : "objects"}
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
          <DropdownMenuItem
            onClick={() => {
              if (onOpenProjectSettings) {
                onOpenProjectSettings("screens")
              }
            }}
          >
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
              New screen will use the project size: {project.screenWidth} × {project.screenHeight}
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
    </>
  )
}
