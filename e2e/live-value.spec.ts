import { test, expect } from "@playwright/test"
import fs from "fs"
import JSZip from "jszip"
import path from "path"
import { parse, resolve as resolvePlaceholders } from "../lib/placeholders"
import { migrateProject } from "../lib/object-types"
import { exportedTextProperties, iconAsDrawn, isLiveIcon, liveIconBranches, liveValuesNotOnDevices, withLiveIconFallbacks } from "../lib/object-text"
import { exportedTopics, placeholderScope, projectSubscriptionTopics, projectUsesLivePlaceholders } from "../lib/render-screen"
import { evaluate, isNo, isYes, liveTextSegments, lowerLiveText, placeholdersToLiveValues, sourceShortName, resolveLiveText, textOf, type LiveValue, type Rule, type Source } from "../lib/live-value"
import { combinedReadableFrom, combinedUsage, computeCombined, dependentsOf, evaluationOrder, renameCombined, type CombinedTopic } from "../lib/combined-topics"

// Live values (docs/2026-10-07-live-values.md). The cases are data in
// lib/live-value/vectors.json, to be shared with the firmware and the Android
// app as lib/placeholders/vectors.json is - so a case belongs there, not here.

interface EvaluateVector {
  name: string
  rules: Omit<Rule, "result">[]
  value?: string
  applies: number | "otherwise" | "noValueYet"
}

const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "lib", "live-value", "vectors.json"), "utf8")) as {
  evaluate: EvaluateVector[]
}

test.describe("live value vectors: which rule applies", () => {
  for (const vector of vectors.evaluate) {
    test(vector.name, () => {
      const rules = vector.rules.map((rule, i) => ({ ...rule, result: { kind: "text" as const, parts: [`rule ${i}`] } }))
      expect(evaluate({ id: "lv1", source: { namespace: "topic", path: "t" }, rules }, vector.value).applies).toEqual(vector.applies)
    })
  }
})

interface TextVector {
  name: string
  liveValue: LiveValue
  value?: string
  decimal?: string
  thousands?: string
  expected: string
}

interface ResolveVector {
  name: string
  text: string
  liveValues: LiveValue[]
  values: Record<string, string>
  expected: string
}

const textVectors = vectors as unknown as { text: TextVector[]; resolve: ResolveVector[] }

test.describe("live value vectors: as text", () => {
  for (const vector of textVectors.text) {
    test(vector.name, () => {
      const separators = { decimal: vector.decimal ?? ".", thousands: vector.thousands ?? "'" }
      expect(textOf(vector.liveValue, vector.value, separators)).toBe(vector.expected)
    })
  }
})

test.describe("live value vectors: a whole text", () => {
  for (const vector of textVectors.resolve) {
    test(vector.name, () => {
      const lookup = (source: Source) => vector.values[`${source.namespace}:${source.path}`]
      expect(resolveLiveText(vector.text, vector.liveValues, lookup, { decimal: ".", thousands: "'" })).toBe(vector.expected)
    })
  }
})

