import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import { Jimp } from "jimp"
import { barLayout, themeSwitchLength, NAVIGATOR_DIVIDER } from "../lib/navigator"

const THEME_SWITCH_LENGTH = themeSwitchLength("left")
const ALONG_BOTTOM = themeSwitchLength("bottom")
import { BACK_ARROW_ASSETS, entryLook, navigatorEntries, navigatorEntryObjects } from "../lib/navigator-entries"
import { THEMES, applyTheme, resolveRole } from "../lib/themes"

// The navigator's options of 2026-10-11: «Background» Panel or Accent, and a
// light/dark switch at the start (Near) or end (Far) of the bar that stands
// still while the entries scroll - and the open entry's box as far from the
// line as from the other side.

const svg = (body: string) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`).toString("base64")}`

function project(nav: Record<string, unknown>): any {
  const navigator = { id: "nav", type: "navigator", x: 0, y: 0, width: 80, height: 480, zIndex: 9, properties: { edge: "left", shows: "iconsAndText", ...nav } }
  return {
    name: "nav-switch",
    screenWidth: 800,
    screenHeight: 480,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [{ id: "square", name: "square", type: "icon", data: svg('<rect x="4" y="4" width="16" height="16" fill="currentColor"/>') }],
    topics: [{ id: "theme", topic: "schaltli/state/theme", type: "text", examples: ["light", "dark"] }],
    screens: [
      { id: "m", name: "Master", isMaster: true, objects: [navigator] },
      { id: "a", name: "Licht", masterScreenId: "m", iconAssetId: "square", objects: [] },
      { id: "c", name: "Heizung", masterScreenId: "m", iconAssetId: "square", objects: [] },
    ],
  }
}

async function ready(page: Page) {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
}

test.describe("the navigator's bar", () => {
  test("the switch's place is cut off at the start or the end; the entries are laid out in the rest", () => {
    const left = { x: 0, y: 0, width: 80, height: 480 }
    const none = barLayout("left", "iconsAndText", left, 4, "none")
    expect(none.themeSwitch).toBeUndefined()
    expect(none.layout.strip).toEqual(left)

    const near = barLayout("left", "iconsAndText", left, 4, "near")
    expect(near.themeSwitch).toEqual({ x: 0, y: 0, width: 80, height: THEME_SWITCH_LENGTH })
    expect(near.layout.strip).toEqual({ x: 0, y: THEME_SWITCH_LENGTH, width: 80, height: 480 - THEME_SWITCH_LENGTH })
    expect(near.layout.entryLength).toBe(Math.floor((480 - THEME_SWITCH_LENGTH) / 4))

    const bottom = { x: 0, y: 400, width: 800, height: 80 }
    const far = barLayout("bottom", "iconsAndText", bottom, 4, "far")
    expect(far.themeSwitch).toEqual({ x: 800 - ALONG_BOTTOM, y: 400, width: ALONG_BOTTOM, height: 80 })
    expect(far.layout.strip).toEqual({ x: 0, y: 400, width: 800 - ALONG_BOTTOM, height: 80 })
    // Narrow: a little more than the switch itself (the user, 2026-10-11).
    expect(THEME_SWITCH_LENGTH).toBeLessThanOrEqual(40)
    expect(ALONG_BOTTOM).toBeLessThanOrEqual(56)
  })

  test("the open entry's box keeps 4 px from the line as from the other side", () => {
    const nav = { id: "n", type: "navigator", x: 0, y: 0, width: 80, height: 480, zIndex: 0, properties: { edge: "left", borderColor: "#cccccc" } } as any
    const [box] = navigatorEntryObjects({ id: "s", name: "S" }, 80, 120, entryLook(nav, []), true)
    expect(box.type).toBe("box")
    expect(box.x).toBe(4)
    expect(80 - (box.x + box.width)).toBe(4 + NAVIGATOR_DIVIDER)
    const plain = navigatorEntryObjects({ id: "s", name: "S" }, 80, 120, entryLook({ ...nav, properties: { edge: "left" } }, []), true)[0]
    expect(80 - (plain.x + plain.width)).toBe(4)
  })

  test("the way back has no name, and shows its arrow alone - no text drawn as «Label»", () => {
    const nav = { id: "n", type: "navigator", x: 0, y: 0, width: 80, height: 480, zIndex: 0, properties: { edge: "left", shows: "iconsAndText" } } as any
    const back = navigatorEntryObjects({ id: "a", name: "", iconAssetId: "schaltli-back-down" }, 80, 120, entryLook(nav, []), false)
    expect(back.map((o) => o.type)).toEqual(["icon"])
    const named = navigatorEntryObjects({ id: "a", name: "A" }, 80, 120, entryLook(nav, []), false)
    expect(named.map((o) => o.type)).toEqual(["icon", "text"])
  })

  test("the way back points to where the page lies: down above it, up below it", () => {
    const screens = [
      { id: "a", name: "A" },
      { id: "top", name: "Top", dock: { screenId: "a", edge: "up" } },
      { id: "low", name: "Low", dock: { screenId: "a", edge: "down" } },
    ] as any[]
    // The arrow's shaft and head: from (12,4) down to (12,20), or the other way.
    const pointsDown = (id: string) => {
      const [entry] = navigatorEntries(screens, id)
      expect(entry.id).toBe("a")
      const svg = Buffer.from(BACK_ARROW_ASSETS.find((a) => a.id === entry.iconAssetId)!.data.split(",")[1], "base64").toString()
      return svg.includes("M12 4v16") ? true : svg.includes("M12 20V4") ? false : undefined
    }
    expect(pointsDown("top")).toBe(true)
    expect(pointsDown("low")).toBe(false)
  })

  test("«Accent»: the strip in the accent, ink on it, the open entry the other way round, no line", () => {
    for (const theme of THEMES) {
      for (const variant of ["light", "dark"] as const) {
        const [nav] = applyTheme([{ type: "navigator", properties: { edge: "left", ground: "accent" } as Record<string, any> }], theme, variant, "24bit")
        const role = (r: any) => resolveRole(theme, r, variant, "24bit")
        expect(nav.properties.backgroundColor, theme.id).toBe(role("accent"))
        expect(nav.properties.textColor, theme.id).toBe(role("onAccent"))
        expect(nav.properties.activeColor, theme.id).toBe(role("surface"))
        expect(nav.properties.activeTextColor, theme.id).toBe(role("accent"))
        expect(nav.properties.borderColor, theme.id).toBeUndefined()
      }
    }
  })
})

