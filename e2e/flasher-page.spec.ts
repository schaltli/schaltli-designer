import { test, expect } from "@playwright/test"
import crypto from "crypto"
import fs from "fs"
import http from "http"
import os from "os"
import path from "path"
import { spawnSync } from "child_process"
import { mergeFactoryImage } from "../lib/factory-image.mjs"
import { appImage, factoryParts } from "./factory-fixtures"

// The flasher page, built the way the Pages workflow builds it and served the
// way Pages serves it: a directory of static files. Everything up to the moment
// a serial port is needed is exercised here - which board is on offer, which
// firmware, and above all that a wrong or damaged image is refused before a
// single byte goes to a chip. The writing itself cannot be tested from here: no
// browser lets a test hand it a serial port.
// See docs/2026-09-18-factory-image.md.

const ROOT = path.join(__dirname, "..")
const KNOB = "waveshare-knob-1v8"
const LCD = "waveshare-touch-lcd-4v3b"
const PAPER = "m5stack-papers3"
// A board the page knows nothing about, as a release would carry it if the
// firmware grew one before flasher/boards.mjs did.
const STRANGER = "some-future-board"

const RELEASES = [
  { tag: "fw-2026.09.25.1", publishedAt: "2026-09-25T09:00:00Z", devices: [LCD, KNOB, STRANGER] },
  { tag: "fw-2026.09.24.2", publishedAt: "2026-09-24T18:00:00Z", devices: [LCD] },
  // From before the rename: it speaks screenbee/..., and a board flashed with
  // it never appears in the designer. The page must not offer it at all.
  { tag: "fw-2026.09.18.1", publishedAt: "2026-09-18T09:00:00Z", devices: [LCD, KNOB] },
]

type Built = { dist: string; sha: Record<string, Record<string, string>>; sizes: Record<string, number>; bundled: boolean }

function buildStand(): Built {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flasher-"))
  const staging = path.join(tmp, "staging")
  const sha: Record<string, Record<string, string>> = {}
  const sizes: Record<string, number> = {}

  for (const release of RELEASES) {
    const dir = path.join(staging, release.tag)
    fs.mkdirSync(dir, { recursive: true })
    const devices: Record<string, unknown> = {}
    sha[release.tag] = {}
    for (const deviceId of release.devices) {
      const app = appImage(deviceId)
      const image = Buffer.from(mergeFactoryImage(factoryParts({ app })))
      const file = `${deviceId}-factory-${release.tag}.bin`
      fs.writeFileSync(path.join(dir, file), image)
      const digest = crypto.createHash("sha256").update(image).digest("hex")
      sha[release.tag][deviceId] = digest
      sizes[file] = image.length
      devices[deviceId] = {
        build: release.tag,
        file: `${deviceId}-${release.tag}.bin`,
        size: app.length,
        sha256: crypto.createHash("sha256").update(app).digest("hex"),
        systemGeneration: "1.0",
        url: `https://example.invalid/${deviceId}-${release.tag}.bin`,
        factory: { file, size: image.length, sha256: digest, url: `https://example.invalid/${file}` },
      }
    }
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ release: release.tag, commit: "0".repeat(40), devices }))
    fs.writeFileSync(path.join(dir, "release.json"), JSON.stringify({ tag: release.tag, publishedAt: release.publishedAt }))
  }

  const dist = path.join(tmp, "dist")
  const built = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-flasher.js"), "--out", dist, "--releases", staging], {
    cwd: ROOT,
    encoding: "utf8",
  })
  expect(built.status, `build-flasher failed:\n${built.stdout}\n${built.stderr}`).toBe(0)
  return { dist, sha, sizes, bundled: fs.existsSync(path.join(dist, "esptool.bundle.js")) }
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bin": "application/octet-stream",
}

function serve(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    const asked = decodeURIComponent((request.url || "/").split("?")[0])
    const file = path.join(dir, asked === "/" ? "index.html" : asked.replace(/^\/+/, ""))
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end("not here")
      return
    }
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" })
    response.end(fs.readFileSync(file))
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

let stand: Built
let site: { url: string; close: () => Promise<void> }

test.beforeAll(async () => {
  stand = buildStand()
  site = await serve(stand.dist)
})

