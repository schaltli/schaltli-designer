import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import { COMBINED_TEST_PROJECT, createScreen } from "./helpers"
import { DEMO_HEADER, allowedInDemo } from "../lib/demo-mode"
import { POST as createProject } from "../app/api/projects/route"
import { DELETE as deleteProject } from "../app/api/projects/[name]/route"
import { POST as deploy } from "../app/api/deploy/route"
import { POST as fetchDdf } from "../app/api/ddf/fetch/route"

// The demo mode of demo.schaltli.com (docs/2026-10-09-demo-instance.md,
// decisions 2 and 3): reading the start project and what the designer needs
// to draw it passes, everything else is 403 «Not in the demo». Turned on here
// per request with the test header, which only a server outside production
// honours; on the demo server SCHALTLI_DEMO=1 does it for every request.

const DEMO = { [DEMO_HEADER]: "1" }
// The start project's name comes from the server's environment
// (SCHALTLI_DEMO_START, «Camper» on the demo server); the dev server has
// none, so it is the default.
const START = process.env.SCHALTLI_DEMO_START?.trim() || "Demo"

// Every route and method there is (app/api/**/route.ts, 2026-10-09). A route
// added later has to be put here, as allowed or as refused.
const REFUSED: [string, string][] = [
  ["GET", "/api/by-instance/e2e-demo"],
  ["POST", "/api/ddf/fetch"],
  ["POST", "/api/deploy"],
  ["GET", "/api/deploy/e2e-demo"],
  ["GET", "/api/firmware/release"],
  ["GET", "/api/firmware/release/x.bin"],
  ["POST", "/api/firmware/upload"],
  ["GET", "/api/firmware/upload/e2e-demo"],
  ["POST", "/api/projects"],
  ["DELETE", "/api/projects/e2e-demo"],
  ["POST", "/api/projects/e2e-demo/deploys"],
  ["POST", "/api/projects/e2e-demo/rename"],
  ["POST", "/api/projects/e2e-demo/versions"],
  ["GET", "/api/projects/e2e-demo/versions/v1"],
  ["POST", "/api/recovery/fetch"],
  ["GET", "/api/translate?q=Licht&tl=en"],
]
const ALLOWED: [string, string][] = [
  ["GET", "/api/projects"],
  ["GET", "/api/projects/e2e-demo-none"],
  ["GET", "/api/projects/e2e-demo-none/versions"],
  ["GET", "/api/ddf/list"],
  ["GET", "/api/ddf/data/waveshare-touch-lcd-4v3b.ddf.zip"],
  ["GET", "/api/fonts/list"],
  ["GET", "/api/version"],
]

test("the allow-list lets through only what reads the start project and draws it", () => {
  for (const [method, path] of ALLOWED) expect(allowedInDemo(method, path.split("?")[0]), `${method} ${path}`).toBe(true)
  for (const [method, path] of REFUSED) expect(allowedInDemo(method, path.split("?")[0]), `${method} ${path}`).toBe(false)
  // HEAD reads as GET; a path is matched whole, not by its start.
  expect(allowedInDemo("HEAD", "/api/version")).toBe(true)
  expect(allowedInDemo("GET", "/api/projects/x/rename")).toBe(false)
  expect(allowedInDemo("GET", "/api/version/../projects")).toBe(false)
})

test("in demo mode every refused route answers 403, every allowed one as usual", async ({ request }) => {
  for (const [method, path] of REFUSED) {
    const res = await request.fetch(path, { method, headers: DEMO, data: method === "GET" ? undefined : {} })
    expect(res.status(), `${method} ${path}`).toBe(403)
    expect(await res.json()).toEqual({ error: "Not in the demo" })
  }
  for (const [method, path] of ALLOWED) {
    const res = await request.fetch(path, { method, headers: DEMO })
    expect(res.status(), `${method} ${path}`).not.toBe(403)
  }
  expect(await (await request.get("/api/version", { headers: DEMO })).json()).toMatchObject({ demo: { start: START } })
})

test("without demo mode nothing changes", async ({ request }) => {
  expect(await (await request.get("/api/version")).json()).not.toHaveProperty("demo")
  // Routes that only read, asked without the header: not refused.
  for (const path of ["/api/by-instance/e2e-demo", "/api/firmware/release", "/api/projects/e2e-demo/versions/v1"]) {
    expect((await request.get(path)).status(), path).not.toBe(403)
  }
})