// Every placeholder case (lib/placeholders/vectors.json), its text turned into
// live values, reads exactly as the placeholder did: the migration loses
// nothing a text could say (Task 3).
test.describe("placeholders become live values and read the same", () => {
  const placeholderCases = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "lib", "placeholders", "vectors.json"), "utf8"),
  ).cases as { name: string; text: string; values?: Record<string, string>; decimal?: string; thousands?: string; expected: string }[]
  for (const vector of placeholderCases) {
    test(vector.name, () => {
      const separators = { decimal: vector.decimal ?? ".", thousands: vector.thousands ?? "'" }
      const { text, liveValues } = placeholdersToLiveValues(vector.text, [], separators)
      // No placeholder a device would resolve is left; one it shows as
      // written (reserved, broken) stays as written.
      expect(parse(text).filter((segment) => segment.kind === "placeholder")).toEqual([])
      const values = vector.values ?? {}
      const lookup = (source: Source) => values[`${source.namespace}:${source.path}`]
      expect(resolveLiveText(text, liveValues, lookup, separators)).toBe(vector.expected)
    })
  }

  test("ids go on from the ones the object has, and a second pass changes nothing", () => {
    const first = placeholdersToLiveValues("A {topic:a} B {topic:b ?? 0:F1}", [{ id: "lv1", source: { namespace: "topic", path: "x" }, rules: [] }], {
      decimal: ".",
      thousands: "'",
    })
    expect(first.text).toBe("A {live:lv2} B {live:lv3}")
    expect(first.liveValues.map((lv) => lv.id)).toEqual(["lv1", "lv2", "lv3"])
    expect(first.liveValues[2]).toMatchObject({
      source: { namespace: "topic", path: "b" },
      format: { kind: "number", decimals: 1, grouped: false },
      noValueYet: { kind: "text", parts: ["0.0"] },
    })
    const again = placeholdersToLiveValues(first.text, first.liveValues, { decimal: ".", thousands: "'" })
    expect(again).toEqual(first)
  })
})

test.describe("is yes / is no", () => {
  test("a value is never both", () => {
    for (const value of ["true", "on", "yes", "1", "-3", "false", "off", "no", "0", "", "fan_only", "  "]) {
      expect(isYes(value) && isNo(value), value).toBe(false)
    }
  })
})

// Task 4: every renderer draws a text through its live values - the canvas,
// the thumbnails, the read-only path and test-render all go through
// renderLabel, so test-render stands for them.
test.describe("a text with live values is drawn", () => {
  const project = (text: string, liveValues?: LiveValue[]) => ({
    name: "live-values",
    screenWidth: 200,
    screenHeight: 40,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [],
    topics: [{ id: "t1", topic: "van/temp", type: "numeric", examples: ["21.46"] }],
    screens: [
      {
        id: "s1",
        name: "Screen 1",
        backgroundColor: "#ffffff",
        objects: [{ id: "o1", type: "text", x: 4, y: 4, width: 190, height: 24, zIndex: 1, properties: { text, textColor: "#000000", ...(liveValues ? { liveValues } : {}) } }],
      },
    ],
  })
  const temp: LiveValue = {
    id: "lv1",
    source: { namespace: "topic", path: "van/temp" },
    format: { kind: "number", decimals: 1, grouped: false },
    rules: [{ op: "<", operand: "0", result: { kind: "text", parts: ["Frost"] } }],
    noValueYet: { kind: "text", parts: ["–"] },
  }

  test("as the text it reads, at the example and at a test value", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const render = (p: unknown, overrides: Record<string, string> = {}) =>
      page.evaluate((req) => (window as any).__renderScreenForTest(req), { project: p, screenIndex: 0, topicOverrides: overrides })

    expect(await render(project("Innen {live:lv1} °C", [temp]))).toBe(await render(project("Innen 21.5 °C")))
    expect(await render(project("Innen {live:lv1} °C", [temp]), { "van/temp": "-3" })).toBe(await render(project("Innen Frost °C")))
    expect(await render(project("Innen {live:lv1} °C", [temp]), { "van/temp": "" })).toBe(await render(project("Innen – °C")))
  })

  test("its topics are subscribed in the live preview and declared in the export", () => {
    const p = project("Innen {live:lv1}", [{ ...temp, source: { namespace: "topic", path: "van/klima#innen" } }]) as any
    expect(projectSubscriptionTopics(p)).toContain("van/klima")
    expect(exportedTopics(p).map((t) => t.topic)).toContain("van/klima")
    expect(projectUsesLivePlaceholders(p)).toBe(true)
  })
})

