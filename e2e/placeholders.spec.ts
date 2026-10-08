import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"
import { DEFAULT_SEPARATORS, bakeProjectFields, parse, referencedTopics, resolve } from "../lib/placeholders"
import { placeholderScope, projectSubscriptionTopics, projectUsesLivePlaceholders } from "../lib/render-screen"
import { PLACEHOLDER_GENERATION, generationBelow } from "../lib/system-generation"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// Placeholders in texts (docs/2026-09-25-text-placeholders.md). The cases are
// data in lib/placeholders/vectors.json, shared with the firmware and the
// Android app, which must turn every text into the same result - so a case
// belongs there, not here.

interface Vector {
  name: string
  text: string
  values?: Record<string, string>
  decimal?: string
  thousands?: string
  expected: string
}

const { cases } = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "lib", "placeholders", "vectors.json"), "utf8"),
) as { cases: Vector[] }

test.describe("placeholder vectors", () => {
  for (const vector of cases) {
    test(vector.name, () => {
      const values = vector.values ?? {}
      const lookup = (ref: { namespace: string; path: string }) => {
        const key = `${ref.namespace}:${ref.path}`
        return key in values ? values[key] : undefined
      }
      const separators = {
        decimal: vector.decimal ?? DEFAULT_SEPARATORS.decimal,
        thousands: vector.thousands ?? DEFAULT_SEPARATORS.thousands,
      }
      expect(resolve(vector.text, lookup, separators)).toBe(vector.expected)
    })
  }
})

// Settings › Number format: a preset or a typed pair, stored as the two
// characters a device reads (docs/2026-09-25-text-placeholders.md).
test.describe("number format", () => {
  async function downloadProjectJson(page: Page): Promise<{ settings: Record<string, unknown> }> {
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const chunks: Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    const zip = await JSZip.loadAsync(Buffer.concat(chunks))
    return JSON.parse(await zip.file("project.json")!.async("string"))
  }

  async function openProperties(page: Page) {
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Project Properties" }).click()
    return page.getByRole("dialog").locator("#numberFormat")
  }

  test("a project saved before has Switzerland's; a preset stores its two characters", async ({ page }) => {
    // The combined test project predates the setting.
    await loadProject(page, COMBINED_TEST_PROJECT)
    const picker = await openProperties(page)
    await expect(picker).toContainText("Switzerland (12'345.68)")

    await picker.click()
    await page.getByRole("option", { name: /^Germany/ }).click()
    await expect(picker).toContainText("Germany (12.345,68)")
    await page.keyboard.press("Escape")

    const { settings } = await downloadProjectJson(page)
    expect(settings.decimalSeparator).toBe(",")
    expect(settings.thousandsSeparator).toBe(".")
  })

  test("Custom stores a typed pair, and refuses the same character twice", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    const picker = await openProperties(page)
    await picker.click()
    await page.getByRole("option", { name: "Custom" }).click()

    const decimal = page.locator("#decimalSeparator")
    const thousands = page.locator("#thousandsSeparator")
    await decimal.fill(".")
    await thousands.fill(" ")
    await expect(page.getByRole("dialog")).toContainText("12 345.68")
    // Still Custom, although nothing else was chosen.
    await expect(picker).toContainText("Custom")

    await thousands.fill(".")
    await expect(page.getByRole("dialog")).toContainText("Decimal and thousands separator must differ.")
    await page.keyboard.press("Escape")

    // The last usable pair is what is stored.
    const { settings } = await downloadProjectJson(page)
    expect(settings.decimalSeparator).toBe(".")
    expect(settings.thousandsSeparator).toBe(" ")
  })
})

