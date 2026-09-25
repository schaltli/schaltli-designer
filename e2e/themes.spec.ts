import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import JSZip from "jszip"
import { loadProject, getMainCanvas, objectTreeRow, devicePoint } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { THEMES, ROLES, ROLE_LABELS, resolveRole, migrateColorsToRoles, ensureEveryScreenHasAMaster, themeFor, isRole, ThemeColorError, applyTheme, assertDeviceColours, type Role, type Theme, type Variant } from "../lib/themes"
import { migrateProject } from "../lib/object-types"
import { ROLE_PALETTE, controlPalette } from "../lib/control-palette"
import { applyColorDepth } from "../lib/color-depth"

// Themes (docs/2026-09-24-themes-model.md): the catalogue, drawn with the
// real renderers through app/test-render, and the promises the catalogue
// makes - that "lavender" is today's palette, that every theme really draws,
// that light and dark differ where a device can show it and are one where
// it cannot.
//
// The catalogue page this writes (attached to the test) is how the user
// chooses the themes; it is a test so it cannot rot.

test.describe("theme catalogue", () => {
  test("lavender is today's creation palette, value for value", () => {
    const lavender = THEMES.find((t) => t.id === "lavender")!
    const today = controlPalette("24bit")
    expect(lavender.light.surface).toBe(today.background)
    expect(lavender.light.outline).toBe(today.border)
    expect(lavender.light.text).toBe(today.text)
    expect(lavender.light.onAccent).toBe(today.textOnFill)
    expect(lavender.light.accent).toBe(today.fill)
    expect(lavender.light.accent).toBe(today.accent)
  })

  test("every theme names every role, in both variants, as a hex", () => {
    for (const theme of THEMES) {
      for (const variant of ["light", "dark"] as const) {
        for (const role of ROLES) {
          expect(theme[variant][role], `${theme.id}.${variant}.${role}`).toMatch(/^#[0-9a-f]{6}$/i)
        }
      }
    }
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })

  test("grey and 1-bit devices have one variant: the light one, on the ramp", () => {
    for (const theme of THEMES) {
      for (const role of ROLES) {
        const light = resolveRole(theme, role, "light", "4bit")
        expect(resolveRole(theme, role, "dark", "4bit")).toBe(light)
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(light.slice(i, i + 2), 16))
        expect(r).toBe(g)
        expect(g).toBe(b)
        expect(r % 17).toBe(0)
        expect(["#000000", "#ffffff"]).toContain(resolveRole(theme, role, "dark", "1bit"))
      }
    }
  })

  // The devices a theme is shown on, and a sample screen for each with
  // every control that has a colour of its own, bound to the role it would
  // get from the designer. Values are device pixels.
  type Device = { id: string; name: string; width: number; height: number; colorDepth: string; round?: boolean }
  const DEVICES: Device[] = [
    { id: "4v3b", name: "Waveshare 4.3B", width: 800, height: 480, colorDepth: "24bit" },
    { id: "knob", name: "Waveshare Knob 1.8", width: 360, height: 360, colorDepth: "24bit", round: true },
    { id: "papers3", name: "M5Stack PaperS3", width: 960, height: 540, colorDepth: "4bit" },
  ]

  const TOPICS = {
    temp: "schaltli/state/temp/1/value",
    fresh: "schaltli/state/tank/1/level",
    grey: "schaltli/state/tank/2/level",
    battery: "schaltli/state/battery/soc",
    dimmer: "schaltli/state/dimmer/1/level",
    heaterTemp: "schaltli/state/heater/temp",
    heaterTarget: "schaltli/state/heater/target",
    light: "schaltli/state/relay/1/power",
    pump: "schaltli/state/relay/2/power",
    mode: "schaltli/state/heater/mode",
  }
  const VALUES: Record<string, string> = {
    [TOPICS.temp]: "21.4",
    [TOPICS.fresh]: "63",
    [TOPICS.grey]: "34",
    [TOPICS.battery]: "82",
    [TOPICS.dimmer]: "40",
    [TOPICS.heaterTemp]: "17",
    [TOPICS.heaterTarget]: "21",
    [TOPICS.light]: "on",
    [TOPICS.pump]: "on",
    [TOPICS.mode]: "auto",
  }
  const HEATER_RANGE = [
    { value: 12, barSizePercent: 0 },
    { value: 35, barSizePercent: 100 },
  ]
  const PERCENT = [
    { value: 0, barSizePercent: 0 },
    { value: 100, barSizePercent: 100 },
  ]

  // Objects hold role names here, as a project will; resolve() below turns
  // them into the device-format hex the reference render draws.
  type Obj = { id: string; type: string; zIndex: number; x: number; y: number; width: number; height: number; properties: Record<string, any> }
  let nextId = 0
  const obj = (type: string, x: number, y: number, width: number, height: number, properties: Record<string, any>): Obj => ({
    id: `${type}-${nextId++}`,
    type,
    zIndex: nextId,
    x,
    y,
    width,
    height,
    properties,
  })
  const text = (x: number, y: number, w: number, h: number, content: string, size: number, role: Role = "text", align = "left") =>
    obj("text", x, y, w, h, { text: content, fontSize: size, color: role, textAlign: align, fontWeight: "normal", backgroundColor: "transparent", borderColor: "transparent" })
  const liveText = (x: number, y: number, w: number, h: number, topic: string, size: number, postfix: string) =>
    obj("live-text", x, y, w, h, { topic, displayAs: "Display as-is", fontSize: size, backgroundColor: "panel", borderColor: "outline", textColor: "text", textAlign: "center", prefix: "", postfix })
  const level = (type: "bar" | "slider", x: number, y: number, w: number, h: number, topic: string, label: string | undefined, size: number, extra: Record<string, any> = {}) =>
    obj(type, x, y, w, h, { topic, label, direction: "left-to-right", calibrationPoints: PERCENT, displayValue: label ? "percentage" : "none", fillColor: "accent", textColor: "text", fontSize: size, ...extra })
  const arc = (type: "gauge" | "dial", x: number, y: number, size: number, extra: Record<string, any> = {}) =>
    obj(type, x, y, size, size, { topic: TOPICS.heaterTemp, setpointTopic: TOPICS.heaterTarget, minAngle: 225, maxAngle: 135, direction: "cw", thickness: Math.round(size / 11), markerWidth: 4, backgroundColor: "transparent", fillColor: "accent", textColor: "text", displayValue: "value", calibrationPoints: HEATER_RANGE, ...extra })
  const toggle = (x: number, y: number, w: number, h: number, topic: string, size: number) =>
    obj("switch", x, y, w, h, { topic, writeTopic: topic.replace("/state/", "/cmnd/"), states: [{ id: "off", label: "Aus", readValue: "off", writeValue: "off" }, { id: "on", label: "An", readValue: "on", writeValue: "on", showAsOn: true }], switchStyle: "filled", switchColor: "accent", fontSize: size })
  const group = (x: number, y: number, w: number, h: number, size: number) =>
    obj("button-group", x, y, w, h, { topic: TOPICS.mode, writeTopic: "schaltli/cmnd/heater/mode", states: [{ id: "auto", label: "Auto", readValue: "auto", writeValue: "auto" }, { id: "manual", label: "Manuell", readValue: "manual", writeValue: "manual" }], switchStyle: "filled", switchColor: "accent", fontSize: size })
  const button = (x: number, y: number, w: number, h: number, label: string, size: number, role: Role = "accent") =>
    obj("button", x, y, w, h, { text: label, buttonStyle: "filled", buttonColor: role, fontSize: size, action: { type: "send-mqtt", mqttTopic: "schaltli/cmnd/switchall", mqttMessage: "off" } })
  const box = (x: number, y: number, w: number, h: number) =>
    obj("box", x, y, w, h, { fillColor: "panel", strokeColor: "outline", strokeWidth: 2, cornerRadius: 8 })
  const line = (x: number, y: number, w: number) =>
    obj("line", x, y, w, 1, { color: "outline", strokeWidth: 2, strokeStyle: "solid", filletRadius: 0, points: [{ x, y }, { x: x + w, y }], arrowStart: false, arrowEnd: false })

  function sampleScreen(device: Device): Obj[] {
    nextId = 0
    switch (device.id) {
      case "4v3b":
        return [
          text(24, 24, 360, 44, "Wohnraum", 30),
          text(24, 60, 360, 24, "Stube · 21:40", 16, "textMuted"),
          liveText(560, 26, 216, 52, TOPICS.temp, 28, " °C"),
          line(24, 96, 752),
          level("bar", 24, 112, 752, 88, TOPICS.fresh, "Frischwasser", 22),
          level("slider", 24, 216, 752, 88, TOPICS.dimmer, "Leselampe", 22, { writeTopic: "schaltli/cmnd/dimmer/1", step: 5 }),
          arc("dial", 24, 316, 144, { writeTopic: "schaltli/cmnd/heater/target", step: 1 }),
          text(184, 322, 120, 24, "Licht", 20),
          toggle(184, 350, 240, 56, TOPICS.light, 18),
          group(184, 416, 240, 48, 16),
          box(456, 316, 320, 148),
          text(472, 328, 288, 24, "Heizung", 18, "textMuted"),
          button(472, 360, 288, 52, "Alles aus", 18, "accentAlt"),
          text(472, 424, 288, 24, "Sollwert 21 °C", 16, "textMuted"),
        ]
      case "knob":
        return [
          arc("dial", 92, 28, 176, { writeTopic: "schaltli/cmnd/heater/target", step: 1 }),
          text(80, 208, 200, 28, "Heizung", 22, "text", "center"),
          toggle(92, 244, 176, 48, TOPICS.light, 16),
          level("bar", 100, 304, 160, 28, TOPICS.fresh, undefined, 14),
        ]
      default:
        return [
          text(48, 40, 500, 48, "Wasser und Strom", 34),
          liveText(696, 40, 216, 56, TOPICS.temp, 30, " °C"),
          line(48, 112, 864),
          level("bar", 48, 132, 864, 96, TOPICS.grey, "Grauwasser", 24),
          level("bar", 48, 244, 864, 96, TOPICS.battery, "Batterie", 24),
          arc("gauge", 48, 360, 152),
          text(224, 368, 200, 28, "Wasserpumpe", 22),
          toggle(224, 400, 260, 64, TOPICS.pump, 20),
          box(520, 360, 392, 152),
          group(540, 380, 352, 52, 18),
          button(540, 444, 352, 52, "Alles aus", 20, "accentAlt"),
        ]
    }
  }

  function resolve(objects: Obj[], theme: Theme, variant: Variant, depth: string): Obj[] {
    return objects.map((o) => {
      const properties = { ...o.properties }
      for (const key of ["color", "backgroundColor", "borderColor", "fillColor", "strokeColor", "textColor", "buttonColor", "switchColor", "iconColor"]) {
        const v = properties[key]
        if ((ROLES as readonly string[]).includes(v)) properties[key] = resolveRole(theme, v as Role, variant, depth)
      }
      return { ...o, properties }
    })
  }

  async function render(page: import("@playwright/test").Page, device: Device, theme: Theme, variant: Variant): Promise<string> {
    const project = {
      name: `${theme.id}-${variant}`,
      screenWidth: device.width,
      screenHeight: device.height,
      fonts: [],
      assets: [],
      topics: Object.values(TOPICS).map((topic) => ({ topic, examples: [VALUES[topic]] })),
      screens: [{ id: "s", name: "Probe", backgroundColor: resolveRole(theme, "surface", variant, device.colorDepth), objects: resolve(sampleScreen(device), theme, variant, device.colorDepth) }],
      settings: { colorDepth: device.colorDepth },
    }
    return page.evaluate((req) => (window as any).__renderScreenForTest(req), { project, screenIndex: 0, topicOverrides: VALUES })
  }

  // Pixel statistics of a data-URL PNG, read back in the browser.
  async function stats(page: import("@playwright/test").Page, dataUrl: string) {
    return page.evaluate(async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const c = document.createElement("canvas")
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      const { data } = ctx.getImageData(0, 0, c.width, c.height)
      const seen = new Set<number>()
      let grey = 0
      let onRamp = 0
      const n = data.length / 4
      for (let i = 0; i < data.length; i += 4) {
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
        if (data[i] === data[i + 1] && data[i + 1] === data[i + 2]) grey++
        if (data[i] % 17 === 0 && data[i + 1] % 17 === 0 && data[i + 2] % 17 === 0) onRamp++
      }
      return { colours: seen.size, grey: grey / n, onRamp: onRamp / n }
    }, dataUrl)
  }

  test("every theme draws every control on every device, and the page to choose from", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)

    const renders: Record<string, string> = {}
    for (const theme of THEMES) {
      for (const device of DEVICES) {
        const light = await render(page, device, theme, "light")
        const dark = await render(page, device, theme, "dark")
        renders[`${theme.id}/${device.id}/light`] = light
        renders[`${theme.id}/${device.id}/dark`] = dark

        const s = await stats(page, light)
        expect(s.colours, `${theme.id} on ${device.id} draws something`).toBeGreaterThan(4)
        if (device.colorDepth === "24bit") {
          expect(light, `${theme.id} on ${device.id}: light and dark differ`).not.toBe(dark)
        } else {
          // One variant on the PaperS3, and (nearly) nothing but its sixteen
          // greys. Off the ramp: the anti-aliased edges of the fallback font,
          // which stands in for the device's pixel font here. Not grey at
          // all: the arc's track, a blend of fill and ground that
          // render-arc-level.ts (l. 657) does not put back on the ramp - a
          // designer-side quirk from before themes, which the panel shows in
          // RGB565 anyway. The bar's track is on the ramp.
          expect(light, `${theme.id} on ${device.id}: one variant`).toBe(dark)
          expect(s.grey, `${theme.id} on ${device.id}: grey but for the arc's track`).toBeGreaterThan(0.99)
          expect(s.onRamp, `${theme.id} on ${device.id}: on the ramp`).toBeGreaterThan(0.97)
        }
      }
    }

    const html = cataloguePage(renders, DEVICES)
    const out = testInfo.outputPath("theme-catalogue.html")
    fs.writeFileSync(out, html)
    await testInfo.attach("theme-catalogue", { path: out, contentType: "text/html" })
    // Where the last run's page can be found without digging through
    // test-results: overwritten every run, never committed.
    fs.writeFileSync(path.join(__dirname, "..", "test-results", "theme-catalogue.html"), html)
  })

  function cataloguePage(renders: Record<string, string>, devices: Device[]): string {
    const swatches = (theme: Theme, variant: Variant) =>
      ROLES.map((role) => `<div class="sw"><i style="background:${theme[variant][role]}"></i><span>${ROLE_LABELS[role]}<br>${theme[variant][role]}</span></div>`).join("")
    const sections = THEMES.map((theme) => {
      const shots = devices
        .flatMap((d) => (d.colorDepth === "24bit" ? [["light", "hell"], ["dark", "dunkel"]] : [["light", "eine Variante"]]).map(([v, label]) => ({ d, v, label })))
        .map(({ d, v, label }) => `<figure data-device="${d.id}"><img src="${renders[`${theme.id}/${d.id}/${v}`]}" alt="${theme.name}, ${d.name}, ${label}"><figcaption>${d.name} · ${label}</figcaption></figure>`)
        .join("")
      return `<section id="${theme.id}"><h2>${theme.name} <code>${theme.id}</code></h2>
<div class="rows"><div class="row"><b>hell</b>${swatches(theme, "light")}</div><div class="row"><b>dunkel</b>${swatches(theme, "dark")}</div></div>
<div class="shots">${shots}</div></section>`
    }).join("\n")
    return `<!doctype html><html lang="de"><meta charset="utf-8"><title>Schaltli Themes</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;700&family=Varela+Round&display=swap">
<style>
:root{--paper:#fff;--ink:#111;--muted:#555;--rule:#eee}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--paper:#111;--ink:#eee;--muted:#aaa;--rule:#333;color-scheme:dark}}
:root[data-theme=dark]{--paper:#111;--ink:#eee;--muted:#aaa;--rule:#333;color-scheme:dark}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 "Nunito Sans",system-ui,sans-serif;padding:32px 16px 64px}
main{max-width:1280px;margin:0 auto}
h1,h2{font-family:"Varela Round",system-ui,sans-serif;font-weight:400;margin:0}
h1{font-size:2rem}
p.lead{color:var(--muted);max-width:70ch;margin:8px 0 24px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:32px}
nav a{color:var(--ink);text-decoration:none;border:1px solid var(--rule);border-radius:999px;padding:4px 12px;font-size:14px}
section{border-top:2px solid var(--ink);padding-top:16px;margin-bottom:48px}
h2{font-size:1.5rem;display:flex;align-items:baseline;gap:12px}
h2 code{font:13px ui-monospace,Consolas,monospace;color:var(--muted)}
.rows{display:grid;gap:8px;margin:12px 0 16px}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.row b{width:56px;font-weight:700;font-size:13px}
.sw{display:flex;align-items:center;gap:6px;width:150px}
.sw i{display:block;width:26px;height:26px;border-radius:6px;border:1px solid var(--rule);flex:none}
.sw span{font:11px/1.25 ui-monospace,Consolas,monospace;color:var(--muted)}
.shots{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:end}
@media (max-width:900px){.shots{grid-template-columns:1fr 1fr}}
figure[data-device="4v3b"],figure[data-device="papers3"]{grid-column:span 2}
figure{margin:0}
figure img{display:block;width:100%;height:auto;border-radius:8px;border:1px solid var(--rule)}
figure[data-device="knob"] img{border-radius:50%}
figcaption{font-size:13px;color:var(--muted);margin-top:6px}
</style>
<main>
<h1>Schaltli Themes</h1>
<p class="lead">Acht Themes, jedes in hell und dunkel, gezeichnet mit den Renderern des Designers: Text, Live-Text, Linie, Box, Bar, Slider, Gauge, Dial, Switch, Button-Group und Button. Das PaperS3 hat eine Variante (die helle, auf seine 16 Graustufen gerundet). Die Schrift ist die Ersatzschrift des Browsers, nicht die Pixelschrift der Geräte.</p>
<nav>${THEMES.map((t) => `<a href="#${t.id}">${t.name}</a>`).join("")}</nav>
${sections}
</main></html>`
  }
})

