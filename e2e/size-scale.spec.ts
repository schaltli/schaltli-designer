import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import mqtt from "mqtt"
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
  resolveScale,
  stepKindOf,
  stepPx,
  textScaleOf,
  typographyFor,
  typographyNameOf,
  stepOf,
  stepSizeOf,
  stepUpdates,
  snapDiameter,
  withHonestSteps,
  type TextStyle,
} from "../lib/size-scale"
import type { Typography } from "../lib/device-description"
import { calculateTextObjectHeight } from "../lib/font-utils"
import { BDFFont } from "../lib/bdffont"
import type { Project, ProjectFont } from "../components/project-editor"
import { COMBINED_TEST_PROJECT, ROUND_FIXTURE_DEVICE_ID, objectTreeRow, ROUND_FIXTURE_SCREEN, chooseDevice, createProject, devicePoint, getMainCanvas, loadProject, placingFreely, waitForDeviceGate, waitForEditorReady } from "./helpers"

// Sizes and fonts from a physical scale (docs/2026-09-30-size-scale.md).
// A device description says how large its screen is in millimetres, what
// family and weight each font is, and which family each text style uses in
// the typographies it offers - "Standard" always among them. This file
// starts with what the designer reads out of a DDF (Task 1); the scale
// itself and the fields that use it follow.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

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
    // 360 px over a 45.68 mm round panel. Display is FreeUniversal on all
    // three since the typographies of 2026-09-30, up to its 42 pt.
    { source: "ddf-source", pxPerMm: 7.88, display: "FreeUniversal" },
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

  // Typography appendix, Task T2: bold is the regular size's bold face.
  test("bold takes the size regular has, even where the family's bold lines run a pixel apart", () => {
    // Lucida Sans in shape: every bold line one pixel taller than its regular.
    const lucida = [
      ...[15, 23, 32].map((px) => font(`luRS${px}`, "Lucida Sans", "regular", px)),
      ...[16, 24, 33].map((px) => font(`luBS${px}`, "Lucida Sans", "bold", px)),
    ]
    const humanist: Typography = { name: "Humanist", styles: { caption: "Lucida Sans", label: "Lucida Sans", title: "Lucida Sans", display: "Lucida Sans" } }
    // Label on the PaperS3 is 27.8 px: regular 32 is closest. Sized on its
    // own, bold would have taken 24 - a size smaller than its regular.
    expect(fontFor("label", false, humanist, lucida, 9.26)?.id).toBe("luRS32")
    expect(fontFor("label", true, humanist, lucida, 9.26)?.id).toBe("luBS33")
  })

  test("without a bold of that size, bold stays regular rather than change size", () => {
    const family = [font("r32", "X", "regular", 32), font("r23", "X", "regular", 23), font("b24", "X", "bold", 24)]
    const x: Typography = { name: "X", styles: { caption: "X", label: "X", title: "X", display: "X" } }
    expect(fontFor("label", true, x, family, 9.26)?.id).toBe("r32")
    // A family that has only bold faces is sized from them.
    const onlyBold = [font("b30", "Y", "bold", 30), font("b20", "Y", "bold", 20)]
    const y: Typography = { name: "Y", styles: { caption: "Y", label: "Y", title: "Y", display: "Y" } }
    expect(fontFor("label", false, y, onlyBold, 9.26)?.id).toBe("b30")
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
    expect(stepKindOf("slider")).toBe("track")
    expect(stepKindOf("dial")).toBe("track")
    expect(stepKindOf("button-group")).toBe("control")
    expect(stepKindOf("live-icon")).toBe("icon")
    expect(stepKindOf("text")).toBeUndefined()
    // A control at M on the 4.3B (8.66 px/mm): 8 mm is 69 px.
    expect(stepPx("control", "m", 8.66)).toBe(69)
    // S is 52, M 69: 62 is nearer M, 60 still nearer S.
    expect(nearestStep("control", 62, 8.66)).toBe("m")
    expect(nearestStep("control", 60, 8.66)).toBe("s")
    // XS (since 2026-10-05) is 43: 40 is nearest it, 48 still S.
    expect(stepPx("control", "xs", 8.66)).toBe(43)
    expect(nearestStep("control", 40, 8.66)).toBe("xs")
    expect(nearestStep("control", 48, 8.66)).toBe("s")
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
      // Standard, Humanist and Technic (the typography appendix, Task T3):
      // every style, regular and bold, lands on a font of the family it
      // names - bold on regular only where the family has no bold.
      expect(fields.typographies?.map((t) => t.name)).toEqual(["Standard", "Humanist", "Technic"])
      for (const typography of fields.typographies!) {
        for (const style of TEXT_STYLES) {
          for (const bold of [false, true]) {
            const font = fontFor(style, bold, typography, fields.fonts, fields.pixelsPerMm!)
            const what = `${typography.name} ${style}${bold ? " bold" : ""}`
            expect(font?.family, what).toBe(typography.styles[style])
          }
        }
      }
      for (const kind of ["track", "control", "icon"] as const) {
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

    // Display is 55 px: FreeUniversal, the Standard typography's Display
    // family, at its 42 pt (a 51 px line), bold too.
    await page.locator("#textStyle").selectOption("display")
    ;[text] = await texts(page)
    expect(text.properties).toMatchObject({ textStyle: "display", textBold: true, fontId: "font-fub42" })
  })

  test("an object in a font by hand shows as Custom, and Snap moves it to the nearest style", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    // The switch fixture was made before the scale: its switch is set in
    // Helvetica 8px, a 12 px line, by hand.
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()
    await expect(page.locator("#textStyle")).toHaveValue("")
    await expect(page.locator("#textStyle option:checked")).toHaveText("Custom (Helvetica 8px)")
    // 12 px is nearest Caption (16 px on the Knob): Helvetica 12, an 18 px line.
    await page.getByRole("button", { name: "Snap to Caption" }).click()
    await expect(page.locator("#textStyle")).toHaveValue("caption")
    const project = await downloadProject(page)
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    const sw = deep(project.screens.flatMap((s: any) => s.objects)).find((o: any) => o.id === "obj-switch-1")
    expect(sw.properties).toMatchObject({ textStyle: "caption", fontId: "font-helvR12" })
  })

  // Task 6a: a level's value takes a style as text does.
  test("a gauge's value in Display gets the device's Display font", async ({ page }) => {
    await textOnKnob(page)
    await page.getByRole("button", { name: "Gauge", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 100, 220, ROUND_FIXTURE_SCREEN)
    const to = devicePoint(box, 200, 320, ROUND_FIXTURE_SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await page.locator("#textStyle").selectOption("display")
    const project = await downloadProject(page)
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    const [gauge] = deep(project.screens.flatMap((s: any) => s.objects)).filter((o: any) => o.type === "gauge")
    // 7 mm on the Knob is 55 px: FreeUniversal 42, a 51 px line.
    expect(gauge.properties).toMatchObject({ textStyle: "display", fontId: "font-fur42" })
  })

  // Task 6b: a switch's and a button's labels take a style as text does.
  test("a switch's labels in Title and a button's in Label get the device's fonts", async ({ page }) => {
    await textOnKnob(page)
    const draw = async (tool: string, from: [number, number], to: [number, number]) => {
      await page.getByRole("button", { name: tool, exact: true }).first().click()
      const { box } = await getMainCanvas(page)
      const a = devicePoint(box, from[0], from[1], ROUND_FIXTURE_SCREEN)
      const b = devicePoint(box, to[0], to[1], ROUND_FIXTURE_SCREEN)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(b.x, b.y, { steps: 5 })
      await page.mouse.up()
    }
    await draw("Switch", [80, 220], [280, 260])
    await page.locator("#textStyle").selectOption("title")
    await draw("Button", [80, 280], [280, 320])
    await page.locator("#textStyle").selectOption("label")

    const project = await downloadProject(page)
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    const objects = deep(project.screens.flatMap((s: any) => s.objects))
    // Title on the Knob is 35 px: Helvetica 24. Label is 24 px: Helvetica 18.
    expect(objects.find((o: any) => o.type === "switch").properties).toMatchObject({ textStyle: "title", fontId: "font-helvR24" })
    expect(objects.find((o: any) => o.type === "button").properties).toMatchObject({ textStyle: "label", fontId: "font-helvR18" })
  })

  // Task 7: on a device with a scale nothing new starts in a font by hand.
  test("every new object with text starts in a style: Label, and Display in a ring", async ({ page }) => {
    await textOnKnob(page)
    const draw = async (tool: string, from: [number, number], to: [number, number]) => {
      await page.getByRole("button", { name: tool, exact: true }).first().click()
      const { box } = await getMainCanvas(page)
      const a = devicePoint(box, from[0], from[1], ROUND_FIXTURE_SCREEN)
      const b = devicePoint(box, to[0], to[1], ROUND_FIXTURE_SCREEN)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(b.x, b.y, { steps: 5 })
      await page.mouse.up()
    }
    await draw("Text", [60, 60], [300, 90])
    await draw("Bar", [60, 100], [300, 130])
    await draw("Gauge", [60, 140], [160, 240])
    await draw("Switch", [180, 150], [320, 190])
    await draw("Button", [180, 200], [320, 240])

    const project = await downloadProject(page)
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    const byType = (type: string) => deep(project.screens.flatMap((s: any) => s.objects)).find((o: any) => o.type === type)
    // Label on the Knob is Helvetica 18; Display FreeUniversal 42.
    for (const type of ["text", "bar", "switch", "button"]) {
      expect(byType(type).properties, type).toMatchObject({ textStyle: "label", textBold: false, fontId: "font-helvR18" })
    }
    expect(byType("gauge").properties).toMatchObject({ textStyle: "display", fontId: "font-fur42" })
    // The text's height follows its font, as the Text panel sets it.
    expect(byType("text").height).toBe(calculateTextObjectHeight(27))
  })

  test("a block's label on a device with a scale is in the Label style", async ({ page }, testInfo) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    // A switch announced on the local broker (npm run hil:broker) under a
    // discovery prefix of this test's own.
    // Per run, so repeats in parallel do not clear each other's retained announcement.
    const prefix = `e2e-scale-${testInfo.testId}-${testInfo.repeatEachIndex}-${testInfo.retry}`
    const topic = `${prefix}/switch/pump/config`
    const broker = mqtt.connect(process.env.HIL_MQTT_WS_URL || "ws://localhost:9001", { clientId: `e2e-scale-${Date.now()}` })
    await new Promise((resolve) => broker.once("connect", resolve))
    await broker.publishAsync(topic, JSON.stringify({ name: "Pumpe", stat_t: "van/pump", cmd_t: "van/pump/set" }), { retain: true })
    try {
      await page.addInitScript(
        (p) => window.localStorage.setItem("schaltli-mqtt-connection", JSON.stringify({ websocketUrl: "ws://localhost:9001", discoveryPrefix: p })),
        prefix,
      )
      // Neither icon service is asked for real: the block's icon is looked
      // for through /api/translate first, which goes out to Google with a 5 s
      // timeout of its own - as long as Insert below is given to close the
      // dialog, so under load the test lost the race (2026-10-07).
      await page.route("**/api/translate?**", (route) => {
        const q = new URL(route.request().url()).searchParams.get("q") ?? ""
        return route.fulfill({ json: { translated: q } })
      })
      await page.route("https://api.iconify.design/**", (route) => route.fulfill({ json: { icons: [] } }))
      await page.goto("/")
      await waitForDeviceGate(page)
      await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
      await createProject(page)
      await waitForEditorReady(page)
      // The menu reads the broker each time it opens and gives up after a
      // while; under a full parallel run that was now and then before the
      // retained announcement came through. Opened again until it is there.
      const pumpe = page.getByRole("menuitem", { name: "Pumpe", exact: true })
      await expect(async () => {
        await page.keyboard.press("Escape")
        await page.getByRole("button", { name: "Block", exact: true }).click()
        await expect(pumpe).toBeVisible({ timeout: 8_000 })
      }).toPass({ timeout: 40_000 })
      await pumpe.click()
      await page.getByTestId("baustein-insert").click()
      // Insert waits for the icon still being looked for (baustein-dialog.tsx).
      await expect(page.getByRole("dialog")).toHaveCount(0)
      // On the new screen, free: drawn as a rectangle.
      const { box } = await getMainCanvas(page)
      const from = devicePoint(box, 60, 120, ROUND_FIXTURE_SCREEN)
      const to = devicePoint(box, 300, 200, ROUND_FIXTURE_SCREEN)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 8 })
      await page.mouse.up()

      const project = await downloadProject(page)
      const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
      const label = deep(project.screens.flatMap((s: any) => s.objects)).find((o: any) => o.type === "text")
      expect(label.properties).toMatchObject({ text: "Pumpe", textStyle: "label", fontId: "font-helvR18" })
    } finally {
      await broker.publishAsync(topic, "", { retain: true })
      broker.end(true)
    }
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
    // And new objects start in the device's first font, as before (Task 7).
    const project = await downloadProject(page)
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    const texts = deep(project.screens.flatMap((s: any) => s.objects)).filter((o: any) => o.type === "text")
    expect(texts.every((t: any) => t.properties.textStyle === undefined)).toBe(true)
  })
})

