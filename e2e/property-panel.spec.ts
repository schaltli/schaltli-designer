import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import {
  loadProject,
  objectTreeRow,
  getSelectedHeader,
  getMainCanvas,
  clickButton0,
  COMBINED_TEST_PROJECT,
} from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"

// Every control every property panel offers, per object type and variant.
//
// The list in e2e/fixtures/property-panel-controls.json was harvested from the
// panels as they were on 2026-09-20, before the control split
// (docs/2026-09-20-control-split.md) and the panel rebuild
// (docs/2026-09-20-property-panel.md). It is the answer to the one question
// that rebuild cannot afford to get wrong: did a property quietly disappear
// while a panel was rewritten? A device renders the property it cannot be
// given no differently from one it was never given, so nothing downstream
// would notice.
//
// Until the rebuild, this spec pins the old panels exactly. During it, each
// rebuilt panel's entry gets rewritten against the new sections and names,
// with every rename an explicit line - so a changed name is always a
// decision, never a slip. Re-harvest with HARVEST_PANEL_CONTROLS=1.
//
// The variants matter as much as the types: a Level Indicator with a write
// topic shows rows one without never does, a Software Button shows different
// rows per action, a Switch per mode. The split turns most of these variants
// into types of their own.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
const EXPECTED_PATH = path.join(__dirname, "fixtures", "property-panel-controls.json")
const HARVEST = process.env.HARVEST_PANEL_CONTROLS === "1"

// The topics the switch fixture already registers (test-projects/
// switch-test-project.zip) - bound here so the topic pickers show a chosen
// topic rather than "No topic", which is a different set of rows.
const READ_TOPIC = "diag/plain"
const WRITE_TOPIC = "test/switch-cmd"
const SETPOINT_TOPIC = "diag/plain/nested"

const CALIBRATION = [
  { value: 0, barSizePercent: 0 },
  { value: 100, barSizePercent: 100 },
]

type Obj = Record<string, any>

// One object per variant, small and spread over the 240x240 fixture screen.
// What each carries is the creation default from project-editor.tsx /
// canvas.tsx plus whatever the variant needs to show its extra rows.
function fixtureObjects(): Obj[] {
  let n = 0
  const place = (id: string, type: string, properties: Obj, size = { width: 40, height: 20 }, extra: Obj = {}): Obj => {
    const col = n % 5
    const row = Math.floor(n / 5)
    n += 1
    return { id, type, x: 10 + col * 45, y: 10 + row * 45, zIndex: n, ...size, properties, ...extra }
  }
  return [
    place("v-label", "text", { text: "Wohnzimmer", textAlign: "left", backgroundColor: "transparent", borderColor: "#cccccc", textColor: "#000000" }),
    place("v-box", "box", { fillColor: "transparent", strokeColor: "#000000", strokeWidth: 2, cornerRadius: 0 }),
    place("v-line", "line", { color: "#000000", strokeWidth: 2, strokeStyle: "solid", filletRadius: 0, points: [{ x: 10, y: 60 }, { x: 50, y: 60 }] }),
    place("v-icon", "icon", { assetId: null, iconName: "default", backgroundColor: "transparent" }, { width: 24, height: 24 }),
    place("v-mqtt-data-field", "live-text", { topic: READ_TOPIC, displayAs: "Display as-is", textAlign: "left", backgroundColor: "#ffffff", borderColor: "#cccccc", textColor: "#000000" }),
    place("v-mqtt-icon-field", "live-icon", {
      topic: READ_TOPIC,
      valueIconPairs: [{ comparisonOperator: "=", comparisonValue: "on", thenShowIcon: null }],
      backgroundColor: "transparent",
    }, { width: 24, height: 24 }),
    place("v-mqtt-data-line", "live-line", {
      topic: READ_TOPIC,
      color: "#000000",
      filletRadius: 0,
      points: [{ x: 10, y: 110 }, { x: 50, y: 110 }],
      calibrationPoints: [{ value: 0, barSizePercent: 1 }, { value: 100, barSizePercent: 6 }],
      arrowStartOperator: "<",
      arrowStartValue: "0",
      arrowEndOperator: ">",
      arrowEndValue: "0",
    }),
    place("v-level-read", "bar", levelProperties(false)),
    place("v-level-write", "slider", levelProperties(true)),
    place("v-arc-read", "gauge", arcProperties(false), { width: 80, height: 80 }),
    place("v-arc-write", "dial", arcProperties(true), { width: 80, height: 80 }),
    place("v-button-next", "button", buttonProperties({ type: "next-screen" })),
    place("v-button-goto", "button", buttonProperties({ type: "goto-screen", targetScreenId: "" })),
    place("v-button-mqtt", "button", buttonProperties({ type: "send-mqtt", mqttTopic: "a/b", mqttMessage: "ON" })),
    place("v-button-device", "button", buttonProperties({ type: "device-action", deviceActionId: "" })),
    place("v-switch-group", "button-group", switchProperties("segmented", 2)),
    place("v-switch-knob", "switch", switchProperties("single", 1)),
    place("v-tab-control", "switcher", { topic: READ_TOPIC, comparisonOperator: "==", comparisonValue: "" }, { width: 60, height: 40 }, {
      children: [
        {
          id: "v-panel",
          type: "panel",
          x: 0,
          y: 0,
          width: 60,
          height: 40,
          zIndex: 0,
          properties: { comparisonOperator: "==", comparisonValue: "a" },
          children: [],
        },
      ],
    }),
  ]
}

