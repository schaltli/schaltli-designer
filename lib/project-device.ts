import { resolveRotatedScreenSize, type ProjectDeviceFields } from "@/lib/device-description"
import { resolveScale } from "@/lib/size-scale"
import { navigatorStrip } from "@/lib/navigator"
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
      supportedObjectTypes: fields.supportedObjectTypes,
      ddfHash: fields.ddfHash,
      rotation: rotated.rotation,
      needsPageIconsInSize: fields.needsPageIconsInSize,
      pixelsPerMm: fields.pixelsPerMm,
      typographies: fields.typographies,
      screenShape: fields.screenShape,
    },
  })
  // A navigator fills its edge of the new screen: placed for the old one,
  // it kept the old size until moved (the user, 2026-10-12, 4.3B to a phone).
  const fitted = withNavigatorsFitted(moved, rotated.screenWidth, rotated.screenHeight)
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
