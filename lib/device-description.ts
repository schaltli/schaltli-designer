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
    // Which 90-degree rotations this device's physical enclosure actually
    // supports being mounted/used in, beyond its native 0deg - e.g. [180] for
    // a device that can only go in upside-down, or [90, 180, 270] for one
    // that can go any way. Omitted/empty = native orientation only. Deliberately
    // no arbitrary-angle support: a rotation that isn't a multiple of 90
    // wouldn't have a well-defined width/height swap (see
    // ProjectSettings.rotation in project-editor.tsx).
    allowedRotations?: number[]
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
  // Whether/how this device wants each screen's icon (ProjectScreen.iconAssetId)
  // baked into the export - e.g. for an on-device screen-switch navigator
  // overlay (M5 Dial). The designer has no opinion on what a device does with
  // these - it just bakes a square NxN 1-bit mask bitmap per screen that has
  // an icon set (see AssetExporter.exportPageIcon) when this is present, and
  // omits it entirely (existing behavior, zero export cost) when a device
  // doesn't declare it - a static e-paper display has no reason to want this.
  // Number = the bitmap's width/height in pixels (square, matching how a
  // firmware target would actually draw it - the designer doesn't get to
  // guess an aspect ratio a device never asked for).
  needsPageIconsInSize?: number
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
  // Buffer, in addition to the browser-side ArrayBuffer/Blob, is needed for
  // app/api/ddf/fetch/route.ts's server-side reuse of this same parse+
  // validate logic against a device-provided DDF.
  zipData: ArrayBuffer | Blob | Buffer,
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
  // Always native (0deg) - the device's own physical orientation. A chosen
  // project rotation (ProjectSettings.rotation in project-editor.tsx) is
  // applied on top of this by the caller, not by this module - this stays
  // rotation-agnostic, same as the raw DDF data it's derived from.
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
  // 90-degree rotations beyond native 0deg this device's enclosure supports -
  // see DeviceDescriptionFile["screen"]["allowedRotations"]. Always [] when
  // the DDF doesn't declare any (native orientation only).
  allowedRotations: number[]
  // See DeviceDescriptionFile.needsPageIconsInSize's own comment. Undefined
  // when the device doesn't declare it.
  needsPageIconsInSize?: number
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
    allowedRotations: manifest.screen.allowedRotations ?? [],
    needsPageIconsInSize: manifest.needsPageIconsInSize,
  }
}

export interface DeviceDescriptionListEntry {
  name: string
  path: string
  deviceId: string | null
  deviceName: string
  // Lets a client compare against a device's own announced ddfVersion
  // (MQTT hello) without fetching/unzipping the DDF itself - see
  // components/device-scan-section.tsx.
  ddfVersion: string | null
  // "curated" = hand-authored, committed to public/ddf/. "auto-discovered"
  // = fetched moments ago straight from the device itself (.data/ddf/, see
  // app/api/ddf/fetch/route.ts) - surfaced in the Startup Gate so a user
  // debugging "this looks wrong" knows which case they're in.
  source: "curated" | "auto-discovered"
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
  // no-store: this DDF zip is a plain static file (public/ddf/*.zip) served
  // under a stable filename that can still change content (e.g. a
  // re-curated device, or an auto-discovered device announcing a new
  // ddfVersion at the same .data/ddf/{deviceId}.ddf.zip path) - a cached
  // response would silently keep serving stale screen/button/rotation data
  // after an update. Same reasoning as listDeviceDescriptionFiles()'s
  // no-store on /api/ddf/list, just missed here originally since this is a
  // different fetch (the actual zip bytes, not the listing).
  const response = await fetch(path, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Could not fetch DDF at "${path}" (${response.status})`)
  }
  const zipBlob = await response.blob()
  const parsed = await parseDeviceDescriptionFile(zipBlob)
  return deviceDescriptionToProjectFields(parsed, existingHardwareButtons)
}

/**
 * Validates a requested project rotation against what the device's DDF
 * actually allows, and computes the resulting (possibly swapped)
 * screenWidth/screenHeight. Falls back to 0 (native) if the requested
 * rotation isn't in fields.allowedRotations - the caller should surface
 * that fallback to the user (see project-editor.tsx's resolve call sites).
 */
export function resolveRotatedScreenSize(
  fields: Pick<ProjectDeviceFields, "screenWidth" | "screenHeight" | "allowedRotations">,
  requestedRotation: number,
): { screenWidth: number; screenHeight: number; rotation: 0 | 90 | 180 | 270; rotationWasReset: boolean } {
  const isAllowed = requestedRotation === 0 || fields.allowedRotations.includes(requestedRotation)
  const rotation = (isAllowed ? requestedRotation : 0) as 0 | 90 | 180 | 270
  const swapped = rotation === 90 || rotation === 270
  return {
    screenWidth: swapped ? fields.screenHeight : fields.screenWidth,
    screenHeight: swapped ? fields.screenWidth : fields.screenHeight,
    rotation,
    rotationWasReset: !isAllowed && requestedRotation !== 0,
  }
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
  // /api/ddf/list returns every DDF for this deviceId (curated and
  // auto-discovered both), not just one - no UI to ask a human here (a
  // project just references a deviceId), so curated wins automatically:
  // it's the deliberately-maintained copy, not whatever a device happened
  // to be serving from its own filesystem the last time it announced
  // itself (which can be stale - see app/api/ddf/list/route.ts's header
  // comment for why this flipped from "auto-discovered always wins").
  const match =
    available.find((d) => d.deviceId === deviceId && d.source === "curated") ??
    available.find((d) => d.deviceId === deviceId)

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
