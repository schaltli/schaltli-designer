import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject, placingFreely } from "./helpers"

// Combined topics in the designer (docs/2026-10-07-live-values.md, decisions
// 10-15; tasks/live-values-todo.md, Task 12): made in Project Settings ›
// Topics, read by a chip like any topic, not deleted while read, renamed with
// every reference, never offered where they would close a circular reference,
// and an export with one is refused.

async function downloadProjectJson(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

async function openTopics(page: Page) {
  await page.getByRole("button", { name: "Settings", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Topics", exact: true }).click()
}

const cards = (page: Page) => page.getByTestId("combined-topic")

// A combined topic named `name`, its first condition set up.
async function addCombined(page: Page, name: string, reads: string, op: string, value?: string) {
  await page.getByRole("button", { name: "Add combined topic" }).click()
  const card = cards(page).last()
  await card.getByLabel("Combined topic name").fill(name)
  await card.getByLabel("Combined topic name").press("Enter")
  await card.getByRole("button", { name: "+ Add condition" }).click()
  await card.getByLabel("Condition 1 reads").selectOption(reads)
  await card.getByLabel("Condition 1 comparison").selectOption(op)
  if (value !== undefined) await card.getByLabel("Condition 1 value").fill(value)
  return card
}

test.describe("combined topics", () => {
  test.beforeEach(async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
  })

  test("made in Topics, read by a chip, not deleted while read, renamed with every reference", async ({ page }) => {
    await openTopics(page)
    await addCombined(page, "frost", "topic:test/fan-setpoint", "<", "50")
    const ruhig = await addCombined(page, "ruhig", "combined:frost", "yes")
    await expect(ruhig.getByLabel("Condition 1 reads")).toHaveValue("combined:frost")
    // frost may not read ruhig: ruhig reads frost.
    await expect(cards(page).first().getByLabel("Condition 1 reads").locator("option", { hasText: "combined:ruhig" })).toHaveCount(0)
    await page.keyboard.press("Escape")

    // A chip reads it like any topic.
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const a = devicePoint(box, 20, 200)
    const b = devicePoint(box, 220, 224)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    // Freely: drawn beside the project's objects, where it would snap.
    await placingFreely(page, async () => {
      await page.mouse.move(b.x, b.y, { steps: 5 })
      await page.mouse.up()
    })
    await page.keyboard.type("Frost: ")
    await page.keyboard.type("{")
    await expect(page.getByRole("group", { name: "Combined" })).toContainText("frost")
    await page.keyboard.type("combined:frost")
    await page.keyboard.press("Enter")
    // At the example (fan-setpoint 45 < 50) frost is yes.
    await expect(page.locator("#text").getByTestId("live-chip")).toContainText("true")
    await page.locator("#text").press("Enter")

    await openTopics(page)
    await cards(page).first().getByRole("button", { name: "Delete" }).click()
    await expect(page.getByTestId("combined-refusal")).toContainText("«frost» is still read by")
    await expect(page.getByTestId("combined-refusal")).toContainText("combined ruhig")
    await expect(cards(page)).toHaveCount(2)

    await cards(page).first().getByLabel("Combined topic name").fill("kalt")
    await cards(page).first().getByLabel("Combined topic name").press("Enter")
    await page.keyboard.press("Escape")

    const project = await downloadProjectJson(page)
    expect(project.combinedTopics.map((ct: any) => ct.name)).toEqual(["kalt", "ruhig"])
    expect(project.combinedTopics[1].conditions[0].source).toEqual({ namespace: "combined", path: "kalt" })
    const text = project.screens.flatMap((s: any) => s.objects).find((o: any) => o.properties?.text?.startsWith("Frost"))
    expect(text.properties.liveValues[0].source).toEqual({ namespace: "combined", path: "kalt" })
  })

  test("a combined topic no one reads is deleted", async ({ page }) => {
    await openTopics(page)
    await addCombined(page, "allein", "topic:test/fan-mode", "==", "OFF")
    await cards(page).first().getByRole("button", { name: "Delete" }).click()
    await expect(cards(page)).toHaveCount(0)
  })
})

test.describe("a circular reference", () => {
  const project = {
    name: "circular",
    screenWidth: 100,
    screenHeight: 50,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [],
    combinedTopics: [
      { id: "c1", name: "nass", mode: "any", conditions: [{ source: { namespace: "combined", path: "glaette" }, op: "yes" }] },
      { id: "c2", name: "glaette", mode: "all", conditions: [{ source: { namespace: "combined", path: "nass" }, op: "yes" }] },
    ],
    screens: [{ id: "s1", name: "S", backgroundColor: "#ffffff", objects: [] }],
  }

  test("the export refuses it, naming the chain", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const error = await page.evaluate(async (p) => {
      try {
        await (window as any).__buildDeviceZipForTest(p)
        return "exported"
      } catch (e) {
        return (e as Error).message
      }
    }, project)
    expect(error).toContain("Circular reference among combined topics: glaette → nass → glaette")
  })
})

// Task 13: the preview computes combined topics from the values it has.
test.describe("a combined topic is drawn", () => {
  const T = (word: string) => ({ kind: "text", parts: [word] })
  const project = {
    name: "glaette",
    screenWidth: 200,
    screenHeight: 40,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [
      { id: "1", topic: "outside_temp", type: "numeric", examples: ["8"] },
      { id: "2", topic: "rain", type: "text", examples: ["false"] },
    ],
    combinedTopics: [
      { id: "c1", name: "frost", mode: "all", conditions: [{ source: { namespace: "topic", path: "outside_temp" }, op: "<", operand: "1" }] },
      { id: "c2", name: "glaette", mode: "all", conditions: [{ source: { namespace: "combined", path: "frost" }, op: "yes" }, { source: { namespace: "topic", path: "rain" }, op: "yes" }] },
    ],
    screens: [
      {
        id: "s1",
        name: "S",
        backgroundColor: "#ffffff",
        objects: [
          {
            id: "t",
            type: "text",
            x: 4,
            y: 4,
            width: 190,
            height: 24,
            zIndex: 1,
            properties: {
              text: "Strasse {live:lv1}",
              textColor: "#000000",
              liveValues: [{ id: "lv1", source: { namespace: "combined", path: "glaette" }, rules: [{ op: "yes", result: T("GLATT") }, { op: "no", result: T("ok") }], noValueYet: T("?") }],
            },
          },
        ],
      },
    ],
  }
  const plain = (text: string) => ({ ...project, combinedTopics: [], screens: [{ ...project.screens[0], objects: [{ ...project.screens[0].objects[0], properties: { text, textColor: "#000000" } }] }] })

  test("from the examples, from test values, and before anything arrived", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const render = (p: unknown, overrides: Record<string, string> = {}) =>
      page.evaluate((req) => (window as any).__renderScreenForTest(req), { project: p, screenIndex: 0, topicOverrides: overrides })
    expect(await render(project)).toBe(await render(plain("Strasse ok")))
    expect(await render(project, { outside_temp: "-2", rain: "true" })).toBe(await render(plain("Strasse GLATT")))
    expect(await render(project, { outside_temp: "-2", rain: "false" })).toBe(await render(plain("Strasse ok")))
    expect(await render(project, { outside_temp: "-2", rain: "" })).toBe(await render(plain("Strasse ?")))
  })
})