function levelProperties(writable: boolean): Obj {
  return {
    topic: READ_TOPIC,
    ...(writable ? { writeTopic: WRITE_TOPIC, step: 1, setpointTopic: SETPOINT_TOPIC } : {}),
    calibrationPoints: CALIBRATION,
    barDirection: "left-to-right",
    barThickness: 20,
    markerStyle: "line",
    markerWidth: 4,
    displayValue: "value",
    fillColor: "#6750A4",
    markerColor: "#1D192B",
    textColor: "#000000",
  }
}

function arcProperties(writable: boolean): Obj {
  return {
    topic: READ_TOPIC,
    ...(writable ? { writeTopic: WRITE_TOPIC, step: 1 } : {}),
    setpointTopic: undefined,
    calibrationPoints: CALIBRATION,
    minAngle: 225,
    maxAngle: 135,
    direction: "cw",
    thickness: 22,
    markerWidth: 4,
    displayValue: "value",
    backgroundColor: "transparent",
    trackColor: "#E8DEF8",
    fillColor: "#6750A4",
    markerColor: "#1D192B",
    textColor: "#ffffff",
  }
}

function buttonProperties(action: Obj): Obj {
  return { text: "Licht", iconAssetId: null, buttonStyle: "tonal", buttonColor: "#6750A4", action }
}

function switchProperties(mode: "segmented" | "single", states: number): Obj {
  return {
    topic: READ_TOPIC,
    writeTopic: WRITE_TOPIC,
    mode,
    switchStyle: "filled",
    switchColor: "#6750A4",
    states: Array.from({ length: states }, (_, i) => ({
      id: `v-state-${i + 1}`,
      label: `State ${i + 1}`,
      readValue: String(i),
      writeValue: String(i),
    })),
  }
}

