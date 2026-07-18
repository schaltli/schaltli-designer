/**
 * Device Description File (DDF) support.
 *
 * A DDF is a ZIP (device.json + an adornment SVG + BDF font files) that a
 * device/firmware project supplies. It lets the designer import screen specs,
 * physical hardware button layout, and the exact on-device fonts, instead of
 * requiring manual re-entry per project.
 */

import JSZip from "jszip"
import type { ScreenmanFont, HardwareButton } from "@/components/screenman-editor"

export interface DeviceDescriptionFontEntry {
  id: string
  displayName: string
  internalName: string
  file: string // path within the DDF zip, e.g. "fonts/helvR08.bdf"
  size: number
  ascent: number
  descent: number
}

export interface DeviceDescriptionButtonEntry {
  id: string
  name: string
  svgElementId: string
  shape: "round" | "rectangular"
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface DeviceDescriptionFile {
  ddfVersion: string
  device: {
    id: string
    name: string
    firmwareRepo?: string
  }
  screen: {
    width: number
    height: number
    colorDepth: "1bit" | "4bit" | "24bit"
  }
  adornment: {
    svgPath: string
    drawingArea: {
      x: number
      y: number
      width: number
      height: number
      svgViewBox: { x: number; y: number; width: number; height: number }
    }
  }
  hardwareButtons: DeviceDescriptionButtonEntry[]
  fonts: DeviceDescriptionFontEntry[]
  // ScreenmanObject["type"] values this device's firmware actually renders.
  // Object types outside this list are placeable in the designer but will
  // not appear on the real device.
  supportedObjectTypes: string[]
}

export interface ParsedDeviceDescription {
  manifest: DeviceDescriptionFile
  adornmentSvg: string
  fonts: (ScreenmanFont & { data: string })[]
}

/**
 * Parse a DDF ZIP into its manifest plus resolved SVG/BDF file contents.
 */
export async function parseDeviceDescriptionFile(
  zipData: ArrayBuffer | Blob,
): Promise<ParsedDeviceDescription> {
  const zip = await JSZip.loadAsync(zipData)

  const manifestFile = zip.file("device.json")
  if (!manifestFile) {
    throw new Error("DDF is missing device.json")
  }
  const manifest: DeviceDescriptionFile = JSON.parse(await manifestFile.async("string"))

  const svgFile = zip.file(manifest.adornment.svgPath)
  if (!svgFile) {
    throw new Error(`DDF is missing adornment SVG at "${manifest.adornment.svgPath}"`)
  }
  const adornmentSvg = await svgFile.async("string")

  const fonts = await Promise.all(
    manifest.fonts.map(async (fontEntry) => {
      const fontFile = zip.file(fontEntry.file)
      if (!fontFile) {
        throw new Error(`DDF is missing font file "${fontEntry.file}"`)
      }
      const data = await fontFile.async("string")
      const font: ScreenmanFont & { data: string } = {
        id: fontEntry.id,
        name: fontEntry.internalName,
        displayName: fontEntry.displayName,
        path: fontEntry.file,
        size: fontEntry.size,
        data,
        internalName: fontEntry.internalName,
        ascent: fontEntry.ascent,
        descent: fontEntry.descent,
      }
      return font
    }),
  )

  return { manifest, adornmentSvg, fonts }
}

export interface ProjectDeviceFields {
  screenWidth: number
  screenHeight: number
  colorDepth: "1bit" | "4bit" | "24bit"
  adornment: string
  adornmentDrawingArea: DeviceDescriptionFile["adornment"]["drawingArea"]
  hardwareButtons: HardwareButton[]
  fonts: (ScreenmanFont & { data: string })[]
  supportedObjectTypes: string[]
  deviceId: string
  deviceName: string
}

/**
 * Turn a parsed DDF into the fields a ScreenmanProject needs, ready to merge in.
 * Existing hardware button actions are preserved by matching on svgElementId,
 * since actions are project-specific and not part of the device spec.
 */
export function deviceDescriptionToProjectFields(
  parsed: ParsedDeviceDescription,
  existingHardwareButtons: HardwareButton[] = [],
): ProjectDeviceFields {
  const { manifest, adornmentSvg, fonts } = parsed

  const hardwareButtons: HardwareButton[] = manifest.hardwareButtons.map((btn) => {
    const existing = existingHardwareButtons.find((b) => b.svgElementId === btn.svgElementId)
    return {
      id: existing?.id ?? btn.id,
      name: btn.name,
      svgElementId: btn.svgElementId,
      shape: btn.shape,
      x: btn.x,
      y: btn.y,
      width: btn.width,
      height: btn.height,
      defaultAction: existing?.defaultAction,
      action: existing?.action,
    }
  })

  return {
    screenWidth: manifest.screen.width,
    screenHeight: manifest.screen.height,
    colorDepth: manifest.screen.colorDepth,
    adornment: adornmentSvg,
    adornmentDrawingArea: manifest.adornment.drawingArea,
    hardwareButtons,
    fonts,
    supportedObjectTypes: manifest.supportedObjectTypes,
    deviceId: manifest.device.id,
    deviceName: manifest.device.name,
  }
}

export interface DeviceDescriptionListEntry {
  name: string
  path: string
}

/**
 * List DDFs available under public/ddf/ via the API route.
 */
export async function listDeviceDescriptionFiles(): Promise<DeviceDescriptionListEntry[]> {
  const response = await fetch("/api/ddf/list")
  if (!response.ok) {
    return []
  }
  const data = await response.json()
  return data.devices ?? []
}