test.describe("the light/dark switch, drawn and exported", () => {
  test.beforeEach(async ({ page }) => ready(page))

  test("drawn at Near as an entry: a sun while light, a moon while dark; the entries start below it", async ({ page }) => {
    const p = project({ themeSwitch: "near", backgroundColor: "#202020", textColor: "#c0c0c0", activeColor: "#4060ff", activeTextColor: "#ffffff" })
    const at = async (overrides: Record<string, string>) => {
      const dataUrl: string = await page.evaluate((req) => (window as any).__renderScreenForTest(req), { project: { ...p, screens: [{ ...p.screens[1], objects: p.screens[0].objects }, p.screens[2]] }, screenIndex: 0, topicOverrides: overrides })
      const img = await Jimp.read(Buffer.from(dataUrl.split(",")[1], "base64"))
      return (x: number, y: number) => "#" + (img.getPixelColor(x, y) >>> 8).toString(16).padStart(6, "0")
    }
    const light = await at({ "schaltli/state/theme": "light" })
    const dark = await at({ "schaltli/state/theme": "dark" })
    // The sun becomes the moon (docs/2026-11-11-led-look.md, decision 13).
    let differs = 0
    for (let y = 0; y < THEME_SWITCH_LENGTH; y++) for (let x = 0; x < 78; x++) if (light(x, y) !== dark(x, y)) differs++
    expect(differs).toBeGreaterThan(20)
    // The first entry, open, starts below the switch: its accent box.
    expect(light(10, THEME_SWITCH_LENGTH + 10)).toBe("#4060ff")
    expect(light(10, 10)).toBe("#202020")
  })

  test("exported once with its place and its live icon; the app's bundle has it too, and the line", async ({ page }) => {
    const p = project({ themeSwitch: "far" })
    const base64: string = await page.evaluate((proj) => (window as any).__buildDeviceZipForTest(proj), p)
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
    const nav = JSON.parse(await zip.file("project.json")!.async("string")).navigators[0]
    expect(nav.themeSwitch).toMatchObject({ at: "far", length: THEME_SWITCH_LENGTH })
    expect(nav.entryLength).toBe(Math.floor((480 - THEME_SWITCH_LENGTH) / 2))
    // An entry like the others since 2026-11-11 (LED look, decision 13): a
    // live icon on the theme - the sun, the moon while dark - behind a line;
    // the device asks for the other variant on a tap on the place.
    const icon = nav.themeSwitch.objects.find((o: any) => o.type === "icon")
    expect(icon.properties.liveValues[0].source).toEqual({ namespace: "topic", path: "schaltli/state/theme" })
    expect(icon.properties.liveValues[0].rules.map((r: any) => r.operand)).toEqual(["dark", "light"])
    const line = nav.themeSwitch.objects.find((o: any) => o.type === "box")
    // The strip runs down the left: the line lies across, at the place's top
    // (Far), towards the entries.
    expect(line).toMatchObject({ y: 0, width: 36, height: 1 })
    expect(JSON.parse(await zip.file("project.json")!.async("string")).topics.some((t: any) => t.topic === "schaltli/state/theme")).toBe(true)

    const androidBase64: string = await page.evaluate((proj) => (window as any).__buildAndroidZipForTest(proj), p)
    const androidZip = await JSZip.loadAsync(Buffer.from(androidBase64, "base64"))
    const androidNav = JSON.parse(await androidZip.file("project.json")!.async("string")).navigators[0]
    expect(androidNav.themeSwitch).toMatchObject({ at: "far", length: THEME_SWITCH_LENGTH })
    expect(androidNav.borderColor).toMatch(/^#[0-9a-f]{6}$/i)
    const androidIcon = androidNav.themeSwitch.objects.find((o: any) => o.type === "icon")
    expect(androidIcon.properties.liveValues[0].source.path).toBe("schaltli/state/theme")
  })

  test("without a switch the export has none, and «Accent» exports no line", async ({ page }) => {
    const base64: string = await page.evaluate((proj) => (window as any).__buildDeviceZipForTest(proj), project({ ground: "accent" }))
    const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
    const nav = JSON.parse(await zip.file("project.json")!.async("string")).navigators[0]
    expect(nav.themeSwitch).toBeUndefined()
    expect(nav.borderColor).toBeUndefined()
  })
})

// docs/2026-11-11-led-look.md, decision 12: «Background» LED - the card, the
// open screen's icon in the text colour with a strip under it, the others
// muted; the strip is the marker that glides along with a swipe.
test.describe("the LED look", () => {
  test("the open entry: the icon in the text colour, a 30 x 4 strip in the accent under it; the others muted", () => {
    const nav = { type: "navigator", properties: { ground: "led", shows: "icons", edge: "bottom", backgroundColor: "#181c24", textColor: "#f1f5f9", activeColor: "#0ea5e9", borderColor: "#272d3b" } } as any
    const look = entryLook(nav, [])
    expect(look.led).toBe(true)
    expect(look.activeTextColor).toBe("#f1f5f9")
    const screen = { id: "a", name: "Licht", iconAssetId: "square" } as any
    const open = navigatorEntryObjects(screen, 60, 64, look, true)
    const marker = open.find((o) => o.type === "box")!
    expect(marker).toMatchObject({ width: 30, height: 4, x: 15, properties: { fillColor: "#0ea5e9" } })
    const icon = open.find((o) => o.type === "icon")!
    expect(icon.properties.iconColor).toBe("#f1f5f9")
    // The strip under the icon, the two centred together.
    expect(marker.y).toBe(icon.y + icon.height + 4)
    const shut = navigatorEntryObjects(screen, 60, 64, look, false)
    expect(shut.find((o) => o.type === "box")).toBeUndefined()
    expect(shut.find((o) => o.type === "icon")!.properties.iconColor).toBe(look.mutedColor)
    expect(shut.find((o) => o.type === "icon")!.y).toBe(icon.y)
  })
})