// The preview draws texts resolved (task 3). Checked through the headless
// render harness by comparing pictures: a text with a placeholder must come
// out pixel for pixel as the text it should read, so the comparison covers the
// font and the position without reading any text back off a canvas. A level's
// label took placeholders too, until Bar and Slider lost their name
// (2026-09-29).
test.describe("placeholders in the rendered preview", () => {
  const W = 320
  const H = 120

  function project(object: Record<string, unknown>, topics: { topic: string; examples: string[] }[], settings = {}) {
    return {
      name: "Van Sommer 2026",
      screenWidth: W,
      screenHeight: H,
      settings: { colorDepth: "24bit", deviceName: "Waveshare Knob-Touch LCD 1.8", ...settings },
      fonts: [],
      assets: [],
      topics,
      screens: [{ id: "s1", name: "Screen 1", backgroundColor: "#ffffff", objects: [{ id: "o", zIndex: 0, ...object }] }],
    }
  }
  const text = (value: string) => ({ type: "text", x: 10, y: 10, width: 300, height: 30, properties: { text: value, fontSize: 18 } })

  async function picture(page: Page, p: unknown, overrides: Record<string, string> = {}): Promise<string> {
    await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project: p, screenIndex: 0, topicOverrides: overrides })
    return page.evaluate(() => (document.querySelector("canvas") as HTMLCanvasElement).toDataURL())
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
  })

  const level = { topic: "t/level", examples: ["72"] }

  test("a text reads its topic's example, formatted in the project's number format", async ({ page }) => {
    const topics = [level, { topic: "t/big", examples: ["12345.678"] }]
    // The comparison only means something if different texts draw differently.
    expect(await picture(page, project(text("Tank 72 %"), topics))).not.toBe(await picture(page, project(text("Tank 73 %"), topics)))
    const resolved = await picture(page, project(text("Tank {topic:t/level:F0} %, {topic:t/big:N2}"), topics))
    const expected = await picture(page, project(text("Tank 72 %, 12'345.68"), topics))
    expect(resolved).toBe(expected)

    const german = await picture(page, project(text("{topic:t/big:N2}"), topics, { decimalSeparator: ",", thousandsSeparator: "." }))
    expect(german).toBe(await picture(page, project(text("12.345,68"), topics)))
  })

  test("a text follows a value that arrives, and shows ?? until one does", async ({ page }) => {
    const topics = [level]
    const p = project(text("Tank {topic:t/level ?? \"–\"} %"), topics)
    expect(await picture(page, p, { "t/level": "40" })).toBe(await picture(page, project(text("Tank 40 %"), topics)))
    // An override of "" is a topic nothing has arrived on, as on a device.
    expect(await picture(page, p, { "t/level": "" })).toBe(await picture(page, project(text("Tank – %"), topics)))
  })

  test("device and project resolve; reserved references stay as written", async ({ page }) => {
    expect(await picture(page, project(text("{project:name} · {device:model}"), [level]))).toBe(
      await picture(page, project(text("Van Sommer 2026 · Waveshare Knob-Touch LCD 1.8"), [level])),
    )
    expect(await picture(page, project(text("{device:name}"), [level]))).toBe(await picture(page, project(text("{device:name}"), [level])))
  })
})

// Task 5: what a placeholder names is heard and declared, and a device that
// cannot resolve placeholders yet is named before a deploy.
test.describe("topics named by placeholders", () => {
  const text = (value: string, children: unknown[] = []) =>
    ({ id: "t", type: "text", properties: { text: value }, children }) as any
  // A bar's label is not a text any more (2026-09-29): what an old project
  // still carries there names nothing and needs nothing of the device.
  const bar = (label?: string) => ({ id: "b", type: "bar", properties: { topic: "t/level", label } }) as any

  test("the live preview subscribes to every topic a text names, without its JSON path", () => {
    const topics = projectSubscriptionTopics({
      topics: [],
      screens: [
        {
          objects: [
            text("{topic:van/data#temp:F1} {device:id}"),
            bar('{topic:t/stale ?? "x"}'),
            text('{topic:t/name ?? "x"}'),
            text("", [text("{topic:nested/one}")]),
          ],
        },
      ],
    })
    expect(topics.sort()).toEqual(["nested/one", "t/level", "t/name", "van/data"])
  })

  test("a project needs a placeholder-capable device only for topic: and device: references", () => {
    expect(projectUsesLivePlaceholders({ screens: [{ objects: [text("{project:name} {screen}")] }] })).toBe(false)
    expect(projectUsesLivePlaceholders({ screens: [{ objects: [text("{device:model}")] }] })).toBe(true)
    expect(projectUsesLivePlaceholders({ screens: [{ objects: [bar("{device:model}")] }] })).toBe(false)
    expect(projectUsesLivePlaceholders({ screens: [{ objects: [text("", [text("{topic:a}")])] }] })).toBe(true)
  })

  test("generations below the placeholder one are told apart", () => {
    expect(generationBelow("1.1", PLACEHOLDER_GENERATION)).toBe(true)
    expect(generationBelow(undefined, PLACEHOLDER_GENERATION)).toBe(true)
    expect(generationBelow("1.2", PLACEHOLDER_GENERATION)).toBe(false)
    expect(generationBelow("2.0", PLACEHOLDER_GENERATION)).toBe(false)
  })

  test("leaving a text field declares the topics it names, once", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 20, 200)
    const to = devicePoint(box, 200, 230)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()

    const field = page.locator("#text")
    await field.fill("{topic:van/new:F1} und {topic:van/new} und {topic:van/json#a}")
    await field.evaluate((el) => (el as HTMLElement).blur())

    await page.getByRole("button", { name: "Settings" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByRole("button", { name: "Topics", exact: true }).click()
    await expect(dialog.getByText("van/new", { exact: true })).toHaveCount(1)
    await expect(dialog.getByText("van/json", { exact: true })).toHaveCount(1)
  })
})

