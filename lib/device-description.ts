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
import type { Rect } from "@/lib/adornment-rotation"
import { assertReadableGeneration } from "@/lib/system-generation"

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

export interface DeviceDescriptionFile {
  // Which system generation this DDF's file format is written to - the
  // same single number every artifact in this system carries, see
  // lib/system-generation.ts. Was `schemaVersion?: number` (one of three
  // independently-bumped integers) until 2026-08-19. Absent = "1.0", the
  // implicit generation every DDF written before this field existed.
  systemGeneration?: string
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
    // Where the screen sits within the adornment SVG is no longer declared
    // here - it's read directly off a `<rect id="screen">` in the SVG
    // itself (see extractScreenRect below), so a DDF author never
    // hand-transcribes coordinates: draw the rect in Inkscape/etc. at the
    // screen's exact position and size, done. (Pre-2026-08-16 DDFs declared
    // `drawingArea: {x,y,width,height,svgViewBox}` here instead - that
    // shape is gone, not optional; every DDF's adornment.svg needs the rect.)
  }
  // Hardware buttons are no longer declared here at all (2026-08-16, the
  // same "read it off the SVG instead of hand-transcribing" move as
  // adornment.drawingArea before it) - every element in adornment.svg whose
  // id starts with "button" *is* a hardware button, identified by that same
  // id (which must also be exactly what the firmware itself uses to key
  // button actions - see extractHardwareButtons below and DEVICE_GUIDE.md's
  // "Building the adornment SVG" section for the full convention every
  // device's SVG *and* firmware must follow).
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
  // Where the screen sits within adornmentSvg's own coordinate space -
  // extracted from that SVG's `<rect id="screen">`, see extractScreenRect.
  screenDrawingArea: Rect
  // Every id^="button" element in adornmentSvg, see extractHardwareButtons.
  hardwareButtons: AdornmentButton[]
  fonts: (ProjectFont & { data: string })[]
}

// Reads the screen's position/size directly off the adornment SVG's own
// `<rect id="screen">`, rather than requiring a DDF author to hand-transcribe
// coordinates into device.json (drawingArea used to work that way - see the
// comment on DeviceDescriptionFile["adornment"]). A plain regex rather than
// DOMParser because this runs server-side too (app/api/ddf/fetch/route.ts),
// where there's no DOM.
// Both extractors below match with regexes rather than parsing XML, which
// means they happily match markup that only *appears* in a comment. Found
// live 2026-08-19 while authoring the Waveshare board's adornment: its
// header comment documented the convention by spelling the screen rect out
// as literal tag syntax, and the parser picked that up instead of the real
// element, failing with the useless "screen rect missing x attribute".
//
// Comments are stripped before matching rather than switching to a real XML
// parser: the extractors only need two specific elements out of an
// otherwise free-form Inkscape file, and a DOM parse would drag in a
// dependency (and differ between the browser and the server-side reuse in
// app/api/ddf/fetch/route.ts) for no gain. This strips only for *matching* -
// the SVG kept for rendering is untouched, so authors' comments survive
// into the stored adornment.
function stripXmlComments(svgText: string): string {
  return svgText.replace(/<!--[\s\S]*?-->/g, "")
}

function extractScreenRect(svgTextWithComments: string): Rect {
  const svgText = stripXmlComments(svgTextWithComments)
  const rectMatch = svgText.match(/<rect\b[^>]*\bid=["']screen["'][^>]*>/i)
  if (!rectMatch) {
    throw new Error(
      'Adornment SVG is missing a <rect id="screen"> marking the screen area - draw one at the screen\'s exact position and size.',
    )
  }
  const tag = rectMatch[0]
  const attr = (name: string): number => {
    const match = tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, "i"))
    if (!match) {
      throw new Error(`Adornment SVG's <rect id="screen"> is missing a "${name}" attribute`)
    }
    return Number.parseFloat(match[1])
  }
  return { x: attr("x"), y: attr("y"), width: attr("width"), height: attr("height") }
}

