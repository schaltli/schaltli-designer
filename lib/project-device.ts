import { resolveRotatedScreenSize, type ProjectDeviceFields } from "@/lib/device-description"
import { resolveScale } from "@/lib/size-scale"
import { navigatorStrip } from "@/lib/navigator"
import { replacedFontIdsUsed, textsNoLongerFitting, withReplacedFonts } from "@/lib/font-migration"
import { resolveDeviceForProject } from "@/lib/device-description"
import type { Project } from "@/components/project-editor"

/**
 * The project moved onto another device: its screen size, frame, buttons,
 * fonts, colour depth and the rest come from that device's description,
 * the objects stay where they are. What Settings › Device › Load Device does,
 * and since 2026-10-09 also the Deploy dialog's «Switch this project to …»
 * (#62) - one function, so the two cannot drift apart.
 *
 * The rotation is kept where the device allows it, else reset to 0
 * (`rotationWasReset`, for the caller to say so). Styled texts take the new
 * device's fonts, texts in a font chosen by hand keep theirs
 * (docs/2026-09-30-size-scale.md).
 */
export function projectOnDevice(
  project: Project,
  fields: ProjectDeviceFields,
): { project: Project; screenWidth: number; screenHeight: number; rotationWasReset: boolean } {
  const rotated = resolveRotatedScreenSize(fields, project.settings.rotation ?? 0)
  const moved = resolveScale({
    ...project,
    screenWidth: rotated.screenWidth,
    screenHeight: rotated.screenHeight,
    adornment: fields.adornment,
    adornmentDrawingArea: fields.adornmentDrawingArea,
    hardwareButtons: fields.hardwareButtons,
    fonts: fields.fonts,
    embeddedDdfZipBase64: fields.ddfZipBase64,
    settings: {
      ...project.settings,
      colorDepth: fields.colorDepth,
      deviceId: fields.deviceId,
      deviceName: fields.deviceName,
      // The platform and the device's own actions come with the device too: a
      // project moved from a board to a phone kept "firmware" and was deployed
      // the boards' BMPs (2026-09-27).
      devicePlatform: fields.devicePlatform,
      deviceActions: fields.deviceActions,
      supportedFeatures: fields.supportedFeatures,
      supportedObjectTypes: fields.supportedObjectTypes,
      ddfHash: fields.ddfHash,
      rotation: rotated.rotation,
      needsPageIconsInSize: fields.needsPageIconsInSize,
      pixelsPerMm: fields.pixelsPerMm,
      typographies: fields.typographies,
      screenShape: fields.screenShape,
      screenMotion: fields.screenMotion,
    },
  })
  // A font the device replaces (a 1-bit face its 4-bit one stands in for,
  // docs/2026-11-01-4bit-fonts.md) becomes that font in every font field.
  const replaced = withReplacedFonts(moved).project
  // A navigator fills its edge of the new screen: placed for the old one,
  // it kept the old size until moved (the user, 2026-10-12, 4.3B to a phone).
  const fitted = withFontsOnDevice(withNavigatorsFitted(replaced, rotated.screenWidth, rotated.screenHeight), project.fonts ?? [])
  return { project: fitted, screenWidth: rotated.screenWidth, screenHeight: rotated.screenHeight, rotationWasReset: rotated.rotationWasReset }
}

/** Every navigator on a master placed along its edge of a screen this size (lib/navigator.ts navigatorStrip). */
function withNavigatorsFitted(project: Project, screenWidth: number, screenHeight: number): Project {
  let changed = false
  const screens = project.screens.map((screen) => {
    if (!screen.objects.some((o) => o.type === "navigator")) return screen
    changed = true
    return {
      ...screen,
      objects: screen.objects.map((o) =>
        o.type === "navigator"
          ? { ...o, ...navigatorStrip(o.properties?.edge ?? "left", o.properties?.shows ?? "iconsAndText", screenWidth, screenHeight) }
          : o,
      ),
    }
  })
  return changed ? { ...project, screens } : project
}