// Task 8a: styled objects follow the device - after "Load device", and on
// opening with a device whose DDF has changed. Custom objects stay.
test.describe("styled objects follow the device", () => {
  async function firmwareFields(source: string) {
    const dir = path.join(__dirname, "..", "..", "schaltli-firmware", source)
    if (!fs.existsSync(path.join(dir, "device.json"))) return undefined
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
    return deviceDescriptionToProjectFields(await parseDeviceDescriptionFile(bytes), bytes.toString("base64"))
  }

  function projectOn(fields: NonNullable<Awaited<ReturnType<typeof firmwareFields>>>, objects: any[], typography?: string): Project {
    return {
      name: "p",
      screens: [{ id: "s1", name: "Screen 1", objects, typography }],
      assets: [],
      fonts: fields.fonts,
      hardwareButtons: [],
      snapGuides: [],
      topics: [],
      settings: { pixelsPerMm: fields.pixelsPerMm, typographies: fields.typographies },
    } as unknown as Project
  }

  test("moved from the 4.3B to the Knob, a Display stays Display in the Knob's font; Custom keeps its font", async () => {
    const v43b = await firmwareFields("ddf-source-waveshare4v3b")
    const knob = await firmwareFields("ddf-source")
    test.skip(!v43b || !knob, "schaltli-firmware not checked out alongside this repo")
    // In Technic, whose Seven Segment Display each board carries at exactly
    // its own Display line - 61 px on the 4.3B, 55 on the Knob. Already
    // resolved for the 4.3B.
    const styled = { id: "a", type: "text", x: 0, y: 0, width: 100, height: calculateTextObjectHeight(61), zIndex: 1, properties: { text: "21.5", textStyle: "display", textBold: false, fontId: "font-seg7-61", fontSize: 61 } }
    const custom = { id: "b", type: "text", x: 0, y: 0, width: 100, height: 10, zIndex: 2, properties: { text: "B", fontId: "font-fur35", fontSize: 43 } }
    const on43b = projectOn(v43b!, [styled, custom], "Technic")

    // On the 4.3B nothing changes: the same project comes back.
    expect(resolveScale(on43b)).toBe(on43b)

    // "Load device" to the Knob: its fonts and scale, the objects as they were.
    const moved = resolveScale({ ...projectOn(knob!, [styled, custom], "Technic") })
    const [a, b] = moved.screens[0].objects
    // Display on the Knob: its own Seven Segment; the height follows the font.
    expect(a.properties).toMatchObject({ textStyle: "display", fontId: "font-seg7-55", fontSize: 55 })
    expect(a.height).toBe(calculateTextObjectHeight(55))
    // The Custom text keeps what it had, even a font the Knob does not have.
    expect(b).toBe(custom)
  })

  test("a group's children and a project without a scale are resolved, or left, alike", async () => {
    const knob = await firmwareFields("ddf-source")
    test.skip(!knob, "schaltli-firmware not checked out alongside this repo")
    const child = { id: "c", type: "switch", x: 0, y: 0, width: 100, height: 30, zIndex: 1, properties: { textStyle: "title", fontId: "x", fontSize: 1 } }
    const group = { id: "g", type: "group", x: 0, y: 0, width: 100, height: 30, zIndex: 1, properties: {}, children: [child] }
    const resolved = resolveScale(projectOn(knob!, [group]))
    const [g] = resolved.screens[0].objects
    // A switch's height is not its text's: only the font changes.
    expect(g.children![0]).toMatchObject({ height: 30, properties: { textStyle: "title", fontId: "font-helvR24" } })

    const noScale = { ...projectOn(knob!, [group]), settings: {} } as unknown as Project
    expect(resolveScale(noScale)).toBe(noScale)
  })

  // Task T6: the typography is a screen's, inherited from its master like the
  // theme (user, 2026-09-30).
  test("each screen in its own typography, else its master's, else Standard", async () => {
    const knob = await firmwareFields("ddf-source")
    test.skip(!knob, "schaltli-firmware not checked out alongside this repo")
    const label = (id: string) => ({ id, type: "text", x: 0, y: 0, width: 100, height: 10, zIndex: 1, properties: { text: id, textStyle: "label", textBold: false } })
    const project = {
      ...projectOn(knob!, []),
      screens: [
        { id: "m", name: "Master", isMaster: true, typography: "Technic", objects: [label("on-master")] },
        { id: "inherits", name: "A", masterScreenId: "m", objects: [label("inherits")] },
        { id: "own", name: "B", masterScreenId: "m", typography: "Standard", objects: [label("own")] },
        { id: "alone", name: "C", objects: [label("alone")] },
      ],
    } as unknown as Project
    const family = (p: Project, id: string) => {
      const o = p.screens.flatMap((sc) => sc.objects).find((x) => x.id === id)!
      return knob!.fonts.find((f) => f.id === o.properties.fontId)?.family
    }
    const resolved = resolveScale(project)
    expect(family(resolved, "on-master")).toBe("Lucida Sans")
    expect(family(resolved, "inherits")).toBe("Lucida Sans")
    expect(family(resolved, "own")).toBe("Helvetica")
    expect(family(resolved, "alone")).toBe("Helvetica")
    expect(typographyNameOf(resolved.screens[1], resolved.screens)).toBe("Technic")
  })

  // Task 9a, revised by the user on 2026-09-30: S/M/L is the track's
  // thickness, one row for bar, slider, gauge and dial - 15, 25 and 40 px
  // on the 4.3B - and a ring's diameter sits on its track's grid.
  test("a size step sets every track's thickness; a ring's diameter lands on its track's grid", async () => {
    const v43b = await firmwareFields("ddf-source-waveshare4v3b")
    const knob = await firmwareFields("ddf-source")
    test.skip(!v43b || !knob, "schaltli-firmware not checked out alongside this repo")
    const ppm = v43b!.pixelsPerMm!
    const fonts = v43b!.fonts

    const slider = { id: "s", type: "slider", x: 10, y: 20, width: 300, height: 40, zIndex: 1, properties: { writeTopic: "a/b", displayValue: "none" } } as any
    const bar = { ...slider, id: "b", type: "bar", properties: { displayValue: "none" } }
    const dial = { id: "d", type: "dial", x: 0, y: 0, width: 130, height: 130, zIndex: 1, properties: {} } as any
    for (const [step, px] of [["s", 15], ["m", 25], ["l", 40]] as const) {
      for (const object of [slider, bar, dial]) {
        const sized = { ...object, ...stepUpdates(object, step, ppm, fonts) }
        expect(sized.properties.thickness, `${object.type} ${step}`).toBe(px)
        expect(stepOf(sized, ppm)).toBe(step)
      }
    }
    // The slider's box is as deep as its handle, the bar's as its track; both
    // keep their length and corner.
    const sliderM = { ...slider, ...stepUpdates(slider, "m", ppm, fonts) }
    expect(sliderM).toMatchObject({ x: 10, y: 20, width: 300, height: Math.trunc((25 * 11) / 4) })
    const barM = { ...bar, ...stepUpdates(bar, "m", ppm, fonts) }
    expect(barM).toMatchObject({ width: 300, height: 25 })

    // A ring: 130 is nearest 150 on M's 50 px grid; at least two tracks
    // either side; rings of one step nest.
    const dialM = { ...dial, ...stepUpdates(dial, "m", ppm, fonts) }
    expect([dialM.width, dialM.height]).toEqual([150, 150])
    expect(snapDiameter(10, 25)).toBe(100)
    expect(snapDiameter(174, 25)).toBe(150)
    expect(snapDiameter(176, 25)).toBe(200)

    // Moved to the Knob (M is 23 px there): the Knob's M, on the Knob's grid.
    const moved = resolveScale(projectOn(knob!, [sliderM, dialM])).screens[0].objects
    const knobM = Math.round(2.89 * knob!.pixelsPerMm!)
    expect(moved.map((o) => o.properties.thickness)).toEqual([knobM, knobM])
    expect(moved[1].width % (2 * knobM)).toBe(0)
    expect(moved.map((o) => o.properties.sizeStep)).toEqual(["m", "m"])
  })

  test("an object resized off its step loses it, so a device change leaves it alone", async () => {
    const v43b = await firmwareFields("ddf-source-waveshare4v3b")
    test.skip(!v43b, "schaltli-firmware not checked out alongside this repo")
    const ppm = v43b!.pixelsPerMm!
    const bar = { id: "b", type: "bar", x: 0, y: 0, width: 300, height: 40, zIndex: 1, properties: { displayValue: "none" } } as any
    const barM = { ...bar, ...stepUpdates(bar, "m", ppm, v43b!.fonts) }
    const kept = [barM]
    expect(withHonestSteps(kept, ppm)).toBe(kept)
    const typed = { ...barM, properties: { ...barM.properties, thickness: 30 } }
    const [left] = withHonestSteps([typed], ppm)
    expect(left.properties.sizeStep).toBeUndefined()
    expect(left.properties.thickness).toBe(30)
    // An old bar that happens to measure a step is on it, named or not.
    expect(stepOf({ ...bar, properties: { thickness: 15 } }, ppm)).toBe("s")
  })

  // Task 9b: a switch, button group or button's height, an icon's edge; a
  // control's width never below what its labels need.
  test("a size step sets a control's height and an icon's edge; a control stays wide enough for its labels", async () => {
    const v43b = await firmwareFields("ddf-source-waveshare4v3b")
    test.skip(!v43b, "schaltli-firmware not checked out alongside this repo")
    const ppm = v43b!.pixelsPerMm!
    const fonts = v43b!.fonts
    const label = fonts.find((f) => f.id === "font-helvR18")!
    expect(label.data, "the firmware DDF's fonts come with their bitmaps").toBeTruthy()
    const states = [{ label: "Aus" }, { label: "Automatik und Nacht" }]
    const make = (type: string, width: number, properties: Record<string, unknown>) =>
      ({ id: type, type, x: 5, y: 6, width, height: 30, zIndex: 1, properties: { fontId: label.id, ...properties } }) as any

    for (const [step, mm] of [["s", 6], ["m", 8], ["l", 11]] as const) {
      for (const object of [
        make("switch", 60, { states }),
        make("button-group", 60, { states }),
        make("button", 40, { text: "Alles aus" }),
      ]) {
        const sized = { ...object, ...stepUpdates(object, step, ppm, fonts) }
        expect(sized.height, `${object.type} ${step}`).toBe(Math.round(mm * ppm))
        expect(stepOf(sized, ppm)).toBe(step)
        // Wider than the 60/40 it had: the long label needs it.
        expect(sized.width, `${object.type} ${step}`).toBeGreaterThan(object.width)
        expect(sized).toMatchObject({ x: 5, y: 6 })
      }
    }
    // Room to spare: the width stays the author's.
    const wide = make("button", 600, { text: "OK" })
    expect({ ...wide, ...stepUpdates(wide, "m", ppm, fonts) }.width).toBe(600)

    // A button's width: its round ends (the height) and its label, measured
    // in the bitmap font it is drawn in.
    const button = make("button", 10, { text: "Alles aus" })
    const buttonM = { ...button, ...stepUpdates(button, "m", ppm, fonts) }
    const text = new BDFFont(label.data!).measureText("Alles aus").width
    expect(buttonM.width).toBe(buttonM.height + Math.ceil(text))

    for (const type of ["icon", "live-icon"]) {
      const icon = { id: type, type, x: 0, y: 0, width: 24, height: 24, zIndex: 1, properties: {} } as any
      const iconL = { ...icon, ...stepUpdates(icon, "l", ppm, fonts) }
      expect(iconL.width).toBe(Math.round(9 * ppm))
      expect(iconL.height).toBe(iconL.width)
    }
  })

  test("opening a project gives its styled text the device's fonts as the device has them now", async ({ page }, testInfo) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    // The e-paper fixture, moved onto the Knob, with a text in Label - saved
    // in a font the Knob would not pick for it - and one in a font by hand.
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.settings.deviceId = ROUND_FIXTURE_DEVICE_ID
    delete project.embeddedDdfZipBase64
    project.screens[0].objects.push(
      { id: "e2e-styled", type: "text", x: 10, y: 10, width: 200, height: 20, zIndex: 900, properties: { text: "Styled", textStyle: "label", textBold: false, fontId: "font-helvR08", fontSize: 12 } },
      { id: "e2e-custom", type: "text", x: 10, y: 40, width: 200, height: 20, zIndex: 901, properties: { text: "Custom", fontId: "font-helvR08", fontSize: 12 } },
    )
    zip.file("project.json", JSON.stringify(project))
    const projectPath = testInfo.outputPath("moved-to-knob.zip")
    fs.writeFileSync(projectPath, await zip.generateAsync({ type: "nodebuffer" }))

    await loadProject(page, projectPath)
    const saved = await downloadProject(page)
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    const objects = deep(saved.screens.flatMap((s: any) => s.objects))
    expect(objects.find((o: any) => o.id === "e2e-styled").properties).toMatchObject({ textStyle: "label", fontId: "font-helvR18" })
    expect(objects.find((o: any) => o.id === "e2e-custom").properties).toMatchObject({ fontId: "font-helvR08" })
    expect(objects.find((o: any) => o.id === "e2e-custom").properties.textStyle).toBeUndefined()
  })
})

