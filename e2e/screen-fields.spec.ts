import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { createProject, chooseDevice, ROUND_FIXTURE_DEVICE_ID, getMainCanvas, devicePoint, waitForDeviceGate, waitForEditorReady, loadProject } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { withScreenFields } from "../lib/screen-fields"
import { mergeMasterAndScreenObjects } from "../lib/object-order"
import { placeholdersToLiveValues } from "../lib/live-value"
import { DEFAULT_SEPARATORS } from "../lib/placeholders"
import { referenceEntries } from "../lib/placeholder-completion"
import { projectUsesLivePlaceholders } from "../lib/render-screen"

// A master that shows the screen it is drawn on (asked 2026-10-28): a text's
// {screen:name} chip and an icon set to «Screen» are written in per screen
// where the master's objects are merged in (lib/screen-fields.ts), so the
// canvas, the thumbnails and every export show each screen's own name and
// icon, and no device has to know the screen namespace.

const text = (id: string, stored: string, liveValues: unknown[]): any => ({ id, type: "text", x: 0, y: 0, width: 100, height: 20, zIndex: 1, properties: { text: stored, liveValues } })
const screenName = { id: "lv1", source: { namespace: "screen", path: "name" }, rules: [] }
const topicValue = { id: "lv2", source: { namespace: "topic", path: "van/temp" }, rules: [] }
const icon = (properties: Record<string, unknown>): any => ({ id: "i", type: "icon", x: 0, y: 0, width: 24, height: 24, zIndex: 1, properties })

test.describe("Screen fields, written in", () => {
  test("a {screen:name} chip becomes the screen's name, braces doubled, other chips kept", () => {
    const [out] = withScreenFields([text("t", "{live:lv1} · {live:lv2} °C", [screenName, topicValue])], { name: "Licht {1}" })
    expect(out.properties.text).toBe("Licht {{1}} · {live:lv2} °C")
    expect(out.properties.liveValues).toEqual([topicValue])
  })

  test("typed as a placeholder, {screen:name} becomes a chip that reads the screen", () => {
    const { text: stored, liveValues } = placeholdersToLiveValues("{screen:name}", [], DEFAULT_SEPARATORS)
    expect(stored).toBe("{live:lv1}")
    expect(liveValues[0].source).toEqual({ namespace: "screen", path: "name" })
    expect(referenceEntries("screen", []).map((e) => e.reference)).toEqual(["screen:name"])
  })

  test("an icon set to Screen shows the screen's icon, fixed or live, and its own where the screen has none", () => {
    const fromScreen = icon({ screenIcon: true, assetId: "stand-in" })
    expect(withScreenFields([fromScreen], { name: "A", iconAssetId: "bulb" })[0].properties).toEqual({ assetId: "bulb" })
    const live = { id: "lv9", source: { namespace: "topic", path: "x" }, rules: [], otherwise: { kind: "icon", icon: "drop" } } as any
    expect(withScreenFields([fromScreen], { name: "A", iconAssetId: "drop", iconLive: live })[0].properties).toEqual({ assetId: "drop", liveIconId: "lv9", liveValues: [live] })
    expect(withScreenFields([fromScreen], { name: "Master 1" })[0].properties).toEqual({ assetId: "stand-in" })
  })

  test("a live icon that reads the screen's name is decided per screen", () => {
    const rules = [{ op: "==", operand: "Licht", result: { kind: "icon", icon: "bulb" } }]
    const lv = { id: "lv1", source: { namespace: "screen", path: "name" }, rules, otherwise: { kind: "icon", icon: "dot" } }
    const obj = icon({ liveIconId: "lv1", liveValues: [lv] })
    expect(withScreenFields([obj], { name: "Licht" })[0].properties).toEqual({ assetId: "bulb" })
    expect(withScreenFields([obj], { name: "Wasser" })[0].properties).toEqual({ assetId: "dot" })
  })

  test("nested objects are reached, and objects without a screen field are left as they are", () => {
    const group: any = { id: "g", type: "group", x: 0, y: 0, width: 100, height: 40, zIndex: 1, properties: {}, children: [text("t", "{live:lv1}", [screenName])] }
    expect(withScreenFields([group], { name: "Licht" })[0].children![0].properties.text).toBe("Licht")
    const plain = [text("p", "Hallo", [])]
    expect(withScreenFields(plain, { name: "Licht" })).toBe(plain)
    // The merge writes them in once it knows the screen.
    expect(mergeMasterAndScreenObjects([text("m", "{live:lv1}", [screenName])], [], { name: "Wasser" })[0].properties.text).toBe("Wasser")
  })

  test("a screen's name asks nothing of a device", () => {
    expect(projectUsesLivePlaceholders({ screens: [{ objects: [text("t", "{live:lv1}", [screenName])] }] })).toBe(false)
  })
})

