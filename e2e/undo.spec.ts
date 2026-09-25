import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"
import mqtt from "mqtt"
import {
  pressDeploy,
  createProject,
  COMBINED_TEST_PROJECT,
  ROUND_FIXTURE_DEVICE_ID,
  chooseDevice,
  createScreen,
  devicePoint,
  getMainCanvas,
  loadProject,
  objectTreeRow,
  openFrameSection,
  saveProjectAs,
  waitForDeviceGate,
  waitForEditorReady,
} from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

// Undo and redo (docs/2026-09-23-undo.md, issue #5). Driven through the real
// keys and the real delete paths - canvas Delete, the screens panel menu,
// the Topics tab - because history records whatever the editor commits, and
// only the real paths show whether a change lands as the one step the user
// made.
//
// COMBINED_TEST_PROJECT's first screen stacks text objects down its left
// edge: obj-4 at y 9-25, obj-5 at y 25-48.

const OBJ_4 = { x: 100, y: 15 }
const OBJ_5 = { x: 100, y: 35 }

async function deleteOnCanvas(page: Page, at: { x: number; y: number }): Promise<void> {
  const { box } = await getMainCanvas(page)
  const point = devicePoint(box, at.x, at.y)
  await page.mouse.click(point.x, point.y)
  await page.keyboard.press("Delete")
}

// The object tree lists objects in drawing order, so its data-object-id
// sequence is what "put back at the same position" is checked against.
async function treeOrder(page: Page): Promise<string[]> {
  return page.locator("[data-object-id]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-object-id")!))
}

// The object tree highlights selected rows (object-tree-panel.tsx), which
// is the one place a multi-selection can be read from outside.
async function selectedIds(page: Page): Promise<string[]> {
  return page
    .locator("[data-object-id]")
    .evaluateAll((rows) => rows.filter((r) => r.classList.contains("bg-primary/15")).map((r) => r.getAttribute("data-object-id")!))
}

async function screenOrder(page: Page): Promise<string[]> {
  return page.locator("[data-screen-id]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-screen-id")!))
}

