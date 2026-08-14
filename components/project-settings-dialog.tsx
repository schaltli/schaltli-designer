"use client"

import { useEffect } from "react"

import { useState } from "react"

import type React from "react"
import { Search, X } from "lucide-react"
import type { Topic, JsonSubtopic, HardwareButton, HardwareButtonAction } from "./project-editor"
import { describeHardwareButtonAction } from "./project-editor"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { flattenJsonFields } from "@/lib/json-path"
import { AssetColorEditorDialog } from "@/components/asset-color-editor-dialog" // Import AssetColorEditorDialog
import { SettingsIcon } from "@/components/icons/settings-icon"
import { MqttIcon } from "@/components/icons/mqtt-icon"
import { FolderIcon } from "@/components/icons/folder-icon"
import { GridIcon } from "@/components/icons/grid-icon"
import { FontIcon } from "@/components/icons/font-icon"
import { HardwareButtonActionDialog } from "@/components/hardware-button-action-dialog"
import { Trash2 } from "@/components/icons/trash-2" // Import Trash2 icon
import { FontPreviewDialog } from "@/components/font-preview-dialog"
import { BDFFont } from "@/lib/bdffont"
// Removed GitHubIcon usage
import { ButtonIcon } from "@/components/icons/button-icon"
import { AdornmentIcon } from "@/components/icons/adornment-icon"
import { PaletteIcon } from "@/components/icons/palette-icon"
import { useToast } from "@/hooks/use-toast"
import { getColorPaletteForDepth, calculateColorUsage, groupColorsByUsage } from "@/lib/color-palette"
import {
  listDeviceDescriptionFiles,
  parseDeviceDescriptionFile,
  deviceDescriptionToProjectFields,
  resolveRotatedScreenSize,
  type DeviceDescriptionListEntry,
} from "@/lib/device-description"

const ScreensIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 28 28">
    <g fill="currentColor">
      <path d="M22.993 6.008A3.24 3.24 0 0 1 24.5 8.75v10.5c0 2.9-2.35 5.25-5.25 5.25H8.75a3.25 3.25 0 0 1-2.744-1.508l.122.006l.122.002h13A3.75 3.75 0 0 0 23 19.25v-13a4 4 0 0 0-.007-.242M6 14.5a2.5 2.5 0 1 1 5 0a2.5 2.5 0 0 1-5 0m2.5-1a1 1 0 1 0 0 2a1 1 0 0 0 0-2" />
      <path d="M13 14.25a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75m-7-5a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12A.75.75 0 0 1 6 9.25" />
      <path d="M18.75 3A3.25 3.25 0 0 1 22 6.25v12.5A3.25 3.25 0 0 1 18.75 22H6.25A3.25 3.25 0 0 1 3 18.75V6.25A3.25 3.25 0 0 1 6.25 3zm0 17.5a1.75 1.75 0 0 0 1.75-1.75V6.25a1.75 1.75 0 0 0-1.75-1.75H6.25A1.75 1.75 0 0 0 4.5 6.25v12.5a1.747 1.747 0 0 0 1.75 1.75z" />
    </g>
  </svg>
)

