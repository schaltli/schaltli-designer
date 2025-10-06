"use client"

import { useEffect } from "react"

import { useState } from "react"

import type React from "react"
import type { Topic } from "./screenman-editor"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ExportDialog } from "@/components/export-dialog" // Import ExportDialog
import { AssetColorEditorDialog } from "@/components/asset-color-editor-dialog" // Import AssetColorEditorDialog
import { MqttDiscoveryDialog } from "@/components/mqtt-discovery-dialog" // Import MqttDiscoveryDialog
import { SettingsIcon } from "@/components/icons/settings-icon"
import { MqttIcon } from "@/components/icons/mqtt-icon"
import { FolderIcon } from "@/components/icons/folder-icon"
import { GridIcon } from "@/components/icons/grid-icon"
import { FileCode } from "@/components/icons/file-code" // Import FileCode
import { Upload } from "@/components/icons/upload" // Import Upload
import { FontIcon } from "@/components/icons/font-icon"
// Removed BDF font handling; using TTF via URL
import { Trash2 } from "@/components/icons/trash-2" // Import Trash2 icon
import { AddTtfFontDialog } from "@/components/add-ttf-font-dialog"
import { useToast } from "@/hooks/use-toast"

const ScreensIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 28 28">
    <g fill="currentColor">
      <path d="M22.993 6.008A3.24 3.24 0 0 1 24.5 8.75v10.5c0 2.9-2.35 5.25-5.25 5.25H8.75a3.25 3.25 0 0 1-2.744-1.508l.122.006l.122.002h13A3.75 3.75 0 0 0 23 19.25v-13a4 4 0 0 0-.007-.242M6 14.5a2.5 2.5 0 1 1 5 0a2.5 2.5 0 0 1-5 0m2.5-1a1 1 0 1 0 0 2a1 1 0 0 0 0-2" />
      <path d="M13 14.25a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75m-7-5a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12A.75.75 0 0 1 6 9.25" />
      <path d="M18.75 3A3.25 3.25 0 0 1 22 6.25v12.5A3.25 3.25 0 0 1 18.75 22H6.25A3.25 3.25 0 0 1 3 18.75V6.25A3.25 3.25 0 0 1 6.25 3zm0 17.5a1.75 1.75 0 0 0 1.75-1.75V6.25a1.75 1.75 0 0 0-1.75-1.75H6.25A1.75 1.75 0 0 0 4.5 6.25v12.5a1.747 1.747 0 0 0 1.75 1.75z" />
    </g>
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

interface ScreenmanProject {
  name: string
  screenWidth: number
  screenHeight: number
  screens: { id: string; name: string; objects: any[] }[]
  assets: { id: string; name: string; type: string; data: string; size?: number }[]
  settings: { snapGrid: string }
  topics: Topic[]
  fonts?: {
    id: string
    name: string
    size: number
    url: string
    baselineOffset: number
  }[]
  nextId?: number // Added nextId for object/screen IDs
}

interface ProjectSettingsDialogProps {
  project: ScreenmanProject
  currentScreenId: string
  onProjectUpdate: (project: ScreenmanProject) => void
  projectSettingsTab?: string
  showProjectSettings?: boolean
  setShowProjectSettings?: (show: boolean) => void
  showMqttDiscovery?: boolean
  setShowMqttDiscovery?: (show: boolean) => void
  onTopicsSelected?: (topics: any[]) => void
}