// Task 5: until devices read live values, the export writes each one back as
// the placeholder that says the same, where one can; a live value no
// placeholder can say is left out of the text, and the deploy dialog names
// its object.
test.describe("the interim export", () => {
  const placeholderCases = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "lib", "placeholders", "vectors.json"), "utf8"),
  ).cases as { name: string; text: string; values?: Record<string, string>; decimal?: string; thousands?: string; expected: string }[]

  for (const vector of placeholderCases) {
    test(`a device reads it as before: ${vector.name}`, () => {
      const separators = { decimal: vector.decimal ?? ".", thousands: vector.thousands ?? "'" }
      const migrated = placeholdersToLiveValues(vector.text, [], separators)
      const lowered = lowerLiveText(migrated.text, migrated.liveValues)
      expect(lowered.left).toEqual([])
      const values = vector.values ?? {}
      const lookup = (ref: { namespace: string; path: string }) => values[`${ref.namespace}:${ref.path}`]
      expect(resolvePlaceholders(lowered.text, lookup, separators)).toBe(vector.expected)
    })
  }

  test("a live value with a rule, a duration or a combined source is left out and named", () => {
    const text = "A {live:lv1} B {live:lv2} C {live:lv3} D {live:lv4}"
    const liveValues: LiveValue[] = [
      { id: "lv1", source: { namespace: "topic", path: "t" }, rules: [{ op: "yes", result: { kind: "text", parts: ["an"] } }] },
      { id: "lv2", source: { namespace: "topic", path: "t" }, format: { kind: "duration", pattern: "h:mm" }, rules: [] },
      { id: "lv3", source: { namespace: "combined", path: "glaette" }, rules: [] },
      { id: "lv4", source: { namespace: "topic", path: "u" }, format: { kind: "number", decimals: 2, grouped: true }, rules: [], noValueYet: { kind: "text", parts: ["leer"] } },
    ]
    expect(lowerLiveText(text, liveValues)).toEqual({ text: 'A  B  C  D {topic:u ?? "leer":N2}', left: ["lv1", "lv2", "lv3"] })
  })

  test("the exported object carries the placeholder for 1.3 and the live values for 1.4; project:name is written in", () => {
    const obj = {
      id: "o1",
      type: "text",
      properties: {
        text: "{live:lv1} in {live:lv2}",
        liveValues: [
          { id: "lv1", source: { namespace: "topic", path: "van/temp" }, format: { kind: "number", decimals: 1, grouped: false }, rules: [] },
          { id: "lv2", source: { namespace: "project", path: "name" }, rules: [] },
        ],
      },
    } as any
    const exported = exportedTextProperties(obj, { name: "Mein Van" })
    expect(exported.text).toBe("{topic:van/temp:F1} in Mein Van")
    // A device of generation 1.4 reads these (tasks/live-values-export-todo.md, Task 1).
    expect(exported.liveText).toBe("{live:lv1} in {live:lv2}")
    expect(exported.liveValues).toEqual(obj.properties.liveValues)
  })

  test("the deploy dialog names the objects whose live values a device cannot show yet", () => {
    const project = {
      screens: [
        {
          name: "Heizung",
          objects: [
            { id: "o1", type: "text", properties: { text: "Timer {live:lv1}", liveValues: [{ id: "lv1", source: { namespace: "topic", path: "t" }, format: { kind: "duration", pattern: "h:mm" }, rules: [] }] } },
            { id: "o2", type: "text", properties: { text: "Temp {live:lv1}", liveValues: [{ id: "lv1", source: { namespace: "topic", path: "u" }, rules: [] }] } },
          ],
        },
      ],
    } as any
    expect(liveValuesNotOnDevices(project)).toEqual(['"Timer …" on Heizung'])
  })
})