test.afterAll(async () => {
  await site.close()
  fs.rmSync(path.join(stand.dist, ".."), { recursive: true, force: true })
})

test.describe("flasher page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(site.url)
    await expect(page.getByTestId("picker")).toBeVisible()
  })

  test("it offers the boards the releases carry, and says so for the one they do not", async ({ page }) => {
    await expect(page.getByTestId(`board-${LCD}`)).toContainText("Waveshare ESP32-S3 Touch LCD 4.3B")
    await expect(page.getByTestId(`board-${KNOB}`)).toContainText("Knob Touch LCD 1.8")
    // No image in these releases: still listed, so a board cannot go missing
    // quietly, but not selectable.
    const paper = page.getByTestId(`board-${PAPER}`)
    await expect(paper).toContainText("No factory image in the published releases yet")
    await expect(paper).toBeDisabled()
    // Nothing is chosen for the visitor. The chip cannot be asked which board
    // it is, so a preselected board would be a wrong flash waiting for an
    // impatient finger - the button stays out of reach until someone picks one.
    for (const id of [LCD, KNOB, PAPER]) {
      await expect(page.getByTestId(`board-${id}`)).toHaveAttribute("aria-pressed", "false")
    }
    await expect(page.getByTestId("flash")).toBeDisabled()
    await expect(page.getByTestId("image-meta")).toContainText("Pick your board above first")
    // An empty version list would read as a broken page rather than one waiting.
    await expect(page.getByTestId("version-select")).toBeDisabled()
    await expect(page.getByTestId("version-select")).toContainText("pick a board above")

    await page.getByTestId(`board-${LCD}`).click()
    await expect(page.getByTestId(`board-${LCD}`)).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId(`board-${KNOB}`)).toHaveAttribute("aria-pressed", "false")
  })

  test("a board the page has never heard of is still offered, under its bare id", async ({ page }) => {
    // Otherwise a new board would be missing from the page with nothing saying
    // so, and the only hint would be a buyer who cannot flash their board.
    const stranger = page.getByTestId(`board-${STRANGER}`)
    await expect(stranger).toContainText(STRANGER)
    await expect(stranger).toBeEnabled()
    await stranger.click()
    await expect(page.getByTestId("image-meta")).toContainText(`${STRANGER}-factory-fw-2026.09.25.1.bin`)
    await expect(page.getByTestId("version-select").locator("option")).toHaveCount(1)
  })

  test("each board offers its own firmware, newest first", async ({ page }) => {
    const select = page.getByTestId("version-select")
    await page.getByTestId(`board-${LCD}`).click()
    await expect(select.locator("option")).toHaveCount(2)
    const labels = await select.locator("option").allTextContents()
    expect(labels[0]).toContain("fw-2026.09.25.1")
    expect(labels[0]).toContain("2026-09-25")
    expect(labels[0]).toContain("system 1.0")
    expect(labels[1]).toContain("fw-2026.09.24.2")
    expect(await select.inputValue()).toBe("fw-2026.09.25.1")

    // Two, not three: fw-2026.09.18.1 predates the rename and is left out
    // (OLDEST_RELEASE in scripts/build-flasher.js).
    expect(labels.join(" ")).not.toContain("fw-2026.09.18.1")

    // The knob is only in the newer release, so its list is shorter - a version
    // list per board, not one list with gaps.
    await page.getByTestId(`board-${KNOB}`).click()
    await expect(select.locator("option")).toHaveCount(1)
    await expect(page.getByTestId("board-note")).toContainText("appears as two serial ports")
  })

  test("it names the file, its size and its hash, and switches them with the version", async ({ page }) => {
    const newest = stand.sha["fw-2026.09.25.1"][LCD]
    await page.getByTestId(`board-${LCD}`).click()
    await expect(page.getByTestId("image-meta")).toContainText(`${LCD}-factory-fw-2026.09.25.1.bin`)
    await expect(page.getByTestId("image-meta")).toContainText("written as one file at 0x0")
    await expect(page.getByTestId("image-sha")).toHaveText(`SHA-256 ${newest}`)

    await page.getByTestId("version-select").selectOption("fw-2026.09.24.2")
    await expect(page.getByTestId("image-sha")).toHaveText(`SHA-256 ${stand.sha["fw-2026.09.24.2"][LCD]}`)
  })

  test("erasing the chip is off unless it is asked for", async ({ page }) => {
    await expect(page.getByTestId("erase-all")).not.toBeChecked()
  })

  test("a damaged or foreign image is refused before anything is written", async ({ page }) => {
    const newest = "fw-2026.09.25.1"
    const good = {
      file: `images/${LCD}-factory-${newest}.bin`,
      size: stand.sizes[`${LCD}-factory-${newest}.bin`],
      sha256: stand.sha[newest][LCD],
      deviceId: LCD,
    }
    const knobFile = `${KNOB}-factory-${newest}.bin`
    const withForeign = {
      ...good,
      foreign: {
        file: `images/${knobFile}`,
        size: stand.sizes[knobFile],
        sha256: stand.sha[newest][KNOB],
        deviceId: LCD,
      },
    }
    const outcome = await page.evaluate(async (chosen) => {
      // The page's own module, loaded in the page. Through a variable, because
      // this file is type-checked here and the path only exists over there.
      const pageModule = "./app.mjs"
      const { prepareImage } = await import(pageModule)
      const attempt = async (entry: unknown) => {
        try {
          const bytes = await prepareImage(entry as never)
          return { length: bytes.length }
        } catch (error) {
          return { error: String((error as Error).message) }
        }
      }
      return {
        good: await attempt(chosen),
        wrongHash: await attempt({ ...chosen, sha256: "0".repeat(64) }),
        wrongSize: await attempt({ ...chosen, size: chosen.size - 1 }),
        // The knob's image offered as the 4.3B's, with its own size and hash so
        // both of those pass: an images.json that names the wrong file would get
        // this far, and only the marker inside the image catches it.
        foreign: await attempt(chosen.foreign),
        missing: await attempt({ ...chosen, file: "images/not-a-release.bin" }),
      }
    }, withForeign)

    expect(outcome.good).toEqual({ length: good.size })
    expect(outcome.wrongHash.error).toMatch(/does not match its SHA-256/)
    expect(outcome.wrongSize.error).toMatch(/the release says/)
    expect(outcome.foreign.error).toMatch(/not a sound factory image.*carries waveshare-knob-1v8, expected waveshare-touch-lcd-4v3b/)
    expect(outcome.missing.error).toMatch(/could not be downloaded \(404\)/)
  })

  // The flashing code itself: loaded only when the button is pressed, so a
  // broken bundle would otherwise be found by the first person to try it. What
  // it does with a serial port cannot be tested here, that it loads and has the
  // two things the page calls can be. Skipped with a warning when the packages
  // for it are not installed, never silently.
  test("the flashing code loads in a browser", async ({ page }) => {
    if (!stand.bundled) {
      console.warn("[flasher-page] SKIPPED: no esptool.bundle.js - run" +
        " npm install --prefix .flasher-deps --no-save esptool-js@0.6.1 esbuild@0.24.0")
      test.skip(true, "esptool-js is not installed beside this checkout")
      return
    }
    const shape = await page.evaluate(async () => {
      const bundle = "./esptool.bundle.js"
      const module = await import(bundle)
      return { loader: typeof module.ESPLoader, transport: typeof module.Transport }
    })
    expect(shape).toEqual({ loader: "function", transport: "function" })
  })

  test("the button is offered exactly when this browser can use it", async ({ page }) => {
    // Chrome and Edge can talk to a serial port, Firefox and Safari cannot, and
    // a page that offers a button it cannot honour is worse than one that says
    // so. Which side this test lands on depends on the browser it runs in.
    const hasSerial = await page.evaluate(() => "serial" in navigator)
    await page.getByTestId(`board-${LCD}`).click()
    if (hasSerial) {
      await expect(page.getByTestId("flash")).toBeEnabled()
      await expect(page.getByTestId("unsupported")).toBeHidden()
    } else {
      await expect(page.getByTestId("flash")).toBeDisabled()
      await expect(page.getByTestId("unsupported")).toBeVisible()
      await expect(page.getByTestId("unsupported")).toContainText("Chrome or Edge")
    }
  })
})