// The deploy warning, against the local broker (npm run hil:broker): a fake
// board announcing 1.1 is warned about, one announcing 1.2 is not.
test.describe("deploying placeholders to a device that cannot show them", () => {
  const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

  for (const [generation, warned] of [
    ["1.1", true],
    ["1.2", false],
  ] as const) {
    test(`a device announcing ${generation} is ${warned ? "" : "not "}warned about`, async ({ page }, testInfo) => {
      const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
      const p = JSON.parse(await zip.file("project.json")!.async("string"))
      p.screens[0].objects.push({ id: "ph", type: "text", zIndex: 99, x: 10, y: 250, width: 200, height: 20, properties: { text: "{topic:a/b:F1}" } })
      zip.file("project.json", JSON.stringify(p))
      const withPlaceholder = testInfo.outputPath("with-placeholder.zip")
      fs.writeFileSync(withPlaceholder, await zip.generateAsync({ type: "nodebuffer" }))

      const id = `e2e-ph-${testInfo.testId}`
      const device = await new Promise<mqtt.MqttClient>((resolve, reject) => {
        const client = mqtt.connect(BROKER_URL, { clientId: `e2e-ph-${testInfo.testId}`, reconnectPeriod: 0 })
        client.once("connect", () => resolve(client))
        client.once("error", reject)
      })
      try {
        device.publish(
          `${TOPIC_PREFIX}/${id}/hello`,
          JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Placeholder Test ${id}`, systemGeneration: generation }),
          { retain: true },
        )
        device.publish(`${TOPIC_PREFIX}/${id}/status`, "online", { retain: true })

        await loadProject(page, withPlaceholder)
        await page.getByRole("button", { name: "File" }).click()
        await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
        await page.getByText(`Placeholder Test ${id}`).click()
        await expect(page.getByTestId("placeholder-generation-warning")).toHaveCount(warned ? 1 : 0)
      } finally {
        device.publish(`${TOPIC_PREFIX}/${id}/hello`, "", { retain: true })
        device.publish(`${TOPIC_PREFIX}/${id}/status`, "", { retain: true })
        await new Promise((r) => setTimeout(r, 200))
        device.end()
      }
    })
  }
})

// Live values (docs/2026-10-07-live-values.md): a device below 1.4 shows a
// text's rules as nothing and is warned about; one announcing 1.4 reads them.
test.describe("deploying live values to a device that cannot show them", () => {
  const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

  for (const [generation, warned] of [
    ["1.3", true],
    ["1.4", false],
  ] as const) {
    test(`a device announcing ${generation} is ${warned ? "" : "not "}warned about`, async ({ page }, testInfo) => {
      const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
      const p = JSON.parse(await zip.file("project.json")!.async("string"))
      p.screens[0].objects.push({
        id: "lv",
        type: "text",
        zIndex: 99,
        x: 10,
        y: 250,
        width: 200,
        height: 20,
        properties: { text: "Pumpe {live:lv1}", liveValues: [{ id: "lv1", source: { namespace: "topic", path: "a/b" }, rules: [{ op: "yes", result: { kind: "text", parts: ["an"] } }] }] },
      })
      zip.file("project.json", JSON.stringify(p))
      const withLiveValue = testInfo.outputPath("with-live-value.zip")
      fs.writeFileSync(withLiveValue, await zip.generateAsync({ type: "nodebuffer" }))

      const id = `e2e-lv-${testInfo.testId}`
      const device = await new Promise<mqtt.MqttClient>((resolve, reject) => {
        const client = mqtt.connect(BROKER_URL, { clientId: `e2e-lv-${testInfo.testId}`, reconnectPeriod: 0 })
        client.once("connect", () => resolve(client))
        client.once("error", reject)
      })
      try {
        device.publish(
          `${TOPIC_PREFIX}/${id}/hello`,
          JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Live Value Test ${id}`, systemGeneration: generation }),
          { retain: true },
        )
        device.publish(`${TOPIC_PREFIX}/${id}/status`, "online", { retain: true })

        await loadProject(page, withLiveValue)
        await page.getByRole("button", { name: "File" }).click()
        await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
        await page.getByText(`Live Value Test ${id}`, { exact: true }).click()
        await expect(page.getByTestId("live-value-warning")).toHaveCount(warned ? 1 : 0)
      } finally {
        device.publish(`${TOPIC_PREFIX}/${id}/hello`, "", { retain: true })
        device.publish(`${TOPIC_PREFIX}/${id}/status`, "", { retain: true })
        await new Promise((r) => setTimeout(r, 200))
        device.end()
      }
    })
  }
})

