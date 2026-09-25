import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import path from "path"
import { migrateProject } from "../lib/object-types"

// theme-export, open question 1: what the dark bitmaps cost on a colour
// board's flash. The knob and the 4.3B both use default_16MB.csv, whose
// spiffs partition (LittleFS) is 0x360000 bytes.
const LITTLEFS = 0x360000

// The knob smoke-test fixture: five screens with a tinted icon, a button, a
// switch group and a switcher - the largest colour project in the repo.
const KNOB = "hil/waveshare/fixtures/smoke-test.zip"

async function sourceProject(zipPath: string) {
  const outer = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, "..", zipPath)))
  const inner = await JSZip.loadAsync(await outer.file("_source/project.zip")!.async("uint8array"))
  // Migrated as the designer migrates a project it opens: hex colours become
  // roles, so there is a dark variant to bake at all.
  return migrateProject(JSON.parse(await inner.file("project.json")!.async("string")))
}

// What the device stores once it has unpacked the export.
async function extracted(zip: JSZip, keep: (name: string) => boolean = () => true) {
  let bytes = 0
  for (const [name, f] of Object.entries(zip.files)) {
    if (f.dir || !keep(name)) continue
    bytes += (await f.async("uint8array")).length
  }
  return bytes
}

test("a colour project with its dark bitmaps stays a small part of the board's LittleFS", async ({ page }) => {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const project = await sourceProject(KNOB)
  const base64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), project)
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
  const all = await extracted(zip)
  const light = await extracted(zip, (n) => !n.includes("-dark."))
  const pct = (n: number) => `${((100 * n) / LITTLEFS).toFixed(1)}%`
  // Measured 2026-09-25: light 119,871 B (3.4%), with dark 213,473 B (6.0%).
  // Before the flattened backgrounds were dropped, dark took this project to
  // 116% - the bound below is there so that never comes back unnoticed.
  console.log(`knob fixture: light ${light} B (${pct(light)}), with dark ${all} B (${pct(all)})`)
  expect(all, "the dark bitmaps are in the export").toBeGreaterThan(light)
  expect(all, "with dark, under a quarter of LittleFS").toBeLessThan(LITTLEFS / 4)
})