// Task 3 part 2: a project's texts carry live values from the moment it is
// opened - every door goes through migrateProject.
test.describe("opening a project turns its placeholders into live values", () => {
  const project = () => ({
    name: "p",
    settings: { decimalSeparator: ",", thousandsSeparator: "." },
    screens: [
      {
        id: "s1",
        name: "S",
        objects: [
          { id: "o1", type: "text", x: 0, y: 0, width: 10, height: 10, zIndex: 1, properties: { text: "Tank {topic:tank/1#level:F0} % {{x}}" } },
          {
            id: "g",
            type: "group",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            zIndex: 2,
            properties: {},
            children: [{ id: "o2", type: "text", x: 0, y: 0, width: 10, height: 10, zIndex: 1, properties: { text: "{topic:t ?? 0:F1}" } }],
          },
          { id: "o3", type: "live-text", x: 0, y: 0, width: 10, height: 10, zIndex: 3, properties: { topic: "van/v", prefix: "U ", postfix: " V", displayAs: "Formatted Number", numberOfDecimals: 2 } },
          { id: "o4", type: "text", x: 0, y: 0, width: 10, height: 10, zIndex: 4, properties: { text: "plain" } },
        ],
      },
    ],
  })

  test("texts, nested ones and a Live Text included, in the project's number format", () => {
    const p = migrateProject(project() as any) as any
    const [o1, g, o3, o4] = p.screens[0].objects
    expect(o1.properties).toMatchObject({
      text: "Tank {live:lv1} % {{x}}",
      liveValues: [{ id: "lv1", source: { namespace: "topic", path: "tank/1#level" }, format: { kind: "number", decimals: 0, grouped: false }, rules: [] }],
    })
    expect(g.children[0].properties).toMatchObject({ text: "{live:lv1}", liveValues: [{ noValueYet: { kind: "text", parts: ["0,0"] } }] })
    expect(o3).toMatchObject({ type: "text", properties: { text: "U {live:lv1} V", liveValues: [{ source: { path: "van/v" }, format: { decimals: 2 } }] } })
    expect(o4.properties).toEqual({ text: "plain" })
  })

  test("opening it again changes nothing", () => {
    const once = migrateProject(project() as any)
    expect(migrateProject(structuredClone(once))).toEqual(once)
  })
})

// Task 6: the field shows a text as runs and chips, and joins them back.
test.describe("a text as the field shows it", () => {
  const lv = (id: string, path: string): LiveValue => ({ id, source: { namespace: "topic", path }, rules: [] })
  test("runs and chips, braces kept, an unknown id as text; joined back it is the text", () => {
    const text = "Heizung {live:lv1}{live:lv2} {{x}} {live:lv9}"
    const segments = liveTextSegments(text, [lv("lv1", "heizung/status"), lv("lv2", "heizung/timer")])
    expect(segments).toEqual([
      { kind: "text", text: "Heizung " },
      { kind: "live", id: "lv1" },
      { kind: "live", id: "lv2" },
      { kind: "text", text: " {{x}} {live:lv9}" },
    ])
    expect(segments.map((s) => (s.kind === "text" ? s.text : `{live:${s.id}}`)).join("")).toBe(text)
  })

  test("a chip's short name", () => {
    expect(sourceShortName({ namespace: "topic", path: "heizung/timer" })).toBe("timer")
    expect(sourceShortName({ namespace: "topic", path: "van/klima#innen" })).toBe("innen")
    expect(sourceShortName({ namespace: "topic", path: "pumpe" })).toBe("pumpe")
    expect(sourceShortName({ namespace: "device", path: "model" })).toBe("model")
  })
})

