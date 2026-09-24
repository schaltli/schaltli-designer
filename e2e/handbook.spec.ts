import { test, expect } from "@playwright/test"
import fs from "fs"
import http from "http"
import os from "os"
import path from "path"
import { spawnSync } from "child_process"
import { FLASHER_URL } from "../lib/factory-image.mjs"
import { HANDBOOK_URL } from "../lib/handbook"
import { WAVESHARE_DEVICE_ID, revealDevice, waitForDeviceGate, waitForEditorReady } from "./helpers"

// The Pages site as .github/workflows/pages.yml builds it: the handbook
// (handbuch/, VitePress) at the root, the flasher page beside it under
// flasher/. One repository has one Pages site, so the two share it - and the
// flasher's old address, the root, is now the handbook, which has to lead a
// person arriving from an old release note on to the flasher.
//
// VitePress fails its own build on a dead link between handbook pages, so a
// passing build is already the check that every page it links exists.

const ROOT = path.join(__dirname, "..")
const HANDBUCH = path.join(ROOT, "handbuch")
const BASE = new URL(HANDBOOK_URL).pathname // "/schaltli-designer/"

function run(command: string, args: string[], cwd: string) {
  // npm is a .cmd on Windows, which spawnSync only finds through a shell - and
  // only npm: a shell splits node's own path at "C:\Program Files".
  const shell = command === "npm" && process.platform === "win32"
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell })
  expect(result.status, `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`).toBe(0)
}

function buildSite(): string {
  // VitePress is the handbook's own dependency, not the designer's (a van's
  // npm ci never installs it), so a fresh checkout may not have it yet.
  if (!fs.existsSync(path.join(HANDBUCH, "node_modules", "vitepress"))) {
    run("npm", ["ci"], HANDBUCH)
  }
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "handbuch-"))
  run("npm", ["run", "build", "--", "--outDir", dist], HANDBUCH)
  run(process.execPath, [path.join(ROOT, "scripts", "build-flasher.js"), "--out", path.join(dist, "flasher"), "--no-bundle"], ROOT)
  return dist
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
}

