"use client"

/**
 * Several objects at once: where they go, how big they are, and how they
 * line up.
 *
 * Round 15 of the rebuild (docs/2026-09-20-property-panel.md), and the one
 * panel that is all verbs. Position and Size are the only rows in nineteen
 * panels that do not take effect as you type - there is no single current
 * value to show, and writing one into every object on every keystroke would
 * be unrecoverable - so each keeps its Apply button and its boxes stay empty
 * until you fill them.
 *
 * Align and Distribute are what `ButtonGroupRow` was built for. Six buttons
 * and two buttons, wrapping in the control column, where they used to be two
 * grids of full-width buttons down the panel.
 */

import { useState } from "react"
import type { ScreenObject } from "../project-editor"
import { objectTypeLabel } from "@/lib/object-types"
import {
  ButtonGroupRow,
  FieldNote,
  NumberPair,
  PropertySection,
  PropertySections,
} from "./fields"

interface MultiSelectionPropertiesProps {
  selectedObjects: ScreenObject[]
  onUpdateObjects: (objectIds: string[], updates: Partial<ScreenObject>) => void
}

export function MultiSelectionProperties({ selectedObjects, onUpdateObjects }: MultiSelectionPropertiesProps) {
  const [positionX, setPositionX] = useState("")
  const [positionY, setPositionY] = useState("")
  const [width, setWidth] = useState("")
  const [height, setHeight] = useState("")

  const objectTypes = [...new Set(selectedObjects.map((obj) => obj.type))]
  const isHomogeneous = objectTypes.length === 1

  const handlePositionUpdate = () => {
    const updates: Partial<ScreenObject> = {}
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
    const updates: Partial<ScreenObject> = {}
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

  // Every position these buttons write is rounded, because an object
  // coordinate is a whole device pixel everywhere it is eventually read.
  // The drag and resize paths in canvas.tsx have always rounded (a dozen
  // Math.round calls, snap guides included); these four were the only ways
  // to put a fraction into a project, and both of the things that reads one
  // afterwards get it wrong. The firmware's ProjectLoader does
  // `obj.x = objJson["x"] | 0`, and ArduinoJson's `|` yields the default
  // when the stored value is a double - so a distributed x of 150.5 loads
  // as 0 and the object jumps to the left edge, which is how this was found
  // (2026-08-26, "Camper Licht" on the Waveshare). On the canvas itself a
  // half-pixel edge is merely blurry: a 1px stroke straddles two pixel
  // columns and is drawn as two half-lit ones.
  //
  // Rounding at assignment rather than rounding the accumulator: the ideal
  // spacing stays a float across the whole run, so each object lands on the
  // pixel nearest its exact position instead of accumulating the error of
  // every gap before it.
  const handleAlignCenterHorizontal = () => {
    const centerX = selectedObjects.reduce((sum, obj) => sum + obj.x + obj.width / 2, 0) / selectedObjects.length
    selectedObjects.forEach((obj) => {
      onUpdateObjects([obj.id], { x: Math.round(centerX - obj.width / 2) })
    })
  }

  const handleAlignCenterVertical = () => {
    const centerY = selectedObjects.reduce((sum, obj) => sum + obj.y + obj.height / 2, 0) / selectedObjects.length
    selectedObjects.forEach((obj) => {
      onUpdateObjects([obj.id], { y: Math.round(centerY - obj.height / 2) })
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
      onUpdateObjects([sortedObjects[i].id], { x: Math.round(currentX) })
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
      onUpdateObjects([sortedObjects[i].id], { y: Math.round(currentY) })
      currentY += sortedObjects[i].height + spacing
    }
  }

  return (
    <PropertySections>
      <PropertySection title="Frame">
        <FieldNote>
          {isHomogeneous
            ? `${selectedObjects.length} × ${objectTypeLabel(objectTypes[0])}`
            : `${selectedObjects.length} objects: ${objectTypes.map(objectTypeLabel).join(", ")}`}
        </FieldNote>

        {/* Empty until you type, and applied on the button: there is no one
            current value to show, and writing every keystroke into every
            object at once would be unrecoverable. */}
        <NumberPair
          label="Position"
          names={["X", "Y"]}
          values={[positionX === "" ? undefined : Number(positionX), positionY === "" ? undefined : Number(positionY)]}
          onChange={(which, value) => (which === 0 ? setPositionX(String(value)) : setPositionY(String(value)))}
        />
        <ButtonGroupRow
          label=""
          buttons={[
            { label: "Apply position", onClick: handlePositionUpdate, disabled: positionX === "" && positionY === "" },
          ]}
        />

        <NumberPair
          label="Size"
          names={["W", "H"]}
          values={[width === "" ? undefined : Number(width), height === "" ? undefined : Number(height)]}
          onChange={(which, value) => (which === 0 ? setWidth(String(value)) : setHeight(String(value)))}
        />
        <ButtonGroupRow
          label=""
          buttons={[{ label: "Apply size", onClick: handleSizeUpdate, disabled: width === "" && height === "" }]}
        />

        <ButtonGroupRow
          label="Align"
          buttons={[
            { label: "Left", onClick: handleAlignLeft },
            { label: "Center H", onClick: handleAlignCenterHorizontal },
            { label: "Right", onClick: handleAlignRight },
            { label: "Top", onClick: handleAlignTop },
            { label: "Center V", onClick: handleAlignCenterVertical },
            { label: "Bottom", onClick: handleAlignBottom },
          ]}
        />

        {/* Two objects are already distributed; it takes a third to have a
            gap to even out. */}
        {selectedObjects.length >= 3 ? (
          <ButtonGroupRow
            label="Distribute"
            buttons={[
              { label: "Distribute H", onClick: handleDistributeHorizontal },
              { label: "Distribute V", onClick: handleDistributeVertical },
            ]}
          />
        ) : null}
      </PropertySection>
    </PropertySections>
  )
}
