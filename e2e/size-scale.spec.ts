import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import path from "path"
import {
  deviceDescriptionToProjectFields,
  parseDeviceDescriptionFile,
  pixelsPerMmOf,
  typographiesOf,
} from "../lib/device-description"
import { seedWaveshareDdf } from "./ddf-seed"
import { chooseDevice, createProject, waitForDeviceGate, waitForEditorReady } from "./helpers"

// Sizes and fonts from a physical scale (docs/2026-09-30-size-scale.md).
// A device description says how large its screen is in millimetres, what
// family and weight each font is, and which family each text style uses in
// the typographies it offers - "Standard" always among them. This file
// starts with what the designer reads out of a DDF (Task 1); the scale
// itself and the fields that use it follow.

const STANDARD = { caption: "Helvetica", label: "Helvetica", title: "Helvetica", display: "Helvetica" }

async function ddfZip(device: Record<string, unknown>): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    "device.json",
    JSON.stringify({
      device: { id: "e2e-scale", name: "Scale test" },
      screen: { width: 800, height: 480, colorDepth: "24bit" },
      adornment: { svgPath: "adornment.svg" },
      fonts: [],
      supportedObjectTypes: ["text"],
      ...device,
    }),
  )
  zip.file(
    "adornment.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/></svg>`,
  )
  for (const name of ["helvR18", "helvB18", "hallo45"]) zip.file(`fonts/${name}.bdf`, "STARTFONT 2.1\nENDFONT\n")
  return zip.generateAsync({ type: "nodebuffer" })
}

const FONTS = [
  { id: "font-helvR18", displayName: "Helvetica 18", internalName: "helvR18", file: "fonts/helvR18.bdf", size: 27, ascent: 22, descent: 5, family: "Helvetica", weight: "regular" },
  { id: "font-helvB18", displayName: "Helvetica Bold 18", internalName: "helvB18", file: "fonts/helvB18.bdf", size: 27, ascent: 22, descent: 5, family: "Helvetica", weight: "bold" },
  { id: "font-hallo45", displayName: "Halloween 45", internalName: "hallo45", file: "fonts/hallo45.bdf", size: 45, ascent: 38, descent: 7, family: "Halloween", weight: "regular" },
]

async function fieldsOf(device: Record<string, unknown>) {
  const zip = await ddfZip(device)
  return deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(zip), zip.toString("base64"))
}

test.describe("what a device description says about its scale", () => {
  test("millimetres, families, weights and typographies reach the project's fields", async () => {
    const fields = await fieldsOf({
      screen: { width: 800, height: 480, colorDepth: "24bit", widthMm: 95, heightMm: 57 },
      fonts: FONTS,
      typography: [
        { name: "Standard", styles: STANDARD },
        { name: "Spooky", styles: { ...STANDARD, title: "Halloween" } },
      ],
    })
    // 800 px over 95 mm and 480 over 57: about 8.42 px/mm either way.
    expect(fields.pixelsPerMm).toBeCloseTo(8.42, 2)
    expect(fields.fonts.map((f) => [f.id, f.family, f.weight])).toEqual([
      ["font-helvR18", "Helvetica", "regular"],
      ["font-helvB18", "Helvetica", "bold"],
      ["font-hallo45", "Halloween", "regular"],
    ])
    expect(fields.typographies?.map((t) => t.name)).toEqual(["Standard", "Spooky"])
    expect(fields.typographies?.[1].styles.title).toBe("Halloween")
  })

  test("a DDF that says none of it gives no scale, as every DDF did before", async () => {
    const fields = await fieldsOf({ fonts: FONTS.map(({ family, weight, ...rest }) => rest) })
    expect(fields.pixelsPerMm).toBeUndefined()
    expect(fields.typographies).toBeUndefined()
    expect(fields.fonts.every((f) => f.family === undefined && f.weight === undefined)).toBe(true)
  })

  test("typographies without Standard count as none; an incomplete one is dropped", () => {
    expect(typographiesOf([{ name: "Spooky", styles: STANDARD }])).toEqual([])
    expect(typographiesOf("Standard")).toEqual([])
    const kept = typographiesOf([
      { name: "Standard", styles: STANDARD },
      { name: "Half", styles: { caption: "Helvetica", label: "Helvetica" } },
      { name: "", styles: STANDARD },
    ])
    expect(kept.map((t) => t.name)).toEqual(["Standard"])
  })

  test("pixels per millimetre need both sides, positive", () => {
    expect(pixelsPerMmOf({ width: 360, height: 360, widthMm: 32.4, heightMm: 32.4 })).toBeCloseTo(11.11, 2)
    expect(pixelsPerMmOf({ width: 360, height: 360, widthMm: 32.4 })).toBeUndefined()
    expect(pixelsPerMmOf({ width: 360, height: 360, widthMm: 0, heightMm: 32.4 })).toBeUndefined()
  })

  test("a weight that is neither regular nor bold is left out", async () => {
    const fields = await fieldsOf({ fonts: [{ ...FONTS[0], weight: "heavy" }] })
    expect(fields.fonts[0].family).toBe("Helvetica")
    expect(fields.fonts[0].weight).toBeUndefined()
  })
})

