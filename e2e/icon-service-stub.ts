import fs from "fs"
import path from "path"
import type { Page, Route } from "@playwright/test"

// Serves the icon services from recorded responses instead of the internet.
//
// Three outside calls sit behind the icon features: Iconify's search, the SVG
// each result points at (lib/icon-search.ts), and this app's own
// /api/translate route, which proxies Google Translate so a German screen
// name can be looked up in English (screens-panel.tsx).
//
// They made the suite depend on the weather. Iconify's public API is rate
// limited, and a day of repeated full runs earns a 429 on the SVG endpoint
// while search still answers 200 - so the picker finds an icon, fails to
// load it, and four specs time out on something that has nothing to do with
// the code (2026-09-11). Before that they simply failed whenever the network
// was slow, which is why one of them already carried a hand-raised 20s
// timeout and a comment about measuring the internet.
//
// What is still tested: that the app calls translate, uses its answer to
// search, renders the results, and keeps the one that was picked. What is no
// longer tested is the quality of Google's translation and Iconify's ranking,
// which were never this suite's to guarantee and which it could not have
// failed usefully anyway.
//
// Re-record with ICON_RECORD=1 when a spec starts asking for a term the
// recording has no answer for; the failure names the exact URL.

const DIR = path.join(__dirname, "fixtures", "icon-services")
const SEARCH_FILE = path.join(DIR, "search.json")
const TRANSLATE_FILE = path.join(DIR, "translate.json")
const SVG_DIR = path.join(DIR, "svg")

const recording = process.env.ICON_RECORD === "1"

// Stands in for an unrecorded preview thumbnail: a filled square, in
// currentColor so the picker's own tinting still applies to it.
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z"/></svg>'

type Recorded = Record<string, string>

function readMap(file: string): Recorded {
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

function writeMap(file: string, map: Recorded): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Sorted, so re-recording one new term produces a one-line diff rather
  // than a reshuffled file.
  const sorted = Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]))
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n")
}

// The query string a search URL asks for, which is the key everything is
// filed under. Lower-cased because the app sends whatever the user typed and
// two spellings of the same word are the same recording.
function searchKey(url: URL): string {
  return (url.searchParams.get("query") ?? "").trim().toLowerCase()
}

function translateKey(url: URL): string {
  return `${(url.searchParams.get("q") ?? "").trim().toLowerCase()}|${url.searchParams.get("target") ?? "en"}`
}

function svgFile(url: URL): string {
  // "/material-symbols/home.svg" -> "material-symbols__home.svg"
  return path.join(SVG_DIR, url.pathname.replace(/^\//, "").replace(/\//g, "__"))
}

async function passThroughAndRecord(route: Route, save: (body: string) => void): Promise<void> {
  const response = await route.fetch()
  const body = await response.text()
  if (response.ok()) save(body)
  await route.fulfill({ response, body })
}

function missing(kind: string, key: string, url: string): never {
  throw new Error(
    `No recorded ${kind} for "${key}" (${url}).\n` +
      `Re-record with:  ICON_RECORD=1 npx playwright test <spec>\n` +
      `and commit e2e/fixtures/icon-services/.`,
  )
}

export async function stubIconServices(page: Page): Promise<void> {
  const search = readMap(SEARCH_FILE)
  const translate = readMap(TRANSLATE_FILE)

  await page.route("https://api.iconify.design/search*", async (route) => {
    const url = new URL(route.request().url())
    const key = searchKey(url)

    if (recording) {
      await passThroughAndRecord(route, (body) => {
        search[key] = body
        writeMap(SEARCH_FILE, search)
      })
      return
    }

    const body = search[key]
    if (body === undefined) missing("icon search", key, url.href)
    await route.fulfill({ status: 200, contentType: "application/json", body })
  })

  await page.route("https://api.iconify.design/*/*.svg", async (route) => {
    const url = new URL(route.request().url())
    const file = svgFile(url)

    if (recording) {
      await passThroughAndRecord(route, (body) => {
        fs.mkdirSync(SVG_DIR, { recursive: true })
        fs.writeFileSync(file, body)
      })
      return
    }

    // A missing SVG is served as a placeholder rather than raised, and the
    // difference matters more than it looks.
    //
    // The picker renders every search hit as its own <img>, so one search for
    // "star" pulls dozens of preview SVGs that no assertion ever looks at.
    // Throwing on those took a route handler's exception straight into the
    // test result and failed it for a thumbnail - while the icon the test
    // actually clicked was recorded and fine. A search or a translation is
    // the opposite: the test's logic is built on the answer, so a gap there
    // has to stop the run.
    //
    // The placeholder is a real, valid SVG. The one place a clicked icon's
    // own bytes are asserted on is page-icon-export, which compares the baked
    // PGM's dimensions rather than its content, so a stand-in cannot make a
    // green run lie about pixels.
    if (!fs.existsSync(file)) {
      console.warn(`[icon-stub] no recording for ${url.pathname} - serving a placeholder`)
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: PLACEHOLDER_SVG,
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fs.readFileSync(file, "utf8"),
    })
  })

  await page.route("**/api/translate*", async (route) => {
    const url = new URL(route.request().url())
    const key = translateKey(url)

    if (recording) {
      await passThroughAndRecord(route, (body) => {
        translate[key] = body
        writeMap(TRANSLATE_FILE, translate)
      })
      return
    }

    const body = translate[key]
    if (body === undefined) missing("translation", key, url.href)
    await route.fulfill({ status: 200, contentType: "application/json", body })
  })
}
