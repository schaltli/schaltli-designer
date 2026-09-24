import { test, expect, type Page } from "@playwright/test"
import {
  createProject,
  getMainCanvas,
  getSelectedHeader,
  chooseDevice,
  waitForDeviceGate,
  waitForEditorReady,
  devicePoint,
  openFrameSection,
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
  await page.getByRole("button", { name: "Gauge", exact: true }).first().click()
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
        manifest.supportedObjectTypes = manifest.supportedObjectTypes.filter((type: string) => !["arc-level", "gauge", "dial"].includes(type))
      },
    })),
    "schaltli-firmware not checked out alongside this repo",
  )

  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, ARC_UNSUPPORTED_DEVICE_ID, "auto-discovered")
  await createProject(page)
  await waitForEditorReady(page)

  // Not shown-disabled: a type the device does not declare leaves the toolbar
  // entirely (docs/2026-09-20-control-split.md, decision 11). Both halves of
  // the round level go, since the DDF declares neither.
  await expect(page.getByRole("button", { name: "Gauge", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Dial", exact: true })).toHaveCount(0)
  // The straight level is still declared, so the toolbar is not simply empty.
  await expect(page.getByRole("button", { name: "Bar", exact: true }).first()).toBeVisible()
})

test.describe("on a device that declares it", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await seedWaveshareDdf({ deviceId: ARC_WAVESHARE_DEVICE_ID })),
      "schaltli-firmware not checked out alongside this repo",
    )
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ARC_WAVESHARE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
  })

  test("the arc tool creates a square object with its own property panel", async ({ page }) => {
    // Deliberately a lopsided drag - twice as wide as it is tall. A ring is
    // inscribed in its box, so the object has to come out square whatever
    // shape the drag was, the same way an icon does.
    await createArcOn(page, [60, 60], [220, 140])

    expect(await getSelectedHeader(page)).toContain("Gauge")

    // One "Size" field rather than a width and a height: the two are always
    // equal, so offering them separately would let someone type an oval the
    // canvas would never produce.
    // In the Frame section since the panel rebuild, which starts closed
    // (docs/2026-09-20-property-panel.md).
    await openFrameSection(page)
    const size = page.getByLabel("Size", { exact: true })
    await expect(size).toBeVisible()
    const value = Number(await size.inputValue())
    expect(value).toBeGreaterThan(0)

    // The height is still shown, because the object has one - but it is
    // read-only and says why, rather than being quietly missing
    // (docs/2026-09-20-property-panel.md: a derived dimension is locked with
    // its reason).
    await expect(page.getByLabel("H", { exact: true })).toHaveAttribute("readonly", "")
    await expect(
      page.locator('[role="note"][aria-label="The ring is inscribed in its box, so the height follows the size."]'),
    ).toBeVisible()

    // And typing a size sets both, so the ring cannot be made an oval here
    // either.
    await size.fill("96")
    await expect(page.getByLabel("H", { exact: true })).toHaveValue("96")

    // The ring can be at most half the object thick: at that point its inner
    // edge is the centre and there is no hole left. The renderer has always
    // clamped there, so a bigger number could be typed in and silently
    // ignored; the field stops at the same place now (2026-09-21).
    const thickness = page.locator("#arcThickness")
    await thickness.fill("999")
    await thickness.blur()
    await expect(thickness).toHaveValue("48")
  })

  // Dragging the scale's own ends, added 2026-09-21 together with the clock
  // face's removal from the panel (docs/2026-09-21-arc-handles.md). Three
  // drags for the three rules the grilling settled on: it snaps to half
  // hours, an end never comes past the other, and growing closes the ring.
  test("the scale's ends are dragged on the ring itself", async ({ page }) => {
    await createArcOn(page, [60, 60], [220, 220])
    await openFrameSection(page)
    const x = Number(await page.getByLabel("X", { exact: true }).inputValue())
    const y = Number(await page.getByLabel("Y", { exact: true }).inputValue())
    const size = Number(await page.getByLabel("Size", { exact: true }).inputValue())
    const thickness = Number(await page.locator("#arcThickness").inputValue())

    // The default is the thermostat shape - half past seven round to half
    // past four - still said in clock positions, which is the one thing the
    // clock face left behind.
    await expect(page.getByText("Min (7:30) to Max (4:30).")).toBeVisible()

    const { box } = await getMainCanvas(page)
    // A point on the ring's outer edge, where a scale end's handle sits, at
    // a given angle - twelve o'clock up and clockwise, the orientation the
    // object stores. `thickness` is read above only to prove the ring is
    // where this arithmetic assumes.
    expect(thickness).toBeGreaterThan(0)
    const onRing = (deg: number) => {
      const r = size / 2
      const rad = ((deg - 90) * Math.PI) / 180
      return devicePoint(
        box,
        x + size / 2 + Math.cos(rad) * r,
        y + size / 2 + Math.sin(rad) * r,
        WAVESHARE_SCREEN,
      )
    }
    // Along the ring, the way a hand moves, rather than straight across the
    // canvas: the drag counts the way round it went, and a straight chord
    // passes near the centre where the angle under the pointer swings
    // wildly. `turn` is signed - positive clockwise.
    const dragEnd = async (fromDeg: number, turn: number) => {
      const from = onRing(fromDeg)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      const steps = Math.max(2, Math.ceil(Math.abs(turn) / 10))
      for (let i = 1; i <= steps; i++) {
        const at = onRing(fromDeg + (turn * i) / steps)
        await page.mouse.move(at.x, at.y)
      }
      await page.mouse.up()
      await page.waitForTimeout(150)
    }

    // 1. It snaps. The max end stands at 135 degrees; dragged 33 degrees
    //    back it lands on a half hour, not where the pointer stopped.
    const angles = async () => ({
      min: Number(await page.getByLabel("Min", { exact: true }).inputValue()),
      max: Number(await page.getByLabel("Max", { exact: true }).inputValue()),
    })

    await dragEnd(135, -33)
    const afterFirst = await angles()
    expect(afterFirst.min).toBe(225)
    expect(afterFirst.max % 15, `max was ${afterFirst.max}`).toBe(0)
    const firstSpan = (((afterFirst.max - afterFirst.min) % 360) + 360) % 360
    expect(firstSpan, `span was ${firstSpan}`).toBe(240)

    // 2. It never comes past the other end. Dragging the max cap backwards
    //    the whole way to where min sits leaves one step of scale standing,
    //    instead of collapsing through zero and coming out as a full ring.
    await dragEnd(afterFirst.max, -260)
    const afterSecond = await angles()
    expect(afterSecond.min).toBe(225)
    const span = (((afterSecond.max - afterSecond.min) % 360) + 360) % 360
    expect(span, `span was ${span}`).toBe(15)

    // 3. Growing closes the ring: the ends meet and the arc becomes a full
    //    one, which is what min === max means.
    await dragEnd(afterSecond.max, 400)
    const afterThird = await angles()
    expect(afterThird.max).toBe(afterThird.min)
    await expect(page.getByText("Min (7:30) to Max (7:30).")).toBeVisible()
  })

  test("resizing keeps it square", async ({ page }) => {
    // The square constraint lives at three call sites (creation preview,
    // creation, resize) behind one shared predicate. Before that predicate
    // existed each site spelled the type list out, so a new square type
    // could be created square and then dragged oval - which looks like a
    // rendering bug rather than a missing case.
    await createArcOn(page, [60, 60], [200, 200])
    await openFrameSection(page)
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
