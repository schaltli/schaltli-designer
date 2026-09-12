import { test, expect, type Page } from "@playwright/test"
import {
  getMainCanvas,
  getSelectedHeader,
  chooseDevice,
  waitForDeviceGate,
  waitForEditorReady,
  devicePoint,
} from "./helpers"
import { seedWaveshareDdf } from "./ddf-seed"

// The arc-level object end to end through the real editor: gated by the
// device that has to draw it, drawn with the tool, kept square, and
// described in clock positions.
//
// The rasterizer's arithmetic is pinned separately in arc-raster.spec.ts.
// What this file covers is everything the wiring can get wrong while the
// maths stays perfectly correct - a type that draws but has no property
// panel, a square constraint applied at creation but not at resize, a tool
// that commits the wrong type. Adding an object type touches around ten
// places in this app, and missing one of them fails quietly.

// Seeded under an id of this file's own rather than the real
// waveshare-knob-1v8, because the tests below run in parallel
// (playwright.config.ts's fullyParallel) and two of them writing the same
// .data/ddf entry is a race the seeder warns about: the loser reads a DDF
// that has not landed yet, its project is created without arc-level in
// supportedObjectTypes, and the Ring tool comes up disabled - which reads as
// a broken feature rather than as a test racing itself.
const ARC_WAVESHARE_DEVICE_ID = "e2e-arc-waveshare"

// This device's screen, not the combined project's 400x300 - mouse points
// have to be mapped with the size of the screen actually on the canvas, or
// they land somewhere else entirely (see devicePoint's own comment).
const WAVESHARE_SCREEN = { width: 360, height: 360 }

async function createArcOn(page: Page, from: [number, number], to: [number, number]) {
  const { box } = await getMainCanvas(page)
  await page.getByRole("button", { name: "Ring", exact: true }).first().click()
  await page.waitForTimeout(150)
  const a = devicePoint(box, from[0], from[1], WAVESHARE_SCREEN)
  const b = devicePoint(box, to[0], to[1], WAVESHARE_SCREEN)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
}

// Seeded from the real Waveshare DDF with the one type removed, rather than
// pointed at some shipping device that happens to lack it.
//
// It used to load the combined test project, whose device is the e-paper
// board - true when this was written, and false as of 2026-09-12, when that
// firmware learned to draw a ring. The test then failed while nothing it
// covers was broken, which is the failure mode worth avoiding: a gate test
// that depends on some other device staying incapable expires the moment
// that device improves. A device built to lack the type cannot expire.
const ARC_UNSUPPORTED_DEVICE_ID = "e2e-arc-no-ring"

test("a device that does not declare arc-level cannot draw one", async ({ page }) => {
  // The reason this is its own object type rather than a flag on the level
  // indicator: supportedObjectTypes gates by type string, so a device that
  // has never heard of a ring says so in the toolbar instead of accepting
  // the project and quietly drawing a rectangle.
  test.skip(
    !(await seedWaveshareDdf({
      deviceId: ARC_UNSUPPORTED_DEVICE_ID,
      mutateDeviceJson: (manifest) => {
        manifest.supportedObjectTypes = manifest.supportedObjectTypes.filter((type: string) => type !== "arc-level")
      },
    })),
    "screenbee-waveshare-1v8 not checked out alongside this repo",
  )

  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, ARC_UNSUPPORTED_DEVICE_ID, "auto-discovered")
  await page.getByRole("button", { name: "Create Project" }).click()
  await waitForEditorReady(page)

  const ringTool = page.getByRole("button", { name: "Ring", exact: true }).first()
  await expect(ringTool).toBeVisible()
  await expect(ringTool).toBeDisabled()
})

test.describe("on a device that declares it", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await seedWaveshareDdf({ deviceId: ARC_WAVESHARE_DEVICE_ID })),
      "screenbee-waveshare-1v8 not checked out alongside this repo",
    )
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ARC_WAVESHARE_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await waitForEditorReady(page)
  })

  test("the arc tool creates a square object with its own property panel", async ({ page }) => {
    // Deliberately a lopsided drag - twice as wide as it is tall. A ring is
    // inscribed in its box, so the object has to come out square whatever
    // shape the drag was, the same way an icon does.
    await createArcOn(page, [60, 60], [220, 140])

    expect(await getSelectedHeader(page)).toContain("Arc Level")

    // One "Size" field rather than a width and a height: the two are always
    // equal, so offering them separately would let someone type an oval the
    // canvas would never produce.
    const size = page.getByLabel("Size", { exact: true })
    await expect(size).toBeVisible()
    const value = Number(await size.inputValue())
    expect(value).toBeGreaterThan(0)
  })

  test("the scale is described in clock positions, and the presets set both ends", async ({ page }) => {
    await createArcOn(page, [60, 60], [220, 220])

    // The default is the thermostat shape - half past seven round to half
    // past four. Shown as clock positions, because that is how a position on
    // a round face is described; stored as whole degrees, because the
    // rasterizer needs them and no firmware should have to parse "7:30".
    await expect(page.getByText("Min (7:30)")).toBeVisible()
    await expect(page.getByText("Max (4:30)")).toBeVisible()

    await page.getByRole("button", { name: "Halbrund", exact: true }).click()
    await page.waitForTimeout(200)
    await expect(page.getByText("Min (9)")).toBeVisible()
    await expect(page.getByText("Max (3)")).toBeVisible()

    // Both ends on twelve: the ambiguous case, deliberately read as a full
    // ring rather than as an arc of zero length, which is not a thing anyone
    // builds on purpose.
    await page.getByRole("button", { name: "Voll", exact: true }).click()
    await page.waitForTimeout(200)
    await expect(page.getByText("Min (12)")).toBeVisible()
    await expect(page.getByText("Max (12)")).toBeVisible()
  })

  test("resizing keeps it square", async ({ page }) => {
    // The square constraint lives at three call sites (creation preview,
    // creation, resize) behind one shared predicate. Before that predicate
    // existed each site spelled the type list out, so a new square type
    // could be created square and then dragged oval - which looks like a
    // rendering bug rather than a missing case.
    await createArcOn(page, [60, 60], [200, 200])
    const size = page.getByLabel("Size", { exact: true })
    const before = Number(await size.inputValue())

    // Back to the select tool explicitly, rather than trusting that the
    // creation path's own onToolChange("select") has landed. It usually has;
    // under parallel load it sometimes had not, and then pressing down on
    // the handle drew a *second* ring instead of resizing the first - whose
    // smaller size then read as "the square constraint failed" rather than
    // as "the tool was still armed".
    await page.getByRole("button", { name: "Select", exact: true }).first().click()
    await expect(size).toBeVisible()

    // Read where the object actually ended up rather than assuming the drag
    // landed exactly on its start point - under parallel load it need not,
    // and a handle grabbed at a guessed position drags nothing, which reads
    // as "the constraint failed" instead of "the test missed".
    const objX = Number(await page.getByLabel("X", { exact: true }).inputValue())
    const objY = Number(await page.getByLabel("Y", { exact: true }).inputValue())

    const { box } = await getMainCanvas(page)
    // The south-east handle, dragged out horizontally only.
    const handle = devicePoint(box, objX + before, objY + before, WAVESHARE_SCREEN)
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    await page.mouse.move(handle.x + 60, handle.y, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(400)

    // A horizontal-only drag still grows both sides, so the ring stays a
    // ring - the shared isSquareType predicate is reached from the resize
    // path too, not just from creation.
    expect(Number(await size.inputValue())).toBeGreaterThan(before)
  })
})