export interface AdornmentButton {
  id: string
  name: string
}

// Reads the device's hardware buttons directly off the adornment SVG,
// rather than requiring a DDF author to declare a separate hardwareButtons[]
// array in device.json (removed 2026-08-16 - same "read it off the SVG
// instead of duplicating it in JSON" move as extractScreenRect above).
// Every element whose id starts with "button" *is* a hardware button - the
// same id^="button" convention canvas.tsx's own hit-testing already uses -
// and that id must be exactly what the device's own firmware uses to key
// button actions in the exported project.json. This is now a hard
// requirement on firmware too, not just the designer - see
// DEVICE_GUIDE.md's "Building the adornment SVG" and
// docs/device-contract.md §5 for the full convention every device must
// follow (SVG element id == firmware's own button identifier, no
// indirection table anywhere).
//
// The button's display name comes from Inkscape's Label field
// (`inkscape:label` - NOT the ID field, see DEVICE_GUIDE.md for that
// distinction), required, and must actually be a human name rather than a
// copy of the id - the M5 Dial's own adornment.svg had exactly that mistake
// (`inkscape:label="button-0"`) until this convention was written down, so
// it's checked for here rather than silently accepted.
function extractHardwareButtons(svgTextWithComments: string): AdornmentButton[] {
  // Same comment-stripping reason as extractScreenRect above - and the
  // stakes are higher here, since a commented-out button would be silently
  // *added* to the device rather than failing loudly.
  const svgText = stripXmlComments(svgTextWithComments)
  const tagPattern = /<[a-zA-Z][^>]*\bid=["'](button[^"']*)["'][^>]*>/g
  const buttons: AdornmentButton[] = []
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(svgText)) !== null) {
    const tag = match[0]
    const id = match[1]
    const name = tag.match(/\binkscape:label=["']([^"']*)["']/)?.[1]?.trim()
    if (!name) {
      throw new Error(
        `Adornment SVG's button "${id}" is missing an inkscape:label - set its Label (not ID) in Inkscape's Object Properties to a real name.`,
      )
    }
    if (name === id) {
      throw new Error(
        `Adornment SVG's button "${id}" has its Label set to the same text as its ID ("${name}") - set a real human-readable name instead.`,
      )
    }
    buttons.push({ id, name })
  }
  return buttons
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

  // Checked before any other field is read (device.id included) - an
  // unrecognized file format can't be trusted to have any of the fields
  // below mean what this parser expects them to mean.
  assertReadableGeneration(manifest.systemGeneration, "DDF")

  const svgFile = zip.file(manifest.adornment.svgPath)
  if (!svgFile) {
    throw new Error(`DDF is missing adornment SVG at "${manifest.adornment.svgPath}"`)
  }
  const adornmentSvg = await svgFile.async("string")
  const screenDrawingArea = extractScreenRect(adornmentSvg)
  const hardwareButtons = extractHardwareButtons(adornmentSvg)

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

  return { manifest, adornmentSvg, screenDrawingArea, hardwareButtons, fonts }
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
  adornmentDrawingArea: Rect
  hardwareButtons: HardwareButton[]
  fonts: (ProjectFont & { data: string })[]
  supportedObjectTypes: string[]
  deviceId: string
  deviceName: string
  // Carried through unchanged from the DDF's own ddfVersion, so a project
  // remembers which capability revision it was last checked against - see
  // ProjectSettings.ddfVersion's own comment in project-editor.tsx.
  ddfVersion: string
  // The DDF zip's own raw bytes, base64-encoded - embedded whole into the
  // project file as _source/ddf.zip (project-editor.tsx's downloadProject)
  // rather than just the denormalized fields above, so nothing about the
  // device can drift out of sync with what the project actually carries.
  // See docs/nested-provenance.md's "Nesting is zip-in-zip" decision.
  ddfZipBase64: string
  devicePlatform: "firmware" | "android"
  // 90-degree rotations beyond native 0deg this device's enclosure supports -
  // see DeviceDescriptionFile["screen"]["allowedRotations"]. Always [] when
  // the DDF doesn't declare any (native orientation only).
  allowedRotations: number[]
  // See DeviceDescriptionFile.needsPageIconsInSize's own comment. Undefined
  // when the device doesn't declare it.
  needsPageIconsInSize?: number
}