test.describe("placeholders beyond the shared vectors", () => {
  test("the vectors are many and their names unique", () => {
    expect(cases.length).toBeGreaterThan(50)
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length)
  })

  test("the topics a text refers to, each once, for subscribing and declaring", () => {
    expect(referencedTopics("{topic:a/b:F1} {topic:c ?? 0} {topic:a/b} {device:id} {screen} {topic:van/data#temp}")).toEqual([
      "a/b",
      "c",
      "van/data#temp",
    ])
  })

  // The designer's scope: what `??` sees as "never arrived" in the editor
  // (no example) and in the live preview (nothing delivered), and "" as a
  // value that did arrive.
  test("the preview scope answers undefined only for a value that is not there", () => {
    const topics = [
      { id: "1", topic: "t/level", type: "numeric" as const, examples: ["72"] },
      { id: "2", topic: "t/none", type: "text" as const, examples: [] },
      { id: "3", topic: "t/json", type: "json" as const, examples: ['{"temp":21.4}'] },
    ]
    const editor = placeholderScope({ topics, projectName: "P", device: { model: "M", id: "gleaming-harvest" }, separators: DEFAULT_SEPARATORS })
    const topic = (path: string) => ({ namespace: "topic" as const, path })
    expect(editor.lookup(topic("t/level"))).toBe("72")
    expect(editor.lookup(topic("t/none"))).toBeUndefined()
    expect(editor.lookup(topic("t/unknown"))).toBeUndefined()
    expect(editor.lookup(topic("t/json#temp"))).toBe("21.4")
    expect(editor.lookup({ namespace: "device", path: "id" })).toBe("gleaming-harvest")
    expect(editor.lookup({ namespace: "project", path: "name" })).toBe("P")

    const live = placeholderScope({ topics, liveValues: { "t/empty": "" }, separators: DEFAULT_SEPARATORS })
    expect(live.lookup(topic("t/level")), "no example stands in for a live value").toBeUndefined()
    expect(live.lookup(topic("t/empty"))).toBe("")
  })

  // The export writes in {project:name} and leaves everything else for the
  // device - including escaped braces, which must still be escaped when the
  // device reads the text.
  test("baking writes in project fields only, and keeps the text parseable", () => {
    const project = { name: "Van {Sommer}" }
    expect(bakeProjectFields("{project:name}", project)).toBe("Van {{Sommer}}")
    expect(bakeProjectFields("A {topic:a/b:F1} {device:id} {{x}} {screen} a}b", project)).toBe(
      "A {topic:a/b:F1} {device:id} {{x}} {screen} a}}b",
    )
    // Baked, the text resolves to what it did before baking.
    const text = '{project:name}: {topic:t ?? "–"} {{ok}}'
    const lookup = (ref: { namespace: string; path: string }) => (ref.namespace === "project" ? project.name : undefined)
    expect(resolve(bakeProjectFields(text, project), () => undefined)).toBe(resolve(text, lookup))
  })

  test("an unknown or reserved placeholder says why, for the editor to show", () => {
    const [segment] = parse("{(topic:a < 0 ? \"x\" : \"y\")}")
    expect(segment).toMatchObject({ kind: "raw", reason: "expressions are reserved for later" })
    expect(parse("{device:name}")[0]).toMatchObject({ kind: "raw", reason: "unknown field" })
  })
})