// The switch fixture, bound to the seeded round-fixture device (every object
// type, touch, 24-bit), with its screen replaced by the variants above.
async function projectWithEveryVariant(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens[0].objects = fixtureObjects()
  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `property-panel-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

// Everything in the property panel a person could read or operate, in DOM
// order, as "kind: name". A control is named by its label: the `for` link
// where there is one, else the caption written just above it - most pickers
// (colour, topic, the calibration cells) label themselves that way, with a
// <Label> that points at nothing. An icon-only button is named by its
// aria-label or title, a field without any of these by its placeholder. The
// current *value* is never the name: a colour picker showing "SlateBlue" is
// still the "Bar Color" control. Headings and captions that name no control
// are kept because the rebuild introduces sections, and their order is part
// of what it changes.
async function harvestPanel(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector("div.p-4.space-y-6")
    if (!root) return ["<no property panel>"]
    const text = (el: Element) => (el.textContent || "").trim().replace(/\s+/g, " ")
    const labelFor = new Map<string, string>()
    root.querySelectorAll("label[for]").forEach((l) => {
      const target = (l as HTMLLabelElement).htmlFor
      if (target && root.querySelector(`#${CSS.escape(target)}`)) labelFor.set(target, text(l))
    })
    type Entry = { kind: string; name: string; labelled: boolean }
    const entries: Entry[] = []
    // Once an element is taken as a control, everything inside it is that
    // control's own markup (a trigger's spans, an icon's paths) and is
    // skipped - by containment, not by marking every descendant, which is
    // quadratic and hung on the first attempt.
    let taken: Element | null = null
    root.querySelectorAll("*").forEach((el) => {
      if (taken && taken.contains(el)) return
      const tag = el.tagName.toLowerCase()
      const role = el.getAttribute("role")
      const id = el.getAttribute("id")
      let kind = ""
      let control = true
      if (tag === "h3" || tag === "h4") {
        kind = "heading"
        control = false
      } else if (tag === "input") {
        const type = (el as HTMLInputElement).type
        if (type === "hidden") return
        kind = `input:${type}` + ((el as HTMLInputElement).disabled ? ":disabled" : "")
      } else if (tag === "select") kind = "select"
      else if (tag === "textarea") kind = "textarea"
      else if (role === "combobox") kind = "combobox"
      else if (role === "checkbox" || role === "switch" || role === "slider" || role === "radio") kind = role
      else if (tag === "button" || role === "button") kind = "button"
      else if (tag === "label" && !el.querySelector("input,select,button,[role]")) {
        // A <Label> that points at nothing, or at an id nothing carries: it
        // captions the control that follows, or a group ("States").
        const target = (el as HTMLLabelElement).htmlFor
        if (target && labelFor.has(target)) return
        kind = "caption"
        control = false
      } else return
      let name = ""
      let labelled = false
      if (control) {
        if (id && labelFor.has(id)) {
          name = labelFor.get(id)!
          labelled = true
        } else {
          const wrapping = el.closest("label")
          if (wrapping && text(wrapping)) {
            name = text(wrapping)
            labelled = true
          } else {
            name = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || ""
            if (!name && kind === "button") name = text(el)
            labelled = Boolean(name) && kind === "button"
          }
        }
        if (kind === "button" && !name) return
      } else {
        name = text(el)
      }
      entries.push({ kind, name, labelled })
      taken = el
    })
    // A control that carries no label of its own takes the caption written
    // just above it, and the caption is spent.
    const out: string[] = []
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (e.kind === "caption" && i + 1 < entries.length) {
        const next = entries[i + 1]
        if (next.kind !== "caption" && next.kind !== "heading" && !next.labelled) {
          out.push(`${next.kind}: ${e.name}`)
          i += 1
          continue
        }
      }
      out.push(`${e.kind}: ${e.name}`)
    }
    return out
  })
}

async function selectInTree(page: Page, objectId: string, expectedHeaderPart: string): Promise<void> {
  await objectTreeRow(page, objectId).click()
  await expect
    .poll(async () => getSelectedHeader(page), { timeout: 10000, message: `panel for ${objectId}` })
    .toContain(expectedHeaderPart)
}

type Harvest = Record<string, { header: string; controls: string[] }>

function readExpected(): Harvest | null {
  if (!fs.existsSync(EXPECTED_PATH)) return null
  return JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf-8")).variants
}

