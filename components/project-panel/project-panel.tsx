"use client"

import type React from "react"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ScreenmanProject } from "../screenman-editor"
import { ExportDialog } from "../export-dialog"
import { Upload, FileCode, Trash2 } from "lucide-react"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"

interface ProjectPanelProps {
  project: ScreenmanProject
  currentScreenId: string
  onScreenChange: (screenId: string) => void
  onProjectUpdate: (project: ScreenmanProject) => void
}

export function ProjectPanel({ project, currentScreenId, onScreenChange, onProjectUpdate }: ProjectPanelProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [newScreenName, setNewScreenName] = useState("")
  const [showNewScreenDialog, setShowNewScreenDialog] = useState(false)
  const [snapGridInput, setSnapGridInput] = useState(project.settings.snapGrid)
  const assetFileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const isScreenNameDuplicate = (name: string, excludeScreenId?: string) => {
    const normalizedName = name.trim().toLowerCase()
    return project.screens.some(
      (screen) => screen.id !== excludeScreenId && screen.name.toLowerCase() === normalizedName,
    )
  }

  const addScreen = (name?: string, width?: number, height?: number) => {
    const screenName = name || `Screen ${project.screens.length + 1}`

    if (isScreenNameDuplicate(screenName)) {
      return
    }

    const newScreen = {
      id: `screen-${project.nextId}`,
      name: screenName,
      width: width || 400,
      height: height || 300,
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

  const updateScreenSize = (screenId: string, width: number, height: number) => {
    onProjectUpdate({
      ...project,
      screens: project.screens.map((screen) => (screen.id === screenId ? { ...screen, width, height } : screen)),
    })
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

  const updateProjectName = (name: string) => {
    onProjectUpdate({
      ...project,
      name,
    })
  }

  const importProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedProject = JSON.parse(e.target?.result as string)
        onProjectUpdate(importedProject)
        onScreenChange(importedProject.screens[0]?.id || "screen-1")
      } catch (error) {
        console.error("Failed to import project:", error)
        toast({
          title: "Import Failed",
          description: "Failed to import project. Please check the file format.",
          variant: "destructive",
        })
      }
    }
    reader.readAsText(file)
  }

  const handleSnapGridBlur = () => {
    onProjectUpdate({
      ...project,
      settings: {
        ...project.settings,
        snapGrid: snapGridInput,
      },
    })
  }

  const handleAssetUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/") && !file.type.includes("svg")) {
      toast({
        title: "Invalid File Type",
        description: "Please select an image or SVG file.",
        variant: "destructive",
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "File is too large. Please select a file smaller than 5MB.",
        variant: "destructive",
      })
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string

      const existingAsset = project.assets.find((asset) => asset.data === result)
      if (existingAsset) {
        toast({
          title: "Duplicate Asset",
          description: `Asset "${existingAsset.name}" already exists in the project.`,
          variant: "destructive",
        })
        return
      }

      const newAsset = {
        id: `asset-${project.nextId}`,
        name: file.name,
        type: file.type.includes("svg") ? ("svg" as const) : ("image" as const),
        data: result,
        size: file.size,
      }

      onProjectUpdate({
        ...project,
        nextId: project.nextId + 1,
        assets: [...project.assets, newAsset],
      })

      console.log("[v0] Added new asset:", newAsset.id, newAsset.name)
    }
    reader.readAsDataURL(file)

    event.target.value = ""
  }

  const deleteAsset = (assetId: string) => {
    const isUsedAsBackground = project.screens.some((screen) => screen.backgroundImageAssetId === assetId)

    if (isUsedAsBackground) {
      if (!confirm("This asset is being used as a background image. Are you sure you want to delete it?")) {
        return
      }

      const updatedScreens = project.screens.map((screen) =>
        screen.backgroundImageAssetId === assetId ? { ...screen, backgroundImageAssetId: undefined } : screen,
      )

      onProjectUpdate({
        ...project,
        screens: updatedScreens,
        assets: project.assets.filter((asset) => asset.id !== assetId),
      })
    } else {
      onProjectUpdate({
        ...project,
        assets: project.assets.filter((asset) => asset.id !== assetId),
      })
    }
  }

  const currentScreen = project.screens.find((s) => s.id === currentScreenId)

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="assets" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="flex-1 flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Assets ({project.assets.length})</Label>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => assetFileInputRef.current?.click()}
              >
                <Upload className="h-3 w-3" />
              </Button>
            </div>
            <input
              ref={assetFileInputRef}
              type="file"
              accept="image/*,.svg"
              onChange={handleAssetUpload}
              style={{ display: "none" }}
            />
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2">
              {project.assets.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-8">
                  No assets yet
                  <br />
                  Upload SVG icons and images to use in your designs
                </div>
              ) : (
                <div className="space-y-1">
                  {project.assets.map((asset) => (
                    <div key={asset.id} className="p-2 border rounded hover:bg-muted group">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 border rounded flex items-center justify-center bg-muted/50 flex-shrink-0">
                          {asset.type === "svg" ? (
                            <div
                              className="w-6 h-6 flex items-center justify-center"
                              dangerouslySetInnerHTML={{
                                __html: asset.data.startsWith("data:image/svg+xml;base64,")
                                  ? atob(asset.data.replace("data:image/svg+xml;base64,", ""))
                                  : asset.data.startsWith("data:image/svg+xml,")
                                    ? decodeURIComponent(asset.data.replace("data:image/svg+xml,", ""))
                                    : asset.data,
                              }}
                            />
                          ) : asset.type === "image" ? (
                            <img
                              src={asset.data || "/placeholder.svg"}
                              alt={asset.name}
                              className="w-6 h-6 object-cover rounded"
                            />
                          ) : (
                            <div className="w-4 h-4 bg-muted-foreground/20 rounded" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{asset.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {asset.type.toUpperCase()}
                            {asset.size && ` • ${Math.round(asset.size / 1024)}KB`}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteAsset(asset.id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <div className="p-2 border-t border-border">
        <div className="flex gap-1">
          <ExportDialog project={project}>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs bg-transparent">
              <FileCode className="h-3 w-3 mr-1" />
              Export
            </Button>
          </ExportDialog>
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs bg-transparent" asChild>
            <label>
              <Upload className="h-3 w-3 mr-1" />
              Import
              <input type="file" accept=".json" onChange={importProject} className="hidden" />
            </label>
          </Button>
        </div>
      </div>
    </div>
  )
}
