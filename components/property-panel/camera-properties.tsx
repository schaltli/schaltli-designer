"use client"

/**
 * A Camera (docs/2026-11-09-camera.md): where its picture comes from. It only
 * shows a picture; switching a camera on is left to other objects.
 */

import type { ScreenObject } from "../project-editor"
import { clampCameraSize } from "@/lib/camera-size"
import { FrameFields, PropertySection, PropertySections, TextField, frameSummary } from "./fields"

interface CameraPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
}

export function CameraProperties({ selectedObject, onUpdateObject }: CameraPropertiesProps) {
  const updateProperty = (key: "url" | "username" | "password", value: string) => {
    onUpdateObject(selectedObject.id, {
      properties: { ...selectedObject.properties, [key]: value },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    if (key === "x" || key === "y") {
      onUpdateObject(selectedObject.id, { [key]: value })
      return
    }
    const next = { width: selectedObject.width, height: selectedObject.height, [key]: value }
    onUpdateObject(selectedObject.id, clampCameraSize(next.width, next.height))
  }

  return (
    <PropertySections>
      <PropertySection title="Source">
        <TextField
          id="cameraUrl"
          label="URL"
          value={selectedObject.properties.url ?? ""}
          onChange={(value) => updateProperty("url", value)}
          placeholder="http://192.168.1.50/capture"
          hint="The camera's address for a single picture. http only."
        />
        <TextField
          id="cameraUsername"
          label="Username"
          value={selectedObject.properties.username ?? ""}
          onChange={(value) => updateProperty("username", value)}
          hint="Only for a camera that asks for one."
        />
        <TextField
          id="cameraPassword"
          label="Password"
          type="password"
          value={selectedObject.properties.password ?? ""}
          onChange={(value) => updateProperty("password", value)}
          hint="Stored in the project and on every device, unencrypted."
        />
      </PropertySection>

      <PropertySection
        title="Frame"
        defaultCollapsed
        summary={frameSummary(selectedObject.x, selectedObject.y, selectedObject.width, selectedObject.height)}
      >
        <FrameFields
          x={selectedObject.x}
          y={selectedObject.y}
          width={selectedObject.width}
          height={selectedObject.height}
          onChange={updatePosition}
        />
      </PropertySection>
    </PropertySections>
  )
}
