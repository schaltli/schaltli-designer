import { test, expect } from "@playwright/test"
import crypto from "crypto"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { buildCamperProject } from "../deploy/demo/camper-project"
import { buildCamperUiProject } from "../deploy/demo/camperui-project"
import { buildStarterProject } from "../deploy/demo/starter-project"

// Areas (docs/2026-11-16-areas.md, «Old projects»): nothing moves. A
// project's device zip, exported before the designer knew areas and after,
// holds the same files with the same bytes.
//
// «Before» is e2e/fixtures/areas-baseline.json: each file's hash, written
// from `main` at 784739e8 with AREAS_BASELINE=1. It is written again only
// where a change to what a device gets is meant - never to make this pass.
//
// The projects are the ones the repo builds: the starter from its shipped
// template (templates/), the demo «Camper» and CamperUI rebuilt, which
// between them hold cards stretched in cells, docked tables and switchers.

const ROOT = path.join(__dirname, "..")
const DDF = path.join(ROOT, "public", "ddf", "waveshare-touch-lcd-4.ddf.zip")
const BASELINE = path.join(__dirname, "fixtures", "areas-baseline.json")

const PROJECTS: Record<string, (ddf: Uint8Array) => Promise<unknown>> = {
  "VanPi-Starter": (ddf) => buildStarterProject(ddf),
  Camper: (ddf) => buildCamperProject(ddf),
  CamperUI: (ddf) => buildCamperUiProject(ddf),
}

type Hashes = Record<string, string>

async function exported(page: import("@playwright/test").Page, project: unknown): Promise<Hashes> {
  // As the designer opens it: migrated, then laid out.
  const base64: string = await page.evaluate(async (p) => {
    const w = window as any
    const laid = w.__layoutProjectForTest(w.__migrateProjectForTest(p))
    return w.__buildDeviceZipForTest(laid)
  }, project)
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"))
  const hashes: Hashes = {}
  for (const name of Object.keys(zip.files).sort()) {
    // The recovery copy is the designer's own project, which a migration
    // changes; no device reads it (lib/project-zip.ts).
    if (zip.files[name].dir || name.startsWith("_source/")) continue
    let bytes = await zip.files[name].async("nodebuffer")
    // When it was exported is not what was exported.
    if (name === "project.json") {
      const { exportedAt: _at, ...rest } = JSON.parse(bytes.toString("utf8"))
      bytes = Buffer.from(JSON.stringify(rest))
    }
    hashes[name] = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16)
  }
  return hashes
}

test("every project exports the files it exported before areas, byte for byte", async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const ddf = new Uint8Array(fs.readFileSync(DDF))
  const now: Record<string, Hashes> = {}
  for (const [name, build] of Object.entries(PROJECTS)) now[name] = await exported(page, await build(ddf))

  if (process.env.AREAS_BASELINE) {
    fs.writeFileSync(BASELINE, JSON.stringify(now, null, 1) + "\n")
    return
  }
  const before: Record<string, Hashes> = JSON.parse(fs.readFileSync(BASELINE, "utf8"))
  for (const name of Object.keys(PROJECTS)) {
    const was = before[name] ?? {}
    const is = now[name]
    const differing = [...new Set([...Object.keys(was), ...Object.keys(is)])]
      .sort()
      .filter((file) => was[file] !== is[file])
      .map((file) => (!(file in was) ? `${file} (new)` : !(file in is) ? `${file} (gone)` : file))
    expect(differing, `${name}: files that are not what they were`).toEqual([])
    expect(Object.keys(is).length, `${name}: exports something`).toBeGreaterThan(0)
  }
})