// What a device needs to resolve a text itself (docs/2026-10-05-placeholder-
// devices.md): the project's two separators, and every topic a text names
// declared - a device keeps values only for declared topics. Both exports,
// the firmware bundle and the Android one.
test.describe("the export to a device", () => {
  const project = (settings: Record<string, unknown>, objects: unknown[]) => ({
    name: "Bus",
    screenWidth: 360,
    screenHeight: 240,
    fonts: [],
    assets: [],
    topics: [{ id: "t", topic: "van/declared", type: "numeric", examples: ["40"] }],
    hardwareButtons: [],
    settings: { colorDepth: "24bit", exportFormat: "esp32", gridSize: 10, snapTolerance: 5, snapGrid: "{}", ...settings },
    nextId: 10,
    screens: [
      { id: "m", name: "M", isMaster: true, themeId: "slate", objects: [] },
      { id: "s", name: "S", masterScreenId: "m", themeId: "slate", objects },
    ],
  })
  const text = (id: string, value: string) =>
    ({ id, type: "text", zIndex: 1, x: 10, y: 10, width: 200, height: 30, properties: { text: value } })

  async function exported(page: Page, hook: string, source: unknown): Promise<any> {
    const base64: string = await page.evaluate(([name, arg]) => (window as any)[name as string](arg), [hook, source] as const)
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
    return JSON.parse(await zip.file("project.json")!.async("string"))
  }
  const HOOKS = ["__buildDeviceZipForTest", "__buildAndroidZipForTest"]
  const texts = (device: any): string[] => {
    const out: string[] = []
    const walk = (objects: any[]) => {
      for (const o of objects ?? []) {
        if (o.type === "text") out.push(o.properties.text)
        walk(o.children)
      }
    }
    for (const screen of device.screens ?? []) walk(screen.objects)
    return out
  }

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 60000 })
  })

  test("carries the project's two separators, and the default when it sets none", async ({ page }) => {
    for (const hook of HOOKS) {
      const set = await exported(page, hook, project({ decimalSeparator: ",", thousandsSeparator: " " }, [text("a", "x")]))
      expect([set.decimalSeparator, set.thousandsSeparator], hook).toEqual([",", " "])
      const none = await exported(page, hook, project({}, [text("a", "x")]))
      expect([none.decimalSeparator, none.thousandsSeparator], hook).toEqual([DEFAULT_SEPARATORS.decimal, DEFAULT_SEPARATORS.thousands])
    }
  })

  test("declares every topic a text names, once, without its JSON path", async ({ page }) => {
    const source = project({}, [
      text("a", "{topic:van/declared:F0} {topic:van/new ?? 0}"),
      { id: "g", type: "group", zIndex: 2, x: 0, y: 0, width: 100, height: 100, properties: {},
        children: [text("b", "{topic:van/json#temp:F1} {topic:van/new}")] },
    ])
    for (const hook of HOOKS) {
      const device = await exported(page, hook, source)
      const names = device.topics.map((t: any) => t.topic)
      expect(names, hook).toEqual(["van/declared", "van/new", "van/json"])
      expect(device.topics[0], `${hook}: a declared topic is kept as it is`).toMatchObject({ id: "t", type: "numeric", examples: ["40"] })
    }
  })

  test("writes in project:name and leaves every other placeholder as written", async ({ page }) => {
    const value = "{project:name} {topic:van/declared:F0} {device:model} {screen}"
    for (const hook of HOOKS) {
      const device = await exported(page, hook, project({}, [text("a", value)]))
      expect(texts(device), hook).toEqual(["Bus {topic:van/declared:F0} {device:model} {screen}"])
    }
  })
})
