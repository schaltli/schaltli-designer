import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas } from "./helpers"
import { DEMO_HEADER } from "../lib/demo-mode"
import { browserOf, eventLine, pruneEvents, referrerHost, withinLimits } from "../lib/demo-events"
import { placeOf } from "../lib/demo-geo"
const { summarize, render } = require("../deploy/demo/report.js")

// What the demo counts of its visitors (docs/2026-10-10-demo-tracking.md):
// no cookie, no address - a random visit id per tab, country and region (the
// city only where it is big), the referring site's host, browser and form,
// and what was done. Written by the dev server into .data/demo-events when
// the request carries the demo header, as on the demo server always.

const DEMO = { [DEMO_HEADER]: "1" }
const START = process.env.SCHALTLI_DEMO_START?.trim() || "Demo"
const EVENTS = path.join(__dirname, "..", ".data", "demo-events")
const REQ = { address: "203.0.113.7", userAgent: null, ownHost: "demo.schaltli.com" }

function eventsOf(visit: string): any[] {
  const day = new Date().toISOString().slice(0, 10)
  const file = path.join(EVENTS, `${day}.jsonl`)
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.includes(visit))
    .map((l) => JSON.parse(l))
}

test("an event is checked: a visit id, a known type, a short detail - and the address is never in the line", () => {
  const now = new Date("2026-10-10T12:00:00Z")
  expect(eventLine({ visit: "abc", type: "visit" }, REQ, now)).toBeNull()
  expect(eventLine({ visit: "abcdefgh12", type: "hack" }, REQ, now)).toBeNull()
  expect(eventLine({ visit: "abcdefgh12", type: "tap", detail: "x".repeat(121) }, REQ, now)).toBeNull()
  expect(eventLine({ visit: "abcdefgh12", type: "tap", detail: "a\nb" }, REQ, now)).toBeNull()
  expect(eventLine("nonsense", REQ, now)).toBeNull()
  expect(eventLine({ visit: "abcdefgh12", type: "tap", detail: "relay/1=on" }, REQ, now)).toEqual({
    t: "2026-10-10T12:00:00.000Z",
    visit: "abcdefgh12",
    type: "tap",
    detail: "relay/1=on",
  })
  const visit = eventLine(
    { visit: "abcdefgh12", type: "visit", referrer: "https://forum.pekaway.de/t/schaltli/123?x=1" },
    { ...REQ, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36" },
    now,
  )!
  expect(visit).toMatchObject({ from: "forum.pekaway.de", browser: "Chrome", form: "desktop", place: null })
  expect(JSON.stringify(visit)).not.toContain("203.0.113")
  // The referring page only as its site, and this site is no referrer.
  expect(referrerHost("https://demo.schaltli.com/projects/Camper", "demo.schaltli.com")).toBeNull()
  expect(referrerHost("not a url", null)).toBeNull()
  expect(browserOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17.0 Mobile Safari/604.1")).toEqual({ browser: "Safari", form: "phone" })
  expect(browserOf("Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit Chrome/130.0 Safari/537.36").form).toBe("tablet")
})

test("a place is country and region; the city only where it is big", () => {
  const big = new Set(["ch\tzurich"])
  const record = (city: string) => ({ country: { iso_code: "CH" }, subdivisions: [{ names: { en: "Zurich" } }], city: { names: { en: city } } })
  expect(placeOf(record("Zurich"), big)).toEqual({ country: "CH", region: "Zurich", city: "Zurich" })
  expect(placeOf(record("Wila"), big)).toEqual({ country: "CH", region: "Zurich" })
  expect(placeOf({ country: { iso_code: "DE" } }, big)).toEqual({ country: "DE" })
  expect(placeOf(null, big)).toBeNull()
  expect(placeOf({}, big)).toBeNull()
})

test("limits: 120 events a minute per visit, 60 new visits an hour per address", () => {
  const t = Date.UTC(2026, 9, 10, 12, 0, 0)
  for (let i = 0; i < 120; i++) expect(withinLimits("limitvisit1", null, t)).toBe(true)
  expect(withinLimits("limitvisit1", null, t)).toBe(false)
  expect(withinLimits("limitvisit1", null, t + 60_000)).toBe(true)
  for (let i = 0; i < 60; i++) expect(withinLimits(`addrvisit${i}x`, "198.51.100.1", t)).toBe(true)
  expect(withinLimits("addrvisit60x", "198.51.100.1", t)).toBe(false)
  expect(withinLimits("addrvisit1x", "198.51.100.1", t)).toBe(true)
})

test("day files older than 30 days go", async ({}, testInfo) => {
  const dir = testInfo.outputPath("events")
  fs.mkdirSync(dir, { recursive: true })
  for (const day of ["2026-09-09", "2026-09-10", "2026-10-10"]) fs.writeFileSync(path.join(dir, `${day}.jsonl`), "")
  fs.writeFileSync(path.join(dir, "notes.txt"), "")
  await pruneEvents(dir, new Date("2026-10-10T08:00:00Z"))
  expect(fs.readdirSync(dir).sort()).toEqual(["2026-09-10.jsonl", "2026-10-10.jsonl", "notes.txt"])
})

test("the route is the demo's only, and writes the line without the address", async ({ request }) => {
  const visit = `route${Date.now().toString(36)}`.slice(0, 20)
  const outside = await request.post("/api/demo/event", { data: { visit, type: "visit" } })
  expect(outside.status()).toBe(404)
  const bad = await request.post("/api/demo/event", { headers: DEMO, data: { visit, type: "nonsense" } })
  expect(bad.status()).toBe(400)
  const ok = await request.post("/api/demo/event", {
    headers: { ...DEMO, "x-forwarded-for": "203.0.113.9" },
    data: { visit, type: "visit", referrer: "https://forum.pekaway.de/t/1" },
  })
  expect(ok.status()).toBe(204)
  const lines = eventsOf(visit)
  expect(lines).toHaveLength(1)
  expect(lines[0]).toMatchObject({ visit, type: "visit", from: "forum.pekaway.de" })
  expect(JSON.stringify(lines)).not.toContain("203.0.113")
})

test.describe("in the browser", () => {
  test.beforeAll(async ({ request }) => {
    if ((await request.get(`/api/projects/${START}`)).ok()) return
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const res = await request.post("/api/projects", { data: { name: START, project: { ...project, name: START } } })
    expect([201, 409]).toContain(res.status())
  })

  test("a visit counts what it does: preview, designer, an insert, a refused Save, a download", async ({ page }) => {
    await page.setExtraHTTPHeaders(DEMO)
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    await expect(page.getByTestId("demo-notice").getByRole("link", { name: /counted anonymously/ })).toHaveAttribute(
      "href",
      "https://schaltli.com/einfuehrung/ausprobieren#demo-zaehlt",
    )
    const visit = await page.evaluate(() => sessionStorage.getItem("schaltli.demoVisit"))
    expect(visit).toMatch(/^[a-z0-9]{8,32}$/)
    await expect.poll(() => eventsOf(visit!).map((e) => `${e.type}:${e.detail ?? ""}`)).toEqual(
      expect.arrayContaining(["visit:", "mode:preview"]),
    )

    await page.getByTestId("demo-mode-switch").getByRole("button", { name: "Designer" }).click()
    const { box } = await getMainCanvas(page)
    const from = devicePoint(box, 40, 230, { width: 400, height: 300 })
    const to = devicePoint(box, 200, 280, { width: 400, height: 300 })
    // A text field: every device has the Text tool.
    await page.getByRole("button", { name: "Text", exact: true }).first().click()
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: /^Save\s*Ctrl\+S$/ }).click()
    await page.getByRole("button", { name: "File" }).click()
    const download = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: "Download Project" }).click()
    await download

    await expect
      .poll(() => eventsOf(visit!).map((e) => `${e.type}:${e.detail ?? ""}`))
      .toEqual(expect.arrayContaining(["visit:", "mode:preview", "mode:designer", "insert:text", "refused:save", "download:"]))
    expect(JSON.stringify(eventsOf(visit!))).not.toMatch(/127\.0\.0\.1|::1/)
  })

  test("outside the demo nothing is sent", async ({ page }) => {
    let sent = false
    page.on("request", (req) => {
      if (req.url().includes("/api/demo/event")) sent = true
    })
    await page.goto(`/projects/${START}`)
    await expect(page.getByTestId("project-title")).toHaveText(START)
    await page.waitForTimeout(1500)
    expect(sent).toBe(false)
    expect(await page.evaluate(() => sessionStorage.getItem("schaltli.demoVisit"))).toBeNull()
  })
})

