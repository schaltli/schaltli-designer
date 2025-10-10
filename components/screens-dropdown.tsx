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
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 28 28">
    <g fill="currentColor">
      <path d="M22.993 6.008A3.24 3.24 0 0 1 24.5 8.75v10.5c0 2.9-2.35 5.25-5.25 5.25H8.75a3.25 3.25 0 0 1-2.744-1.508l.122.006l.122.002h13A3.75 3.75 0 0 0 23 19.25v-13a4 4 0 0 0-.007-.242M6 14.5a2.5 2.5 0 1 1 5 0a2.5 2.5 0 0 1-5 0m2.5-1a1 1 0 1 0 0 2a1 1 0 0 0 0-2" />
      <path d="M13 14.25a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75m-7-5a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12A.75.75 0 0 1 6 9.25" />
      <path d="M18.75 3A3.25 3.25 0 0 1 22 6.25v12.5A3.25 3.25 0 0 1 18.75 22H6.25A3.25 3.25 0 0 1 3 18.75V6.25A3.25 3.25 0 0 1 6.25 3zm0 17.5a1.75 1.75 0 0 0 1.75-1.75V6.25a1.75 1.75 0 0 0-1.75-1.75H6.25A1.75 1.75 0 0 0 4.5 6.25v12.5a1.747 1.747 0 0 0 1.75 1.75z" />
    </g>
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
  const [dropdownOpen, setDropdownOpen] = useState(false)

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
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="h-8 px-3 text-sm font-medium"
          >
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