// Task 9: an icon can be live - its one live value's results are icons.
test.describe("a live icon", () => {
  const frost: LiveValue = {
    id: "lv1",
    source: { namespace: "topic", path: "outside_temp" },
    rules: [
      { op: "<", operand: "0", result: { kind: "icon", icon: "asset-alert" } },
      { op: "<", operand: "3", result: { kind: "icon", icon: "asset-flake" } },
    ],
    otherwise: { kind: "icon", icon: "asset-thermo" },
    noValueYet: { kind: "icon", icon: "asset-thermo-off" },
  }
  const icon = { id: "i1", type: "icon", x: 0, y: 0, width: 40, height: 40, zIndex: 1, properties: { assetId: "asset-thermo", liveIconId: "lv1", liveValues: [frost] } } as any
  const scope = (value: string | undefined) => ({ separators: { decimal: ".", thousands: "'" }, lookup: () => value })

  test("draws the icon of the rule that applies, Otherwise, or No value yet", () => {
    expect(iconAsDrawn(icon, scope("-2")).properties.assetId).toBe("asset-alert")
    expect(iconAsDrawn(icon, scope("2.4")).properties.assetId).toBe("asset-flake")
    expect(iconAsDrawn(icon, scope("10")).properties.assetId).toBe("asset-thermo")
    expect(iconAsDrawn(icon, scope(undefined)).properties.assetId).toBe("asset-thermo-off")
    expect(iconAsDrawn({ ...icon, properties: { ...icon.properties, liveValues: [{ ...frost, otherwise: undefined }] } }, scope("10")).properties.assetId).toBeUndefined()
  })

  test("a fixed icon is drawn as it is", () => {
    const fixed = { ...icon, properties: { assetId: "asset-x" } }
    expect(iconAsDrawn(fixed, scope("1"))).toBe(fixed)
  })

  test("the export keeps it live and gives a 1.3 device its Otherwise icon; it is named for those", () => {
    const project = { screens: [{ name: "Wetter", objects: [icon] }] } as any
    const exported = withLiveIconFallbacks(project)
    expect(exported.screens[0].objects[0].properties).toEqual({ assetId: "asset-thermo", liveIconId: "lv1", liveValues: [frost] })
    expect(liveValuesNotOnDevices(project)).toEqual(["an icon on Wetter"])
  })

  test("every icon it can show, by branch, for the export to bake", () => {
    expect(liveIconBranches(frost)).toEqual([
      { branch: "r0", icon: "asset-alert" },
      { branch: "r1", icon: "asset-flake" },
      { branch: "otherwise", icon: "asset-thermo" },
      { branch: "noValueYet", icon: "asset-thermo-off" },
    ])
    expect(isLiveIcon(icon)).toBe(true)
    expect(isLiveIcon({ ...icon, properties: { assetId: "a" } })).toBe(false)
  })
})

// Task 11: combined topics (docs/2026-10-07-live-values.md, decisions 10-15).
interface CombinedVector {
  name: string
  combinedTopics: CombinedTopic[]
  values: Record<string, string>
  expected?: Record<string, string | null>
  circular?: string[]
}

test.describe("combined topics", () => {
  for (const vector of (vectors as unknown as { combined: CombinedVector[] }).combined) {
    test(vector.name, () => {
      const order = evaluationOrder(vector.combinedTopics)
      if (vector.circular) {
        expect(order.circular).toEqual(vector.circular)
        return
      }
      expect(order.circular).toBeUndefined()
      const computed = computeCombined(vector.combinedTopics, (path) => vector.values[path])
      const result: Record<string, string | null> = {}
      for (const ct of vector.combinedTopics) result[ct.name] = computed.get(ct.name) ?? null
      expect(result).toEqual(vector.expected)
    })
  }

  test("the order puts each after what it uses; dependents name who reads whom", () => {
    const glaette = (vectors as unknown as { combined: CombinedVector[] }).combined[0].combinedTopics
    const order = evaluationOrder([glaette[2], glaette[1], glaette[0]]).order.map((ct) => ct.name)
    expect(order.indexOf("glaette")).toBeGreaterThan(order.indexOf("frost"))
    expect(order.indexOf("glaette")).toBeGreaterThan(order.indexOf("nass"))
    expect(dependentsOf(glaette, "nass")).toEqual(["glaette"])
    expect(dependentsOf(glaette, "rain", "topic")).toEqual(["nass", "glaette"])
  })

  test("deeper than 8 levels is refused", () => {
    const chain: CombinedTopic[] = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      name: `s${i}`,
      mode: "any",
      conditions: [i === 0 ? { source: { namespace: "topic", path: "t" }, op: "yes" } : { source: { namespace: "combined", path: `s${i - 1}` }, op: "yes" }],
    }))
    expect(evaluationOrder(chain).tooDeep).toBe("s8")
    expect(evaluationOrder(chain.slice(0, 8)).tooDeep).toBeUndefined()
  })
})