// Browser-safe ArrayBuffer -> base64, chunked to avoid a call-stack
// overflow from String.fromCharCode(...bytes) on a whole DDF's worth of
// bytes at once (tens of thousands of args in one spread).
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/**
 * Turn a parsed DDF into the fields a Project needs, ready to merge in.
 * Hardware button id/name always come fresh from the adornment SVG - unlike
 * before 2026-08-16, there's nothing project-specific on HardwareButton
 * itself to preserve across a re-fetch (button actions live entirely on
 * ProjectScreen.buttonActions now - see lib/hardware-button-actions.ts).
 */
export function deviceDescriptionToProjectFields(
  parsed: ParsedDeviceDescription,
  // The DDF zip's own raw bytes (base64) - required, not optional, so every
  // caller is forced to embed the real thing rather than silently degrading
  // a project back to the old denormalized-fields-only shape.
  ddfZipBase64: string,
): ProjectDeviceFields {
  const { manifest, adornmentSvg, screenDrawingArea, hardwareButtons: adornmentButtons, fonts } = parsed

  const hardwareButtons: HardwareButton[] = adornmentButtons.map((btn) => ({
    id: btn.id,
    name: btn.name,
  }))

  return {
    screenWidth: manifest.screen.width,
    screenHeight: manifest.screen.height,
    colorDepth: manifest.screen.colorDepth,
    adornment: adornmentSvg,
    adornmentDrawingArea: screenDrawingArea,
    hardwareButtons,
    fonts,
    supportedObjectTypes: manifest.supportedObjectTypes,
    ddfVersion: manifest.ddfVersion,
    ddfZipBase64,
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
export async function loadDeviceDescriptionByPath(path: string): Promise<ProjectDeviceFields> {
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
  const ddfZipBase64 = await blobToBase64(zipBlob)
  return deviceDescriptionToProjectFields(parsed, ddfZipBase64)
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

// Browser-safe base64 -> Blob, the inverse of blobToBase64().
function base64ToBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes])
}

/**
 * Resolve a project's device from its own embedded DDF
 * (Project.embeddedDdfZipBase64) rather than this instance's public/ddf/ -
 * the primary path for any project saved after nested provenance shipped
 * (docs/nested-provenance.md's "Version compatibility" > Fall 1): opening a
 * project never depends on what this instance happens to curate, only on
 * what the project itself carries. resolveDeviceForProject() below is now
 * the fallback, for projects saved before this field existed.
 */
export async function resolveDeviceFromEmbeddedDdf(ddfZipBase64: string): Promise<ProjectDeviceFields> {
  const parsed = await parseDeviceDescriptionFile(base64ToBlob(ddfZipBase64))
  return deviceDescriptionToProjectFields(parsed, ddfZipBase64)
}

export type DeviceResolution =
  | { ok: true; fields: ProjectDeviceFields }
  | { ok: false; deviceId: string; deviceName?: string; availableDeviceNames: string[] }

/**
 * Fallback path only - see resolveDeviceFromEmbeddedDdf() above, which
 * every project saved after nested provenance shipped uses instead. Only
 * reached for a project with no embeddedDdfZipBase64 of its own (saved
 * before that field existed): resolves the project's referenced device (by
 * deviceId) against the DDFs available on this instance (public/ddf/), so
 * an old project still opens using *some* authoritative device data
 * instead of nothing.
 */
export async function resolveDeviceForProject(
  deviceId: string,
  fallbackDeviceName: string | undefined,
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

  const fields = await loadDeviceDescriptionByPath(match.path)
  return { ok: true, fields }
}
