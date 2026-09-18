import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { formatBuildDate, formatDesignerBuild } from "../lib/designer-build"
import { SYSTEM_GENERATION_STRING } from "../lib/system-generation"

// "Is my Pi up to date?" had exactly one answer before 2026-09-18: an SSH
// session. A designer is installed by git pull, so its identity is where it
// sits in the history - `git describe`, stamped in by next.config.mjs, served
// by /api/version, and shown in the Deploy dialog. The release tag lives in
// this repository as well as the firmware's, so both sides describe themselves
// off the same release name; see lib/designer-build.ts for that, and for why
// the designer, the system generation and the firmware release stay three
// things rather than one.

const MANIFEST = path.join(__dirname, "..", "firmware", "manifest.json")

test.describe("which designer is this", () => {
  test("a release name, the distance past it, and a date", () => {
    const when = "2026-09-17T23:24:03+02:00"
    // The grammar a firmware build announces, because the release tag lives in
    // this repository too: 24 commits past fw-2026.09.15.1, still being edited.
    expect(formatDesignerBuild({ build: "fw-2026.09.15.1-24-g457f1ad-dirty", commit: "457f1ad", date: when, dirty: true }))
      .toBe("fw-2026.09.15.1-24-g457f1ad-dirty, 17 Sep 2026")
    // Sitting exactly on a release: this is what "in step with the firmware"
    // looks like, and it needs no extra words.
    expect(formatDesignerBuild({ build: "fw-2026.09.15.1", commit: "55b3ad1", date: when, dirty: false }))
      .toBe("fw-2026.09.15.1, 17 Sep 2026")
    // Before any tag has been fetched, describe --always gives a bare commit.
    expect(formatDesignerBuild({ build: "457f1ad", commit: "457f1ad", date: when, dirty: false }))
      .toBe("457f1ad, 17 Sep 2026")
    // No git in the checkout (an unpacked tarball): say so rather than show a
    // blank where a version belongs.
    expect(formatDesignerBuild({ build: "", commit: "", date: "", dirty: false })).toBe("unknown checkout")
    expect(formatDesignerBuild({ build: "", commit: "457f1ad", date: "", dirty: false })).toBe("457f1ad")
    expect(formatDesignerBuild({ build: "457f1ad", commit: "457f1ad", date: "not a date", dirty: false })).toBe("457f1ad")

    // Deliberately not Intl: a Pi, a browser and a test must print the same.
    expect(formatBuildDate("2026-01-05T08:00:00Z")).toMatch(/^5 Jan 2026$/)
    expect(formatBuildDate("")).toBe("")
  })

  test("GET /api/version answers without a browser", async ({ request }) => {
    const body = await (await request.get("/api/version")).json()

    // The designer: what git describe says - a release name with the distance
    // past it, or a bare commit before the first tag, or nothing at all when
    // git was unavailable where this was built. Never a made-up version number.
    expect(body.designer.build).toMatch(/^(fw-[0-9.]+(-\d+-g[0-9a-f]+)?|[0-9a-f]{7,40})?(-dirty)?$/)
    expect(body.designer.commit).toMatch(/^([0-9a-f]{7,40})?$/)
    if (body.designer.build && body.designer.commit && body.designer.build.includes("-g")) {
      // The two must be the same checkout, not two readings taken apart.
      expect(body.designer.build).toContain(body.designer.commit)
    }
    expect(typeof body.designer.dirty).toBe("boolean")
    expect(body.designer.build.endsWith("-dirty")).toBe(body.designer.dirty)
    if (body.designer.date) expect(Number.isNaN(new Date(body.designer.date).getTime())).toBe(false)

    // The one number shared with the firmware - whether the two can work
    // together at all.
    expect(body.systemGeneration).toBe(SYSTEM_GENERATION_STRING)

    // The firmware release this designer carries, as its own manifest names it,
    // plus the firmware commit behind that tag.
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    expect(body.firmware.release).toBe(manifest.release ?? null)
    expect(body.firmware.commit).toBe(manifest.commit ?? null)
  })

  test("the Deploy dialog names it, connected or not", async ({ page }) => {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Deploy to Device" }).click()

    // Outside both branches of the dialog: someone asking which designer this
    // is has not necessarily got a broker answering.
    const line = page.getByTestId("designer-version")
    await expect(line).toBeVisible()
    await expect(line).toContainText("Designer")
    await expect(line).toContainText(`system ${SYSTEM_GENERATION_STRING}`)

    const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    await expect(line).toContainText(manifest.release ? `firmware ${manifest.release}` : "no release shipped")

    // And it agrees with what the API says, rather than being a second source.
    const body = await (await page.request.get("/api/version")).json()
    if (body.designer.build) await expect(line).toContainText(body.designer.build)
  })
})