async function downloadZipProjectJson(page: Page, menuItemName: string): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: menuItemName }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  const project = JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  // «Export Project» keeps the File menu open (label-placeholders.spec.ts).
  await page.keyboard.press("Escape")
  return project
}

const svg = (shape: string) => "data:image/svg+xml;base64," + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${shape}</svg>`).toString("base64")

test.describe("Screen fields in the export", () => {
  test.beforeEach(async () => {
    test.skip(!(await seedRoundFixtureDdf()), "schaltli-firmware not checked out alongside this repo")
  })

  test("typed into a text, {screen:name} reaches the device as the screen's name", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)

    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    await page.waitForTimeout(150)
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 20, 20)
    const to = devicePoint(box, 180, 60)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(200)
    await page.locator("#text").fill("{screen:name}!")

    const deviceProject = await downloadZipProjectJson(page, "Export Project")
    const deviceText = deviceProject.screens.find((s: any) => s.name === "Screen 1").objects.find((o: any) => o.type === "text")
    expect(deviceText.properties.text).toBe("Screen 1!")
  })

  test("a master's header shows each screen's name and icon, its stand-in where a screen has none", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
    const saved = await downloadZipProjectJson(page, "Download Project")

    saved.assets = [
      ...(saved.assets ?? []),
      { id: "bulb", name: "bulb", type: "icon", data: svg('<circle cx="12" cy="12" r="9" fill="#000"/>') },
      { id: "sq", name: "sq", type: "icon", data: svg('<rect x="2" y="2" width="20" height="20" fill="#000"/>') },
    ]
    const master = saved.screens.find((s: any) => s.isMaster)
    const first = saved.screens.find((s: any) => !s.isMaster)
    master.objects.push(
      { ...text("head", "{live:lv1}", [screenName]), x: 80, y: 40, width: 200, height: 30, properties: { ...text("", "{live:lv1}", [screenName]).properties, color: "#000000" } },
      { ...icon({ screenIcon: true, assetId: "sq" }), x: 40, y: 40 },
    )
    first.name = "Licht"
    first.iconAssetId = "bulb"
    saved.screens.push({ ...first, id: "screen-wasser", name: "Wasser", iconAssetId: undefined, objects: [] })
    const zip = new JSZip()
    zip.file("project.json", JSON.stringify(saved))
    const file = path.join(os.tmpdir(), `screen-fields-${Date.now()}.zip`)
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    await loadProject(page, file)

    const deviceProject = await downloadZipProjectJson(page, "Export Project")
    const on = (name: string) => deviceProject.screens.find((s: any) => s.name === name).objects
    expect(on("Licht").find((o: any) => o.id === "head").properties.text).toBe("Licht")
    expect(on("Wasser").find((o: any) => o.id === "head").properties.text).toBe("Wasser")
    const iconOf = (name: string) => on(name).find((o: any) => o.id === "i").properties
    expect(iconOf("Licht").assetId).toBe("bulb")
    expect(iconOf("Licht").screenIcon).toBeUndefined()
    expect(iconOf("Wasser").assetId).toBe("sq")

    // On the master, the icon's panel says where it comes from, and Fixed
    // takes it back to its own.
    await page.locator("[data-screen-id]").filter({ hasText: master.name }).first().click()
    await page.locator('[data-object-id="i"]').first().click()
    await expect(page.getByRole("radio", { name: "Screen" })).toHaveAttribute("aria-checked", "true")
    await expect(page.getByText("Each screen shows its own icon here.")).toBeVisible()
    await page.getByRole("radio", { name: "Fixed" }).click()
    const fixed = await downloadZipProjectJson(page, "Export Project")
    expect(fixed.screens.find((s: any) => s.name === "Licht").objects.find((o: any) => o.id === "i").properties.assetId).toBe("sq")

    // Set to Screen, an icon without a colour takes the text's, so that it
    // turns light on a dark theme as the navigator's icons do.
    await page.getByRole("radio", { name: "Screen" }).click()
    const tinted = await downloadZipProjectJson(page, "Export Project")
    const props = tinted.screens.find((s: any) => s.name === "Licht").objects.find((o: any) => o.id === "i").properties
    expect(props.assetId).toBe("bulb")
    expect(props.iconColor).toMatch(/^#/)
    expect(props.iconColorDark).toMatch(/^#/)
    expect(props.iconColorDark).not.toBe(props.iconColor)
  })
})
