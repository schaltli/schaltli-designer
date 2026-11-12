// The VanPi starter as a project on demo.schaltli.com, beside «Camper»
// (tasks/starter-project-todo.md, T7): the 4" a project is made for, as the
// New Project dialog makes one, with the starter added (lib/starters.ts).
import { parseDeviceDescriptionFile, deviceDescriptionToProjectFields } from "@/lib/device-description"
import { declaresTouch } from "@/lib/object-types"
import { DEFAULT_SEPARATORS } from "@/lib/placeholders"
import { withStarter, type StarterContent } from "@/lib/starters"
import fs from "node:fs"
import path from "node:path"

export const STARTER_DEMO_NAME = "VanPi-Starter"

export async function buildStarterProject(ddfZip: Uint8Array, starterId = "vanpi-4") {
  const parsed = await parseDeviceDescriptionFile(Buffer.from(ddfZip))
  const fields = deviceDescriptionToProjectFields(parsed, Buffer.from(ddfZip).toString("base64"))
  const base = {
    name: STARTER_DEMO_NAME,
    screenWidth: fields.screenWidth,
    screenHeight: fields.screenHeight,
    screens: [] as unknown[],
    assets: [] as unknown[],
    fonts: fields.fonts,
    hardwareButtons: fields.hardwareButtons,
    snapGuides: [] as unknown[],
    adornment: fields.adornment,
    adornmentDrawingArea: fields.adornmentDrawingArea,
    embeddedDdfZipBase64: fields.ddfZipBase64,
    topics: [] as unknown[],
    nextId: 1,
    settings: {
      exportFormat: "esp32",
      gridSize: 20,
      snapTolerance: 8,
      snapGrid: '{"horizontal":[], "vertical":[]}',
      colorDepth: fields.colorDepth,
      decimalSeparator: DEFAULT_SEPARATORS.decimal,
      thousandsSeparator: DEFAULT_SEPARATORS.thousands,
      deviceId: fields.deviceId,
      deviceName: fields.deviceName,
      devicePlatform: fields.devicePlatform,
      supportedObjectTypes: fields.supportedObjectTypes,
      deviceActions: fields.deviceActions,
      supportedFeatures: fields.supportedFeatures,
      ddfHash: fields.ddfHash,
      supportsSoftwareButtons: declaresTouch(fields.supportedObjectTypes),
      needsPageIconsInSize: fields.needsPageIconsInSize,
      pixelsPerMm: fields.pixelsPerMm,
      typographies: fields.typographies,
      screenShape: fields.screenShape,
      screenMotion: fields.screenMotion,
      popupCloseRadius: fields.popupCloseRadius,
    },
  }
  // Read from its file: loadStarter's import is the page's, through the bundler.
  const content = JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib", "starters", `${starterId}.json`), "utf8")) as StarterContent
  return withStarter(base, content)
}