// Task 12: combined topics in a project - who reads one, renaming, and what a
// condition may read without closing a circular reference.
test.describe("combined topics in a project", () => {
  const glaette = (vectors as unknown as { combined: CombinedVector[] }).combined[0].combinedTopics
  const project = () =>
    ({
      combinedTopics: structuredClone(glaette),
      screens: [
        {
          name: "Wetter",
          objects: [
            { id: "t", type: "text", properties: { text: "Glätte {live:lv1}", liveValues: [{ id: "lv1", source: { namespace: "combined", path: "glaette" }, rules: [] }] } },
            { id: "i", type: "icon", properties: { liveIconId: "lv1", liveValues: [{ id: "lv1", source: { namespace: "combined", path: "frost" }, rules: [] }] } },
          ],
        },
      ],
    }) as any

  test("who reads a combined topic", () => {
    expect(combinedUsage(project(), "glaette")).toEqual(['"Glätte …" on Wetter'])
    expect(combinedUsage(project(), "frost")).toEqual(["an icon on Wetter", "combined glaette"])
    expect(combinedUsage(project(), "nass")).toEqual(["combined glaette"])
  })

  test("renaming carries every reference", () => {
    const renamed = renameCombined(project(), "frost", "eis")
    expect(renamed.combinedTopics.map((ct: CombinedTopic) => ct.name)).toEqual(["eis", "nass", "glaette"])
    expect(renamed.combinedTopics[2].conditions[0].source).toEqual({ namespace: "combined", path: "eis" })
    expect(renamed.screens[0].objects[1].properties.liveValues[0].source).toEqual({ namespace: "combined", path: "eis" })
    expect(renamed.screens[0].objects[0].properties.liveValues[0].source.path).toBe("glaette")
  })

  test("a condition may read neither its own topic nor one that reads it", () => {
    expect(combinedReadableFrom(glaette, "frost")).toEqual(["nass"])
    expect(combinedReadableFrom(glaette, "glaette")).toEqual(["frost", "nass"])
    expect(combinedReadableFrom(glaette, "nass")).toEqual(["frost"])
  })
})

// Task 13: the canvas's scope computes combined topics - from the examples,
// and from an open editor's test value on a topic they read.
test.describe("combined topics in the preview's scope", () => {
  const glaette = (vectors as unknown as { combined: CombinedVector[] }).combined[0].combinedTopics
  const topics = [
    { id: "1", topic: "outside_temp", type: "numeric" as const, examples: ["8"] },
    { id: "2", topic: "rain", type: "text" as const, examples: ["true"] },
    { id: "3", topic: "humidity", type: "numeric" as const, examples: ["50"] },
  ]
  const separators = { decimal: ".", thousands: "'" }

  test("from the examples", () => {
    const scope = placeholderScope({ topics, combinedTopics: glaette, separators })
    expect([scope.combined?.("frost"), scope.combined?.("nass"), scope.combined?.("glaette")]).toEqual(["false", "true", "false"])
  })

  test("a test value on a topic reaches every combined topic that reads it", () => {
    const scope = placeholderScope({ topics, combinedTopics: glaette, separators, test: { source: { namespace: "topic", path: "outside_temp" }, value: "-2" } })
    expect([scope.combined?.("frost"), scope.combined?.("glaette")]).toEqual(["true", "true"])
  })

  test("a test value on a combined topic itself", () => {
    const scope = placeholderScope({ topics, combinedTopics: glaette, separators, test: { source: { namespace: "combined", path: "glaette" }, value: undefined } })
    expect(scope.combined?.("glaette")).toBeUndefined()
  })
})

