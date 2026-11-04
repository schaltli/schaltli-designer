import { test, expect, type Page } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { PAPERS3_DDF_SOURCE, seedWaveshare4v3bDdf } from "./ddf-seed"
import { chooseDevice, createProject, deleteProject, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { BDFFont } from "../lib/bdffont"
import { withReplacedFonts } from "../lib/font-migration"
import type { Project, ProjectFont } from "../components/project-editor"

// A project made on the 4.3B's 1-bit fonts, opened once the board's
// description sets text in 4 bits (docs/2026-11-01-4bit-fonts.md, decision 2,
// T7): every font field naming a font the description `replaces` names its
// successor, the project shows as changed, and a text that no longer fits its
// box is named. Opened again after saving, nothing moves.
//
// The board is a fixture id seeded twice: first with its description as it
// was - no 4-bit fonts, the Helvetica typographies - for the project to be
// made on, then as it is now. Its 1-bit fonts left its description with T14;
// the PaperS3 keeps the same u8g2 bitmaps, so the description as it was is
// put together from those.

const FIRMWARE = path.join(__dirname, "..", "..", "schaltli-firmware", "ddf-source-waveshare4v3b")
const OLD_TYPOGRAPHY = [
  { name: "Standard", styles: { caption: "Helvetica", label: "Helvetica", title: "Helvetica", display: "FreeUniversal" } },
  { name: "Humanist", styles: { caption: "Lucida Sans", label: "Lucida Sans", title: "Lucida Sans", display: "FreeUniversal" } },
  { name: "Technic", styles: { caption: "Lucida Sans", label: "Lucida Sans", title: "Logisoso", display: "Seven Segment" } },
]
const asBefore = (manifest: any): Record<string, Buffer> => {
  const old = JSON.parse(fs.readFileSync(path.join(PAPERS3_DDF_SOURCE, "device.json"), "utf8")).fonts
  manifest.fonts = old
  manifest.typography = OLD_TYPOGRAPHY
  return Object.fromEntries(old.map((f: any) => [f.file, fs.readFileSync(path.join(PAPERS3_DDF_SOURCE, f.file))]))
}

// A 1-bit font from the PaperS3's description, a 4-bit one from the 4.3B's.
function widthIn(file: string, text: string): number {
  const dir = fs.existsSync(path.join(FIRMWARE, "fonts", file)) ? FIRMWARE : PAPERS3_DDF_SOURCE
  return new BDFFont(fs.readFileSync(path.join(dir, "fonts", file), "utf8")).measureText(text).width
}

async function downloadProject(page: Page): Promise<any> {
  await page.getByRole("button", { name: "File" }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Download Project" }).click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk))
  return JSON.parse(await (await JSZip.loadAsync(Buffer.concat(chunks))).file("project.json")!.async("string"))
}

const deep = (list: any[]): any[] => (list ?? []).flatMap((o) => [o, ...deep(o.children)])

test("a 1-bit project on the 4.3B opens on its 4-bit fonts, changed, and names the text that no longer fits", async ({ page }) => {
  test.setTimeout(120_000)
  const deviceId = "e2e-4bit-migration-4v3b"
  test.skip(!(await seedWaveshare4v3bDdf(deviceId, asBefore)), "schaltli-firmware not checked out alongside this repo")

  await page.goto("/")
  await waitForDeviceGate(page)
  await chooseDevice(page, deviceId, "auto-discovered")
  const name = await createProject(page, `e2e 4bit migration ${Date.now().toString(36)}`)
  await waitForEditorReady(page)
  try {
    await page.keyboard.press("ControlOrMeta+s")
    let saved: Project | undefined
    await expect(async () => {
      const res = await page.request.get(`/api/projects/${encodeURIComponent(name)}`)
      expect(res.status()).toBe(200)
      saved = (await res.json()).project
    }).toPass({ timeout: 20_000 })

    // A text in a font by hand that fits; one cut to Helvetica 8's width, which
    // Roboto's wider letters will not fit; and a group holding a third, so the
    // nested case is there too.
    const tight = "Grauwasser"
    const tightWidth = widthIn("helvR08.bdf", tight)
    const screen = saved!.screens.find((s) => !s.isMaster)!
    screen.objects.push(
      { id: "mig-roomy", type: "text", x: 10, y: 10, width: 400, height: 22, zIndex: 900, properties: { text: "Frischwasser", fontId: "font-helvR18", fontSize: 27 } },
      { id: "mig-tight", type: "text", x: 10, y: 60, width: tightWidth, height: 16, zIndex: 901, properties: { text: tight, fontId: "font-helvR08", fontSize: 12 } },
      {
        id: "mig-group", type: "group", x: 10, y: 100, width: 400, height: 40, zIndex: 902, properties: {},
        children: [{ id: "mig-inner", type: "text", x: 0, y: 0, width: 400, height: 40, zIndex: 1, properties: { text: "Batterie", fontId: "font-luBS24", fontSize: 32 } }],
      } as any,
    )
    expect((await page.request.post(`/api/projects/${encodeURIComponent(name)}/versions`, { data: saved })).ok()).toBe(true)
    expect(widthIn("roboto-c13.bdf", tight), "Roboto at Standard (the old Caption) is wider than Helvetica 8").toBeGreaterThan(tightWidth)

    // The board's description as it is now.
    await seedWaveshare4v3bDdf(deviceId)
    await page.goto(`/projects/${encodeURIComponent(name)}`)
    await waitForEditorReady(page)

    const note = page.getByText(/now use the device's new fonts/).first()
    await expect(note).toBeVisible({ timeout: 20_000 })
    await expect(note).toContainText(`«${tight}»`)
    await expect(note).not.toContainText("Frischwasser")
    await expect(page).toHaveTitle(/^• /)

    const opened = await downloadProject(page)
    const objects = deep(opened.screens.flatMap((s: any) => s.objects))
    const old = new Set(opened.fonts.filter((f: any) => f.bpp !== 4).map((f: any) => f.id))
    const named = objects.flatMap((o: any) => Object.entries(o.properties ?? {}).filter(([k]) => k === "fontId" || k.endsWith("FontId")).map(([, v]) => v))
    expect(named.filter((id) => old.has(id)), "no object names a replaced font").toEqual([])
    expect(objects.find((o: any) => o.id === "mig-roomy").properties).toMatchObject({ fontId: "font-roboto-c18" })
    expect(objects.find((o: any) => o.id === "mig-tight").properties).toMatchObject({ fontId: "font-roboto-c13" })
    expect(objects.find((o: any) => o.id === "mig-inner").properties).toMatchObject({ fontId: "font-interb-c25" })
    // Custom stays Custom: no style is given to a text set by hand.
    expect(objects.find((o: any) => o.id === "mig-roomy").properties.textStyle).toBeUndefined()
    // Its size follows its new font, as a style change does.
    const roboto18 = opened.fonts.find((f: any) => f.id === "font-roboto-c18")
    expect(objects.find((o: any) => o.id === "mig-roomy").properties.fontSize).toBe(roboto18.ascent + roboto18.descent)

    // Saved, and opened again: nothing more to move, nothing said.
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page).not.toHaveTitle(/^• /, { timeout: 20_000 })
    await page.goto("/")
    await page.goto(`/projects/${encodeURIComponent(name)}`)
    await waitForEditorReady(page)
    await page.waitForTimeout(1500)
    await expect(page.getByText(/now use the device's new fonts/)).toHaveCount(0)
    await expect(page).not.toHaveTitle(/^• /)
    const again = await downloadProject(page)
    expect(deep(again.screens.flatMap((s: any) => s.objects))).toEqual(objects)
  } finally {
    await deleteProject(page, name)
  }
})

// lib/font-migration.ts on its own: every font field, at any depth, and only
// those; a project naming nothing replaced comes back as the same object.
test("every font field naming a replaced font is rewritten, and nothing else", () => {
  const font = (id: string, extra: Partial<ProjectFont> = {}): ProjectFont => ({ id, name: id, displayName: id, path: `fonts/${id}.bdf`, size: 20, ascent: 16, descent: 4, ...extra })
  const project = {
    name: "p",
    fonts: [font("old"), font("old-b"), font("new", { bpp: 4, capHeight: 12, size: 30, ascent: 24, descent: 6, replaces: ["old", "old-b"] })],
    screens: [
      {
        id: "s",
        name: "S",
        objects: [
          { id: "d", type: "energy-diagram", x: 0, y: 0, width: 10, height: 10, zIndex: 1, properties: { fontId: "old", valueFontId: "old-b", other: "old" } },
          { id: "c", type: "chart", x: 0, y: 0, width: 10, height: 10, zIndex: 2, properties: { dateFontId: "old", series: [{ fontId: "old-b" }] } },
          { id: "t", type: "text", x: 0, y: 0, width: 10, height: 10, zIndex: 3, properties: { text: "x", fontId: "old", fontSize: 20 } },
          { id: "k", type: "text", x: 0, y: 0, width: 10, height: 10, zIndex: 4, properties: { text: "y", fontId: "kept" } },
        ],
      },
    ],
  } as unknown as Project
  const { project: out, moved } = withReplacedFonts(project)
  const [d, c, t, k] = out.screens[0].objects
  expect(moved).toBe(3)
  expect(d.properties).toEqual({ fontId: "new", valueFontId: "new", other: "old" })
  expect(c.properties).toEqual({ dateFontId: "new", series: [{ fontId: "new" }] })
  expect(t.properties).toMatchObject({ fontId: "new", fontSize: 30 })
  expect(k).toBe(project.screens[0].objects[3])
  expect(withReplacedFonts(out).project).toBe(out)
})