async function downloadProject(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download Project" }).click(),
  ])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

test.describe("a project on a device with a scale", () => {
  test("a new project keeps the device's pixels per millimetre and typographies", async ({ page }) => {
    const deviceId = "e2e-scale-knob"
    const seeded = await seedWaveshareDdf({
      deviceId,
      mutateDeviceJson: (manifest) => {
        manifest.screen.widthMm = 32.4
        manifest.screen.heightMm = 32.4
        for (const font of manifest.fonts) {
          font.family = String(font.internalName).includes("cour") ? "Courier" : "Helvetica"
          font.weight = /B\d/.test(font.internalName) ? "bold" : "regular"
        }
        manifest.typography = [{ name: "Standard", styles: STANDARD }]
      },
    })
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")

    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, deviceId, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)

    const project = await downloadProject(page)
    expect(project.settings.pixelsPerMm).toBeCloseTo(11.11, 2)
    expect(project.settings.typographies).toEqual([{ name: "Standard", styles: STANDARD }])
    expect(project.fonts.find((f: any) => f.id === "font-helvB18")).toMatchObject({ family: "Helvetica", weight: "bold" })
  })
})

// The three firmware DDFs as their source in the firmware repo has them
// (Task 2, 2026-09-30): active areas from the panels' data sheets, every
// font in a family, a "Standard" typography.
test.describe("the firmware devices' scale", () => {
  const FIRMWARE = path.join(__dirname, "..", "..", "schaltli-firmware")
  async function sourceZip(dir: string): Promise<Buffer> {
    const zip = new JSZip()
    const add = (at: string, prefix: string) => {
      for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
        const full = path.join(at, entry.name)
        if (entry.isDirectory()) add(full, `${prefix}${entry.name}/`)
        else zip.file(prefix + entry.name, fs.readFileSync(full))
      }
    }
    add(dir, "")
    return zip.generateAsync({ type: "nodebuffer" })
  }

  const DEVICES = [
    // 360 px over a 45.68 mm round panel.
    { source: "ddf-source", pxPerMm: 7.88, display: "Helvetica" },
    // 800 × 480 over 95.04 × 53.86 mm: 8.42 across and 8.91 down, not square;
    // the mean is what the scale uses.
    { source: "ddf-source-waveshare4v3b", pxPerMm: 8.66, display: "FreeUniversal" },
    // 960 × 540 over 103.68 × 58.32 mm, the ED047TC1's 0.108 mm pitch.
    { source: "ddf-source-papers3", pxPerMm: 9.26, display: "FreeUniversal" },
  ]
  for (const device of DEVICES) {
    test(`${device.source} has a scale, fonts in families and a Standard typography`, async () => {
      const dir = path.join(FIRMWARE, device.source)
      test.skip(!fs.existsSync(path.join(dir, "device.json")), "schaltli-firmware not checked out alongside this repo")
      const zip = await sourceZip(dir)
      const fields = deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(zip), zip.toString("base64"))
      expect(fields.pixelsPerMm).toBeCloseTo(device.pxPerMm, 2)
      expect(fields.fonts.every((f) => f.family && (f.weight === "regular" || f.weight === "bold"))).toBe(true)
      const standard = fields.typographies?.find((t) => t.name === "Standard")
      expect(standard?.styles).toEqual({ caption: "Helvetica", label: "Helvetica", title: "Helvetica", display: device.display })
      // Every family a style names has fonts on the device.
      for (const family of Object.values(standard!.styles)) {
        expect(fields.fonts.some((f) => f.family === family)).toBe(true)
      }
    })
  }
})