// Task 2 of tasks/todo.md: a project whose colours are roles is drawn and
// exported in each screen's theme. A master screen has a theme of its own
// that its screens inherit, and any screen can override it (user,
// 2026-09-24); the master's objects are drawn in the theme of the screen
// they appear on.
test.describe("drawing and export from roles", () => {
  const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")
  const SLATE = THEMES.find((t) => t.id === "slate")!
  const AMBER = THEMES.find((t) => t.id === "amber")!

  // The 24-bit round fixture, rewritten: a master in Slate with a box in the
  // accent colour over the middle of the screen, a screen that inherits the
  // master's theme, and one that overrides it with Amber. No colour in it is
  // a hex.
  async function themedProjectZip(): Promise<{ file: string; project: any }> {
    const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const box = {
      id: "theme-box",
      type: "box",
      zIndex: 1,
      // Over the middle whether the screen is the fixture's 240 or the
      // round device's 360 it takes on loading.
      x: 100,
      y: 100,
      width: 160,
      height: 160,
      properties: { fillColor: "accent", strokeColor: "outline", strokeWidth: 2, cornerRadius: 0 },
    }
    project.screens = [
      { id: "theme-master", name: "Theme master", isMaster: true, themeId: "slate", objects: [box] },
      { id: "theme-inherits", name: "Inherits", masterScreenId: "theme-master", objects: [] },
      { id: "theme-amber", name: "Amber", masterScreenId: "theme-master", themeId: "amber", objects: [] },
    ]
    zip.file("project.json", JSON.stringify(project))
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "themes-")), "themed-project.zip")
    fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
    return { file, project }
  }

  const hex = (c: { r: number; g: number; b: number }) =>
    "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")

  async function centrePixel(page: Page) {
    const { canvas, box } = await getMainCanvas(page)
    return canvas.evaluate(
      (el: HTMLCanvasElement, at: { x: number; y: number }) => {
        const d = el.getContext("2d")!.getImageData(at.x, at.y, 1, 1).data
        return { r: d[0], g: d[1], b: d[2] }
      },
      { x: Math.round(box.width / 2), y: Math.round(box.height / 2) },
    )
  }

  test("a master's box takes each screen's theme, on the canvas and in the thumbnails", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    const { file } = await themedProjectZip()
    await loadProject(page, file)

    await page.locator('[data-screen-id="theme-inherits"]').click()
    await expect.poll(async () => hex(await centrePixel(page))).toBe(SLATE.light.accent.toLowerCase())
    await page.locator('[data-screen-id="theme-amber"]').click()
    await expect.poll(async () => hex(await centrePixel(page))).toBe(AMBER.light.accent.toLowerCase())

    // The thumbnails draw at the screen's own 240x240: their centres are
    // the box, in each screen's theme.
    const thumbs = await page.locator('[data-screen-id] canvas').evaluateAll((canvases) =>
      canvases.map((c) => {
        const el = c as HTMLCanvasElement
        const d = el.getContext("2d")!.getImageData(el.width / 2, el.height / 2, 1, 1).data
        return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")
      }),
    )
    expect(thumbs).toContain(SLATE.light.accent.toLowerCase())
    expect(thumbs).toContain(AMBER.light.accent.toLowerCase())
  })

  // Task 4: the user picks roles, and a theme per screen.
  test("a colour is chosen as a role, and nothing else", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    const { file } = await themedProjectZip()
    await loadProject(page, file)
    await page.locator('[data-screen-id="theme-master"]').click()
    await objectTreeRow(page, "theme-box").click()

    const fill = page.locator("[data-row-label]", { hasText: "Fill" }).first().locator("..").getByRole("combobox")
    await expect(fill).toHaveText("Accent")
    await fill.click()
    const options = (await page.getByRole("option").allTextContents()).map((t) => t.trim())
    // The eight roles, and "Transparent" because a new box has no fill and
    // must be able to go back to none. No colour list, no hex.
    expect(options).toEqual(["Transparent", ...ROLES.map((r) => ROLE_LABELS[r])])
    await page.getByRole("option", { name: "Second accent", exact: true }).click()
    await expect(fill).toHaveText("Second accent")

    await page.locator('[data-screen-id="theme-inherits"]').click()
    await expect.poll(async () => hex(await centrePixel(page))).toBe(SLATE.light.accentAlt.toLowerCase())
  })

  test("a screen inherits its master's theme, can pick its own, and one undo takes it back", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    const { file } = await themedProjectZip()
    await loadProject(page, file)

    await page.locator('[data-screen-id="theme-inherits"]').click()
    const picker = page.getByTestId("theme-picker")
    // Closed: the name and the accent as a blot, nothing more.
    await expect(picker).toHaveText("Inherited from Master (Slate)")
    await picker.click()
    // Open: the inherit entry and the eight themes, each as two small screens.
    await expect(page.getByRole("option")).toHaveCount(1 + THEMES.length)
    await expect(page.locator('[role="option"][data-theme-id="inherit"]')).toHaveText("Inherit from Master (Slate)")
    for (const theme of THEMES) {
      const option = page.locator(`[role="option"][data-theme-id="${theme.id}"]`)
      await expect(option).toContainText(theme.name)
      for (const variant of ["light", "dark"] as const) {
        const colours = await option.locator(`canvas[data-variant="${variant}"]`).evaluate((c: HTMLCanvasElement) => {
          const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height)
          const seen = new Set<string>()
          for (let i = 0; i < data.length; i += 4) seen.add("#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join(""))
          return [...seen]
        })
        expect(colours, `${theme.id} ${variant}: its surface`).toContain(theme[variant].surface.toLowerCase())
        expect(colours, `${theme.id} ${variant}: its accent`).toContain(theme[variant].accent.toLowerCase())
      }
    }

    const FOREST = THEMES.find((t) => t.id === "forest")!
    await page.locator('[role="option"][data-theme-id="forest"]').click()
    await expect(picker).toHaveText("Forest")
    await expect.poll(async () => hex(await centrePixel(page))).toBe(FOREST.light.accent.toLowerCase())

    await page.getByRole("button", { name: "Undo" }).click()
    await expect.poll(async () => hex(await centrePixel(page))).toBe(SLATE.light.accent.toLowerCase())
    await expect(picker).toHaveText("Inherited from Master (Slate)")

    // A master has a theme of its own, always: no inherit entry.
    await page.locator('[data-screen-id="theme-master"]').click()
    await expect(picker).toHaveText("Slate")
    await picker.click()
    await expect(page.getByRole("option")).toHaveCount(THEMES.length)
    await expect(page.locator('[role="option"][data-theme-id="inherit"]')).toHaveCount(0)
    await page.keyboard.press("Escape")
  })

  // Task 5: light and dark in the editor, and the Themes tab.
  test("Dark shows the dark variant on the canvas and in the thumbnails, and is no edit", async ({ page }) => {
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    const { file } = await themedProjectZip()
    await loadProject(page, file)
    await page.locator('[data-screen-id="theme-inherits"]').click()
    const undo = page.getByRole("button", { name: "Undo" })
    const undoBefore = await undo.isDisabled()

    // The footer's "Dark" switch, beside "Adornment".
    const dark = page.getByRole("switch", { name: "Dark" })
    await dark.click()
    await expect(dark).toHaveAttribute("aria-checked", "true")
    await expect.poll(async () => hex(await centrePixel(page))).toBe(SLATE.dark.accent.toLowerCase())
    const thumbs = async () =>
      page.locator("[data-screen-id] canvas").evaluateAll((canvases) =>
        canvases.map((c) => {
          const el = c as HTMLCanvasElement
          const d = el.getContext("2d")!.getImageData(el.width / 2, el.height / 2, 1, 1).data
          return "#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")
        }),
      )
    await expect.poll(thumbs).toContain(AMBER.dark.accent.toLowerCase())

    // A view, not a change to the project: nothing to undo.
    expect(await undo.isDisabled()).toBe(undoBefore)

    await dark.click()
    await expect(dark).toHaveAttribute("aria-checked", "false")
    await expect.poll(async () => hex(await centrePixel(page))).toBe(SLATE.light.accent.toLowerCase())
  })

  test("a grey or 1-bit device has one variant, and the Dark switch says so", async ({ page }) => {
    await loadProject(page, path.join(__dirname, "..", "test-projects", "combined-test-project.zip"))
    const dark = page.getByRole("switch", { name: "Dark" })
    await expect(dark).toBeDisabled()
    await expect(dark).toHaveAttribute("aria-checked", "false")
  })

  test("every screen has a master: no \"No master\" to choose, and old files get one", async ({ page }) => {
    // The rule (user, 2026-09-25), on a file: a screen without a master is
    // given the first master, keeping its look - it showed no master's
    // objects, so it still does not - and a project without any master gets
    // one, with a theme.
    const orphans = {
      screens: [
        { id: "a", name: "A", objects: [] },
        { id: "m", name: "M", isMaster: true, themeId: "forest", objects: [{ id: "x" }] },
        { id: "b", name: "B", masterScreenId: "gone", objects: [] },
      ],
    }
    ensureEveryScreenHasAMaster(orphans)
    expect(orphans.screens.find((s) => s.id === "a")).toMatchObject({ masterScreenId: "m", showMaster: false })
    expect(orphans.screens.find((s) => s.id === "b")).toMatchObject({ masterScreenId: "m", showMaster: false })
    expect(themeFor(orphans.screens[0] as any, orphans.screens as any).id).toBe("forest")
    const none = { screens: [{ id: "a", name: "A", objects: [] }] }
    ensureEveryScreenHasAMaster(none)
    const master = none.screens.find((s: any) => s.isMaster) as any
    expect(master.themeId).toBe("lavender")
    expect((none.screens.find((s) => s.id === "a") as any).masterScreenId).toBe(master.id)
    // The screen the user had stays first, which is the one the editor opens.
    expect(none.screens[0].id).toBe("a")
    expect(ensureEveryScreenHasAMaster(none)).toBe(false)

    // And in the designer: the master select has the masters and nothing else.
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    const { file } = await themedProjectZip()
    await loadProject(page, file)
    await page.locator('[data-screen-id="theme-inherits"]').click()
    await page.getByRole("combobox").filter({ hasText: "Theme master" }).first().click()
    expect((await page.getByRole("option").allTextContents()).map((t) => t.trim())).toEqual(["Theme master"])
  })

  test("the firmware and Android exports carry each screen's colours, never a role", async ({ page }) => {
    const { project } = await themedProjectZip()
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)

    for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"]) {
      const base64: string = await page.evaluate(([name, p]) => (window as any)[name as string](p), [hook, project] as const)
      const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
      const json = JSON.parse(await zip.file("project.json")!.async("string"))
      const screens = new Map<string, any>(json.screens.map((s: any) => [s.id, s]))
      const inherits = screens.get("theme-inherits")
      const amber = screens.get("theme-amber")
      expect(inherits, hook).toBeTruthy()
      const boxOf = (s: any) => s.objects.find((o: any) => o.id === "theme-box")
      expect(boxOf(inherits).properties.fillColor.toLowerCase(), hook).toBe(SLATE.light.accent.toLowerCase())
      expect(boxOf(amber).properties.fillColor.toLowerCase(), hook).toBe(AMBER.light.accent.toLowerCase())
      expect(inherits.backgroundColor.toLowerCase(), hook).toBe(SLATE.light.surface.toLowerCase())
      expect(amber.backgroundColor.toLowerCase(), hook).toBe(AMBER.light.surface.toLowerCase())
      // No role name anywhere a colour goes.
      const text = JSON.stringify(json)
      for (const role of ROLES) expect(text, `${hook}: ${role}`).not.toMatch(new RegExp(`Color"\s*:\s*"${role}"`))
    }
  })
})

