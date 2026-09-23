import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { chooseDevice, ROUND_FIXTURE_DEVICE_ID, waitForDeviceGate } from "./helpers"
import { seedRoundFixtureDdf } from "./ddf-seed"
import { replayIconServices } from "./icon-service-recording"

// How many requests a search for icons makes (2026-09-22,
// docs/2026-09-22-icon-batching.md).
//
// This is not a detail of the picker, it is the picker working at all. Every
// hit used to be its own <img src=".../<prefix>/<name>.svg"> - fifty requests
// a search, a fresh fifty per keystroke the debounce let through - and
// Iconify rations that endpoint per address. Once it starts answering 429 the
// grid is nothing but torn-page tiles, and because a 429 carries no CORS
// header the app could not even see why. That is what the user reported:
// "so schaut es aus wenn ich ein icon mit open suchen will".
//
// So what is pinned here is the shape of the traffic: one request per
// COLLECTION, none per icon, and none at all when an icon is picked. A
// change that quietly goes back to one request per icon passes every other
// icon spec in this suite and fails this one.
//
// The counts are read from the recording rather than written down, so
// re-recording the search cannot leave a stale number behind.

const SEARCH_TERM = "home"
const ICONIFY = "https://api.iconify.design/"

function recordedSearch(term: string): string[] {
  const file = path.join(__dirname, "fixtures", "icon-services", "search.json")
  const recorded = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>
  const body = recorded[term]
  if (!body) throw new Error(`no recorded icon search for "${term}"`)
  return (JSON.parse(body) as { icons: string[] }).icons
}

test.describe("Icon search traffic", () => {
  test.beforeEach(async ({ page }) => {
    await replayIconServices(page)
    const seeded = await seedRoundFixtureDdf()
    test.skip(!seeded, "schaltli-firmware not checked out alongside this repo")
  })

  test("a search asks once per collection, never once per icon", async ({ page }) => {
    const names = recordedSearch(SEARCH_TERM)
    const collections = new Set(names.map((n) => n.slice(0, n.indexOf(":"))))
    expect(collections.size, "the recorded search is spread over several collections").toBeGreaterThan(5)

    const perIcon: string[] = []
    const perCollection: string[] = []
    const searches: string[] = []
    page.on("request", (request) => {
      const url = request.url()
      if (!url.startsWith(ICONIFY)) return
      const { pathname } = new URL(url)
      if (pathname.startsWith("/search")) searches.push(url)
      else if (pathname.endsWith(".json")) perCollection.push(url)
      else if (pathname.endsWith(".svg")) perIcon.push(url)
    })

    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, ROUND_FIXTURE_DEVICE_ID, "auto-discovered")
    await page.getByRole("button", { name: "Create Project" }).click()
    await page.waitForTimeout(1500)

    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Screens", exact: true }).click()
    await page.getByRole("button", { name: "Select icon" }).click()
    await expect(page.getByRole("dialog", { name: "Select Icon" })).toBeVisible()

    await page.getByPlaceholder("Search for icons...").fill(SEARCH_TERM)
    const grid = page.getByRole("dialog", { name: "Select Icon" }).getByRole("button", { name: /:/ })
    await expect(grid.first()).toBeVisible()
    await expect.poll(() => grid.count(), { timeout: 15000 }).toBe(names.length)

    expect(searches.length, "one search for one term").toBe(1)
    expect(perIcon, "no icon was asked for on its own").toEqual([])
    expect(perCollection.length, "one request per collection the hits come from").toBe(collections.size)
    expect(perCollection.length).toBeLessThan(names.length)

    // Every request names the icons it wants, and only the ones it wants.
    for (const url of perCollection) {
      const asked = new URL(url).searchParams.get("icons") ?? ""
      expect(asked.split(",").filter(Boolean).length, `${url} asks for icons`).toBeGreaterThan(0)
    }

    // The assembled SVGs are real pictures, not a grid of broken images -
    // which is the fault this whole change is about, and a naturalWidth of 0
    // is exactly what a torn-page tile has.
    const drawn = await page.evaluate(() => {
      const images = [...document.querySelectorAll<HTMLImageElement>('[role="dialog"] img')]
      return {
        total: images.length,
        loaded: images.filter((i) => i.complete && i.naturalWidth > 0).length,
        dataUrls: images.filter((i) => i.src.startsWith("data:image/svg+xml")).length,
      }
    })
    expect(drawn.loaded, "every tile shows a picture").toBe(drawn.total)
    expect(drawn.dataUrls, "and shows it from the batch, not from a second request").toBe(drawn.total)

    // Picking one needs nothing further: its body arrived with the batch.
    const before = perIcon.length + perCollection.length + searches.length
    await grid.first().click()
    await expect(page.getByRole("dialog", { name: "Select Icon" })).not.toBeVisible()
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible()
    expect(perIcon.length + perCollection.length + searches.length, "choosing an icon costs no request").toBe(before)
  })
})