test.describe("Undo and redo", () => {
  test.beforeEach(async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
  })

  test("a deleted object comes back with its id and drawing-order place, and goes again on redo", async ({ page }) => {
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    const before = await treeOrder(page)

    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    expect(await treeOrder(page)).toEqual(before)

    await page.keyboard.press("ControlOrMeta+y")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    // The other redo chord does the same.
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    await page.keyboard.press("ControlOrMeta+Shift+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)
  })

  test("a deleted screen comes back in its place", async ({ page }) => {
    const before = await screenOrder(page)
    const row = page.locator('[data-screen-id="screen-box-black"]')
    await row.hover()
    await row.locator("button").last().click()
    await page.getByRole("menuitem", { name: "Delete" }).click()
    await expect(row).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(row).toHaveCount(1)
    expect(await screenOrder(page)).toEqual(before)
  })

  // The editor looks the current screen up with a non-null assertion; undoing
  // the screen it stands on must move it off first, not crash the page.
  test("undoing a new screen while it is shown moves to a screen that exists", async ({ page }) => {
    const before = await screenOrder(page)
    await createScreen(page, "undo-me", false)
    await expect(page.locator("[data-screen-id]")).toHaveCount(before.length + 1)

    await page.keyboard.press("ControlOrMeta+z")
    expect(await screenOrder(page)).toEqual(before)
    await expect(page.getByRole("button", { name: "File" })).toBeVisible()
    await getMainCanvas(page)
  })

  test("a deleted topic comes back", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "Topics", exact: true }).click()
    const deletes = dialog.getByRole("button", { name: "Delete", exact: true })
    const count = await deletes.count()
    expect(count).toBeGreaterThan(0)

    await deletes.first().click()
    await expect(deletes).toHaveCount(count - 1)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(deletes).toHaveCount(count)
    await expect(dialog.getByText("Freshwater/Level").first()).toBeVisible()
  })

  test("a new edit after undo throws away what could have been redone", async ({ page }) => {
    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)

    await deleteOnCanvas(page, OBJ_5)
    await expect(objectTreeRow(page, "obj-5")).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+y")
    // Nothing to redo: obj-4 stays, obj-5 stays deleted.
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    await expect(objectTreeRow(page, "obj-5")).toHaveCount(0)
  })

  test("Ctrl+Z inside a text field is the field's own, not the project's", async ({ page }) => {
    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.locator("input:visible").first().focus()
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    // Out of the field, the same key undoes the delete.
    const { box } = await getMainCanvas(page)
    const empty = devicePoint(box, -20, -20)
    await page.mouse.click(empty.x, empty.y)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
  })

  // A drag commits on every mousemove. One Ctrl+Z has to take the whole drag
  // back - were each move its own step, it would only go back one move.
  test("a drag is one step", async ({ page }) => {
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, OBJ_4.x, OBJ_4.y)
    await page.mouse.click(from.x, from.y)
    await openFrameSection(page)
    const x = page.locator("#x")
    const y = page.locator("#y")
    await expect(x).toHaveValue("11")
    await expect(y).toHaveValue("9")

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 80, from.y + 60, { steps: 15 })
    await page.mouse.up()
    await expect(x).toHaveValue("91")
    await expect(y).toHaveValue("69")

    await page.keyboard.press("ControlOrMeta+z")
    await expect(x).toHaveValue("11")
    await expect(y).toHaveValue("9")

    await page.keyboard.press("ControlOrMeta+y")
    await expect(x).toHaveValue("91")
    await expect(y).toHaveValue("69")
  })

  // Creating by drag commits on mouse down, on every move and on mouse up;
  // resizing on every move. The mouse-up commit is the one most at risk of
  // landing after the gesture closed.
  test("creating an object by drag and resizing it by a handle are one step each", async ({ page }) => {
    const rows = page.locator("[data-object-id]")
    const count = await rows.count()
    const { box } = await getMainCanvas(page)

    await page.getByRole("button", { name: "Bar" }).first().click()
    const start = devicePoint(box, 330, 200)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 50, start.y + 60, { steps: 10 })
    await page.mouse.up()
    await expect(rows).toHaveCount(count + 1)

    await openFrameSection(page)
    const x = page.locator("#x")
    const width = page.locator("#width")
    const x0 = await x.inputValue()
    const width0 = await width.inputValue()
    const y0 = await page.locator("#y").inputValue()

    const corner = devicePoint(box, Number(x0), Number(y0))
    await page.mouse.move(corner.x, corner.y)
    await page.mouse.down()
    await page.mouse.move(corner.x - 20, corner.y - 20, { steps: 10 })
    await page.mouse.up()
    await expect(width).not.toHaveValue(width0)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(x).toHaveValue(x0)
    await expect(width).toHaveValue(width0)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(rows).toHaveCount(count)
  })

  test("a click, or a drag back to where it started, is not a step", async ({ page }) => {
    await deleteOnCanvas(page, OBJ_5)
    await expect(objectTreeRow(page, "obj-5")).toHaveCount(0)

    // Selecting obj-4 by clicking it runs through the same mouse-down/up
    // path as a drag, just without moving.
    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, OBJ_4.x, OBJ_4.y)
    await page.mouse.click(at.x, at.y)
    await page.mouse.click(at.x, at.y)

    // A drag away and back to the same pixel did commit changes, but ends
    // where it began - nothing the user would want to undo.
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x + 40, at.y + 30, { steps: 5 })
    await page.mouse.move(at.x, at.y, { steps: 5 })
    await page.mouse.up()

    // So the first Ctrl+Z still reaches the delete.
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-5")).toHaveCount(1)
  })

  // The property panel writes the project on every keystroke. Keystrokes into
  // one field are one step until it loses focus or the typing pauses for 1 s.
  // Colours are picked from a palette, not typed, so every pick is a step of
  // its own anyway. Blurred with el.blur() rather than a click elsewhere, which
  // would move the selection and take the field off the panel.
  test("typing into a field is one step per field edit", async ({ page }) => {
    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, OBJ_4.x, OBJ_4.y)
    await page.mouse.click(at.x, at.y)
    const text = page.locator("#text")
    const old = await text.inputValue()

    await text.click()
    await text.press("ControlOrMeta+a")
    await text.pressSequentially("Hello undo", { delay: 30 })
    await text.evaluate((el) => (el as HTMLElement).blur())
    await expect(text).toHaveValue("Hello undo")

    await page.keyboard.press("ControlOrMeta+z")
    await expect(text).toHaveValue(old)
    await page.keyboard.press("ControlOrMeta+y")
    await expect(text).toHaveValue("Hello undo")
  })

  test("a pause in typing, or another field, starts a new step", async ({ page }) => {
    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, OBJ_4.x, OBJ_4.y)
    await page.mouse.click(at.x, at.y)
    await openFrameSection(page)
    const text = page.locator("#text")
    const x = page.locator("#x")
    const oldText = await text.inputValue()
    const oldX = await x.inputValue()

    await text.click()
    await text.press("ControlOrMeta+a")
    await text.pressSequentially("abc", { delay: 30 })
    await page.waitForTimeout(1300)
    await text.pressSequentially("def", { delay: 30 })

    await x.click()
    await x.press("ControlOrMeta+a")
    await x.pressSequentially("42", { delay: 30 })
    await x.evaluate((el) => (el as HTMLElement).blur())
    await expect(x).toHaveValue("42")

    await page.keyboard.press("ControlOrMeta+z")
    await expect(x).toHaveValue(oldX)
    await expect(text).toHaveValue("abcdef")
    await page.keyboard.press("ControlOrMeta+z")
    await expect(text).toHaveValue("abc")
    await page.keyboard.press("ControlOrMeta+z")
    await expect(text).toHaveValue(oldText)
  })

  // Undo happens in front of the user: on the screen the step was made on,
  // with the selection it was made with.
  test("undo goes back to the screen the change was made on", async ({ page }) => {
    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.locator('[data-screen-id="screen-3"] button').first().click()
    await expect(objectTreeRow(page, "obj-17")).toHaveCount(1)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    await expect(objectTreeRow(page, "obj-17")).toHaveCount(0)
    expect(await selectedIds(page)).toEqual(["obj-4"])
  })

  test("undoing a delete of two objects selects exactly those two again", async ({ page }) => {
    const { box } = await getMainCanvas(page)
    const four = devicePoint(box, OBJ_4.x, OBJ_4.y)
    const five = devicePoint(box, OBJ_5.x, OBJ_5.y)
    await page.mouse.click(four.x, four.y)
    await page.keyboard.down("Shift")
    await page.mouse.click(five.x, five.y)
    await page.keyboard.up("Shift")
    expect((await selectedIds(page)).sort()).toEqual(["obj-4", "obj-5"])
    await page.keyboard.press("Delete")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)
    await expect(objectTreeRow(page, "obj-5")).toHaveCount(0)

    // Select something else first, so the reselection is the undo's doing.
    const other = devicePoint(box, 100, 125)
    await page.mouse.click(other.x, other.y)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-5")).toHaveCount(1)
    expect((await selectedIds(page)).sort()).toEqual(["obj-4", "obj-5"])
  })

  test("undoing a paste restores the selection before it; redo selects the pasted object", async ({ page }) => {
    const rows = page.locator("[data-object-id]")
    const count = await rows.count()
    const { box } = await getMainCanvas(page)
    const at = devicePoint(box, OBJ_4.x, OBJ_4.y)
    await page.mouse.click(at.x, at.y)
    await page.keyboard.press("ControlOrMeta+c")
    await page.keyboard.press("ControlOrMeta+v")
    await expect(rows).toHaveCount(count + 1)
    const pasted = await selectedIds(page)
    expect(pasted).toHaveLength(1)
    expect(pasted[0]).not.toBe("obj-4")

    await page.keyboard.press("ControlOrMeta+z")
    await expect(rows).toHaveCount(count)
    expect(await selectedIds(page)).toEqual(["obj-4"])

    await page.keyboard.press("ControlOrMeta+y")
    await expect(rows).toHaveCount(count + 1)
    expect(await selectedIds(page)).toEqual(pasted)
  })

  test("undo does nothing in preview", async ({ page }) => {
    await deleteOnCanvas(page, OBJ_4)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.getByRole("button", { name: "Preview" }).click()
    await expect(page.getByRole("button", { name: "Exit Preview" })).toBeVisible()
    await page.keyboard.press("ControlOrMeta+z")
    await page.getByRole("button", { name: "Exit Preview" }).click()
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
  })
})

