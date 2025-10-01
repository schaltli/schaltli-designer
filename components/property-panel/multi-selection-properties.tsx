"use client"

import { useState } from "react"
import { Label } from "../ui/label"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { Separator } from "../ui/separator"
import type { ScreenmanObject } from "../screenman-editor"

interface MultiSelectionPropertiesProps {
  selectedObjects: ScreenmanObject[]
  onUpdateObjects: (objectIds: string[], updates: Partial<ScreenmanObject>) => void
}

export function MultiSelectionProperties({ selectedObjects, onUpdateObjects }: MultiSelectionPropertiesProps) {
  const [positionX, setPositionX] = useState("")
  const [positionY, setPositionY] = useState("")
  const [width, setWidth] = useState("")
  const [height, setHeight] = useState("")

  const objectTypes = [...new Set(selectedObjects.map((obj) => obj.type))]
  const isHomogeneous = objectTypes.length === 1

  const handlePositionUpdate = () => {
    const updates: Partial<ScreenmanObject> = {}
    if (positionX !== "") updates.x = Number.parseInt(positionX)
    if (positionY !== "") updates.y = Number.parseInt(positionY)

    if (Object.keys(updates).length > 0) {
      onUpdateObjects(
        selectedObjects.map((obj) => obj.id),
        updates,
      )
      setPositionX("")
      setPositionY("")
    }
  }

  const handleSizeUpdate = () => {
    const updates: Partial<ScreenmanObject> = {}
    if (width !== "") updates.width = Number.parseInt(width)
    if (height !== "") updates.height = Number.parseInt(height)

    if (Object.keys(updates).length > 0) {
      onUpdateObjects(
        selectedObjects.map((obj) => obj.id),
        updates,
      )
      setWidth("")
      setHeight("")
    }
  }

  const handleAlignLeft = () => {
    const leftmostX = Math.min(...selectedObjects.map((obj) => obj.x))
    onUpdateObjects(
      selectedObjects.map((obj) => obj.id),
      { x: leftmostX },
    )
  }

  const handleAlignRight = () => {
    const rightmostX = Math.max(...selectedObjects.map((obj) => obj.x + obj.width))
    selectedObjects.forEach((obj) => {
      onUpdateObjects([obj.id], { x: rightmostX - obj.width })
    })
  }

  const handleAlignTop = () => {
    const topmostY = Math.min(...selectedObjects.map((obj) => obj.y))
    onUpdateObjects(
      selectedObjects.map((obj) => obj.id),
      { y: topmostY },
    )
  }

  const handleAlignBottom = () => {
    const bottommostY = Math.max(...selectedObjects.map((obj) => obj.y + obj.height))
    selectedObjects.forEach((obj) => {
      onUpdateObjects([obj.id], { y: bottommostY - obj.height })
    })
  }

  const handleAlignCenterHorizontal = () => {
    const centerX = selectedObjects.reduce((sum, obj) => sum + obj.x + obj.width / 2, 0) / selectedObjects.length
    selectedObjects.forEach((obj) => {
      onUpdateObjects([obj.id], { x: centerX - obj.width / 2 })
    })
  }

  const handleAlignCenterVertical = () => {
    const centerY = selectedObjects.reduce((sum, obj) => sum + obj.y + obj.height / 2, 0) / selectedObjects.length
    selectedObjects.forEach((obj) => {
      onUpdateObjects([obj.id], { y: centerY - obj.height / 2 })
    })
  }

  const handleDistributeHorizontal = () => {
    if (selectedObjects.length < 3) return

    const sortedObjects = [...selectedObjects].sort((a, b) => a.x - b.x)
    const leftmost = sortedObjects[0]
    const rightmost = sortedObjects[sortedObjects.length - 1]
    const totalWidth = rightmost.x + rightmost.width - leftmost.x
    const availableSpace = totalWidth - sortedObjects.reduce((sum, obj) => sum + obj.width, 0)
    const spacing = availableSpace / (sortedObjects.length - 1)

    let currentX = leftmost.x + leftmost.width + spacing
    for (let i = 1; i < sortedObjects.length - 1; i++) {
      onUpdateObjects([sortedObjects[i].id], { x: currentX })
      currentX += sortedObjects[i].width + spacing
    }
  }

  const handleDistributeVertical = () => {
    if (selectedObjects.length < 3) return

    const sortedObjects = [...selectedObjects].sort((a, b) => a.y - b.y)
    const topmost = sortedObjects[0]
    const bottommost = sortedObjects[sortedObjects.length - 1]
    const totalHeight = bottommost.y + bottommost.height - topmost.y
    const availableSpace = totalHeight - sortedObjects.reduce((sum, obj) => sum + obj.height, 0)
    const spacing = availableSpace / (sortedObjects.length - 1)

    let currentY = topmost.y + topmost.height + spacing
    for (let i = 1; i < sortedObjects.length - 1; i++) {
      onUpdateObjects([sortedObjects[i].id], { y: currentY })
      currentY += sortedObjects[i].height + spacing
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {isHomogeneous
          ? `${selectedObjects.length} ${objectTypes[0]} objects selected`
          : `${selectedObjects.length} objects selected (${objectTypes.join(", ")})`}
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-xs font-medium">Position</Label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">X</Label>
            <Input
              type="number"
              value={positionX}
              onChange={(e) => setPositionX(e.target.value)}
              placeholder="X"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Y</Label>
            <Input
              type="number"
              value={positionY}
              onChange={(e) => setPositionY(e.target.value)}
              placeholder="Y"
              className="h-8 text-xs"
            />
          </div>
          <Button
            onClick={handlePositionUpdate}
            size="sm"
            className="h-8 text-xs mt-4"
            disabled={positionX === "" && positionY === ""}
          >
            Apply
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs font-medium">Size</Label>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">W</Label>
            <Input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="Width"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">H</Label>
            <Input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="Height"
              className="h-8 text-xs"
            />
          </div>
          <Button
            onClick={handleSizeUpdate}
            size="sm"
            className="h-8 text-xs mt-4"
            disabled={width === "" && height === ""}
          >
            Apply
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-xs font-medium">Alignment</Label>
        <div className="grid grid-cols-3 gap-1">
          <Button onClick={handleAlignLeft} size="sm" variant="outline" className="h-8 text-xs bg-transparent">
            Left
          </Button>
          <Button
            onClick={handleAlignCenterHorizontal}
            size="sm"
            variant="outline"
            className="h-8 text-xs bg-transparent"
          >
            Center H
          </Button>
          <Button onClick={handleAlignRight} size="sm" variant="outline" className="h-8 text-xs bg-transparent">
            Right
          </Button>
          <Button onClick={handleAlignTop} size="sm" variant="outline" className="h-8 text-xs bg-transparent">
            Top
          </Button>
          <Button
            onClick={handleAlignCenterVertical}
            size="sm"
            variant="outline"
            className="h-8 text-xs bg-transparent"
          >
            Center V
          </Button>
          <Button onClick={handleAlignBottom} size="sm" variant="outline" className="h-8 text-xs bg-transparent">
            Bottom
          </Button>
        </div>
      </div>

      {selectedObjects.length >= 3 && (
        <div className="space-y-3">
          <Label className="text-xs font-medium">Distribution</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleDistributeHorizontal}
              size="sm"
              variant="outline"
              className="h-8 text-xs bg-transparent"
            >
              Distribute H
            </Button>
            <Button
              onClick={handleDistributeVertical}
              size="sm"
              variant="outline"
              className="h-8 text-xs bg-transparent"
            >
              Distribute V
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
