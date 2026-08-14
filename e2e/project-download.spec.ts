import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"

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

    // Compression has to be real, not just declared - the fonts alone are
    // ~570KB uncompressed in this fixture.
    expect(buf.length).toBeLessThan(200_000)
  })
})