// Task 8b, moved onto the screens by T6: a device may offer more than one
// typography; a master or a screen picks one next to its theme, a screen
// inherits its master's, and styled text follows.
test.describe("choosing a typography", () => {
  async function knobProject(page: Page, deviceId: string, typography?: Typography[]) {
    const seeded = await seedWaveshareDdf({
      deviceId,
      mutateDeviceJson: typography ? (manifest) => (manifest.typography = typography) : undefined,
    })
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, deviceId, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
  }

  test("a second typography is offered, and choosing it gives styled text its family", async ({ page }) => {
    const mono: Typography = { name: "Mono", styles: { ...STANDARD, label: "Courier" } }
    await knobProject(page, "e2e-scale-knob-mono", [{ name: "Standard", styles: STANDARD }, mono])
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 60, 160, ROUND_FIXTURE_SCREEN)
    const to = devicePoint(box, 300, 200, ROUND_FIXTURE_SCREEN)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()

    // The text just drawn has its field focused (focus-on-create.spec.ts):
    // the first Esc lets go of it, the second clears the selection.
    await page.keyboard.press("Escape")
    await page.keyboard.press("Escape")

    // Screen 1 inherits from Master 1, which has picked nothing: Standard.
    const typography = page.locator("#typography")
    await expect(typography).toHaveValue("__inherit__")
    await expect(typography.locator("option:checked")).toHaveText("Inherit from Master (Standard)")

    // Mono on the master: the screen's text follows.
    await page.locator("[data-screen-id]").filter({ hasText: "Master 1" }).click()
    await expect(typography).toHaveValue("Standard")
    await typography.selectOption("Mono")
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    const textIn = (project: any) => deep(project.screens.flatMap((s: any) => s.objects)).find((o: any) => o.type === "text")
    let project = await downloadProject(page)
    expect(project.screens.find((s: any) => s.isMaster).typography).toBe("Mono")
    expect(project.screens.find((s: any) => !s.isMaster).typography).toBeUndefined()
    // Label on the Knob is 24 px; Courier has 15 and 22: Courier 18, a 22 px line.
    expect(textIn(project).properties).toMatchObject({ textStyle: "label", fontId: "font-courR18" })

    // The screen picks Standard for itself: back to Helvetica.
    await page.locator("[data-screen-id]").filter({ hasText: "Screen 1" }).click()
    await expect(typography.locator("option:checked")).toHaveText("Inherit from Master (Mono)")
    await typography.selectOption("Standard")
    project = await downloadProject(page)
    expect(project.screens.find((s: any) => !s.isMaster).typography).toBe("Standard")
    expect(textIn(project).properties).toMatchObject({ textStyle: "label", fontId: "font-helvR18" })
  })

  test("a device with only Standard shows no choice", async ({ page }) => {
    await knobProject(page, "e2e-scale-knob-standard-only", [{ name: "Standard", styles: STANDARD }])
    await expect(page.getByText("Theme", { exact: true }).first()).toBeVisible()
    await expect(page.locator("#typography")).toHaveCount(0)
  })

  test("a screen's typography the device lacks falls back to Standard", async () => {
    const knob = { pixelsPerMm: 7.88, typographies: [{ name: "Standard", styles: STANDARD }] }
    expect(textScaleOf(knob, "Mono")?.typography.name).toBe("Standard")
  })
})