// The font keys of the objects that pick a font of the device by hand and
// have no text style to pick it again by (resolveScale does those).
const FONT_KEYS: Record<string, string[]> = {
  "energy-diagram": ["fontId", "valueFontId"],
  navigator: ["fontId"],
  chart: ["fontId", "dateFontId"],
}

/**
 * An energy diagram's and a navigator's fonts, where the new device has
 * them not: the new device's font nearest the old one's size, the smaller
 * on a tie - as a new diagram gets its fonts. The 4.3B's Lucida stayed on a
 * diagram moved to a phone, drawn in a box the phone's fonts sized, cut off
 * at the bottom (the user, 2026-10-12).
 */
function withFontsOnDevice(project: Project, oldFonts: readonly { id: string; size?: number }[]): Project {
  const fonts = project.fonts ?? []
  if (fonts.length === 0) return project
  const has = (id: unknown) => typeof id === "string" && fonts.some((f) => f.id === id)
  const near = (px: number) =>
    [...fonts].sort((a, b) => Math.abs((a.size || 0) - px) - Math.abs((b.size || 0) - px) || (a.size || 0) - (b.size || 0))[0]
  let changed = false
  const fix = (o: Project["screens"][number]["objects"][number]): typeof o => {
    let next = o
    const keys = FONT_KEYS[o.type]
    if (keys) {
      for (const key of keys) {
        const id = o.properties?.[key]
        if (id === undefined || has(id)) continue
        const was = oldFonts.find((f) => f.id === id)?.size ?? (key === "valueFontId" || key === "dateFontId" ? 22 : 16)
        next = { ...next, properties: { ...next.properties, [key]: near(was).id } }
        changed = true
      }
    }
    if (o.children?.length) {
      const children = o.children.map(fix)
      if (children.some((c, i) => c !== o.children![i])) next = { ...next, children }
    }
    return next
  }
  const screens = project.screens.map((screen) => {
    const objects = screen.objects.map(fix)
    return objects.some((o, i) => o !== screen.objects[i]) ? { ...screen, objects } : screen
  })
  return changed ? { ...project, screens } : project
}

/**
 * A project as it opens, moved onto its device's description as the designer
 * has it now - when that description replaces fonts the project's objects
 * still name (docs/2026-11-01-4bit-fonts.md, decision 2: every project
 * switches over on its own). The embedded description is kept otherwise, as
 * it always was. null when nothing is to move or the device is unknown here.
 * `moved` counts the objects whose fonts changed; `tooWide` lists the texts
 * that fitted their box and no longer do.
 */
export async function projectOnCurrentFonts(
  project: Project,
): Promise<{ project: Project; moved: number; tooWide: string[] } | null> {
  // On the description it has already - a project opened without an
  // embedded one takes the device's as it is - only the fields move.
  const own = withReplacedFonts(project)
  if (own.moved > 0) return { project: own.project, moved: own.moved, tooWide: textsNoLongerFitting(project, own.project) }
  const deviceId = project.settings?.deviceId
  if (!deviceId) return null
  let resolution
  try {
    resolution = await resolveDeviceForProject(deviceId, project.settings?.deviceName)
  } catch {
    return null
  }
  if (!resolution.ok) return null
  const { fields } = resolution
  if (fields.ddfHash && fields.ddfHash === project.settings?.ddfHash) return null
  if (replacedFontIdsUsed(project, fields.fonts).length === 0) return null
  const moved = projectOnDevice(project, fields).project
  let count = 0
  const index = new Map<string, unknown>()
  const walk = (objects: Project["screens"][number]["objects"], prefix: string, store: boolean) => {
    for (const o of objects) {
      const key = `${prefix}/${o.id}`
      if (store) index.set(key, JSON.stringify(o.properties))
      else if (index.get(key) !== JSON.stringify(o.properties)) count++
      if (o.children) walk(o.children, key, store)
    }
  }
  for (const s of project.screens) walk(s.objects, s.id, true)
  for (const s of moved.screens) walk(s.objects, s.id, false)
  return { project: moved, moved: count, tooWide: textsNoLongerFitting(project, moved) }
}