const DeviceIcon = ({ className }: { className?: string }) => (
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
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
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

// Marks a screen as a master (see ProjectScreen.isMaster in project-editor.tsx).
const MasterScreenIcon = ({ className }: { className?: string }) => (
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
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="9" y1="9" x2="9" y2="21" />
  </svg>
)

interface Project {
  name: string
  screenWidth: number
  screenHeight: number
  screens: {
    id: string
    name: string
    objects: any[]
    isMaster?: boolean
    masterScreenId?: string
    showMaster?: boolean
  }[]
  assets: { id: string; name: string; type: string; data: string; size?: number }[]
  hardwareButtons?: HardwareButton[]
  settings: {
    snapGrid: string
    colorDepth?: "1bit" | "4bit" | "24bit"
    supportsSoftwareButtons?: boolean
    deviceId?: string
    deviceName?: string
    supportedObjectTypes?: string[]
    rotation?: 0 | 90 | 180 | 270
  }
  topics: Topic[]
  fonts?: {
    id: string
    name: string
    displayName: string
    path: string
    size?: number
    data?: string
    internalName?: string
    ascent?: number
    descent?: number
  }[]
  nextId?: number // Added nextId for object/screen IDs
  adornment?: string // Added adornment field
  adornmentDrawingArea?: {
    // Added adornmentDrawingArea field
    x: number
    y: number
    width: number
    height: number
    svgViewBox: { x: number; y: number; width: number; height: number }
  }
}

interface ProjectSettingsDialogProps {
  project: Project
  currentScreenId: string
  onProjectUpdate: (project: Project) => void
  projectSettingsTab?: string
  showProjectSettings?: boolean
  setShowProjectSettings?: (show: boolean) => void
  setShowMqttDiscovery?: (show: boolean) => void
  // Called after a device is successfully (re-)loaded here, so the parent
  // can clear any "device not available, using embedded data" warning.
  onDeviceResolved?: () => void
  // Opens the shared IconSelectorModal (owned by project-editor.tsx, since
  // it's also used for canvas/object icons) targeting a given screen's own
  // iconAssetId - see ProjectScreen's own comment for what this is for.
  onOpenScreenIconSelector?: (screenId: string) => void
}

export function ProjectSettingsDialog({
  project,
  currentScreenId,
  onProjectUpdate,
  projectSettingsTab = "properties",
  showProjectSettings = false,
  setShowProjectSettings,
  setShowMqttDiscovery,
  onDeviceResolved,
  onOpenScreenIconSelector,
}: ProjectSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState(projectSettingsTab || "properties")
  const [snapGridInput, setSnapGridInput] = useState(project.settings.snapGrid)
  const [colorEditorOpen, setColorEditorOpen] = useState(false)
  const [selectedAssetForColorEdit, setSelectedAssetForColorEdit] = useState<any>(null)
  const topics = project.topics || []
  const fonts = project.fonts || [] // Added fonts state
  const hardwareButtons = project.hardwareButtons || [] // Added hardware buttons state
  const [addTopicDialogOpen, setAddTopicDialogOpen] = useState(false)
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null)
  const [topicForm, setTopicForm] = useState({
    topic: "",
    type: "text" as "numeric" | "text" | "json",
    examples: [] as string[],
    subtopics: [] as JsonSubtopic[],
  })
  const [fontPreviewOpen, setFontPreviewOpen] = useState(false)
  const [fontBeingPreviewed, setFontBeingPreviewed] = useState<any>(null)
  const [editedScreenNames, setEditedScreenNames] = useState<Record<string, string>>({})
  const [availableDdfs, setAvailableDdfs] = useState<DeviceDescriptionListEntry[]>([])
  const [selectedDdfPath, setSelectedDdfPath] = useState<string>("")
  const [ddfLoading, setDdfLoading] = useState(false)
  const [ddfError, setDdfError] = useState<string | null>(null)
  // Which rotations the *currently loaded* device allows (screen.allowedRotations,
  // see lib/device-description.ts) - fetched separately from availableDdfs
  // since that list only carries a picker thumbnail, not the full manifest.
  // Only used to render the rotation picker's enabled/disabled state; the
  // actual rotation change itself (handleRotationChange) is pure arithmetic
  // on the project's own current screenWidth/screenHeight, no re-fetch needed.
  const [rotationCapability, setRotationCapability] = useState<{ deviceId: string; allowedRotations: number[] } | null>(null)
  // Distinguishes "still fetching" from "fetched, device just doesn't
  // support rotation" - both otherwise look identical (rotationCapability
  // is null/empty either way). Without this the rotation picker had no
  // loading state at all: on a real network (not localhost), the DDF zip
  // fetch+parse takes a moment, so it looked like the feature was simply
  // missing until the user happened to click to another tab and back,
  // giving the fetch time to finish in the background (reported live,
  // 2026-08-04).
  const [rotationLoading, setRotationLoading] = useState(false)
  const [hardwareButtonActionForm, setHardwareButtonActionForm] = useState({
    actionType: "next-screen" as HardwareButtonAction["type"],
    targetScreenId: "",
    mqttTopic: "",
    mqttMessage: "",
  })
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [buttonForAction, setButtonForAction] = useState<HardwareButton | null>(null)
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
      subtopics: [],
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
      subtopics: topic.subtopics ?? [],
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

    // subtopics only make sense for a "json" topic - drop them if the type
    // was switched away from "json" so a stale list doesn't linger unseen.
    const subtopics = topicForm.type === "json" ? topicForm.subtopics : undefined

    if (editingTopic) {
      updatedTopics = topics.map((t) =>
        t.topic === editingTopic.topic
          ? { id: t.id, topic: topicForm.topic, type: topicForm.type, examples: topicForm.examples, subtopics }
          : t,
      )
    } else {
      const newTopic: Topic = {
        id: `topic_${Date.now()}`,
        topic: topicForm.topic,
        type: topicForm.type,
        examples: topicForm.examples,
        subtopics,
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

  // Removed GitHub font loader handler
  
  const handlePreviewFont = (font: any) => {
    setFontBeingPreviewed(font)
    setFontPreviewOpen(true)
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

    // Deleting a master must not leave dangling masterScreenId references on
    // the screens that used it - nullify them rather than blocking the
    // delete (mirrors screens-panel.tsx's deleteScreen).
    const updatedScreens = project.screens
      .filter((screen) => screen.id !== screenId)
      .map((screen) => (screen.masterScreenId === screenId ? { ...screen, masterScreenId: undefined } : screen))
    onProjectUpdate({
      ...project,
      screens: updatedScreens,
    })
  }

  const setScreenMaster = (screenId: string, masterScreenId: string | undefined) => {
    onProjectUpdate({
      ...project,
      screens: project.screens.map((screen) => (screen.id === screenId ? { ...screen, masterScreenId } : screen)),
    })
  }

  const setScreenShowMaster = (screenId: string, showMaster: boolean) => {
    onProjectUpdate({
      ...project,
      screens: project.screens.map((screen) => (screen.id === screenId ? { ...screen, showMaster } : screen)),
    })
  }

  const clearScreenIcon = (screenId: string) => {
    onProjectUpdate({
      ...project,
      screens: project.screens.map((screen) => (screen.id === screenId ? { ...screen, iconAssetId: undefined } : screen)),
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
  const masterScreens = project.screens.filter((s) => s.isMaster)

  const openActionDialog = (button: HardwareButton) => {
    setButtonForAction(button)
    setActionDialogOpen(true)
  }

  const escapeXmlText = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

  const handleSaveButtonAction = (buttonId: string, action: HardwareButtonAction | null) => {
    // .map() alone silently no-ops if this buttonId has no entry yet in
    // project.hardwareButtons (e.g. a project saved before this DDF's
    // current button set existed, or any other path that left the array
    // incomplete) - the dialog would show the newly picked action type for
    // a moment, Save would appear to succeed, but nothing was actually
    // written, so reopening the dialog (or a real device) would just see
    // "None" again. Found live 2026-08-10 configuring "Rotate Right" on a
    // project whose hardwareButtons didn't yet have a btn-1 entry. Upsert
    // instead: update the existing entry if there is one, otherwise append
    // a new one so every button becomes configurable regardless of what
    // was previously persisted. buttonForAction (passed in from the DDF's
    // own hardwareButtons via openActionDialog) already has this button's
    // real name/svgElementId/shape - reuse it rather than only carrying id
    // + defaultAction, so a freshly-appended entry isn't missing fields
    // the adornment overlay relies on.
    const existing = hardwareButtons.find((b) => b.id === buttonId)
    const updatedHardwareButtons = existing
      ? hardwareButtons.map((b) => (b.id === buttonId ? { ...b, defaultAction: action ?? undefined } : b))
      : [...hardwareButtons, { ...(buttonForAction as HardwareButton), id: buttonId, defaultAction: action ?? undefined }]

    onProjectUpdate({
      ...project,
      hardwareButtons: updatedHardwareButtons,
    })
  }

  const sidebarItems = [
    { id: "properties", label: "Project Properties", icon: SettingsIcon },
    { id: "device", label: "Device", icon: DeviceIcon }, // Added Device tab (Device Description File import)
    { id: "screens", label: "Screens", icon: ScreensIcon },
    { id: "assets", label: "Assets", icon: FolderIcon },
    { id: "fonts", label: "Fonts", icon: FontIcon }, // Added Fonts tab
    { id: "color-palette", label: "Color Palette", icon: PaletteIcon }, // Added Color Palette tab
    { id: "hardware-buttons", label: "Hardware Buttons", icon: ButtonIcon }, // Added Hardware Buttons tab
    { id: "adornment", label: "Adornment", icon: AdornmentIcon }, // Added Adornment tab
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

  useEffect(() => {
    // Refetches every time the Device tab activates, not just the first
    // time - same reasoning as rotationCapability's effect just below: this
    // dialog stays mounted for the whole page session, so a "only if empty"
    // guard would permanently stick to whatever the list looked like the
    // first time this tab was ever opened.
    if (activeTab === "device") {
      listDeviceDescriptionFiles().then(setAvailableDdfs)
    }
  }, [activeTab])

  useEffect(() => {
    const deviceId = project.settings.deviceId
    if (!deviceId) {
      setRotationCapability(null)
      return
    }
    // Deliberately *not* gated on "already have it for this deviceId" -
    // ProjectSettingsDialog stays mounted for the whole page session
    // (showProjectSettings only toggles the Dialog's own visibility, see
    // project-editor.tsx), so a one-time-per-deviceId guard here would
    // permanently stick to whatever allowedRotations was fetched the first
    // time the Device tab was ever opened, even after the DDF changes
    // server-side - reported live (2026-08-04): re-opening the dialog
    // wasn't enough to pick up a DDF update, only a full page reload was
    // (and even that only helps if nothing had cached rotationCapability
    // yet this session). Refetching every time the Device tab activates
    // matches the rest of this app's "always re-resolve fresh" convention.
    if (activeTab !== "device") return
    // Prefer the curated entry when both exist for this deviceId - matches
    // resolveDeviceForProject's precedence (see lib/device-description.ts),
    // so this reflects whichever copy the project actually resolves to on
    // load, not whichever happened to come first in the list.
    const entry =
      availableDdfs.find((d) => d.deviceId === deviceId && d.source === "curated") ??
      availableDdfs.find((d) => d.deviceId === deviceId)
    if (!entry) return
    setRotationLoading(true)
    // no-store: same reasoning as loadDeviceDescriptionByPath - this static
    // zip's content can change under the same filename.
    fetch(entry.path, { cache: "no-store" })
      .then((res) => res.blob())
      .then(parseDeviceDescriptionFile)
      .then((parsed) => {
        setRotationCapability({ deviceId, allowedRotations: parsed.manifest.screen.allowedRotations ?? [] })
      })
      .catch(() => {
        // Non-fatal - the rotation picker just won't offer any non-0 option.
      })
      .finally(() => setRotationLoading(false))
  }, [project.settings.deviceId, availableDdfs, activeTab])

  // Changing rotation only ever touches screenWidth/screenHeight + the
  // rotation setting itself - adornmentDrawingArea/hardwareButtons stay
  // native (0deg) in project state always, applied live at render time (see
  // canvas.tsx and this dialog's own hardware-buttons tab) - so no DDF
  // re-fetch is needed here, just arithmetic on the project's current size.
  const handleRotationChange = (newRotation: 0 | 90 | 180 | 270) => {
    const allowedRotations = rotationCapability?.allowedRotations ?? []
    if (newRotation !== 0 && !allowedRotations.includes(newRotation)) return

    const currentRotation = project.settings.rotation ?? 0
    const currentlySwapped = currentRotation === 90 || currentRotation === 270
    const nativeWidth = currentlySwapped ? project.screenHeight : project.screenWidth
    const nativeHeight = currentlySwapped ? project.screenWidth : project.screenHeight

    const rotated = resolveRotatedScreenSize({ screenWidth: nativeWidth, screenHeight: nativeHeight, allowedRotations }, newRotation)
    onProjectUpdate({
      ...project,
      screenWidth: rotated.screenWidth,
      screenHeight: rotated.screenHeight,
      settings: { ...project.settings, rotation: rotated.rotation },
    })
  }

  const handleLoadDevice = async () => {
    if (!selectedDdfPath) return

    setDdfLoading(true)
    setDdfError(null)

    try {
      // no-store: same reasoning as loadDeviceDescriptionByPath - this
      // static zip's content can change under the same filename.
      const response = await fetch(selectedDdfPath, { cache: "no-store" })
      if (!response.ok) {
        throw new Error(`Could not fetch ${selectedDdfPath} (${response.status})`)
      }
      const zipBlob = await response.blob()
      const parsed = await parseDeviceDescriptionFile(zipBlob)
      const fields = deviceDescriptionToProjectFields(parsed, project.hardwareButtons || [])
      const rotated = resolveRotatedScreenSize(fields, project.settings.rotation ?? 0)
      if (rotated.rotationWasReset) {
        toast({
          title: "Rotation reset",
          description: `This device doesn't support ${project.settings.rotation}° rotation - reset to 0°.`,
        })
      }

      onProjectUpdate({
        ...project,
        screenWidth: rotated.screenWidth,
        screenHeight: rotated.screenHeight,
        adornment: fields.adornment,
        adornmentDrawingArea: fields.adornmentDrawingArea,
        hardwareButtons: fields.hardwareButtons,
        fonts: fields.fonts,
        settings: {
          ...project.settings,
          colorDepth: fields.colorDepth,
          deviceId: fields.deviceId,
          deviceName: fields.deviceName,
          supportedObjectTypes: fields.supportedObjectTypes,
          rotation: rotated.rotation,
          needsPageIconsInSize: fields.needsPageIconsInSize,
        },
      })

      toast({
        title: "Device loaded",
        description: `"${fields.deviceName}" applied: screen ${rotated.screenWidth}x${rotated.screenHeight}, ${fields.fonts.length} fonts, ${fields.hardwareButtons.length} buttons.`,
      })
      onDeviceResolved?.()
    } catch (error) {
      console.error("[v0] Error loading DDF:", error)
      setDdfError(error instanceof Error ? error.message : "Failed to load device")
    } finally {
      setDdfLoading(false)
    }
  }

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
          <Button variant="ghost" size="sm" className="h-8 px-3 font-normal flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" />
            Settings
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
                {activeTab === "device" && (
                  <div className="p-6 overflow-y-auto">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm">Device Description File</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Import screen size, color depth, physical button layout, and fonts from a device/firmware
                          project's DDF instead of entering them manually. Drop a <code>.ddf.zip</code> into{" "}
                          <code>public/ddf/</code> to make it available here.
                        </p>
                      </div>

                      {project.settings.deviceName && (
                        <div className="text-sm rounded-md border px-3 py-2 bg-muted/50">
                          Currently loaded: <span className="font-medium">{project.settings.deviceName}</span>
                        </div>
                      )}

                      {rotationLoading && (
                        <p className="text-xs text-muted-foreground">Checking rotation support...</p>
                      )}

                      {!rotationLoading && rotationCapability && rotationCapability.allowedRotations.length > 0 && (
                        <div>
                          <Label className="text-sm">Rotation</Label>
                          <p className="text-xs text-muted-foreground mt-1">
                            How this device is physically mounted. Swaps screen width/height at 90°/270°. Existing
                            objects are not moved - they may end up outside the new screen bounds.
                          </p>
                          <div className="flex gap-2 mt-2">
                            {[0, ...rotationCapability.allowedRotations].map((deg) => (
                              <Button
                                key={deg}
                                type="button"
                                size="sm"
                                variant={(project.settings.rotation ?? 0) === deg ? "default" : "outline"}
                                onClick={() => handleRotationChange(deg as 0 | 90 | 180 | 270)}
                              >
                                {deg}°
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {availableDdfs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No devices found in <code>public/ddf/</code>.
                        </p>
                      ) : (
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <Label htmlFor="ddf-select" className="text-xs text-muted-foreground">
                              Device
                            </Label>
                            <Select value={selectedDdfPath} onValueChange={setSelectedDdfPath}>
                              <SelectTrigger id="ddf-select" className="mt-1">
                                <SelectValue placeholder="Select a device..." />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Grouped by source rather than one flat, silently-deduped list -
                                    a device can show up here twice (once curated, once
                                    auto-discovered) with different versions; the group + version
                                    make that visible instead of one copy silently winning behind
                                    the scenes (see app/api/ddf/list/route.ts's header comment). */}
                                {availableDdfs.some((d) => d.source === "curated") && (
                                  <SelectGroup>
                                    <SelectLabel>Server DDFs</SelectLabel>
                                    {availableDdfs
                                      .filter((d) => d.source === "curated")
                                      .map((ddf) => (
                                        <SelectItem key={ddf.path} value={ddf.path}>
                                          {ddf.deviceName}
                                          {ddf.ddfVersion ? ` (v${ddf.ddfVersion})` : ""}
                                        </SelectItem>
                                      ))}
                                  </SelectGroup>
                                )}
                                {availableDdfs.some((d) => d.source === "auto-discovered") && (
                                  <SelectGroup>
                                    <SelectLabel>Announced Devices</SelectLabel>
                                    {availableDdfs
                                      .filter((d) => d.source === "auto-discovered")
                                      .map((ddf) => (
                                        <SelectItem key={ddf.path} value={ddf.path}>
                                          {ddf.deviceName}
                                          {ddf.ddfVersion ? ` (v${ddf.ddfVersion})` : ""}
                                        </SelectItem>
                                      ))}
                                  </SelectGroup>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button onClick={handleLoadDevice} disabled={!selectedDdfPath || ddfLoading}>
                            {ddfLoading ? "Loading..." : "Load Device"}
                          </Button>
                        </div>
                      )}

                      {ddfError && <p className="text-sm text-destructive">{ddfError}</p>}

                      <p className="text-xs text-muted-foreground">
                        Loading a device overwrites screen size, color depth, adornment, hardware buttons, and fonts
                        for this project. Object types the device's firmware doesn't render will be disabled in the
                        toolbar and flagged on the canvas.
                      </p>
                    </div>
                  </div>
                )}

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
                            <Input id="screenWidth" type="number" value={project.screenWidth} disabled />
                          </div>
                          <div>
                            <Label htmlFor="screenHeight" className="text-xs text-muted-foreground">
                              Height
                            </Label>
                            <Input id="screenHeight" type="number" value={project.screenHeight} disabled />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Set by the loaded Device Description File (see the "Device" tab)
                        </p>
                      </div>

                      {/* Software Buttons Support */}
                      <div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="software-buttons" className="text-sm">
                            Hardware supports Software Buttons (Touch screen)
                          </Label>
                          <input
                            id="software-buttons"
                            type="checkbox"
                            checked={project.settings.supportsSoftwareButtons || false}
                            onChange={(e) => {
                              onProjectUpdate({
                                ...project,
                                settings: {
                                  ...project.settings,
                                  supportsSoftwareButtons: e.target.checked,
                                },
                              })
                            }}
                            className="h-4 w-4"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Enable this to show the Software Button tool in the toolbar
                        </p>
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
                                  data-screen-name={screen.name}
                                  className="flex items-center gap-2 p-3 border rounded hover:bg-muted"
                                >
                                  <div className="flex-1 min-w-0">
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
                                        value={currentName}
                                        onChange={(e) => handleScreenNameChange(screen.id, e.target.value)}
                                        onBlur={() => handleScreenNameBlur(screen.id)}
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                    {isDuplicate && (
                                      <p className="text-xs text-destructive">
                                        The name &quot;{currentName}&quot; is already taken
                                      </p>
                                    )}
                                    <div className="text-xs text-muted-foreground">
                                      {screen.objects.length} {screen.objects.length === 1 ? "object" : "objects"}
                                    </div>
                                    {/* Same button style as the New Screen dialog's own icon
                                        picker (screens-panel.tsx) for visual consistency - the
                                        earlier icon-only ghost button crammed into the row's
                                        move/duplicate/delete cluster was "kaum sichtbar" (barely
                                        visible), found live 2026-08-11. Not meaningful on a master
                                        screen - see ProjectScreen.iconAssetId's own comment. */}
                                    {!screen.isMaster && onOpenScreenIconSelector && (() => {
                                      const iconAsset = project.assets.find((a) => a.id === screen.iconAssetId)
                                      return (
                                        <div className="flex items-center gap-2 mt-2">
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
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onOpenScreenIconSelector(screen.id)}
                                            className="gap-1.5"
                                          >
                                            <Search className="h-3.5 w-3.5" />
                                            {iconAsset ? "Change" : "Select icon"}
                                          </Button>
                                          {screen.iconAssetId && (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => clearScreenIcon(screen.id)}
                                              className="h-8 w-8 p-0"
                                              title="Clear screen icon"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                        </div>
                                      )
                                    })()}
                                    {!screen.isMaster && masterScreens.length > 0 && (
                                      <div className="flex items-center gap-3 mt-2">
                                        <Select
                                          value={screen.masterScreenId ?? "none"}
                                          onValueChange={(value) =>
                                            setScreenMaster(screen.id, value === "none" ? undefined : value)
                                          }
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
                                              onChange={(e) => setScreenShowMaster(screen.id, e.target.checked)}
                                              className="h-3.5 w-3.5"
                                            />
                                            Show master
                                          </label>
                                        )}
                                      </div>
                                    )}
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-transparent"
                        onClick={() => {
                          // Find all used asset IDs
                          const usedAssetIds = new Set<string>()
                          
                          // Check background images
                          project.screens.forEach(screen => {
                            if (screen.backgroundImageAssetId) {
                              usedAssetIds.add(screen.backgroundImageAssetId)
                            }
                            
                            // Check objects
                            screen.objects.forEach(obj => {
                              // Check icon objects
                              if (obj.type === 'icon' && obj.properties.assetId) {
                                usedAssetIds.add(obj.properties.assetId)
                              }
                              // Check MQTTIconField valueIconPairs
                              if (obj.type === 'MQTTIconField' && obj.properties.valueIconPairs) {
                                obj.properties.valueIconPairs.forEach((pair: any) => {
                                  if (pair.thenShowIcon) {
                                    usedAssetIds.add(pair.thenShowIcon)
                                  }
                                })
                              }
                            })
                          })
                          
                          // Filter out unused assets and remove them
                          onProjectUpdate({
                            ...project,
                            assets: project.assets.filter(asset => usedAssetIds.has(asset.id))
                          })
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove Unused Assets
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
                                            : topic.type === "json"
                                              ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
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
                                    {topic.type === "json" && topic.subtopics && topic.subtopics.length > 0 && (
                                      <div className="text-sm text-muted-foreground mt-1">
                                        <span className="font-medium">Subtopics: </span>
                                        {topic.subtopics.map((s) => s.label || s.path).join(", ")}
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
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2 mb-4">
                      Set by the loaded Device Description File (see the "Device" tab)
                    </p>

                    <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                      <ScrollArea className="h-[calc(600px-200px)]">
                        <div className="p-3">
                          {fonts.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-8">
                              No fonts yet
                              <br />
                              Load a device in the "Device" tab
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
                                        {font.displayName || font.name}
                                      </div>
                                      <div className="text-xs text-muted-foreground space-y-0.5">
                                        <div>
                                          {font.path}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => handlePreviewFont(font)}
                                      >
                                        Preview
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

                {activeTab === "color-palette" && (
                  <div className="p-6 flex flex-col h-full min-h-0">
                    <div className="flex-shrink-0 space-y-4 mb-4">
                      <h3 className="text-lg font-semibold">Color Palette</h3>
                      
                      <div>
                        <Label className="text-sm">Screen Color Depth</Label>
                        <div className="mt-1 px-3 py-2 text-sm border rounded-md bg-muted/50">
                          {project.settings.colorDepth || "24bit"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Set by the loaded Device Description File (see the "Device" tab)
                        </p>
                      </div>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col">
                      <Label className="text-sm font-medium mb-3 block flex-shrink-0">Available Colors ({getColorPaletteForDepth(project.settings.colorDepth || "24bit").length})</Label>
                      <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                        <ScrollArea className="h-full">
                          <div className="p-4">
                        {(() => {
                          const currentColorDepth = project.settings.colorDepth || "24bit"
                          const palette = getColorPaletteForDepth(currentColorDepth)
                          const paletteWithUsage = calculateColorUsage(palette, project.screens)
                          const { used, unused } = groupColorsByUsage(paletteWithUsage)
                              
                              return (
                                <div className="space-y-4">
                                  {/* Used Colors Section */}
                                  {used.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 px-2">
                                        Used Colors ({used.length})
                                      </h4>
                                      <div className="grid grid-cols-2 gap-2">
                                        {used.map((color) => (
                                          <div
                                            key={color.id}
                                            className="flex items-center gap-2 p-2 rounded border hover:bg-accent transition-colors"
                                          >
                                            <div
                                              className="w-8 h-8 rounded border border-gray-300 flex-shrink-0"
                                              style={{ backgroundColor: color.hex }}
                                            />
                                            <div className="flex-1 min-w-0">
                                              <div className="text-sm font-medium truncate">{color.name}</div>
                                              <div className="text-xs text-muted-foreground font-mono">{color.hex}</div>
                                            </div>
                                            <div className="text-xs font-semibold text-primary">
                                              {color.usageCount}×
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Unused Colors Section */}
                                  {unused.length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 px-2">
                                        Unused Colors ({unused.length})
                                      </h4>
                                      <div className="grid grid-cols-2 gap-2">
                                        {unused.map((color) => (
                                          <div
                                            key={color.id}
                                            className="flex items-center gap-2 p-2 rounded border hover:bg-accent transition-colors"
                                          >
                                            <div
                                              className="w-8 h-8 rounded border border-gray-300 flex-shrink-0"
                                              style={{ backgroundColor: color.hex }}
                                            />
                                            <div className="flex-1 min-w-0">
                                              <div className="text-sm font-medium truncate">{color.name}</div>
                                              <div className="text-xs text-muted-foreground font-mono">{color.hex}</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
                          </div>
                        </ScrollArea>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "hardware-buttons" && (
                  <div className="p-6 flex flex-col h-full min-h-0">
                    <div className="flex items-center justify-between flex-shrink-0 mb-4">
                      <Label className="text-sm font-medium">Hardware Buttons ({hardwareButtons.length})</Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2 mb-4">
                      Set by the loaded Device Description File (see the "Device" tab). Click a button on the diagram
                      below to configure its default action - a screen can still override it individually. Green =
                      has a default action, gray = none (hover for details).
                    </p>

                    <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                      <ScrollArea className="h-[calc(600px-200px)]">
                        <div className="p-3">
                          {hardwareButtons.length === 0 || !project.adornment ? (
                            <div className="text-sm text-muted-foreground text-center py-8">
                              No hardware buttons
                              <br />
                              Load a device in the "Device" tab
                            </div>
                          ) : (
                            <div
                              className="w-full border rounded bg-background flex items-center justify-center overflow-hidden p-4 [&_[id^='button-']]:cursor-pointer"
                              onClick={(e) => {
                                const targetEl = (e.target as Element).closest?.('[id^="button-"]')
                                const svgElementId = targetEl?.getAttribute("id")
                                if (!svgElementId) return
                                const button = hardwareButtons.find((b) => b.svgElementId === svgElementId)
                                if (button) openActionDialog(button)
                              }}
                              dangerouslySetInnerHTML={{
                                __html: (() => {
                                  try {
                                    let svgContent = project.adornment
                                    if (project.adornment.startsWith("data:image/svg+xml;base64,")) {
                                      svgContent = atob(project.adornment.replace("data:image/svg+xml;base64,", ""))
                                    } else if (project.adornment.startsWith("data:image/svg+xml,")) {
                                      svgContent = decodeURIComponent(
                                        project.adornment.replace("data:image/svg+xml,", ""),
                                      )
                                    }

                                    // One small status dot per button, in its own
                                    // top-right corner - same coordinate space as
                                    // the button rects themselves, since
                                    // HardwareButton.x/y/width come from the exact
                                    // same DDF entries. <title> gives a native
                                    // hover tooltip with the actual action.
                                    const badges = hardwareButtons
                                      .map((button) => {
                                        if (button.x === undefined || button.y === undefined) return ""
                                        const hasAction = !!button.defaultAction
                                        const label = hasAction
                                          ? describeHardwareButtonAction(button.defaultAction!, project.screens)
                                          : "No default action"
                                        const cx = button.x + (button.width ?? 0) - 4
                                        const cy = button.y + 4
                                        return `<g><circle cx="${cx}" cy="${cy}" r="3.5" fill="${hasAction ? "#16a34a" : "#9ca3af"}" stroke="white" stroke-width="0.75" /><title>${escapeXmlText(button.name)}: ${escapeXmlText(label)}</title></g>`
                                      })
                                      .join("")

                                    // Wrap the whole picture (+ badges, so they
                                    // rotate along) in a <g transform="rotate(...)">
                                    // around the *native* screen cutout's center -
                                    // adornmentDrawingArea/hardwareButtons positions
                                    // are always stored native (0deg), same as
                                    // canvas.tsx's rendering (see
                                    // lib/adornment-rotation.ts's header comment) -
                                    // SVG's own transform handles both the visual
                                    // rotation and click hit-testing for free, no
                                    // manual geometry needed here.
                                    const rotation = project.settings.rotation ?? 0
                                    const pivotX = (project.adornmentDrawingArea?.x ?? 0) + (project.adornmentDrawingArea?.width ?? 0) / 2
                                    const pivotY = (project.adornmentDrawingArea?.y ?? 0) + (project.adornmentDrawingArea?.height ?? 0) / 2

                                    const modifiedSvg = svgContent.replace(
                                      /<svg([^>]*)>([\s\S]*)<\/svg>/,
                                      (_match, svgAttrs, innerContent) =>
                                        `<svg${svgAttrs} style="max-width: 100%; max-height: 100%; width: auto; height: auto;">` +
                                        `<g transform="rotate(${rotation} ${pivotX} ${pivotY})">${innerContent}${badges}</g>` +
                                        `</svg>`,
                                    )

                                    return modifiedSvg
                                  } catch (error) {
                                    console.error("Error rendering hardware buttons diagram:", error)
                                    return '<div class="text-xs text-muted-foreground">Error rendering diagram</div>'
                                  }
                                })(),
                              }}
                            />
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                )}

                {activeTab === "adornment" && (
                  <div className="p-6 flex flex-col h-full min-h-0">
                    <div className="flex items-center justify-between flex-shrink-0 mb-4">
                      <Label className="text-sm font-medium">Project Adornment</Label>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2 mb-4">
                      Set by the loaded Device Description File (see the "Device" tab)
                    </p>

                    <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
                      <ScrollArea className="h-[calc(600px-200px)]">
                        <div className="p-3">
                          {project.adornment ? (
                            <div className="space-y-4">
                              <div className="text-sm text-muted-foreground">
                                An adornment is currently set for this project. The screen element from the SVG will be
                                used to determine the project dimensions.
                              </div>
                               <div className="border rounded p-4 bg-muted/20">
                                 <div className="text-xs text-muted-foreground mb-2">Adornment Preview:</div>
                                 <div
                                   className="w-full h-80 border rounded bg-background flex items-center justify-center overflow-hidden"
                                   style={{
                                     aspectRatio: 'auto'
                                   }}
                                   dangerouslySetInnerHTML={{
                                     __html: (() => {
                                       try {
                                         let svgContent = project.adornment
                                         if (project.adornment.startsWith("data:image/svg+xml;base64,")) {
                                           svgContent = atob(project.adornment.replace("data:image/svg+xml;base64,", ""))
                                         } else if (project.adornment.startsWith("data:image/svg+xml,")) {
                                           svgContent = decodeURIComponent(
                                             project.adornment.replace("data:image/svg+xml,", ""),
                                           )
                                         }
                                         
                                         // Add scaling attributes to the SVG to make it fit within the preview
                                         const modifiedSvg = svgContent.replace(
                                           /<svg([^>]*)>/,
                                           '<svg$1 style="max-width: 100%; max-height: 100%; width: auto; height: auto;">'
                                         )
                                         
                                         return modifiedSvg
                                       } catch (error) {
                                         console.error("Error rendering adornment preview:", error)
                                         return '<div class="text-xs text-muted-foreground">Error rendering preview</div>'
                                       }
                                     })(),
                                   }}
                                 />
                               </div>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground text-center py-8">
                              No adornment set
                              <br />
                              Load a device in the "Device" tab
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
                onValueChange={(value: "numeric" | "text" | "json") => setTopicForm({ ...topicForm, type: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="numeric">Numeric</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
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
                      placeholder={topicForm.type === "json" ? '{"temp":23,"humid":56}' : `Example ${index + 1}`}
                      className="flex-1 font-mono"
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
              <p className="text-xs text-muted-foreground mt-1">
                {topicForm.type === "json" ? "Add example JSON payloads for this topic" : "Add example values for this topic"}
              </p>
            </div>

            {topicForm.type === "json" && (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Subtopics</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Merges across *all* examples, not just the first:
                      // discovery keeps an example precisely when it adds a
                      // field the others didn't have (see
                      // MqttDiscoveryDialog's mergeJsonMessage), so
                      // detecting from one example alone would drop exactly
                      // the fields the extra examples were kept for.
                      const seen = new Set(topicForm.subtopics.map((s) => s.path))
                      const detected: JsonSubtopic[] = []
                      topicForm.examples.forEach((example, exampleIndex) => {
                        if (!example.trim()) return
                        let parsed: unknown
                        try {
                          parsed = JSON.parse(example)
                        } catch {
                          return // not valid JSON - nothing to detect in this one
                        }
                        flattenJsonFields(parsed).forEach((field, fieldIndex) => {
                          if (seen.has(field.path)) return
                          seen.add(field.path)
                          detected.push({
                            id: `subtopic_${Date.now()}_${exampleIndex}_${fieldIndex}`,
                            path: field.path,
                            type: field.type,
                          })
                        })
                      })
                      if (detected.length === 0) return
                      setTopicForm({ ...topicForm, subtopics: [...topicForm.subtopics, ...detected] })
                    }}
                  >
                    Detect from examples
                  </Button>
                </div>
                <div className="mt-1 space-y-2">
                  {topicForm.subtopics.map((subtopic, index) => (
                    <div key={subtopic.id} className="flex gap-2 items-start">
                      <Input
                        value={subtopic.path}
                        onChange={(e) => {
                          const newSubtopics = [...topicForm.subtopics]
                          newSubtopics[index] = { ...newSubtopics[index], path: e.target.value }
                          setTopicForm({ ...topicForm, subtopics: newSubtopics })
                        }}
                        placeholder="e.g. temp or nested.temp"
                        className="flex-1 font-mono"
                      />
                      <Select
                        value={subtopic.type}
                        onValueChange={(value: "numeric" | "text") => {
                          const newSubtopics = [...topicForm.subtopics]
                          newSubtopics[index] = { ...newSubtopics[index], type: value }
                          setTopicForm({ ...topicForm, subtopics: newSubtopics })
                        }}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="numeric">Numeric</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newSubtopics = topicForm.subtopics.filter((_, i) => i !== index)
                          setTopicForm({ ...topicForm, subtopics: newSubtopics })
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
                      const newSubtopic: JsonSubtopic = {
                        id: `subtopic_${Date.now()}`,
                        path: "",
                        type: "text",
                      }
                      setTopicForm({ ...topicForm, subtopics: [...topicForm.subtopics, newSubtopic] })
                    }}
                    className="w-full"
                  >
                    + Add Subtopic
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Each subtopic pulls one field out of this topic's JSON payload - selectable anywhere a topic can be
                  bound. Path uses standard JSONPath member/index syntax: temp, $.temp, nested.temp,
                  readings[0].value, or ['odd key.with.dots'] for names with special characters.
                </p>
              </div>
            )}
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

      {/* Removed GitHubFontLoaderDialog */}

      <FontPreviewDialog
        isOpen={fontPreviewOpen}
        onClose={() => setFontPreviewOpen(false)}
        font={fontBeingPreviewed}
      />

      <HardwareButtonActionDialog
        isOpen={actionDialogOpen}
        onClose={() => {
          setActionDialogOpen(false)
          setButtonForAction(null)
        }}
        button={buttonForAction}
        screens={project.screens}
        onSaveAction={handleSaveButtonAction}
      />
    </>
  )
}
