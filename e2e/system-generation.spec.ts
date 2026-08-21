import { test, expect } from "@playwright/test"
import fs from "fs"
import http from "node:http"
import path from "path"
import { rm } from "fs/promises"
import { SYSTEM_GENERATION } from "../lib/system-generation"
import { serverLanAddress } from "../lib/server-lan-address"
import { waitForEditorReady } from "./helpers"

// Opens every artifact in test-projects/generations/ with today's reader and
// asserts the one rule the whole version model reduces to:
//
//   same or older major  -> opens
//   newer major          -> refused, with a message naming the generation
//   newer minor          -> opens (minors are additive by definition)
//
// The corpus is checked in rather than built here on purpose - see
// test-projects/generations/build-corpus.js. Frozen files are what make this
// a compatibility test instead of a round-trip test: they keep saying what an
// artifact of that generation actually looked like, no matter how the code
// that writes those fields changes afterwards.
//
// The expectation is derived from the filename's generation compared against
// the SYSTEM_GENERATION constant, deliberately NOT by calling
// isReadableGeneration() - asking the implementation whether it agrees with
// itself would asserting nothing. The comparison below is the specification,
// written out once.

const CORPUS_DIR = path.join(__dirname, "..", "test-projects", "generations")
const DATA_DDF_DIR = path.join(__dirname, "..", ".data", "ddf")

interface Fixture {
  file: string
  label: string
  // null = the artifact carries no systemGeneration field at all.
  major: number | null
}

function fixturesFor(prefix: string, suffix: string): Fixture[] {
  return fs
    .readdirSync(CORPUS_DIR)
    .filter((file) => file.startsWith(prefix) && file.endsWith(suffix))
    .map((file) => {
      const label = file.slice(prefix.length, file.length - suffix.length)
      return { file, label, major: label === "none" ? null : Number(label.split(".")[0]) }
    })
}

// The rule, stated once. An absent field is the implicit oldest generation,
// which is readable for the same reason any older major is.
const shouldOpen = (fixture: Fixture) => fixture.major === null || fixture.major <= SYSTEM_GENERATION.major

test.describe("system generation compatibility corpus", () => {
  test("the corpus covers both sides of the rule", () => {
    const projects = fixturesFor("project-", ".zip")
    const ddfs = fixturesFor("ddf-", ".ddf.zip")
    // A corpus of only-readable artifacts would pass while the refusal path
    // was broken, and vice versa - so the corpus itself is checked, not just
    // iterated. This also fails loudly if a future generation bump adds files
    // for one artifact kind and forgets the other.
    expect(projects.length).toBeGreaterThan(0)
    expect(ddfs.map((f) => f.label).sort()).toEqual(projects.map((f) => f.label).sort())
    for (const kind of [projects, ddfs]) {
      expect(kind.some(shouldOpen), "corpus has no readable artifact").toBe(true)
      expect(kind.some((f) => !shouldOpen(f)), "corpus has no artifact from a newer major").toBe(true)
    }
  })

  for (const fixture of fixturesFor("project-", ".zip")) {
    const verb = shouldOpen(fixture) ? "opens" : "refuses"
    test(`${verb} a project file of generation ${fixture.label}`, async ({ page }) => {
      await page.goto("/")

      // Refusal surfaces as a native alert (project-editor.tsx's upload
      // path), so both outcomes are observed through the same channel: the
      // readable cases must produce *no* dialog, which a test that only
      // waited for one would never notice.
      const dialogs: string[] = []
      page.on("dialog", async (dialog) => {
        dialogs.push(dialog.message())
        await dialog.accept()
      })

      const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        page.getByRole("button", { name: "Choose File..." }).click(),
      ])
      await fileChooser.setFiles(path.join(CORPUS_DIR, fixture.file))

      if (shouldOpen(fixture)) {
        await waitForEditorReady(page)
        expect(dialogs, "an artifact this reader understands must open silently").toEqual([])
      } else {
        await expect.poll(() => dialogs.length, { timeout: 15000 }).toBeGreaterThan(0)
        // Naming both generations is the difference between a refusal a
        // human can act on and a dead end.
        expect(dialogs[0]).toContain(fixture.label)
        expect(dialogs[0]).toContain(`${SYSTEM_GENERATION.major}.${SYSTEM_GENERATION.minor}`)
        // Refused means refused: the gate is still up, nothing half-loaded.
        await expect(page.getByRole("heading", { name: "Welcome to ScreenBee" })).toBeVisible()
      }
    })
  }

  for (const fixture of fixturesFor("ddf-", ".ddf.zip")) {
    const verb = shouldOpen(fixture) ? "accepts" : "rejects"
    test(`${verb} a DDF of generation ${fixture.label}`, async ({ request }) => {
      // Driven through /api/ddf/fetch rather than the gate's import form:
      // that route is where a DDF is parsed, and the form itself is already
      // covered by e2e/ddf-url-import.spec.ts. Served over the LAN address
      // because the route refuses hosts it can't reach.
      const zipBytes = fs.readFileSync(path.join(CORPUS_DIR, fixture.file))
      const lanIp = serverLanAddress()
      test.skip(!lanIp, "No LAN-reachable address found on this machine to serve the corpus DDF from")

      const httpServer = http.createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/zip" })
        res.end(zipBytes)
      })
      await new Promise<void>((resolve) => httpServer.listen(0, resolve))
      const port = (httpServer.address() as { port: number }).port

      let importedDeviceId: string | null = null
      try {
        const res = await request.post("/api/ddf/fetch", { data: { url: `http://${lanIp}:${port}/ddf.zip` } })
        const body = await res.json()
        if (shouldOpen(fixture)) {
          expect(res.ok(), JSON.stringify(body)).toBe(true)
          importedDeviceId = body.deviceId
          expect(importedDeviceId).toBe(`e2e-generation-${fixture.label.replace(/\./g, "v")}`)
        } else {
          expect(res.ok()).toBe(false)
          expect(body.error).toContain(fixture.label)
        }
      } finally {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()))
        // The route caches what it accepted. Left behind, these would show up
        // as devices on every later spec's Startup Gate - and /api/ddf/list
        // re-parses every zip in that directory on each request.
        if (importedDeviceId) {
          await rm(path.join(DATA_DDF_DIR, `${importedDeviceId}.ddf.zip`), { force: true })
        }
      }
    })
  }
})