// Task 9a in the panel, and Task 10 on the canvas: a new bar starts at M;
// a thickness typed in makes it Custom, Snap puts it back; a stepped bar
// or slider resizes only along its length, a ring on its track's grid, a
// switch onto a step.
test.describe("a level's size step", () => {
  // The Knob: 7.88 px/mm, a track of 14, 23 or 36 px, a control 47, 63 or 87.
  async function knobProject(page: Page) {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
  }
  // Drags from one point of the device screen to another.
  async function drag(page: Page, from: [number, number], to: [number, number]) {
    const { box } = await getMainCanvas(page)
    const a = devicePoint(box, from[0], from[1], ROUND_FIXTURE_SCREEN)
    const b = devicePoint(box, to[0], to[1], ROUND_FIXTURE_SCREEN)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    // Freely: these objects are drawn and resized beside one another, where
    // they would snap into a table.
    await placingFreely(page, async () => {
      await page.mouse.move(b.x, b.y, { steps: 8 })
      await page.mouse.up()
    })
  }
  async function draw(page: Page, tool: string, from: [number, number], to: [number, number]) {
    await page.getByRole("button", { name: tool, exact: true }).first().click()
    await drag(page, from, to)
  }
  async function objectsOf(page: Page, type: string) {
    const project = await downloadProject(page)
    const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])
    return deep(project.screens.flatMap((s: any) => s.objects)).filter((o: any) => o.type === type)
  }

  test("a new bar is M; a typed thickness is Custom, Snap and a step put it back", async ({ page }) => {
    await knobProject(page)
    await draw(page, "Bar", [60, 160], [300, 200])
    const size = page.locator("#sizeStep")
    await expect(size).toHaveValue("m")
    let [bar] = await objectsOf(page, "bar")
    expect(bar.properties).toMatchObject({ sizeStep: "m", thickness: 23 })

    await page.locator("#thickness").fill("20")
    await page.locator("#thickness").blur()
    await expect(size.locator("option:checked")).toHaveText("Custom (20 px)")
    ;[bar] = await objectsOf(page, "bar")
    expect(bar.properties.sizeStep).toBeUndefined()
    await page.getByRole("button", { name: "Snap to M" }).click()
    await size.selectOption("s")
    ;[bar] = await objectsOf(page, "bar")
    expect(bar.properties).toMatchObject({ sizeStep: "s", thickness: 14 })
  })

  test("a stepped slider resizes only along its length", async ({ page }) => {
    await knobProject(page)
    await draw(page, "Slider", [60, 160], [260, 200])
    const [before] = await objectsOf(page, "slider")
    expect(before.properties.sizeStep).toBe("m")
    // The bottom-right corner, dragged right and down.
    await drag(page, [before.x + before.width, before.y + before.height], [before.x + before.width + 40, before.y + before.height + 40])
    const [after] = await objectsOf(page, "slider")
    expect(after.width).toBeGreaterThan(before.width)
    expect({ y: after.y, height: after.height }).toEqual({ y: before.y, height: before.height })
    expect(after.properties.sizeStep).toBe("m")
  })

  test("a stepped dial resizes on its track's grid; a switch lands on a step", async ({ page }) => {
    await knobProject(page)
    await draw(page, "Dial", [80, 80], [200, 200])
    const [dial] = await objectsOf(page, "dial")
    const grid = 2 * dial.properties.thickness
    expect(dial.width % grid).toBe(0)
    await drag(page, [dial.x + dial.width, dial.y + dial.height], [dial.x + dial.width + grid - 5, dial.y + dial.height + grid - 5])
    const [bigger] = await objectsOf(page, "dial")
    expect(bigger.width).toBe(dial.width + grid)
    expect(bigger.height).toBe(bigger.width)

    await draw(page, "Switch", [60, 260], [260, 300])
    const [sw] = await objectsOf(page, "switch")
    expect(sw).toMatchObject({ height: 63, properties: { sizeStep: "m" } })
    // Dragged 20 px taller: 83 is nearest L's 87.
    await drag(page, [sw.x + sw.width, sw.y + sw.height], [sw.x + sw.width, sw.y + sw.height + 20])
    const [tall] = await objectsOf(page, "switch")
    expect(tall).toMatchObject({ height: 87, properties: { sizeStep: "l" } })
  })
})