// Task 3 of tasks/todo.md: new objects are born with roles, and the files
// from before themes - the test fixtures and the generation corpus, there
// is no productive data - arrive with them.
test.describe("roles at creation and on loading", () => {
  const FIXTURES = [
    "test-projects/combined-test-project.zip",
    "test-projects/switch-test-project.zip",
    "test-projects/generations/project-none.zip",
    "test-projects/generations/project-1.0.zip",
  ]
  const readProject = async (file: string) =>
    JSON.parse(await (await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, "..", file)))).file("project.json")!.async("string"))

  // Every string under a key ending in "color", anywhere in the screens.
  function colourValues(screens: any[]): { key: string; value: string }[] {
    const out: { key: string; value: string }[] = []
    const walk = (node: any, key?: string) => {
      if (Array.isArray(node)) node.forEach((n) => walk(n, key))
      else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) walk(v, k)
      else if (typeof node === "string" && key && /color$/i.test(key)) out.push({ key, value: node })
    }
    walk(screens)
    return out
  }

  test("the creation palette is roles, and draws what the old palette drew", () => {
    const lavender = THEMES.find((t) => t.id === "lavender")!
    const old = controlPalette("24bit")
    for (const key of ["background", "border", "text", "textOnFill", "stroke", "fill", "accent"] as const) {
      const role = ROLE_PALETTE[key]
      expect(isRole(role), key).toBe(true)
      expect(resolveRole(lavender, role as Role, "light", "24bit").toLowerCase(), key).toBe(old[key].toLowerCase())
    }
  })

  for (const fixture of FIXTURES) {
    test(`${path.basename(fixture)} opens with roles and no hex, and a second pass changes nothing`, async () => {
      const project = await readProject(fixture)
      migrateProject(project)
      for (const { key, value } of colourValues(project.screens)) {
        expect(isRole(value) || value === "transparent", `${key}: ${value}`).toBe(true)
      }
      for (const screen of project.screens) {
        expect(screen.gridColor, screen.id).toBeUndefined()
        if (screen.isMaster) expect(screen.themeId, screen.id).toBeTruthy()
      }
      const once = JSON.stringify(project)
      expect(migrateColorsToRoles(project)).toBe(false)
      expect(JSON.stringify(project)).toBe(once)
    })
  }

  test("a colour that is neither a role nor a colour from before themes is refused, naming the object", () => {
    const project = {
      settings: { colorDepth: "24bit" },
      screens: [{ id: "s1", objects: [{ id: "obj-7", type: "text", properties: { color: "not-a-colour" } }] }],
    }
    expect(() => migrateColorsToRoles(project)).toThrow(ThemeColorError)
    expect(() => migrateColorsToRoles(project)).toThrow(/obj-7/)
  })

  test("an object created with default colours exports exactly as before themes", async ({ page }) => {
    // The 24-bit fixture's colours are the old defaults. Exported before and
    // after migration, the device sees the same colours.
    const raw = await readProject("test-projects/switch-test-project.zip")
    const migrated = migrateProject(structuredClone(raw))
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    const exported = async (project: any) => {
      const base64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), project)
      const json = JSON.parse(await (await JSZip.loadAsync(Buffer.from(base64, "base64"))).file("project.json")!.async("string"))
      return colourValues(json.screens)
        .filter(({ key }) => ["color", "backgroundColor", "borderColor", "fillColor", "strokeColor", "textColor", "buttonColor", "switchColor", "iconColor"].includes(key))
        .map(({ key, value }) => `${key}=${value.toLowerCase()}`)
    }
    expect(await exported(migrated)).toEqual(await exported(raw))
  })

  test("a hand-picked colour lands on the nearest role", () => {
    const project = {
      settings: { colorDepth: "24bit" },
      screens: [
        {
          id: "s",
          objects: [
            { id: "a", type: "text", properties: { color: "MediumPurple", backgroundColor: "#fefefe", borderColor: "#c8c8c8" } },
            { id: "b", type: "box", properties: { fillColor: "#e0e0e0", strokeColor: "#101010" } },
          ],
        },
      ],
    }
    migrateColorsToRoles(project)
    const [a, b] = project.screens[0].objects
    expect(a.properties).toEqual({ color: "accent", backgroundColor: "surface", borderColor: "outline" })
    expect(b.properties).toEqual({ fillColor: "panel", strokeColor: "text" })
  })
})