test("the report sums visits up: how many, how long, what they did, where from", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 10, 10, 0, s)).toISOString()
  const events = [
    { t: at(0), visit: "aaaaaaaa", type: "visit", place: { country: "CH", region: "Schaffhausen" }, from: "forum.pekaway.de", browser: "Chrome", form: "desktop" },
    { t: at(5), visit: "aaaaaaaa", type: "mode", detail: "preview" },
    { t: at(20), visit: "aaaaaaaa", type: "tap", detail: "relay/1=on" },
    { t: at(40), visit: "aaaaaaaa", type: "mode", detail: "designer" },
    { t: at(50), visit: "aaaaaaaa", type: "insert", detail: "box" },
    { t: at(90), visit: "aaaaaaaa", type: "download" },
    { t: at(100), visit: "bbbbbbbb", type: "visit", place: { country: "DE", region: "Bavaria", city: "Munich" }, from: null, browser: "Safari", form: "phone", detail: "phone page" },
    { t: at(110), visit: "bbbbbbbb", type: "scene", detail: "shower" },
    { t: at(130), visit: "bbbbbbbb", type: "refused", detail: "save" },
  ]
  const s = summarize(events)
  expect(s).toMatchObject({ visits: 2, phonePage: 1, medianSeconds: 60, longest: 90, designer: 1, inserted: 1, downloads: 1 })
  expect([...s.places.keys()].sort()).toEqual(["CH, Schaffhausen", "DE, Bavaria, Munich"])
  expect(s.taps.get("relay/1")).toBe(1)
  const text = render(s, 7)
  expect(text).toContain("Visits             2")
  expect(text).toContain("forum.pekaway.de")
  expect(text).toContain("IP Geolocation by DB-IP")
})
