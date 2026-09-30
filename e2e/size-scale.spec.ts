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
import { seedRoundFixtureDdf, seedWaveshareDdf } from "./ddf-seed"
import {
  TEXT_STYLES,
  fontFor,
  isOnScale,
  lineHeight,
  nearestStep,
  nearestStyle,
  stepKindOf,
  stepPx,
  typographyFor,
  type TextStyle,
} from "../lib/size-scale"
import type { Typography } from "../lib/device-description"
import type { ProjectFont } from "../components/project-editor"
import { COMBINED_TEST_PROJECT, ROUND_FIXTURE_DEVICE_ID, ROUND_FIXTURE_SCREEN, chooseDevice, createProject, devicePoint, getMainCanvas, loadProject, waitForDeviceGate, waitForEditorReady } from "./helpers"

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

// What the Android app says about itself (schaltli-android DdfBuilder.kt,
// Task 3, 2026-09-30): its screen in dp and the millimetres 160 dp to the
// inch make of it, Roboto as its one family, a Standard typography. The
// manifest here mirrors the builder's; DdfBuilderTest checks the builder's
// side of it.
test("an Android phone's DDF has a scale of 160 dp to the inch", async () => {
  const sizes = [12, 14, 16, 20, 24, 28, 32, 40, 48]
  const zip = new JSZip()
  zip.file(
    "device.json",
    JSON.stringify({
      device: { id: "android-a1b2c3d4", name: "Pixel 7", platform: "android" },
      screen: { width: 412, height: 915, colorDepth: "24bit", allowedRotations: [90, 180, 270], widthMm: 65.41, heightMm: 145.26 },
      adornment: { svgPath: "adornment.svg" },
      fonts: sizes.map((size) => ({
        id: `font-roboto-${size}`,
        displayName: `Roboto ${size}px`,
        internalName: "Roboto",
        file: "fonts/Roboto.ttf",
        size,
        ascent: Math.round((size * 1900) / 2048),
        descent: Math.round((size * 500) / 2048),
        format: "ttf",
        family: "Roboto",
        weight: "regular",
      })),
      typography: [{ name: "Standard", styles: { caption: "Roboto", label: "Roboto", title: "Roboto", display: "Roboto" } }],
      supportedObjectTypes: ["text"],
      systemGeneration: "1.1",
    }),
  )
  zip.file(
    "adornment.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"><rect id="screen" x="0" y="0" width="10" height="10" fill="none" stroke="none"/></svg>`,
  )
  zip.file("fonts/Roboto.ttf", new Uint8Array([0, 1, 0, 0]))
  const bytes = await zip.generateAsync({ type: "nodebuffer" })
  const fields = deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(bytes), bytes.toString("base64"))
  // One project unit is one dp: 160 / 25.4.
  expect(fields.pixelsPerMm).toBeCloseTo(6.3, 1)
  expect(fields.typographies?.[0].name).toBe("Standard")
  expect(fields.fonts.every((f) => f.family === "Roboto" && f.format === "ttf")).toBe(true)
})

// The scale itself (Task 4): millimetres to a device's pixels, a style's
// font within its family, the steps per object kind.
test.describe("the scale", () => {
  const font = (id: string, family: string, weight: "regular" | "bold", line: number): ProjectFont => ({
    id,
    name: id,
    displayName: id,
    path: `fonts/${id}.bdf`,
    size: line,
    ascent: line - Math.round(line / 5),
    descent: Math.round(line / 5),
    family,
    weight,
  })
  // The spec's worked example: Helvetica in many sizes, Halloween in one.
  const HELVETICA = [8, 9, 10, 11, 12, 15, 18, 25, 30, 35].map((px) => font(`helv${px}`, "Helvetica", "regular", px))
  const HELVETICA_BOLD = [18, 25].map((px) => font(`helvB${px}`, "Helvetica", "bold", px))
  const FONTS_EXAMPLE = [...HELVETICA, ...HELVETICA_BOLD, font("hallo45", "Halloween", "regular", 45)]
  const SPOOKY: Typography = { name: "Spooky", styles: { caption: "Helvetica", label: "Helvetica", title: "Halloween", display: "Helvetica" } }
  const PLAIN: Typography = { name: "Standard", styles: { caption: "Helvetica", label: "Helvetica", title: "Helvetica", display: "Helvetica" } }

  test("the spec's worked example: the style's family, the size closest to its millimetres", () => {
    const at = (style: TextStyle) => fontFor(style, false, SPOOKY, FONTS_EXAMPLE, 8.4)?.id
    expect(at("caption")).toBe("helv18") // 16.8 px
    expect(at("label")).toBe("helv25") // 25.2 px
    expect(at("title")).toBe("hallo45") // 37.8 px, Halloween's only size
    expect(at("display")).toBe("helv35") // 58.8 px, Helvetica's largest
  })

  test("bold where the family has it at all, regular where it has not", () => {
    expect(fontFor("label", true, SPOOKY, FONTS_EXAMPLE, 8.4)?.id).toBe("helvB25")
    // Halloween has no bold: Title stays regular.
    expect(fontFor("title", true, SPOOKY, FONTS_EXAMPLE, 8.4)?.id).toBe("hallo45")
    // A font without a weight counts as regular.
    const unweighted = { ...font("x", "Helvetica", "regular", 25), weight: undefined }
    expect(fontFor("label", false, PLAIN, [unweighted], 8.4)?.id).toBe("x")
  })

  test("a family the device has no fonts in gives nothing; a tie goes to the smaller", () => {
    expect(fontFor("title", false, { ...PLAIN, styles: { ...PLAIN.styles, title: "Nope" } }, FONTS_EXAMPLE, 8.4)).toBeUndefined()
    // Label on a 10 px/mm screen is 30 px - exactly between 25 and 35 here.
    const two = [font("a25", "Helvetica", "regular", 25), font("a35", "Helvetica", "regular", 35)]
    expect(fontFor("label", false, PLAIN, two, 10)?.id).toBe("a25")
  })

  test("a line is ascent plus descent: a TTF's size is its font size, not its line", () => {
    expect(lineHeight({ size: 16, ascent: 15, descent: 4 })).toBe(19)
    expect(lineHeight({ size: 27, ascent: 22, descent: 5 })).toBe(27)
    expect(lineHeight({ size: 27 })).toBe(27)
  })

  test("the project's typography, else Standard, else none", () => {
    expect(typographyFor([PLAIN, SPOOKY], "Spooky")?.name).toBe("Spooky")
    expect(typographyFor([PLAIN, SPOOKY], "Gone")?.name).toBe("Standard")
    expect(typographyFor([PLAIN, SPOOKY])?.name).toBe("Standard")
    expect(typographyFor(undefined, "Spooky")).toBeUndefined()
  })

  test("steps: millimetres per kind in pixels, the nearest step, on the scale within a pixel", () => {
    expect(stepKindOf("slider")).toBe("level")
    expect(stepKindOf("dial")).toBe("arc")
    expect(stepKindOf("button-group")).toBe("control")
    expect(stepKindOf("live-icon")).toBe("icon")
    expect(stepKindOf("text")).toBeUndefined()
    // A control at M on the 4.3B (8.66 px/mm): 8 mm is 69 px.
    expect(stepPx("control", "m", 8.66)).toBe(69)
    // S is 52, M 69: 62 is nearer M, 60 still nearer S.
    expect(nearestStep("control", 62, 8.66)).toBe("m")
    expect(nearestStep("control", 60, 8.66)).toBe("s")
    expect(nearestStep("control", 40, 8.66)).toBe("s")
    expect(isOnScale("control", 70, 8.66)).toBe(true)
    expect(isOnScale("control", 64, 8.66)).toBe(false)
    expect(nearestStyle(27, 8.66)).toBe("label")
  })

  // On every firmware device, every style finds a font and every step a
  // size (Task 4's second criterion), read from the firmware repo.
  for (const source of ["ddf-source", "ddf-source-waveshare4v3b", "ddf-source-papers3"]) {
    test(`${source}: every style has a font, every step a size`, async () => {
      const dir = path.join(__dirname, "..", "..", "schaltli-firmware", source)
      test.skip(!fs.existsSync(path.join(dir, "device.json")), "schaltli-firmware not checked out alongside this repo")
      const zip = new JSZip()
      const add = (at: string, prefix: string) => {
        for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
          const full = path.join(at, entry.name)
          if (entry.isDirectory()) add(full, `${prefix}${entry.name}/`)
          else zip.file(prefix + entry.name, fs.readFileSync(full))
        }
      }
      add(dir, "")
      const bytes = await zip.generateAsync({ type: "nodebuffer" })
      const fields = deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(bytes), bytes.toString("base64"))
      const typography = typographyFor(fields.typographies)!
      for (const style of TEXT_STYLES) {
        for (const bold of [false, true]) {
          expect(fontFor(style, bold, typography, fields.fonts, fields.pixelsPerMm!), `${style}${bold ? " bold" : ""}`).toBeDefined()
        }
      }
      for (const kind of ["level", "arc", "control", "icon"] as const) {
        const [s, m, l] = (["s", "m", "l"] as const).map((step) => stepPx(kind, step, fields.pixelsPerMm!))
        expect(s).toBeLessThan(m)
        expect(m).toBeLessThan(l)
      }
    })
  }
})

// Style and Bold on text (Task 5): on a device with a scale a text is set
// in a style, and its font follows; text set in a font by hand shows as
// Custom, and Snap moves it to the nearest style.
test.describe("a text's style", () => {
  // The Knob: its round 360 px screen fits the test window, and since
  // Task 2 its DDF gives a scale - 7.88 px/mm, Helvetica throughout.
  async function textOnKnob(page: Page) {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 60, 160, ROUND_FIXTURE_SCREEN)
    const to = devicePoint(box, 300, 200, ROUND_FIXTURE_SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator("#textStyle")).toBeVisible()
  }

  async function texts(page: Page) {
    const project = await downloadProject(page)
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    return deep(project.screens.flatMap((s: any) => s.objects)).filter((o: any) => o.type === "text")
  }

  test("a style sets the font of the device's typography; Bold its bold face", async ({ page }) => {
    await textOnKnob(page)
    // On the Knob Label is 24 px: Helvetica 18, a 27 px line.
    await page.locator("#textStyle").selectOption("label")
    await expect(page.locator("#textStyle")).toHaveValue("label")
    let [text] = await texts(page)
    expect(text.properties).toMatchObject({ textStyle: "label", textBold: false, fontId: "font-helvR18" })

    // The row's label is what a click lands on; the checkbox itself is hidden.
    await page.locator("label", { has: page.getByRole("checkbox", { name: "Bold" }) }).click()
    ;[text] = await texts(page)
    expect(text.properties).toMatchObject({ textStyle: "label", textBold: true, fontId: "font-helvB18" })

    // Display is 55 px: Helvetica's largest, bold too.
    await page.locator("#textStyle").selectOption("display")
    ;[text] = await texts(page)
    expect(text.properties).toMatchObject({ textStyle: "display", textBold: true, fontId: "font-helvB24" })
  })

  test("text in a font by hand shows as Custom, and Snap moves it to the nearest style", async ({ page }) => {
    await textOnKnob(page)
    // A new text is set in the device's first font - Helvetica 8px, a 12 px
    // line - until new objects start in a style (Task 7).
    await expect(page.locator("#textStyle")).toHaveValue("")
    await expect(page.locator("#textStyle option:checked")).toHaveText("Custom (Helvetica 8px)")
    // 12 px is nearest Caption (16 px on this screen): Helvetica 12, an 18 px line.
    await page.getByRole("button", { name: "Snap to Caption" }).click()
    await expect(page.locator("#textStyle")).toHaveValue("caption")
    const [text] = await texts(page)
    expect(text.properties).toMatchObject({ textStyle: "caption", fontId: "font-helvR12" })
  })

  test("a project on a device without a scale keeps the font picker", async ({ page }) => {
    // The e-paper fixture's DDF predates the scale.
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 20, 200)
    const to = devicePoint(box, 200, 230)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator("#fontId")).toBeVisible()
    await expect(page.locator("#textStyle")).toHaveCount(0)
  })
})