// Every tool, used the way a user uses it - picked in the toolbar and dragged
// on the canvas - and the saved project read back. The canvas has creation
// paths of its own besides project-editor.tsx's; one of them kept hex
// defaults after Task 3 and was only found by hand (user, 2026-09-25).
test.describe("objects created from the toolbar", () => {
  const TOOLS = ["Text", "Live Text", "Bar", "Gauge", "Slider", "Dial", "Switch", "Button Group", "Button", "Line", "Box"]

  async function downloadProjectJson(page: Page): Promise<any> {
    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const chunks: Buffer[] = []
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
    return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
  }

  test("carry roles and never a hex, and a new label has no background and no border", async ({ page }) => {
    test.setTimeout(120_000)
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
    await loadProject(page, path.join(__dirname, "..", "test-projects", "switch-test-project.zip"))
    const { box } = await getMainCanvas(page)

    for (const tool of TOOLS) {
      await page.getByRole("button", { name: tool, exact: true }).first().click()
      await page.waitForTimeout(150)
      const from = devicePoint(box, 120, 150)
      const to = devicePoint(box, 240, 210)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move(to.x, to.y, { steps: 5 })
      await page.mouse.up()
      await page.waitForTimeout(150)
      await page.keyboard.press("Escape")
    }

    const project = await downloadProjectJson(page)
    const created = project.screens.flatMap((screen: any) => screen.objects).filter((o: any) => o.id !== "switch-1")
    const types = new Set(created.map((o: any) => o.type))
    for (const type of ["text", "live-text", "bar", "gauge", "slider", "dial", "switch", "button-group", "button", "line", "box"]) {
      expect(types, `a ${type} was created`).toContain(type)
    }
    for (const object of created) {
      for (const [key, value] of Object.entries(object.properties as Record<string, unknown>)) {
        if (!/color$/i.test(key) || value === undefined) continue
        expect(isRole(value) || value === "transparent", `${object.type}.${key} = ${value}`).toBe(true)
      }
    }
    const label = created.find((o: any) => o.type === "text")
    expect(label.properties.backgroundColor).toBe("transparent")
    expect(label.properties.borderColor).toBe("transparent")
  })
})