export function ProjectSettingsDialog({
  project,
  currentScreenId,
  onProjectUpdate,
  projectSettingsTab = "properties",
  showProjectSettings = false,
  setShowProjectSettings,
  showMqttDiscovery = false,
  setShowMqttDiscovery,
  onTopicsSelected,
}: ProjectSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState(projectSettingsTab || "properties")
  const [snapGridInput, setSnapGridInput] = useState(project.settings.snapGrid)
  const [colorEditorOpen, setColorEditorOpen] = useState(false)
  const [selectedAssetForColorEdit, setSelectedAssetForColorEdit] = useState<any>(null)
  const topics = project.topics || []
  const fonts = project.fonts || [] // Added fonts state
  const [addTopicDialogOpen, setAddTopicDialogOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [topicForm, setTopicForm] = useState({
    topic: "",
    type: "text" as "numeric" | "text",
    examples: [] as string[],
  })
  const [editFontOpen, setEditFontOpen] = useState(false)
  const [fontBeingEdited, setFontBeingEdited] = useState<any>(null)
  const [editedScreenNames, setEditedScreenNames] = useState<Record<string, string>>({})
  const { toast } = useToast()

  const updateProjectName = (name: string) => {
    onProjectUpdate({
      ...project,
      name,
    })
  }

  const updateProjectScreenSize = (width: number, height: number) => {
    onProjectUpdate({
      ...project,
      screenWidth: width,
      screenHeight: height,
    })
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

  const importProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const importedProject = JSON.parse(e.target?.result as string)
        onProjectUpdate(importedProject)
      } catch (error) {
        console.error("Failed to import project:", error)
        alert("Failed to import project. Please check the file format.")
      }
    }
    reader.readAsText(file)
  }

  const generateExampleGrid = (gridSize: number) => {
    const horizontal = []
    const vertical = []

    for (let y = gridSize; y < project.screenHeight; y += gridSize) {
      horizontal.push(y)
    }

    for (let x = gridSize; x < project.screenWidth; x += gridSize) {
      vertical.push(x)
    }

    const gridConfig = JSON.stringify({ horizontal, vertical })
    setSnapGridInput(gridConfig)

    // Update the project immediately
    onProjectUpdate({
      ...project,
      settings: {
        ...project.settings,
        snapGrid: gridConfig,
      },
    })
  }

  const updateAssetData = (assetId: string, newData: string) => {
    console.log("[v0] Updating asset data for:", assetId)
    const updatedAssets = project.assets.map((asset) => (asset.id === assetId ? { ...asset, data: newData } : asset))

    onProjectUpdate({
      ...project,
      assets: updatedAssets,
    })
  }

  const openColorEditor = (asset: any) => {
    console.log("[v0] Opening color editor for asset:", asset.name)
    setSelectedAssetForColorEdit(asset)
    setColorEditorOpen(true)
  }

  const resetTopicForm = () => {
    setTopicForm({
      topic: "",
      type: "text",
      examples: [],
    })
    setEditingTopic(null)
  }

  const openAddTopicDialog = () => {
    resetTopicForm()
    setAddTopicDialogOpen(true)
  }

  const openEditTopicDialog = (topic: Topic) => {
    setTopicForm({
      topic: topic.topic,
      type: topic.type,
      examples: topic.examples,
    })
    setEditingTopic(topic)
    setAddTopicDialogOpen(true)
  }

  const isTopicNameDuplicate = (name: string, excludeTopicName?: string) => {
    const normalizedName = name.trim().toLowerCase()
    return topics.some((topic) => topic.topic !== excludeTopicName && topic.topic.toLowerCase() === normalizedName)
  }

  const handleSaveTopic = () => {
    if (!topicForm.topic.trim()) return

    if (editingTopic) {
      // When editing, exclude the current topic from duplicate check
      if (isTopicNameDuplicate(topicForm.topic, editingTopic.topic)) {
        alert("A topic with this name already exists. Please choose a different name.")
        return
      }
    } else {
      // When adding new, check all topics
      if (isTopicNameDuplicate(topicForm.topic)) {
        alert("A topic with this name already exists. Please choose a different name.")
        return
      }
    }

    let updatedTopics: Topic[]

    if (editingTopic) {
      updatedTopics = topics.map((t) =>
        t.topic === editingTopic.topic
          ? { topic: topicForm.topic, type: topicForm.type, examples: topicForm.examples }
          : t,
      )
    } else {
      const newTopic: Topic = {
        topic: topicForm.topic,
        type: topicForm.type,
        examples: topicForm.examples,
      }
      updatedTopics = [...topics, newTopic]
    }

    onProjectUpdate({
      ...project,
      topics: updatedTopics,
    })

    setAddTopicDialogOpen(false)
    resetTopicForm()
  }

  const handleDeleteTopic = (topicName: string) => {
    const updatedTopics = topics.filter((t) => t.topic !== topicName)

    onProjectUpdate({
      ...project,
      topics: updatedTopics,
    })
  }

  const handleMqttDiscovery = () => {
    if (setShowMqttDiscovery) {
      setShowMqttDiscovery(true)
    }
  }

  const handleMqttDiscoveryClose = () => {
    if (setShowMqttDiscovery) {
      setShowMqttDiscovery(false)
    }
  }

  const handleMqttTopicsSelected = (discoveredTopics: any[]) => {
    if (onTopicsSelected) {
      onTopicsSelected(discoveredTopics)
    }
  }

  const [addTtfOpen, setAddTtfOpen] = useState(false)
  const handleAddTtfFont = () => setAddTtfOpen(true)
  const handleConfirmAddTtf = (font: { id: string; name: string; size: number; url: string; baselineOffset: number }) => {
    const newFont = { ...font, id: `font-${project.nextId}` }
    console.log(`[Font Metrics] Adding new font: ${newFont.name} (ID: ${newFont.id}) - Size: ${newFont.size}px, baselineOffset: ${newFont.baselineOffset.toFixed(2)}px`)
    onProjectUpdate({
      ...project,
      fonts: [...(project.fonts || []), newFont],
      nextId: (project.nextId || 0) + 1,
    })
    setAddTtfOpen(false)
  }


  const openFontEdit = (font: any) => {
    setFontBeingEdited(font)
    setEditFontOpen(true)
  }

  const deleteFont = (fontId: string) => {
    onProjectUpdate({
      ...project,
      fonts: fonts.filter((f) => f.id !== fontId),
    })
  }

  const isScreenNameDuplicate = (name: string, excludeScreenId?: string) => {
    const normalizedName = name.trim().toLowerCase()
    return project.screens.some(
      (screen) => screen.id !== excludeScreenId && screen.name.toLowerCase() === normalizedName,
    )
  }

  const duplicateScreen = (screenId: string) => {
    const screenToDuplicate = project.screens.find((s) => s.id === screenId)
    if (!screenToDuplicate) return

    let currentNextId = project.nextId || 0

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
  }

  const deleteScreen = (screenId: string) => {
    if (project.screens.length <= 1) return

    if (screenId === currentScreenId) {
      toast({
        title: "Cannot delete active screen",
        description: "Please switch to a different screen before deleting this one.",
        variant: "destructive",
      })
      return
    }

    const updatedScreens = project.screens.filter((screen) => screen.id !== screenId)
    onProjectUpdate({
      ...project,
      screens: updatedScreens,
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

  const currentScreen = project.screens.find((s) => s.id === currentScreenId)

  const sidebarItems = [
    { id: "properties", label: "Project Properties", icon: SettingsIcon },
    { id: "screens", label: "Screens", icon: ScreensIcon },
    { id: "assets", label: "Assets", icon: FolderIcon },
    { id: "fonts", label: "Fonts", icon: FontIcon }, // Added Fonts tab
    { id: "snapgrid", label: "Snap Grid", icon: GridIcon },
    { id: "topics", label: "Topics", icon: MqttIcon },
  ]

  useEffect(() => {
    console.log("[v0] ProjectSettingsDialog projectSettingsTab changed to:", projectSettingsTab)
    if (projectSettingsTab) {
      setActiveTab(projectSettingsTab)
    }
  }, [projectSettingsTab])

  useEffect(() => {
    console.log(
      "[v0] ProjectSettingsDialog received project update, assets:",
      project.assets.map((a) => ({ id: a.id, name: a.name, type: a.type })),
    )
  }, [project.assets])

  useEffect(() => {
    if (activeTab === "screens") {
      const initialNames: Record<string, string> = {}
      project.screens.forEach((screen) => {
        initialNames[screen.id] = screen.name
      })
      setEditedScreenNames(initialNames)
    }
  }, [activeTab, project.screens])

  const handleOpenChange = (open: boolean) => {
    console.log("[v0] ProjectSettingsDialog handleOpenChange called with:", open)
    if (open) {
      console.log(
        "[v0] Dialog opening, current project assets:",
        project.assets.map((a) => ({ id: a.id, name: a.name, type: a.type })),
      )
    }
    if (setShowProjectSettings) {
      setShowProjectSettings(open)
    }
  }

  return (
    <>
      <Dialog open={showProjectSettings} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-4xl h-[600px] p-0 bg-background w-full max-w-full overflow-hidden">
          {(() => {
            console.log(
              "[v0] ProjectSettingsDialog content rendering, activeTab:",
              activeTab,
              "showProjectSettings:",
              showProjectSettings,
            )
            return null
          })()}

          <div className="flex flex-col h-full bg-background w-full max-w-full overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b bg-background flex-shrink-0">
              <DialogTitle>Project Settings</DialogTitle>
            </DialogHeader>

            <div className="flex flex-1 min-h-0 bg-background">
              <div className="w-48 border-r p-4 bg-background flex-shrink-0">
                <nav className="space-y-1">
                  {sidebarItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left",
                          activeTab === item.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                </nav>
              </div>

              <div className="flex-1 flex flex-col min-h-0 bg-background">
                {activeTab === "properties" && (
                  <div className="p-6 overflow-y-auto">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="projectName" className="text-sm">
                          Project Name
                        </Label>
                        <Input
                          id="projectName"
                          value={project.name}
                          onChange={(e) => updateProjectName(e.target.value)}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-sm">Screen Size (applies to all screens)</Label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <div>
                            <Label htmlFor="screenWidth" className="text-xs text-muted-foreground">
                              Width
                            </Label>
                            <Input
                              id="screenWidth"
                              type="number"
                              value={project.screenWidth}
                              onChange={(e) =>
                                updateProjectScreenSize(Number.parseInt(e.target.value) || 400, project.screenHeight)
                              }
                              placeholder="Width"
                            />
                          </div>
                          <div>
                            <Label htmlFor="screenHeight" className="text-xs text-muted-foreground">
                              Height
                            </Label>
                            <Input
                              id="screenHeight"
                              type="number"
                              value={project.screenHeight}
                              onChange={(e) =>
                                updateProjectScreenSize(project.screenWidth, Number.parseInt(e.target.value) || 300)
                              }
                              placeholder="Height"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          All screens in this project share the same dimensions
                        </p>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <ExportDialog project={project}>
                          <Button size="sm" variant="outline" className="flex-1 bg-transparent">
                            <FileCode className="h-4 w-4 mr-2" />
                            Export
                          </Button>
                        </ExportDialog>
                        <Button size="sm" variant="outline" className="flex-1 bg-transparent" asChild>
                          <label>
                            <Upload className="h-4 w-4 mr-2" />
                            Import
                            <input type="file" accept=".json" onChange={importProject} className="hidden" />
                          </label>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "screens" && (
                  <div className="p-6 flex flex-col h-full min-h-0">
                    <div className="flex items-center justify-between flex-shrink-0 mb-4">
                      <div>
                        <h3 className="text-lg font-medium">Screens</h3>
                        <p className="text-sm text-muted-foreground">Manage screens in your project</p>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                      <ScrollArea className="h-[calc(600px-200px)]">
                        <div className="p-3">
                          <div className="space-y-2">
                            {project.screens.map((screen, index) => {
                              const currentName = getScreenName(screen.id)
                              const isDuplicate = currentName.trim() && isScreenNameDuplicate(currentName, screen.id)

                              return (
                                <div
                                  key={screen.id}
                                  className="flex items-center gap-2 p-3 border rounded hover:bg-muted"
                                >
                                  <div className="flex-1 min-w-0">
                                    <Input
                                      value={currentName}
                                      onChange={(e) => handleScreenNameChange(screen.id, e.target.value)}
                                      onBlur={() => handleScreenNameBlur(screen.id)}
                                      className="h-8 text-sm mb-1"
                                    />
                                    {isDuplicate && (
                                      <p className="text-xs text-destructive">
                                        The name &quot;{currentName}&quot; is already taken
                                      </p>
                                    )}
                                    <div className="text-xs text-muted-foreground">
                                      {screen.objects.length} {screen.objects.length === 1 ? "object" : "objects"}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => moveScreen(screen.id, "up")}
                                      disabled={index === 0}
                                      className="h-8 w-8 p-0"
                                      title="Move up"
                                    >
                                      ↑
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => moveScreen(screen.id, "down")}
                                      disabled={index === project.screens.length - 1}
                                      className="h-8 w-8 p-0"
                                      title="Move down"
                                    >
                                      ↓
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => duplicateScreen(screen.id)}
                                      className="h-8 w-8 p-0"
                                      title="Duplicate screen"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                    {project.screens.length > 1 && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => deleteScreen(screen.id)}
                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                        title="Delete screen"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}

                {activeTab === "assets" && (
                  <div className="p-6 flex flex-col h-full min-h-0">
                    <div className="flex items-center justify-between flex-shrink-0 mb-4">
                      <Label className="text-sm font-medium">Assets ({project.assets.length})</Label>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <Upload className="h-4 w-4" />
                      </Button>
                    </div>

                    {(() => {
                      console.log("[v0] Complete assets list in project settings:")
                      project.assets.forEach((asset, index) => {
                        console.log(`[v0] Asset ${index + 1}:`, {
                          id: asset.id,
                          name: asset.name,
                          type: asset.type,
                          dataLength: asset.data?.length,
                          hasData: !!asset.data,
                        })
                      })
                      return null
                    })()}

                    <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                      <ScrollArea className="h-[calc(600px-200px)]">
                        <div className="p-3">
                          {project.assets.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-8">
                              No assets yet
                              <br />
                              Upload SVG icons and images to use in your designs
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {project.assets.map((asset, index) => {
                                console.log("[v0] Asset debug:", {
                                  name: asset.name,
                                  type: asset.type,
                                  dataStart: asset.data?.substring(0, 50),
                                  dataLength: asset.data?.length,
                                })

                                return (
                                  <div key={asset.id} className="p-3 border rounded hover:bg-muted">
                                    <div className="flex items-center gap-3">
                                      <div className="w-12 h-12 border rounded flex items-center justify-center bg-muted/50 flex-shrink-0">
                                        {asset.type === "svg" || asset.type === "icon" ? (
                                          <div
                                            className="w-10 h-10 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-10 [&>svg]:max-h-10"
                                            dangerouslySetInnerHTML={{
                                              __html: (() => {
                                                try {
                                                  console.log("[v0] Processing SVG/Icon asset:", asset.name)
                                                  console.log("[v0] Asset type:", asset.type)
                                                  console.log("[v0] Original asset data type:", typeof asset.data)
                                                  console.log(
                                                    "[v0] Asset data starts with:",
                                                    asset.data?.substring(0, 30),
                                                  )

                                                  let svgContent = asset.data

                                                  if (asset.data.startsWith("data:image/svg+xml;base64,")) {
                                                    console.log("[v0] Detected base64 encoded SVG")
                                                    svgContent = atob(
                                                      asset.data.replace("data:image/svg+xml;base64,", ""),
                                                    )
                                                    console.log(
                                                      "[v0] Decoded base64 SVG content:",
                                                      svgContent.substring(0, 100),
                                                    )
                                                  } else if (asset.data.startsWith("data:image/svg+xml,")) {
                                                    console.log("[v0] Detected URL encoded SVG")
                                                    svgContent = decodeURIComponent(
                                                      asset.data.replace("data:image/svg+xml,", ""),
                                                    )
                                                    console.log(
                                                      "[v0] Decoded URL SVG content:",
                                                      svgContent.substring(0, 100),
                                                    )
                                                  } else if (
                                                    asset.data.startsWith("data:image/svg+xml;charset=utf-8,")
                                                  ) {
                                                    console.log("[v0] Detected UTF-8 encoded SVG")
                                                    svgContent = decodeURIComponent(
                                                      asset.data.replace("data:image/svg+xml;charset=utf-8,", ""),
                                                    )
                                                    console.log(
                                                      "[v0] Decoded UTF-8 SVG content:",
                                                      svgContent.substring(0, 100),
                                                    )
                                                  } else {
                                                    console.log("[v0] SVG data format not recognized, using as-is")
                                                    console.log("[v0] Raw SVG content:", svgContent?.substring(0, 50))
                                                  }

                                                  if (!svgContent || !svgContent.includes("<svg")) {
                                                    console.error(
                                                      "[v0] Invalid SVG content after processing:",
                                                      svgContent?.substring(0, 50),
                                                    )
                                                    return '<svg viewBox="0 0 24 24" fill="currentColor"><rect width="20" height="20" x="2" y="2" rx="2"/></svg>'
                                                  }

                                                  console.log(
                                                    "[v0] Final processed SVG content:",
                                                    svgContent.substring(0, 100),
                                                  )
                                                  console.log("[v0] SVG content length:", svgContent.length)
                                                  console.log("[v0] SVG preview should now render successfully")

                                                  return svgContent
                                                } catch (error) {
                                                  console.error("[v0] SVG processing error:", error)
                                                  console.error("[v0] Error details:", error.message)
                                                  return '<svg viewBox="0 0 24 24" fill="currentColor"><rect width="20" height="20" x="2" y="2" rx="2"/></svg>'
                                                }
                                              })(),
                                            }}
                                          />
                                        ) : asset.type === "image" ? (
                                          (() => {
                                            console.log("[v0] Processing image asset:", asset.name)
                                            console.log("[v0] Image data starts with:", asset.data?.substring(0, 30))
                                            return (
                                              <img
                                                src={asset.data || "/placeholder.svg"}
                                                alt={asset.name}
                                                className="w-10 h-10 object-cover rounded"
                                                onLoad={() =>
                                                  console.log("[v0] Image loaded successfully:", asset.name)
                                                }
                                                onError={(e) => {
                                                  console.error("[v0] Image load error for:", asset.name)
                                                  console.error("[v0] Image src was:", e.currentTarget.src)
                                                  e.currentTarget.src = "/placeholder.svg"
                                                }}
                                              />
                                            )
                                          })()
                                        ) : (
                                          (() => {
                                            console.log(
                                              "[v0] Unknown asset type:",
                                              asset.type,
                                              "for asset:",
                                              asset.name,
                                            )
                                            return <div className="w-6 h-6 bg-muted-foreground/20 rounded" />
                                          })()
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">{asset.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {asset.type === "icon" ? "ICON" : asset.type.toUpperCase()}
                                          {asset.size && ` • ${Math.round(asset.size / 1024)}KB`}
                                        </div>
                                      </div>
                                      {(asset.type === "svg" || asset.type === "icon") && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => openColorEditor(asset)}
                                          className="text-xs"
                                        >
                                          Change Colors
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}

                {activeTab === "snapgrid" && (
                  <div className="p-6 overflow-y-auto">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-2">
                        <Label htmlFor="snapGrid" className="text-sm">
                          Snap Grid Configuration
                        </Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <GridIcon className="h-4 w-4 mr-2" />
                              Example Grids
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => generateExampleGrid(20)}>20x20px Grid</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => generateExampleGrid(10)}>10x10px Grid</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <Textarea
                        id="snapGrid"
                        value={snapGridInput}
                        onChange={(e) => setSnapGridInput(e.target.value)}
                        onBlur={handleSnapGridBlur}
                        className="mt-1 font-mono text-xs min-h-[120px] max-h-[500px] overflow-y-auto break-all whitespace-pre-wrap"
                        placeholder='{"horizontal": [4, 200], "vertical": [20, 40, 60]}'
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        JSON format: horizontal and vertical line positions
                        <span className="block mt-1">
                          Current screen: {project.screenWidth}×{project.screenHeight}px
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "topics" && (
                  <div className="p-6 flex flex-col h-full min-h-0 w-full max-w-full overflow-hidden">
                    <div className="flex items-center justify-between flex-shrink-0 mb-4 w-full max-w-full overflow-hidden">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-medium">Topics</h3>
                        <p className="text-sm text-muted-foreground">Manage MQTT topics for your project</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button onClick={handleMqttDiscovery} size="sm" variant="outline">
                          <MqttIcon className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                          Discover MQTT Topics
                        </Button>
                        <Button onClick={openAddTopicDialog} size="sm">
                          <MqttIcon className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                          Add Topic
                        </Button>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-hidden w-full max-w-full">
                      <ScrollArea className="h-[calc(600px-200px)] w-full max-w-full">
                        <div className="space-y-2 pr-4 w-full max-w-full overflow-hidden">
                          {topics.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-muted rounded-lg">
                              <MqttIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground">
                                No topics configured yet. Click "Add Topic" to manually add a topic or "Discover MQTT
                                Topics" to automatically find topics from your MQTT broker.
                              </p>
                            </div>
                          ) : (
                            topics.map((topic) => (
                              <div
                                key={topic.topic}
                                className="p-4 border rounded-lg bg-card w-full max-w-full overflow-hidden"
                              >
                                <div className="flex items-start justify-between w-full max-w-full overflow-hidden">
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    <div className="flex items-center gap-2 mb-2 w-full max-w-full overflow-hidden">
                                      <MqttIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                      <span className="font-medium truncate max-w-[300px]">{topic.topic}</span>
                                      <span
                                        className={cn(
                                          "px-2 py-1 text-xs rounded-full flex-shrink-0",
                                          topic.type === "numeric"
                                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                            : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
                                        )}
                                      >
                                        {topic.type}
                                      </span>
                                    </div>
                                    {topic.examples && topic.examples.length > 0 && (
                                      <div className="text-sm text-muted-foreground w-full max-w-full overflow-hidden">
                                        <span className="font-medium">Examples: </span>
                                        <div
                                          className="inline-block w-full max-w-full overflow-hidden break-all word-break-break-all"
                                          style={{
                                            display: "-webkit-box",
                                            WebkitLineClamp: 3,
                                            WebkitBoxOrient: "vertical",
                                            lineHeight: "1.4em",
                                            maxHeight: "4.2em",
                                          }}
                                        >
                                          {topic.examples.join(", ")}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-2 ml-4 flex-shrink-0">
                                    <Button variant="outline" size="sm" onClick={() => openEditTopicDialog(topic)}>
                                      Edit
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDeleteTopic(topic.topic)}
                                      className="text-destructive hover:text-destructive"
                                    >
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}

                {activeTab === "fonts" && (
                  <div className="p-6 flex flex-col h-full min-h-0">
                    <div className="flex items-center justify-between flex-shrink-0 mb-4">
                      <Label className="text-sm font-medium">Fonts ({fonts.length})</Label>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleAddTtfFont}>
                          <Upload className="h-4 w-4 mr-2" />
                          Add TTF Font
                        </Button>
                      </div>
                    </div>


                    <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                      <ScrollArea className="h-[calc(600px-200px)]">
                        <div className="p-3">
                          {fonts.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-8">
                              No fonts yet
                              <br />
                              Add TTF fonts by URL or load from GitHub repository
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {fonts.map((font) => (
                                <div key={font.id} className="p-3 border rounded hover:bg-muted group">
                                  <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 border rounded flex items-center justify-center bg-muted/50 flex-shrink-0">
                                      <FontIcon className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">
                                        {font.name}
                                      </div>
                                      <div className="text-xs text-muted-foreground space-y-0.5">
                                        <div>
                                          {font.size}px • Baseline offset: {font.baselineOffset.toFixed(1)}px
                                        </div>
                                        <div className="text-muted-foreground/70">
                                          TTF Font
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openFontEdit(font)}
                                        className="text-xs"
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => deleteFont(font.id)}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    <AddTtfFontDialog isOpen={addTtfOpen} onClose={() => setAddTtfOpen(false)} onAdd={handleConfirmAddTtf} />

      <Dialog open={addTopicDialogOpen} onOpenChange={setAddTopicDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTopic ? "Edit Topic" : "Add Topic"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="topicName" className="text-sm font-medium">
                Topic Name
              </Label>
              <Input
                id="topicName"
                value={topicForm.topic}
                onChange={(e) => setTopicForm({ ...topicForm, topic: e.target.value })}
                placeholder="e.g., sensor/temperature"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="topicType" className="text-sm font-medium">
                Type
              </Label>
              <Select
                value={topicForm.type}
                onValueChange={(value: "numeric" | "text") => setTopicForm({ ...topicForm, type: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="numeric">Numeric</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="topicExamples" className="text-sm font-medium">
                Examples
              </Label>
              <div className="mt-1 space-y-2">
                {topicForm.examples.map((example, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={example}
                      onChange={(e) => {
                        const newExamples = [...topicForm.examples]
                        newExamples[index] = e.target.value
                        setTopicForm({ ...topicForm, examples: newExamples })
                      }}
                      placeholder={`Example ${index + 1}`}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newExamples = topicForm.examples.filter((_, i) => i !== index)
                        setTopicForm({ ...topicForm, examples: newExamples })
                      }}
                      className="px-3"
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTopicForm({ ...topicForm, examples: [...topicForm.examples, ""] })
                  }}
                  className="w-full"
                >
                  + Add Example
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Add example values for this topic</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddTopicDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTopic} disabled={!topicForm.topic.trim()}>
              {editingTopic ? "Update" : "Add"} Topic
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AssetColorEditorDialog
        isOpen={colorEditorOpen}
        onClose={() => {
          setColorEditorOpen(false)
          setSelectedAssetForColorEdit(null)
        }}
        asset={selectedAssetForColorEdit}
        onUpdateAsset={updateAssetData}
      />

      <AddTtfFontDialog
        isOpen={editFontOpen}
        onClose={() => setEditFontOpen(false)}
        onAdd={(updated) => {
          console.log(`[Font Metrics] Updating font: ${updated.name} (ID: ${updated.id}) - Size: ${updated.size}px, baselineOffset: ${updated.baselineOffset.toFixed(2)}px`)
          onProjectUpdate({
            ...project,
            fonts: (project.fonts || []).map((f) => (f.id === updated.id ? { ...f, name: updated.name, size: updated.size, url: updated.url, baselineOffset: updated.baselineOffset } : f)),
          })
          setEditFontOpen(false)
          setFontBeingEdited(null)
        }}
        mode="edit"
        initialFont={fontBeingEdited}
      />


      {setShowMqttDiscovery && onTopicsSelected && (
        <MqttDiscoveryDialog
          isOpen={showMqttDiscovery}
          onClose={handleMqttDiscoveryClose}
          onTopicsSelected={handleMqttTopicsSelected}
        />
      )}
    </>
  )
}