test("a route handler refuses on its own too, past the middleware", async () => {
  // Called directly, as if a request had slipped by middleware.ts: each
  // handler checks again before it does anything.
  const req = (method: string, path: string, body?: unknown) =>
    new Request(`http://localhost:3000${path}`, {
      method,
      headers: { ...DEMO, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  const params = { params: Promise.resolve({ name: "e2e-demo" }) }
  expect((await createProject(req("POST", "/api/projects", { name: "e2e-demo" }))).status).toBe(403)
  expect((await deleteProject(req("DELETE", "/api/projects/e2e-demo"), params as any)).status).toBe(403)
  expect((await deploy(req("POST", "/api/deploy", {}))).status).toBe(403)
  expect((await fetchDdf(req("POST", "/api/ddf/fetch", { url: "http://192.0.2.1/ddf.zip" }))).status).toBe(403)
})

// The client (decision 3). The page sends the header with every request,
// as the demo server's environment would answer every request, and the
// start project is put on the dev server for the run if it is not
// there (the global teardown takes away what a run created).
test.describe("the demo in the browser", () => {
  test.describe.configure({ mode: "serial" })

  test.beforeAll(async ({ request }) => {
    if ((await request.get(`/api/projects/${START}`)).ok()) return
    const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    const res = await request.post("/api/projects", { data: { name: START, project: { ...project, name: START } } })
    expect(res.status(), await res.text()).toBe(201)
  })

  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders(DEMO)
  })

  test("the start page opens the start project at once, with the notice and without the project list", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    await expect(page).toHaveURL(new RegExp(`/projects/${START}$`))
    await expect(page.getByRole("heading", { name: "Welcome to Schaltli" })).toHaveCount(0)
    await expect(page.getByTestId("demo-notice")).toContainText("Demo - nothing is saved")
    await expect(page.getByTestId("demo-notice").getByRole("link", { name: "Install Schaltli" })).toHaveAttribute(
      "href",
      "https://schaltli.com/installieren/pekaway.html",
    )
    await expect(page.getByRole("complementary", { name: "Projects panel" })).toHaveCount(0)
  })

  // No draft in the browser (2026-10-10): one from an earlier visit opened
  // in place of the start project as the server has it now, and an edit
  // kept one, though the demo saves nothing.
  test("the start project opens as the server has it, never a draft, and an edit keeps none", async ({ page }) => {
    const drafts = (op: "all" | "put", draft?: unknown) =>
      page.evaluate(
        ([op, draft]) =>
          new Promise<string[]>((resolve) => {
            const open = indexedDB.open("schaltli", 1)
            open.onupgradeneeded = () => open.result.createObjectStore("drafts", { keyPath: "key" })
            open.onsuccess = () => {
              const store = open.result.transaction("drafts", "readwrite").objectStore("drafts")
              const request = op === "put" ? store.put(draft) : store.getAll()
              request.onsuccess = () => {
                resolve(op === "put" ? [] : (request.result as unknown[]).map((d) => JSON.stringify(d)))
                open.result.close()
              }
            }
          }),
        [op, draft] as const,
      )
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    const project = (await (await page.request.get(`/api/projects/${START}`)).json()).project
    project.screens.push({ id: "screen-earlier", name: "From an earlier visit", masterScreenId: project.screens.find((s: any) => s.isMaster)?.id, objects: [] })
    await drafts("put", { key: `name:${START.toLowerCase()}`, name: START, deviceName: null, updatedAt: new Date().toISOString(), project })

    await page.reload()
    await expect(page.getByTestId("project-title")).toHaveText(START)
    await expect(page.getByText("From an earlier visit", { exact: true })).toHaveCount(0)

    await page.getByTestId("demo-mode-switch").getByRole("button", { name: "Designer" }).click()
    await createScreen(page, "Not kept", false)
    await page.waitForTimeout(2000)
    // The one put there is left as it was: nothing written over it.
    const kept = await drafts("all")
    expect(kept).toHaveLength(1)
    expect(kept[0]).toContain("From an earlier visit")
    expect(kept[0]).not.toContain("Not kept")
  })

  // Preview or designer, plain to see (2026-10-10): it opens in the preview,
  // on black felt and without the screens list; the red switch under the
  // device goes to the designer and back.
  test("it opens in the preview, on felt and without the screens list; the red switch goes to the designer and back", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    const modes = page.getByTestId("demo-mode-switch")
    const preview = modes.getByRole("button", { name: "Preview" })
    const designer = modes.getByRole("button", { name: "Designer" })
    const backdrop = page.locator("[data-backdrop]")
    await expect(preview).toHaveAttribute("aria-pressed", "true")
    // In place of the toolbar's Preview button, not beside it.
    await expect(page.getByRole("button", { name: "Exit Preview" })).toHaveCount(0)
    await expect(backdrop).toHaveAttribute("data-backdrop", "felt")
    await expect(page.getByText("Manage Screens")).toHaveCount(0)
    // Under the device: on a large screen halfway between its lower edge
    // and the canvas's bottom; on a small one in a strip under the canvas.
    const canvas = page.locator("canvas[data-device-bottom]")
    const place = page.locator("[data-place]")
    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(place).toHaveAttribute("data-place", "float")
    await expect
      .poll(async () => {
        const box = (await canvas.boundingBox())!
        const bottom = box.y + Number(await canvas.getAttribute("data-device-bottom"))
        const pill = (await modes.boundingBox())!
        return Math.abs(pill.y + pill.height / 2 - (bottom + (box.y + box.height)) / 2)
      })
      .toBeLessThan(4)
    await page.setViewportSize({ width: 1280, height: 480 })
    await expect(place).toHaveAttribute("data-place", "strip")
    const box = (await canvas.boundingBox())!
    expect((await modes.boundingBox())!.y).toBeGreaterThanOrEqual(box.y + box.height)

    await designer.click()
    await expect(designer).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByRole("button", { name: "Preview", exact: true })).toHaveCount(1)
    await expect(backdrop).toHaveAttribute("data-backdrop", "plain")
    await expect(page.getByText("Manage Screens")).toBeVisible()

    await preview.click()
    await expect(preview).toHaveAttribute("aria-pressed", "true")
    await expect(backdrop).toHaveAttribute("data-backdrop", "felt")
  })

  // What only an own Schaltli does stays in the menu and says so, with the
  // way on, and does nothing (2026-10-10; until then it was not shown).
  test("File shows everything; what saves, deploys or keeps versions says it is not possible here, and how to get it", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    let sent = false
    page.on("request", (req) => {
      if (req.method() !== "GET" && req.url().includes("/api/")) sent = true
    })
    const file = page.getByRole("button", { name: "File" })
    await file.click()
    for (const kept of ["Download Project", "Upload Project", "Export Project", "New Project"]) {
      await expect(page.getByRole("menuitem", { name: kept })).toBeVisible()
    }
    await page.keyboard.press("Escape")
    for (const [item, why] of [
      [/^Save\s*Ctrl\+S$/, "saves your projects"],
      [/^Save As\.\.\./, "saves your projects"],
      [/^Deploy to Device$/, "sends a screen to the displays"],
      [/^Version History$/, "keeps every saved version"],
    ] as const) {
      await file.click()
      await page.getByRole("menuitem", { name: item }).click()
      const refusal = page.getByTestId("demo-refusal").last()
      await expect(page.getByText("Not possible in the demo").last()).toBeVisible()
      await expect(refusal).toContainText(why)
      await expect(refusal.getByRole("link", { name: "How to install Schaltli" })).toHaveAttribute(
        "href",
        "https://schaltli.com/installieren/pekaway.html",
      )
      await expect(page.getByRole("dialog")).toHaveCount(0)
    }
    expect(sent).toBe(false)
  })

  test("Ctrl+S says the demo saves nothing, and saves nothing", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    let saved = false
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/projects")) saved = true
    })
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByText("Not possible in the demo").first()).toBeVisible()
    await expect(page.getByTestId("demo-refusal").first()).toContainText("Download Project takes your screen with you")
    expect(saved).toBe(false)
  })

  test("Discover MQTT Topics connects to the demo's broker and offers no other", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    await page.getByRole("button", { name: "Settings" }).click()
    await page.getByText("Topics", { exact: true }).click()
    await page.getByRole("button", { name: "Discover MQTT Topics" }).click()
    await expect(page.getByRole("button", { name: "Start Discovery" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Connection settings" })).toHaveCount(0)
  })

  // Decision 9: a phone gets its own page first - the van, the way on.
  test("on a phone the demo opens its own page; «Open the designer anyway» opens the project", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/")
    const start = page.getByTestId("demo-phone-start")
    await expect(start).toBeVisible()
    await expect(start.locator("svg").first()).toBeVisible()
    await expect(start.getByRole("link", { name: "Install Schaltli" })).toHaveAttribute("href", "https://schaltli.com/installieren/pekaway.html")
    await expect(start.getByRole("link", { name: "Read the handbook" })).toBeVisible()
    await start.getByRole("button", { name: "Open the designer anyway" }).click()
    await expect(page.getByTestId("project-title")).toHaveText(START)
    // Chosen for this session: a reload goes straight to the designer.
    await page.reload()
    await expect(page.getByTestId("project-title")).toHaveText(START)
    await expect(page.getByTestId("demo-phone-start")).toHaveCount(0)
  })

  test("a phone outside the demo gets the designer as always", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const phone = await context.newPage()
    await phone.goto("/")
    await expect(phone.getByRole("heading", { name: "Welcome to Schaltli" })).toBeVisible()
    await expect(phone.getByTestId("demo-phone-start")).toHaveCount(0)
    await context.close()
  })
})