// Records the variant, and unless harvesting, holds it against the file -
// inside the test, so a difference is that test's failure and not an
// afterAll's.
async function record(page: Page, harvested: Harvest, variant: string): Promise<void> {
  // Not getSelectedHeader: that waits for an h3, and the hardware-button
  // panel has none, so it would wait until the test times out.
  const header = (await page.locator("div.p-4.space-y-6 h3").first().textContent({ timeout: 2000 }).catch(() => "")) || ""
  harvested[variant] = { header, controls: await harvestPanel(page) }
  if (HARVEST) return
  const expected = readExpected()
  expect(expected, `${EXPECTED_PATH} is missing - run once with HARVEST_PANEL_CONTROLS=1`).not.toBeNull()
  expect.soft(harvested[variant].controls, variant).toEqual(expected![variant]?.controls)
}

test.describe("property panel: every control of every object", () => {
  test.describe.configure({ mode: "serial" })

  const harvested: Harvest = {}

  test("objects, screen and multi-selection", async ({ page }) => {
    test.skip(!(await seedRoundFixtureDdf()), "screenbee-firmware not checked out alongside this repo")
    test.setTimeout(180_000)
    await loadProject(page, await projectWithEveryVariant())

    const variants: Array<[string, string]> = [
      ["label", "Text"],
      ["box", "Box"],
      ["line", "Line"],
      ["icon", "Icon"],
      ["mqtt-data-field", "Live Text"],
      ["mqtt-icon-field", "Live Icon"],
      ["mqtt-data-line", "Live Line"],
      ["level-read", "Bar"],
      ["level-write", "Slider"],
      ["arc-read", "Gauge"],
      ["arc-write", "Dial"],
      ["button-next", "Button"],
      ["button-goto", "Button"],
      ["button-mqtt", "Button"],
      ["button-device", "Button"],
      ["switch-group", "Button Group"],
      ["switch-knob", "Switch"],
      ["tab-control", "Switcher"],
      ["panel", "Panel"],
    ]
    for (const [variant, header] of variants) {
      await selectInTree(page, `v-${variant}`, header)
      await record(page, harvested, variant)
    }

    // Nothing selected: a click on the canvas's own top-left corner, which no
    // variant covers (they start at 10,10 in device pixels).
    const { box } = await getMainCanvas(page)
    await page.mouse.click(box.x + 2, box.y + 2)
    await expect.poll(async () => getSelectedHeader(page), { timeout: 10000 }).toContain("Screen")
    await record(page, harvested, "screen")

    // Three objects, so the Distribute buttons - which need three - are there.
    await objectTreeRow(page, "v-label").click()
    await objectTreeRow(page, "v-box").click({ modifiers: ["Control"] })
    await objectTreeRow(page, "v-line").click({ modifiers: ["Control"] })
    await expect.poll(async () => getSelectedHeader(page), { timeout: 10000 }).toContain("Multiple")
    await record(page, harvested, "multi-selection")
  })

  test("hardware button", async ({ page }) => {
    // The e-paper fixture is the one with hardware buttons on its DDF; the
    // round fixture has none. It is the big fixture (13 screens), and the
    // load alone can take most of the default minute.
    test.setTimeout(180_000)
    await loadProject(page, COMBINED_TEST_PROJECT)
    await clickButton0(page)
    const panel = page.locator("div.p-4.space-y-6")
    await expect(panel.getByText("Action Type")).toBeVisible({ timeout: 15000 })
    await record(page, harvested, "hardware-button")

    // With an action chosen the panel grows its action's own rows - the MQTT
    // one has the most. Chosen here, not saved: the fixture is not written
    // back.
    await panel.getByRole("combobox").first().click()
    await page.getByRole("option", { name: /MQTT/ }).click()
    await expect(panel.getByText(/MQTT Topic|Topic/).first()).toBeVisible({ timeout: 10000 })
    await record(page, harvested, "hardware-button-mqtt")
  })

  test.afterAll(async () => {
    if (!HARVEST) return
    fs.mkdirSync(path.dirname(EXPECTED_PATH), { recursive: true })
    fs.writeFileSync(
      EXPECTED_PATH,
      JSON.stringify({ harvestedAt: new Date().toISOString().slice(0, 10), variants: harvested }, null, 2) + "\n",
    )
  })
})