// A load, a new project or a restore replaces the project wholesale; undo
// must not reach back across it into the project before (in the worst case
// the empty default one the editor starts with).
test.describe("Undo across loads", () => {
  test("after an upload there is nothing to undo", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    await expect(page.getByRole("button", { name: "File" })).toBeVisible()
  })

  test("after New Project and a device from the gate there is nothing to undo", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")

    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "New Project" }).click()
    // The uploaded project was never saved, so leaving it asks first.
    await page.getByRole("button", { name: "Don't Save" }).click()
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)

    // Neither back to the device-less project (the gate would return) nor
    // to the one loaded before it.
    await page.keyboard.press("ControlOrMeta+z")
    await page.keyboard.press("ControlOrMeta+z")
    await expect(page.getByRole("heading", { name: "Welcome to Schaltli" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "File" })).toBeVisible()
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)
  })

  // What replaced "after restoring an autosave" (the autosave went on
  // 2026-09-24, docs/2026-09-23-explicit-save.md): opening a saved project
  // from the Projects panel is a load, and leaves nothing to undo.
  test("after opening a saved project from the Projects panel there is nothing to undo", async ({ page }, testInfo) => {
    const suffix = `${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
    const first = `e2e undo first ${suffix}`
    const second = `e2e undo second ${suffix}`
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, first)
    // Save As "second", which is then open; an edit there, then back to
    // "first" from the panel.
    await page.keyboard.press("ControlOrMeta+Shift+s")
    await page.locator("#save-project-name").fill(second)
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByTestId("project-title")).toHaveText(second, { timeout: 20_000 })
    await deleteOnCanvas(page, OBJ_4)
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByTestId("project-title")).toHaveText(second)

    await page.locator(`[data-project-name="${first}"]`).click()
    await expect(page.getByTestId("project-title")).toHaveText(first)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)

    await page.keyboard.press("ControlOrMeta+z")
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    await expect(page.getByTestId("project-title")).toHaveText(first)
    await page.request.delete(`/api/projects/${encodeURIComponent(first)}`)
    await page.request.delete(`/api/projects/${encodeURIComponent(second)}`)
  })

  // Restoring a version that lacks the screen being shown used to leave the
  // editor on a screen that no longer existed, and currentScreen's non-null
  // assertion crashed the page. The version is posted straight to the API
  // here, with that screen taken out, rather than made in the editor.
  test("restoring a version without the screen being shown moves off it", async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on("pageerror", (err) => errors.push(err.message))

    const name = `e2e undo restore ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
    const url = `/api/projects/${encodeURIComponent(name)}`
    await loadProject(page, COMBINED_TEST_PROJECT)
    await saveProjectAs(page, name)
    const saved = (await (await page.request.get(url)).json()).project
    const version = { ...saved, screens: saved.screens.filter((s: { id: string }) => s.id !== "screen-3") }
    expect((await page.request.post(`${url}/versions`, { data: version })).ok()).toBe(true)

    await page.locator('[data-screen-id="screen-3"] button').first().click()
    await expect(objectTreeRow(page, "obj-17")).toHaveCount(1)

    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Version History" }).click()
    // The newest version is the one posted above.
    await page.getByRole("button", { name: "Restore" }).first().click()
    await expect(page.getByRole("heading", { name: "Version History" })).not.toBeVisible({ timeout: 20_000 })
    await page.keyboard.press("Escape")

    await expect(page.locator('[data-screen-id="screen-3"]')).toHaveCount(0)
    await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)
    await expect(page.getByRole("button", { name: "File" })).toBeVisible()
    expect(errors).toEqual([])
    await page.request.delete(url)
  })

  // Deploy binds the project to the device it went to. That is no step - the
  // first Ctrl+Z after it reaches the edit before - and no undo takes the
  // binding away (decided 2026-09-23). Since 2026-09-24 the deploy saves
  // first, and that is no step either. The deployed version is then restored
  // from Version History, which clears history like a load.
  // Needs the local broker (npm run hil:broker), as version-history.spec.ts.
  test("deploy is no step and keeps its binding; a restored version clears history", async ({ page }, testInfo) => {
    // Save, deploy, save again, Version History, restore: more round trips
    // than 60 s allows under a full parallel run (2026-09-24).
    test.setTimeout(120_000)
    const epaperId = `e2e-undo-${testInfo.testId}`
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-undo-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${epaperId}/hello`,
        JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Undo Test ${epaperId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "online", { retain: true })

      await loadProject(page, COMBINED_TEST_PROJECT)
      await deleteOnCanvas(page, OBJ_4)
      await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await page.getByText(`Undo Test ${epaperId}`).click()
      const marked = page.waitForResponse(
        (res) => /\/api\/projects\/.+\/deploys$/.test(res.url()) && res.request().method() === "POST",
      )
      const name = await pressDeploy(page)
      await marked
      // Deploy dialog, then the File menu it was opened from (see
      // version-history.spec.ts for why that menu is still open).
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")

      await page.keyboard.press("ControlOrMeta+z")
      await expect(objectTreeRow(page, "obj-4")).toHaveCount(1)

      // Saved now, the undone project still carries the binding.
      await page.keyboard.press("ControlOrMeta+s")
      await expect(page.getByTestId("project-title")).toHaveText(name)
      const saved = (await (await page.request.get(`/api/projects/${encodeURIComponent(name)}`)).json()).project
      expect(saved.screens[0].objects.some((o: { id: string }) => o.id === "obj-4")).toBe(true)
      expect(saved.settings.boundInstanceId).toBe(epaperId)

      // The deployed version is the older one, without obj-4.
      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Version History" }).click()
      const entries = page.getByRole("list", { name: "Versions" }).getByRole("listitem")
      await expect(entries).toHaveCount(2, { timeout: 20_000 })
      await expect(entries.nth(1)).toContainText(`Deployed to Undo Test ${epaperId}`)
      await entries.nth(1).getByRole("button", { name: "Restore" }).click()
      // Generous: the restore fetches a route `next dev` may be compiling for
      // the first time, and under a parallel run that outlasted the 5 s
      // default (2026-09-23) - the dialog sat on its spinner, nothing failed.
      await expect(page.getByRole("heading", { name: "Version History" })).not.toBeVisible({ timeout: 20_000 })
      await page.keyboard.press("Escape")
      await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)

      await page.keyboard.press("ControlOrMeta+z")
      await expect(objectTreeRow(page, "obj-4")).toHaveCount(0)
    } finally {
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${epaperId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })
})