// Stage 2 (tasks/ha-templates-stage2-plan.md, S4): a scaled topic made in the
// form - its source's example scaled beside it - read by a chip; a write
// format set on a slider, saved with it.
test.describe("a scaled topic and a write format in the editor", () => {
  test("made in Topics, previewed from its source's example, read by a chip", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await openTopics(page)
    await page.getByRole("button", { name: "Add combined topic" }).click()
    const card = cards(page).last()
    await card.getByLabel("Combined topic name").fill("fahrenheit")
    await card.getByLabel("Combined topic name").press("Enter")
    await card.getByLabel("All or any").selectOption("scale")
    await card.getByLabel("Scaled topic reads").selectOption("topic:test/fan-setpoint")
    for (const [label, value] of [["Times", "9"], ["Divided by", "5"], ["Plus", "32"], ["Decimals", "1"]]) {
      await card.getByLabel(label, { exact: true }).fill(value)
      await card.getByLabel(label, { exact: true }).blur()
    }
    // fan-setpoint's example is 45: 45 × 9 / 5 + 32.
    await expect(card.getByTestId("combined-scale-preview")).toHaveText("45 gives 113.0")
    await expect(card.getByRole("button", { name: "+ Add condition" })).toHaveCount(0)
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const a = devicePoint(box, 20, 200)
    const b = devicePoint(box, 220, 224)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await placingFreely(page, async () => {
      await page.mouse.move(b.x, b.y, { steps: 5 })
      await page.mouse.up()
    })
    await page.keyboard.type("{")
    await expect(page.getByRole("group", { name: "Combined" })).toContainText("fahrenheit")
    await page.keyboard.type("combined:fahrenheit")
    await page.keyboard.press("Enter")
    await expect(page.locator("#text").getByTestId("live-chip")).toContainText("113.0")
    await page.locator("#text").press("Enter")

    const project = await downloadProjectJson(page)
    expect(project.combinedTopics).toEqual([
      expect.objectContaining({
        name: "fahrenheit",
        mode: "scale",
        conditions: [],
        scale: { source: { namespace: "topic", path: "test/fan-setpoint" }, numerator: 9, denominator: 5, offset: "32", decimals: 1 },
      }),
    ])
  })

  test("a slider's «Send as» with its scale, saved with it", async ({ page }) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const base = JSON.parse(await zip.file("project.json")!.async("string"))
    base.topics.push({ id: "t-lamp", topic: "lamp/level", type: "numeric", examples: ["40"] }, { id: "t-lamp-set", topic: "lamp/set", type: "numeric", examples: ["40"] })
    base.screens[0].objects.push({
      id: "lamp",
      type: "slider",
      zIndex: 99,
      x: 40,
      y: 40,
      width: 200,
      height: 40,
      properties: { topic: "lamp/level", writeTopic: "lamp/set", step: 1, barDirection: "left-to-right", calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }] },
    })
    zip.file("project.json", JSON.stringify(base))
    const file = path.join(os.tmpdir(), `send-as-${Date.now()}.zip`)
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    try {
      await loadProject(page, file)
      const { box } = await getMainCanvas(page)
      const at = devicePoint(box, 140, 60)
      await page.mouse.click(at.x, at.y)
      await page.getByLabel("Send as", { exact: true }).fill('{"brightness":{value}}')
      await page.getByLabel("Send times").fill("255")
      await page.getByLabel("Send divided by").fill("100")
      await page.getByLabel("Send decimals").fill("0")
      // The top of its range, 100, as the device would send it.
      await expect(page.getByTestId("write-format-preview")).toHaveText('100 is sent as {"brightness":255}')
      const project = await downloadProjectJson(page)
      const lamp = project.screens[0].objects.find((o: any) => o.id === "lamp")
      expect(lamp.properties.writeFormat).toEqual({ text: '{"brightness":{value}}', numerator: 255, denominator: 100, decimals: 0 })
    } finally {
      fs.unlinkSync(file)
    }
  })

  test("a bar's Topic offers a scaled topic, not a yes/no one, and binds it as combined:<name>", async ({ page }) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const base = JSON.parse(await zip.file("project.json")!.async("string"))
    base.topics.push({ id: "t-wind", topic: "weather/wind", type: "numeric", examples: ["12.5"] })
    base.combinedTopics = [
      { id: "c-kmh", name: "kmh", mode: "scale", conditions: [], scale: { source: { namespace: "topic", path: "weather/wind" }, numerator: 18, denominator: 5, offset: "0", decimals: 1 } },
      { id: "c-windy", name: "windy", mode: "all", conditions: [{ id: "k1", source: { namespace: "topic", path: "weather/wind" }, op: ">", value: "10" }] },
    ]
    base.screens[0].objects.push({
      id: "wind-bar",
      type: "bar",
      zIndex: 99,
      x: 40,
      y: 40,
      width: 200,
      height: 40,
      properties: { topic: "weather/wind", barDirection: "left-to-right", calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }] },
    })
    zip.file("project.json", JSON.stringify(base))
    const file = path.join(os.tmpdir(), `bar-combined-${Date.now()}.zip`)
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    try {
      await loadProject(page, file)
      const { box } = await getMainCanvas(page)
      const at = devicePoint(box, 140, 60)
      await page.mouse.click(at.x, at.y)
      await page.getByRole("combobox", { name: "Topic", exact: true }).click()
      const group = page.getByRole("group", { name: "Combined topics" })
      await expect(group.getByRole("option")).toHaveText(["kmh"])
      await group.getByRole("option", { name: "kmh" }).click()
      await expect(page.getByRole("combobox", { name: "Topic", exact: true })).toContainText("kmhcombined")
      const project = await downloadProjectJson(page)
      expect(project.screens[0].objects.find((o: any) => o.id === "wind-bar").properties.topic).toBe("combined:kmh")
    } finally {
      fs.unlinkSync(file)
    }
  })
})
