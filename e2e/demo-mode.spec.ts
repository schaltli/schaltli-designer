import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import { COMBINED_TEST_PROJECT } from "./helpers"
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

  test("File offers what keeps a screen, nothing that saves or deploys", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    await page.getByRole("button", { name: "File" }).click()
    for (const kept of ["Download Project", "Upload Project", "Export Project", "New Project"]) {
      await expect(page.getByRole("menuitem", { name: kept })).toBeVisible()
    }
    for (const gone of ["Save", "Save As...", "Version History", "Deploy to Device"]) {
      await expect(page.getByRole("menuitem", { name: gone, exact: true })).toHaveCount(0)
    }
  })

  test("Ctrl+S says the demo saves nothing, and saves nothing", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("project-title")).toHaveText(START)
    let saved = false
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/projects")) saved = true
    })
    await page.keyboard.press("ControlOrMeta+s")
    await expect(page.getByText("Demo - nothing is saved").first()).toBeVisible()
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
})
