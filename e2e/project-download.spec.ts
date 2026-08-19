import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject, chooseDevice, M5DIAL_DEVICE_ID } from "./helpers"
import { seedM5DialDdf } from "./ddf-seed"

// "Download Project" writes the designer's *editable* project - the
// original assets and the BDF font data, everything needed to keep working
// on it - as opposed to "Export Project", which bakes assets into device
// bitmaps and drops the font data entirely (the device already has its
// fonts from its DDF). This had no coverage at all, so neither the
// round-trip nor the zip's own encoding was ever asserted.
//
// Added 2026-08-14 with the DEFLATE fix: the zip was written with JSZip's
// STORE default, the same oversight lib/project-zip.ts had until
// 2026-08-11. Measured on this same fixture, compression takes it from
// 674KB to 79KB.

test.describe("Download Project", () => {
  test("writes a compressed, re-loadable project zip carrying fonts and the editable model", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)

    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const buf = Buffer.concat(chunks)

    // Every entry must actually be DEFLATE (method 8), not STORE (0).
    // Asserted by walking the local file headers rather than trusting a
    // size threshold, which would pass by accident on an incompressible
    // project and hide a regression to the default.
    const methods = new Set<number>()
    let offset = 0
    while (offset < buf.length - 4 && buf.readUInt32LE(offset) === 0x04034b50) {
      const compressedSize = buf.readUInt32LE(offset + 18)
      const nameLen = buf.readUInt16LE(offset + 26)
      const extraLen = buf.readUInt16LE(offset + 28)
      const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString()
      // Directory entries are always method 0 and carry nothing to
      // compress - counting them would make this assertion unsatisfiable.
      if (!name.endsWith("/")) methods.add(buf.readUInt16LE(offset + 8))
      offset += 30 + nameLen + extraLen + compressedSize
    }
    expect(methods.size).toBeGreaterThan(0)
    expect([...methods]).toEqual([8])

    const zip = await JSZip.loadAsync(buf)
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir)

    // The editable model, not the device export: font *data* ships here
    // (the export only carries font metadata), and there are no baked
    // screen bitmaps.
    expect(names).toContain("project.json")
    expect(names.some((n) => n.startsWith("fonts/") && n.endsWith(".bdf"))).toBe(true)
    expect(names.some((n) => n.endsWith(".pbm") || n.endsWith(".pgm"))).toBe(false)

    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    expect(project.screens.length).toBeGreaterThan(0)
    // Master screens survive as themselves here - the export flattens them
    // away, this format must not.
    expect(project.screens.some((s: { name: string }) => s.name === "tab-control-tests")).toBe(true)
    // The one system generation every artifact carries
    // (docs/nested-provenance.md's "Version compatibility"; replaced three
    // separate schemaVersion integers on 2026-08-19) - proves
    // downloadProject() actually writes it, not just that uploadProject()
    // tolerates it being absent.
    expect(project.systemGeneration).toBe("1.0")
    expect(project.schemaVersion).toBeUndefined()
    // A stray write-only `version: "1.0.0"` used to sit next to
    // schemaVersion here, read by nothing (designer, M5 Dial firmware,
    // e-paper firmware or Android app) and easy to mistake for the real
    // format-version axis - removed 2026-08-19, asserted so it can't creep
    // back as a third lookalike.
    expect(project.version).toBeUndefined()

    // Compression has to be real, not just declared - the fonts alone are
    // ~570KB uncompressed in this fixture.
    expect(buf.length).toBeLessThan(200_000)
  })

  // Covers the actual DDF-embedding half of Phase 1 (2026-08-15 grilling
  // session, docs/nested-provenance.md's "Nesting is zip-in-zip" decision):
  // a project built via the device picker carries the real DDF zip as
  // _source/ddf.zip, not just the denormalized fields - and that entry is
  // itself a valid, independently-openable DDF, not a merged/flattened
  // subset.
  test("a project created from a device embeds that device's real DDF as _source/ddf.zip", async ({ page }) => {
    const seeded = await seedM5DialDdf()
    test.skip(!seeded, "screenbee-m5dial not checked out alongside this repo")

    await page.goto("/")
    await chooseDevice(page, M5DIAL_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "File" }).click()
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    const buf = Buffer.concat(chunks)

    const outerZip = await JSZip.loadAsync(buf)
    const embeddedEntry = outerZip.file("_source/ddf.zip")
    expect(embeddedEntry).not.toBeNull()

    // Zip-in-zip, not flattened: no DDF files (device.json, fonts/*.bdf)
    // sitting loose in the outer archive's own tree, only the one blob.
    expect(Object.keys(outerZip.files)).not.toContain("device.json")

    // The embedded blob has to be a real, independently-parseable DDF, not
    // just opaque bytes - opening it on its own must yield this exact
    // device's own manifest.
    const embeddedBytes = await embeddedEntry!.async("nodebuffer")
    const innerZip = await JSZip.loadAsync(embeddedBytes)
    const manifest = JSON.parse(await innerZip.file("device.json")!.async("string"))
    expect(manifest.device.id).toBe(M5DIAL_DEVICE_ID)

    // project.json itself must NOT also carry the DDF bytes inline - it
    // lives only as the zip entry above, never duplicated as base64 text.
    const projectJson = await outerZip.file("project.json")!.async("string")
    expect(projectJson).not.toContain("embeddedDdfZipBase64")

    // Round-trips through upload -> re-download rather than being silently
    // dropped the moment a project is reopened - the other half of this
    // mechanism (uploadProject()'s read-back), otherwise untested. A
    // project is already open at this point, so this goes through the File
    // menu's "Upload Project" (project-editor.tsx:2325), not the Startup
    // Gate's "Choose File..." button loadProject() uses.
    await page.getByRole("button", { name: "File" }).click()
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("menuitem", { name: "Upload Project" }).click(),
    ])
    await fileChooser.setFiles({ name: "roundtrip-project.zip", mimeType: "application/zip", buffer: buf })
    await page.waitForTimeout(2500)

    await page.getByRole("button", { name: "File" }).click()
    const [download2] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.getByRole("menuitem", { name: "Download Project" }).click(),
    ])
    const stream2 = await download2.createReadStream()
    const chunks2: Buffer[] = []
    for await (const chunk of stream2) chunks2.push(Buffer.from(chunk))
    const buf2 = Buffer.concat(chunks2)

    const outerZip2 = await JSZip.loadAsync(buf2)
    const embeddedEntry2 = outerZip2.file("_source/ddf.zip")
    expect(embeddedEntry2).not.toBeNull()
    expect(await embeddedEntry2!.async("nodebuffer")).toEqual(embeddedBytes)
  })

  // Covers project-editor.tsx's validateProjectSchemaVersion(), called from
  // both uploadProject() branches before anything else in the file is read
  // (2026-08-15 version-compatibility grilling session).
  test("rejects a project file whose system generation is newer than this app understands", async ({ page }) => {
    const zip = new JSZip()
    zip.file(
      "project.json",
      JSON.stringify({
        name: "Too New",
        systemGeneration: "999.0",
        screenWidth: 10,
        screenHeight: 10,
        screens: [{ id: "screen-1", name: "Screen 1", objects: [] }],
        settings: {},
        assets: [],
        fonts: [],
        topics: [],
        hardwareButtons: [],
      }),
    )
    const buffer = await zip.generateAsync({ type: "nodebuffer" })

    await page.goto("/")

    const dialogMessage = new Promise<string>((resolve) => {
      page.once("dialog", async (dialog) => {
        resolve(dialog.message())
        await dialog.accept()
      })
    })

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Choose File..." }).click(),
    ])
    await fileChooser.setFiles({ name: "too-new-project.zip", mimeType: "application/zip", buffer })

    expect(await dialogMessage).toContain("999.0")
  })

  // A newer *minor* is additive by definition, so it must open rather than
  // be refused - this is the half of the rule that a "reject anything
  // newer" check would silently get wrong, and the reason major.minor
  // exists at all rather than one flat counter.
  test("opens a project file from a newer minor of the same major", async ({ page }) => {
    const zip = new JSZip()
    zip.file(
      "project.json",
      JSON.stringify({
        name: "Newer Minor",
        systemGeneration: "1.999",
        screenWidth: 10,
        screenHeight: 10,
        screens: [{ id: "screen-1", name: "Screen 1", objects: [] }],
        settings: {},
        assets: [],
        fonts: [],
        topics: [],
        hardwareButtons: [],
      }),
    )
    const buffer = await zip.generateAsync({ type: "nodebuffer" })

    await page.goto("/")

    let refused = false
    page.once("dialog", async (dialog) => {
      refused = true
      await dialog.accept()
    })

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Choose File..." }).click(),
    ])
    await fileChooser.setFiles({ name: "newer-minor-project.zip", mimeType: "application/zip", buffer })

    await expect(page.getByRole("button", { name: "File" })).toBeVisible()
    expect(refused).toBe(false)
  })
})