// Task 1 of tasks/live-values-export-todo.md: the device export carries both
// readings - what a 1.3 device shows today, and the live values for 1.4.
test.describe("the export for devices of generation 1.4", () => {
  const svg = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${d}"/></svg>`
  const T = (word: string) => ({ kind: "text", parts: [word] })
  const project = {
    name: "export",
    screenWidth: 200,
    screenHeight: 80,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [
      { id: "a-thermo", name: "thermometer", type: "icon", data: svg("M10 2h4v14a4 4 0 1 1-4 0z") },
      { id: "a-flake", name: "snowflake", type: "icon", data: svg("M11 1h2v22h-2zM1 11h22v2H1z") },
    ],
    topics: [{ id: "t", topic: "outside_temp", type: "numeric", examples: ["10"] }, { id: "r", topic: "rain", type: "text", examples: ["false"] }],
    combinedTopics: [
      { id: "c2", name: "glaette", mode: "all", conditions: [{ source: { namespace: "combined", path: "frost" }, op: "yes" }, { source: { namespace: "topic", path: "rain" }, op: "yes" }] },
      { id: "c1", name: "frost", mode: "all", conditions: [{ source: { namespace: "topic", path: "outside_temp" }, op: "<", operand: "1" }] },
    ],
    screens: [
      {
        id: "s1",
        name: "S",
        backgroundColor: "#ffffff",
        objects: [
          {
            id: "t1",
            type: "text",
            x: 4,
            y: 4,
            width: 150,
            height: 24,
            zIndex: 1,
            properties: { text: "Strasse {live:lv1}", textColor: "#000000", liveValues: [{ id: "lv1", source: { namespace: "combined", path: "glaette" }, rules: [{ op: "yes", result: T("GLATT") }], otherwise: T("ok") }] },
          },
          {
            id: "i1",
            type: "icon",
            x: 160,
            y: 4,
            width: 32,
            height: 32,
            zIndex: 2,
            properties: {
              iconColor: "#000000",
              assetId: "a-thermo",
              liveIconId: "lv1",
              liveValues: [{ id: "lv1", source: { namespace: "topic", path: "outside_temp" }, rules: [{ op: "<", operand: "3", result: { kind: "icon", icon: "a-flake" } }], otherwise: { kind: "icon", icon: "a-thermo" } }],
            },
          },
        ],
      },
    ],
  }

  async function exported(page: import("@playwright/test").Page, hook: string) {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const base64 = await page.evaluate(([h, p]) => (window as any)[h as string](p), [hook, project] as const)
    const zip = await JSZip.loadAsync(Buffer.from(base64 as string, "base64"))
    return { zip, json: JSON.parse(await zip.file("project.json")!.async("string")) }
  }

  for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"]) {
    test(`${hook}: both readings, every icon result baked, combined topics in order`, async ({ page }) => {
      const { zip, json } = await exported(page, hook)
      const objects = json.screens[0].objects
      const text = objects.find((o: any) => o.id === "t1")
      expect(text.properties.text).toBe("Strasse ")
      expect(text.properties.liveText).toBe("Strasse {live:lv1}")
      expect(text.properties.liveValues[0].source).toEqual({ namespace: "combined", path: "glaette" })
      const icon = objects.find((o: any) => o.id === "i1")
      expect(icon.properties.liveIconId).toBe("lv1")
      const lv = icon.properties.liveValues[0]
      for (const result of [lv.rules[0].result, lv.otherwise]) {
        expect(result.path, JSON.stringify(result)).toBeTruthy()
        expect(zip.file(result.path)).not.toBeNull()
      }
      // A 1.3 device draws what it draws today: the Otherwise icon.
      if (hook === "__buildDeviceZipForTest") expect(zip.file(icon.path)).not.toBeNull()
      expect(json.combinedTopics.map((ct: any) => ct.name)).toEqual(["frost", "glaette"])
    })
  }
})
