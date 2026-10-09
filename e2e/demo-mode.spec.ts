import { test, expect } from "@playwright/test"
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
  expect(await (await request.get("/api/version", { headers: DEMO })).json()).toMatchObject({ demo: true })
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