// Task 9b in the panel: the same field on a button group made before the
// scale.
test.describe("a control's size step", () => {
  test("a button group from before the scale is Custom; Snap and a step set its height", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await loadProject(page, SWITCH_TEST_PROJECT)
    await objectTreeRow(page, "obj-switch-1").click()
    const size = page.locator("#sizeStep")
    // 50 px on the Knob (7.88 px/mm: S 47, M 63, L 87).
    await expect(size.locator("option:checked")).toHaveText("Custom (50 px)")
    await page.getByRole("button", { name: "Snap to S" }).click()
    await expect(size).toHaveValue("s")
    const group = async () => {
      const project = await downloadProject(page)
      return project.screens.flatMap((sc: any) => sc.objects).find((o: any) => o.id === "obj-switch-1")
    }
    expect(await group()).toMatchObject({ height: 47, width: 220, properties: { sizeStep: "s" } })
    await size.selectOption("l")
    const large = await group()
    expect(large).toMatchObject({ height: 87, properties: { sizeStep: "l" } })
    expect(large.width).toBeGreaterThanOrEqual(220)
  })
})

// Task T1 of the typography appendix: a glyph wider than 32 px. BDFFont read
// each bitmap row into one number and tested it with `>>`, which works on
// 32 bits, so the left part of a wider glyph was lost - FreeUniversal 42's
// "D", every digit of the seven-segment DSEG7 (2026-09-30).
test.describe("a BDF glyph of any width", () => {
  function bdfWith(width: number, rows: string[]): string {
    return [
      "STARTFONT 2.1",
      "FONT test",
      "SIZE 10 75 75",
      `FONTBOUNDINGBOX ${width} ${rows.length} 0 0`,
      "STARTPROPERTIES 2",
      `FONT_ASCENT ${rows.length}`,
      "FONT_DESCENT 0",
      "ENDPROPERTIES",
      "CHARS 1",
      "STARTCHAR A",
      "ENCODING 65",
      `DWIDTH ${width} 0`,
      `BBX ${width} ${rows.length} 0 0`,
      "BITMAP",
      ...rows,
      "ENDCHAR",
      "ENDFONT",
    ].join("\n")
  }

  // The pixels a glyph draws, read off a stand-in for the canvas.
  function pixels(bdf: string): string[] {
    const drawn: string[] = []
    const ctx = { fillRect: (x: number, y: number) => drawn.push(`${x},${y}`) } as unknown as CanvasRenderingContext2D
    new BDFFont(bdf).drawChar(ctx, 65, 0, 1)
    return drawn.sort()
  }

  test("a 50 px row draws all its pixels, the leftmost one to the right of the origin as always", () => {
    // 50 px, padded to 56 bits: the first and the last pixel, and one in the
    // middle past bit 32.
    const row = (bits: number[]) => {
      const cells = Array.from({ length: 56 }, (_, i) => (bits.includes(i) ? "1" : "0")).join("")
      return cells.match(/.{4}/g)!.map((n) => parseInt(n, 2).toString(16).toUpperCase()).join("")
    }
    const drawn = pixels(bdfWith(50, [row([0, 20, 49])]))
    // The leftmost pixel lands at x = 1: the one-pixel shift the designer and
    // the firmware's BdfFont share on purpose.
    expect(drawn).toEqual(["1,0", "21,0", "50,0"].sort())
  })

  test("a narrow glyph draws exactly as before", () => {
    // An 8 px row, 0b10000001: x = 1 and x = 8, as the 32-bit code drew it.
    expect(pixels(bdfWith(8, ["81"]))).toEqual(["1,0", "8,0"].sort())
    // A 12 px row padded to 16 bits.
    expect(pixels(bdfWith(12, ["F010"]))).toEqual(["1,0", "2,0", "3,0", "4,0", "12,0"].sort())
  })
})
