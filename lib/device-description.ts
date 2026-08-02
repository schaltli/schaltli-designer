/**
 * Device Description File (DDF) support.
 *
 * A DDF is a ZIP (device.json + an adornment SVG + BDF font files) that a
 * device/firmware project supplies. It lets the designer import screen specs,
 * physical hardware button layout, and the exact on-device fonts, instead of
 * requiring manual re-entry per project.
 */

import JSZip from "jszip"
import type { ProjectFont, HardwareButton } from "@/components/project-editor"

export interface DeviceDescriptionFontEntry {
  id: string
  displayName: string
  internalName: string
  file: string // path within the DDF zip, e.g. "fonts/helvR08.bdf" or "fonts/Roboto.ttf"
  size: number
  ascent: number
  descent: number
  // "bdf" (default when omitted, backward-compatible with every existing
  // DDF) draws pixel-font glyphs manually via BDFFont - what firmware
  // targets use. "ttf" registers the file as a real browser font (see
  // lib/ttf-font-registry.ts) and renders it through the canvas's normal
  // text path - what a real-UI target like Android needs to look like
  // actual system typography instead of a bitmap font.
  format?: "bdf" | "ttf"
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
    // "firmware" (default when omitted, backward-compatible with every
    // existing DDF) exports the BMP/PBM + firmware-project.json bundle
    // AssetExporter already produces. "android" exports a generic JSON +
    // PNG bundle instead (see lib/android-export.ts) - there's no firmware
    // repo consuming it, so quantized bitmap formats and device-specific
    // upload fields don't apply.
    platform?: "firmware" | "android"
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
  // ScreenObject["type"] values this device's firmware actually renders.
  // Object types outside this list are placeable in the designer but will
  // not appear on the real device.
  supportedObjectTypes: string[]
  // Optional: how an external hardware-in-the-loop test orchestrator talks to
  // a running instance of this device. Not used by the designer app itself at
  // runtime - only read by test tooling. "{ip}" in the URLs is a placeholder
  // the orchestrator substitutes with the actual device's address.
  testInterface?: DeviceTestInterface
}

export interface DeviceTestInterface {
  // Upload a project ZIP (project.json + assets/fonts) onto the device.
  uploadUrl: string
  uploadMethod: "POST" | "PUT"
  uploadContentType: "multipart-zip" | "raw-zip"
  // Force a full (non-partial) render of a specific screen by index, without
  // rebooting/reloading the project - the key thing that makes testing many
  // screens from one uploaded project cheap.
  screenSwitchUrl: string
  screenSwitchMethod: "POST" | "PUT"
  // Request body shape screenSwitchUrl expects. The reference e-paper
  // firmware uses a plain form-urlencoded field ("index=2"), matching its
  // other control endpoints - not a JSON body.
  screenSwitchBody: "form-urlencoded" | "json"
  // Fetch the currently rendered frame.
  snapshotUrl: string
  snapshotFormat: "bmp" | "png"
  // How long to wait after screenSwitchUrl responds before the snapshot is
  // guaranteed to reflect the new frame (e.g. e-paper refresh settle time).
  // 0 if the device's response only returns once rendering is fully done.
  postRenderSettleMs: number
}

export interface ParsedDeviceDescription {
  manifest: DeviceDescriptionFile
  adornmentSvg: string
  fonts: (ProjectFont & { data: string })[]
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
      // BDF fonts are plain text, read as-is. TTF fonts are binary - read as
      // base64 and wrap as a data: URL so `data` stays a plain string
      // (ProjectFont's existing shape) while still being directly usable
      // as a FontFace source (see lib/ttf-font-registry.ts).
      const format = fontEntry.format ?? "bdf"
      const data =
        format === "ttf"
          ? `data:font/ttf;base64,${await fontFile.async("base64")}`
          : await fontFile.async("string")
      const font: ProjectFont & { data: string } = {
        id: fontEntry.id,
        name: fontEntry.internalName,
        displayName: fontEntry.displayName,
        path: fontEntry.file,
        size: fontEntry.size,
        data,
        internalName: fontEntry.internalName,
        ascent: fontEntry.ascent,
        descent: fontEntry.descent,
        format,
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
  fonts: (ProjectFont & { data: string })[]
  supportedObjectTypes: string[]
  deviceId: string
  deviceName: string
  devicePlatform: "firmware" | "android"
}

/**
 * Turn a parsed DDF into the fields a Project needs, ready to merge in.
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
    devicePlatform: manifest.device.platform ?? "firmware",
  }
}

export interface DeviceDescriptionListEntry {
  name: string
  path: string
  deviceId: string | null
  deviceName: string
  // Raw adornment SVG markup, for a picker thumbnail. Null if the DDF
  // couldn't be parsed or its SVG file is missing.
  adornmentSvg: string | null
}

/**
 * List DDFs available under public/ddf/ via the API route.
 */
export async function listDeviceDescriptionFiles(): Promise<DeviceDescriptionListEntry[]> {
  // no-store: this must never be served from the browser's HTTP cache or
  // Next.js's fetch data cache - public/ddf/ can change between requests
  // and a stale cached response would silently look like "no devices".
  const response = await fetch("/api/ddf/list", { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`/api/ddf/list returned ${response.status}`)
  }
  const data = await response.json()
  return data.devices ?? []
}

/**
 * Fetch and parse the DDF at the given path (e.g. from listDeviceDescriptionFiles),
 * returning project-ready fields.
 */
export async function loadDeviceDescriptionByPath(
  path: string,
  existingHardwareButtons: HardwareButton[] = [],
): Promise<ProjectDeviceFields> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Could not fetch DDF at "${path}" (${response.status})`)
  }
  const zipBlob = await response.blob()
  const parsed = await parseDeviceDescriptionFile(zipBlob)
  return deviceDescriptionToProjectFields(parsed, existingHardwareButtons)
}

export type DeviceResolution =
  | { ok: true; fields: ProjectDeviceFields }
  | { ok: false; deviceId: string; deviceName?: string; availableDeviceNames: string[] }

/**
 * Resolve a project's referenced device (by deviceId) against the DDFs actually
 * available on this instance (public/ddf/). Always re-loads the device fresh from
 * the local DDF rather than trusting whatever was embedded in an uploaded project,
 * so a project always reflects the current instance's authoritative device data.
 */
export async function resolveDeviceForProject(
  deviceId: string,
  fallbackDeviceName: string | undefined,
  existingHardwareButtons: HardwareButton[] = [],
): Promise<DeviceResolution> {
  const available = await listDeviceDescriptionFiles()
  const match = available.find((d) => d.deviceId === deviceId)

  if (!match) {
    return {
      ok: false,
      deviceId,
      deviceName: fallbackDeviceName,
      availableDeviceNames: available.map((d) => d.deviceName),
    }
  }

  const fields = await loadDeviceDescriptionByPath(match.path, existingHardwareButtons)
  return { ok: true, fields }
}