// Findings of the code review of theme-model (2026-09-25), each pinned.
test.describe("theme-model review findings", () => {
  const SLATE = THEMES.find((t) => t.id === "slate")!
  const RING =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iY3VycmVudENvbG9yIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xMiAxLjVBMTAuNSAxMC41IDAgMSAwIDEyIDIyLjVBMTAuNSAxMC41IDAgMSAwIDEyIDEuNVpNMTIgNkE2IDYgMCAxIDEgMTIgMThBNiA2IDAgMSAxIDEyIDZaIi8+PC9zdmc+"

  // R1: a master's Switch and Button, on two screens in two themes, are two
  // pictures each - baked per screen, not once for the last screen.
  test("a master's switch icons and buttons are baked once per screen, in each screen's theme", async ({ page }) => {
    const project = {
      name: "bakes",
      screenWidth: 360,
      screenHeight: 360,
      fonts: [],
      assets: [{ id: "ring", name: "ring", type: "icon", data: RING }],
      topics: [{ id: "t", topic: "t/power", type: "text", examples: ["on"] }],
      hardwareButtons: [],
      settings: { colorDepth: "24bit", exportFormat: "esp32", gridSize: 10, snapTolerance: 5, snapGrid: "{}" },
      nextId: 10,
      screens: [
        {
          id: "m",
          name: "M",
          isMaster: true,
          themeId: "slate",
          objects: [
            {
              id: "sw",
              type: "switch",
              zIndex: 1,
              x: 40,
              y: 40,
              width: 200,
              height: 60,
              properties: {
                topic: "t/power",
                writeTopic: "t/set",
                switchStyle: "filled",
                switchColor: "accent",
                states: [
                  { id: "off", label: "Aus", readValue: "off", writeValue: "off" },
                  { id: "on", label: "An", readValue: "on", writeValue: "on", showAsOn: true, iconAssetId: "ring" },
                ],
              },
            },
            {
              id: "btn",
              type: "button",
              zIndex: 2,
              x: 40,
              y: 140,
              width: 200,
              height: 60,
              properties: { text: "Go", buttonStyle: "filled", buttonColor: "accent", action: { type: "next-screen" } },
            },
          ],
        },
        { id: "a", name: "A", masterScreenId: "m", objects: [] },
        { id: "b", name: "B", masterScreenId: "m", themeId: "amber", objects: [] },
      ],
    }
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)
    for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"]) {
      const base64: string = await page.evaluate(([name, p]) => (window as any)[name as string](p), [hook, project] as const)
      const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
      const json = JSON.parse(await zip.file("project.json")!.async("string"))
      const screen = (id: string) => json.screens.find((s: any) => s.id === id)
      const obj = (id: string, objId: string) => screen(id).objects.find((o: any) => o.id === objId)
      const bytes = async (p: string) => zip.file(p)!.async("base64")
      const buttonPath = (id: string): string => {
        const o = obj(id, "btn")
        // The firmware's bundle says pathNormal, the app's path.
        return o.pathNormal ?? o.path
      }
      const [ba, bb] = [buttonPath("a"), buttonPath("b")]
      expect(ba, `${hook}: button on A`).toBeTruthy()
      expect(ba, `${hook}: two screens, two buttons`).not.toBe(bb)
      expect(await bytes(ba), `${hook}: the two buttons are different pictures`).not.toBe(await bytes(bb))
      if (hook === "__buildDeviceZipForTest") {
        // Firmware switch state icons carry the backdrop, so they differ too.
        const icon = (id: string): string => obj(id, "sw").properties.states[1].path
        expect(icon("a"), "switch icon on A").toBeTruthy()
        expect(icon("a")).not.toBe(icon("b"))
        expect(await bytes(icon("a"))).not.toBe(await bytes(icon("b")))
        // And each screen's flattened background is its own surface.
        expect(await bytes(screen("a").path)).not.toBe(await bytes(screen("b").path))
      }
    }
  })

  // R2: an unset colour draws in the theme, and in dark, not in a fixed hex.
  test("a colour that is not set is drawn with its default role, light and dark", () => {
    const objects = [
      { id: "b", type: "box", properties: {} },
      { id: "t", type: "text", properties: { text: "x" } },
      { id: "l", type: "bar", properties: {} },
      { id: "i", type: "icon", properties: { assetId: "a" } },
      { id: "old", type: "text", properties: { textColor: "accent" } },
    ] as any[]
    const dark = applyTheme(objects, SLATE, "dark", "24bit")
    expect(dark[0].properties).toMatchObject({ fillColor: SLATE.dark.panel, strokeColor: SLATE.dark.text })
    expect(dark[1].properties).toMatchObject({
      color: SLATE.dark.text,
      backgroundColor: SLATE.dark.surface,
      borderColor: SLATE.dark.outline,
    })
    expect(dark[2].properties).toMatchObject({ fillColor: SLATE.dark.accent, textColor: SLATE.dark.text })
    // An icon's unset tint means "its own colours", and its background none.
    expect(dark[3].properties.iconColor).toBeUndefined()
    expect(dark[3].properties.backgroundColor).toBeUndefined()
    // An old text that carries textColor keeps it; no second colour is added.
    expect(dark[4].properties.color).toBeUndefined()
    expect(dark[4].properties.textColor).toBe(SLATE.dark.accent)
  })

  // R3: nothing but a hex or "transparent" leaves for a device.
  test("an export refuses a colour that is neither a hex nor transparent, naming the object", () => {
    expect(() => assertDeviceColours([{ id: "o1", properties: { fillColor: "accnt" } }], "screen S")).toThrow(/o1.*fillColor.*accnt/)
    expect(() =>
      assertDeviceColours([{ id: "o2", properties: { fillColor: "#6750A4", borderColor: "transparent" } }], "screen S"),
    ).not.toThrow()
  })

  // O1, O3, O4: what older files hold.
  test("old files: trimmed hex, the old green fill, empty screen colours and nested colours", () => {
    const project = {
      settings: { colorDepth: "24bit" },
      screens: [
        {
          id: "s1",
          backgroundColor: "",
          objects: [
            { id: "a", type: "bar", properties: { fillColor: "#4CAF50", textColor: " #000000 " } },
            { id: "b", type: "switch", properties: { switchColor: "#4CAF50", states: [{ id: "on", color: "#ff0000" }] } },
          ],
        },
        { id: "s2", backgroundColor: "transparent", objects: [] },
      ],
    }
    migrateColorsToRoles(project)
    const [a, b] = project.screens[0].objects as any[]
    expect(a.properties).toEqual({ fillColor: "accent", textColor: "text" })
    expect(b.properties.switchColor).toBe("accent")
    expect(b.properties.states[0]).toEqual({ id: "on" })
    expect("backgroundColor" in project.screens[0]).toBe(false)
    expect("backgroundColor" in project.screens[1]).toBe(false)
  })

  // Test gap 5: the 1-bit fixture, with its greens, names and empty strings.
  // Every hex it holds is shown on a 1-bit panel exactly as before once it
  // is a role. (Colour names are left out of the comparison: the old
  // exporter sent "black" as it was, and the firmware draws any colour that
  // is not a hex as white - migration makes it the black it always meant.)
  test("the 1-bit fixture shows every colour it set the same after migration", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, "..", "test-projects", "combined-test-project.zip")))
    const raw = JSON.parse(await zip.file("project.json")!.async("string"))
    const migrated = migrateProject(structuredClone(raw))
    const lavender = THEMES.find((t) => t.id === "lavender")!
    const KEYS = ["color", "backgroundColor", "borderColor", "fillColor", "strokeColor", "textColor", "buttonColor", "switchColor", "iconColor"]
    const changed: string[] = []
    const compare = (rawObjects: any[], newObjects: any[], where: string) => {
      rawObjects.forEach((o: any, i: number) => {
        const n = newObjects[i]
        for (const key of KEYS) {
          const v = o.properties?.[key]
          if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v.trim())) continue
          const before = applyColorDepth(v.trim(), "1bit")
          const role = n.properties[key]
          const after = isRole(role) ? resolveRole(lavender, role, "light", "1bit") : role
          if (before.toLowerCase() !== String(after).toLowerCase()) changed.push(`${where}/${o.id}.${key}: ${v} -> ${role}`)
        }
        compare(o.children ?? [], n.children ?? [], `${where}/${o.id}`)
      })
    }
    raw.screens.forEach((screen: any, i: number) => compare(screen.objects, migrated.screens[i].objects, screen.id))
    expect(changed).toEqual([])
  })
})