// Served under the same path prefix GitHub Pages gives it, because every link
// VitePress writes carries that prefix.
function serve(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    const asked = decodeURIComponent((request.url || "/").split("?")[0])
    if (!asked.startsWith(BASE)) {
      response.writeHead(404).end("not here")
      return
    }
    let file = path.join(dir, asked.slice(BASE.length))
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html")
    if (!file.startsWith(dir) || !fs.existsSync(file)) {
      response.writeHead(404, { "content-type": TYPES[".html"] }).end(fs.readFileSync(path.join(dir, "404.html")))
      return
    }
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" })
    response.end(fs.readFileSync(file))
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port
      resolve({
        url: `http://127.0.0.1:${port}${BASE}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      })
    })
  })
}

test.describe("handbook site", () => {
  // One build for the whole group: it takes several seconds, and nothing here
  // changes it.
  test.describe.configure({ mode: "serial", timeout: 180_000 })

  let dist: string
  let site: { url: string; close: () => Promise<void> }

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    dist = buildSite()
    site = await serve(dist)
  })

  test.afterAll(async () => {
    await site?.close()
    if (dist) fs.rmSync(dist, { recursive: true, force: true })
  })

  test("the addresses the designer knows are the ones the site is built for", () => {
    // The flasher moved below the handbook; both constants have to agree on
    // where the site is, or one of the two links out of the designer breaks.
    expect(FLASHER_URL).toBe(new URL("flasher/", HANDBOOK_URL).href)
  })

  test("the root is the handbook, and it leads on to the flasher", async ({ page }) => {
    await page.goto(site.url)
    await expect(page).toHaveTitle(/Schaltli-Handbuch/)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Schaltli")

    // From the hero, as a person clicks it: a full page load, not the
    // handbook's own router, which would look for a handbook page there.
    await page.locator(".VPHero").getByRole("link", { name: "Firmware flashen" }).click()
    await expect(page).toHaveTitle("Flash a Schaltli device")
    expect(new URL(page.url()).pathname).toBe(`${BASE}flasher/`)
  })

  test("someone arriving from an old release note is told where the flasher went", async ({ page }) => {
    await page.goto(site.url)
    const hint = page.locator(".schaltli-flasher-hint")
    await expect(hint).toContainText("Du suchst den Flasher?")
    await hint.getByRole("link", { name: "/flasher/" }).click()
    await expect(page).toHaveTitle("Flash a Schaltli device")
  })

  test("every link to a place on a page finds that place", () => {
    // VitePress fails its build on a link to a missing page, but not on a
    // link to a missing heading: /geraete/einrichten#spaeter-... to a heading
    // whose id is spelled with an umlaut is a link that works and lands at the
    // top. So every #anchor is looked up in the page it points into.
    const pages = new Map<string, { html: string; ids: Set<string> }>()
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== "flasher") walk(full)
        } else if (entry.name.endsWith(".html")) {
          const html = fs.readFileSync(full, "utf8")
          const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => decodeURIComponent(m[1])))
          pages.set("/" + path.relative(dist, full).split(path.sep).join("/"), { html, ids })
        }
      }
    }
    walk(dist)

    const broken: string[] = []
    for (const [from, { html, ids }] of pages) {
      for (const m of html.matchAll(/href="([^"]*)#([^"]+)"/g)) {
        let target = m[1]
        if (target.startsWith("http")) continue
        if (target === "") {
          if (!ids.has(decodeURIComponent(m[2]))) broken.push(`${from} -> #${m[2]}`)
          continue
        }
        if (!target.startsWith(BASE) || target.startsWith(`${BASE}flasher`)) continue
        target = "/" + target.slice(BASE.length)
        if (target.endsWith("/")) target += "index.html"
        const into = pages.get(target)
        if (!into) broken.push(`${from} -> ${target} (no such page)`)
        else if (!into.ids.has(decodeURIComponent(m[2]))) broken.push(`${from} -> ${target}#${decodeURIComponent(m[2])}`)
      }
    }
    expect([...new Set(broken)], "links to headings that do not exist").toEqual([])
  })

  test("headings are set in Varela Round and running text in Nunito Sans", async ({ page }) => {
    // The brand's two faces (brand/README.md). Only the declared family is
    // checked, not the loaded font: they come from Google Fonts, which a test
    // run need not reach.
    await page.goto(`${site.url}designer/deploy.html`)
    const firstFamily = (selector: string) =>
      page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim())
    expect(await firstFamily(".vp-doc h1")).toBe("Varela Round")
    expect(await firstFamily(".vp-doc h2")).toBe("Varela Round")
    expect(await firstFamily(".vp-doc p")).toBe("Nunito Sans")
    expect(await firstFamily(".vp-doc td")).toBe("Nunito Sans")
    expect(await firstFamily(".vp-doc .ui")).toBe("Nunito Sans")

    const fonts = await page.locator('link[rel="stylesheet"][href^="https://fonts.googleapis.com/"]').getAttribute("href")
    expect(fonts).toContain("family=Nunito+Sans")
    expect(fonts).toContain("family=Varela+Round")
  })

  test("the diagram marks the broker in signal orange and follows the dark theme", async ({ page }) => {
    // brand/README.md: in a diagram the signal colour marks the one node it is
    // about, and nothing else; every other box is ink.
    await page.goto(`${site.url}einfuehrung/index.html`)
    const diagram = page.locator("svg.schaltli-diagram")
    await expect(diagram).toBeVisible()
    await expect(diagram.locator(".node.focal")).toHaveCount(1)
    await expect(diagram.locator(".node")).toHaveCount(4)
    // The focal box is the one the broker's name sits in.
    const focalBox = await diagram.locator(".node.focal").boundingBox()
    const brokerName = await diagram.locator("text.name", { hasText: "MQTT-Broker" }).boundingBox()
    expect(brokerName!.x).toBeGreaterThan(focalBox!.x)
    expect(brokerName!.x + brokerName!.width).toBeLessThan(focalBox!.x + focalBox!.width)
    const colours = () =>
      diagram.evaluate((svg) => ({
        focal: getComputedStyle(svg.querySelector(".node.focal")!).stroke,
        plain: getComputedStyle(svg.querySelector(".node:not(.focal)")!).stroke,
        name: getComputedStyle(svg.querySelector(".name")!).fill,
      }))

    await page.evaluate(() => document.documentElement.classList.remove("dark"))
    expect(await colours()).toEqual({ focal: "rgb(255, 106, 19)", plain: "rgb(17, 17, 17)", name: "rgb(17, 17, 17)" })

    await page.evaluate(() => document.documentElement.classList.add("dark"))
    expect(await colours()).toEqual({ focal: "rgb(255, 138, 61)", plain: "rgb(238, 238, 238)", name: "rgb(238, 238, 238)" })
  })

  test("the MQTT examples build up topic by topic, one highlighted each", async ({ page }) => {
    // handbuch/designer/mqtt-beispiele.md: tank, dimmer, heater, each adding
    // a topic to the one before. A command is dashed (it does not stay on the
    // broker); each diagram highlights exactly the one topic it is about.
    await page.goto(`${site.url}designer/mqtt-beispiele.html`)
    const expected = [
      { id: "tank", topics: 1, commands: 0, focal: "schaltli/state/tank/1/level" },
      { id: "dimmer", topics: 2, commands: 1, focal: "schaltli/cmnd/dimmer/1" },
      { id: "heizung", topics: 3, commands: 1, focal: "schaltli/state/heater/target" },
    ]
    for (const e of expected) {
      const svg = page.locator(`svg.schaltli-diagram[aria-labelledby^="${e.id}-"]`)
      await expect(svg, e.id).toBeVisible()
      await expect(svg.locator("rect.topic"), e.id).toHaveCount(e.topics)
      await expect(svg.locator("rect.topic.command"), e.id).toHaveCount(e.commands)
      await expect(svg.locator(".focal"), e.id).toHaveCount(1)
      // The highlighted box is the one holding the named topic.
      const focal = await svg.locator(".focal").boundingBox()
      const name = await svg.locator("text.topic-name", { hasText: e.focal }).boundingBox()
      expect(name!.y, e.id).toBeGreaterThan(focal!.y)
      expect(name!.y + name!.height, e.id).toBeLessThan(focal!.y + focal!.height)
    }
    // The page is in the sidebar, right after the topics page it explains.
    const sidebar = await page.locator(".VPSidebar a.VPLink").allTextContents()
    const at = sidebar.findIndex((t) => t.trim() === "MQTT an drei Beispielen")
    expect(at).toBeGreaterThan(0)
    expect(sidebar[at - 1].trim()).toBe("MQTT-Topics")
  })

  test("every page in the sidebar opens", async ({ page }) => {
    await page.goto(`${site.url}einfuehrung/`)
    const links = page.locator(".VPSidebar a.VPLink")
    const hrefs = await links.evaluateAll((all) => all.map((a) => (a as HTMLAnchorElement).href))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) {
      const response = await page.goto(href)
      expect(response?.status(), href).toBe(200)
      await expect(page.locator(".vp-doc h1"), href).toBeVisible()
    }
  })
})

test.describe("the designer points at the handbook", () => {
  test("from the start screen", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    const link = page.getByTestId("handbook-link")
    await expect(link).toHaveText("Read the handbook")
    await expect(link).toHaveAttribute("href", HANDBOOK_URL)
    await expect(link).toHaveAttribute("target", "_blank")
  })

  test("from the editor's Help button", async ({ page }) => {
    await page.goto("/")
    await waitForDeviceGate(page)
    const card = await revealDevice(page, WAVESHARE_DEVICE_ID, "curated")
    await card.dblclick()
    await waitForEditorReady(page)

    const help = page.getByTestId("help-link")
    await expect(help).toHaveText("Help")
    await expect(help).toHaveAttribute("href", HANDBOOK_URL)
    await expect(help).toHaveAttribute("target", "_blank")
  })
})
