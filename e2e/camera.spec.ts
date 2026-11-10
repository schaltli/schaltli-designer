import { test, expect, type Page } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import http from "http"
import type { AddressInfo } from "net"
import os from "os"
import path from "path"
import { chooseDevice, createProject, devicePoint, getMainCanvas, loadProject, ROUND_FIXTURE_SCREEN, objectTreeRow, openFrameSection, waitForDeviceGate, waitForEditorReady } from "./helpers"
import { seedPapers3Ddf, seedRoundFixtureDdf, seedWaveshare4Ddf } from "./ddf-seed"
import { CAMERA_MAX, CAMERA_MIN, clampCameraSize } from "../lib/camera-size"
import { placedSize } from "../lib/placing"
import { browserCanLoad, CAMERA_DESIGN_HINT, renderCamera } from "../components/canvas/renderers/render-camera"

// The Camera in the designer (docs/2026-11-09-camera.md, T4): its size, its
// fields, and only where the device declares it. Devices: hil/waveshare4v3b/camera.js.

const SWITCH_TEST_PROJECT = path.join(__dirname, "..", "test-projects", "switch-test-project.zip")

async function projectWithCamera(url = "http://192.168.1.50/capture"): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(SWITCH_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens[0].objects = [
    {
      id: "obj-camera",
      type: "camera",
      zIndex: 1,
      x: 40,
      y: 60,
      width: 200,
      height: 150,
      properties: { url, username: "", password: "" },
    },
  ]
  zip.file("project.json", JSON.stringify(project))
  const file = path.join(os.tmpdir(), `camera-${Date.now()}-${Math.floor(Math.random() * 1e6)}.zip`)
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  return file
}

test.describe("Camera size", () => {
  test("stays between what a device can draw", () => {
    expect(clampCameraSize(10, 10)).toEqual(CAMERA_MIN)
    expect(clampCameraSize(999, 999)).toEqual(CAMERA_MAX)
    expect(clampCameraSize(200, 150)).toEqual({ width: 200, height: 150 })
  })

  test("a new one is placed at the size a device shows best", () => {
    expect(placedSize("camera", 8)).toEqual(CAMERA_MAX)
  })
})

test.describe("Camera in the property panel", () => {
  test.beforeEach(async () => {
    await seedRoundFixtureDdf()
  })

  async function select(page: Page) {
    await loadProject(page, await projectWithCamera())
    await objectTreeRow(page, "obj-camera").click()
  }

  test("URL, Username and a masked Password", async ({ page }) => {
    await select(page)
    await expect(page.locator("#cameraUrl")).toHaveValue("http://192.168.1.50/capture")
    await page.locator("#cameraUrl").fill("http://10.0.0.7/shot.jpg")
    await expect(page.locator("#cameraUrl")).toHaveValue("http://10.0.0.7/shot.jpg")
    await page.locator("#cameraUsername").fill("van")
    await expect(page.locator("#cameraPassword")).toHaveAttribute("type", "password")
    await page.locator("#cameraPassword").fill("geheim")

    // The fields show the object's own values, so these were written to it.
    await expect(page.locator("#cameraUrl")).toHaveValue("http://10.0.0.7/shot.jpg")
    await expect(page.locator("#cameraUsername")).toHaveValue("van")
    await expect(page.locator("#cameraPassword")).toHaveValue("geheim")
  })

  test("the Frame cannot make it larger than a device draws", async ({ page }) => {
    await select(page)
    await openFrameSection(page)
    await page.locator("#width").fill("999")
    await page.locator("#width").blur()
    await expect(page.locator("#width")).toHaveValue(String(CAMERA_MAX.width))
  })
})

test.describe("Camera in the palette", () => {
  async function paletteOn(page: Page, deviceId: string) {
    await page.goto("/")
    await waitForDeviceGate(page)
    await chooseDevice(page, deviceId, "auto-discovered")
    await createProject(page)
    await waitForEditorReady(page)
    return page.getByTestId("palette").getByRole("button", { name: "Camera", exact: true })
  }

  test("offered on a device that declares it", async ({ page }) => {
    const deviceId = "e2e-camera-waveshare-4"
    test.skip(!(await seedWaveshare4Ddf(deviceId)), "schaltli-firmware not checked out")
    await expect(await paletteOn(page, deviceId)).toBeVisible()
  })

  test("not offered on one that does not", async ({ page }) => {
    const deviceId = "e2e-camera-papers3"
    test.skip(!(await seedPapers3Ddf(deviceId)), "schaltli-firmware not checked out")
    await expect(await paletteOn(page, deviceId)).toHaveCount(0)
  })
})

test.describe("Camera preview", () => {
  test("what a browser can load", () => {
    expect(browserCanLoad("http://10.0.0.7/shot.jpg", "", "http:")).toBe(true)
    expect(browserCanLoad("http://10.0.0.7/shot.jpg", "van", "http:")).toBe(false)
    expect(browserCanLoad("http://10.0.0.7/shot.jpg", "", "https:")).toBe(false)
    expect(browserCanLoad("https://cam/shot.jpg", "", "https:")).toBe(true)
    expect(browserCanLoad("", "", "http:")).toBe(false)
  })
})

test.describe("Camera preview on the canvas", () => {
  // A 64x64 red PNG, smaller than the object: centred and not enlarged.
  const RED = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAd0lEQVR4AeXBAQEAAAiDMKR/5xuE7QYjTOIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIkTuIeUzUCfsRYvj4AAAAASUVORK5CYII=",
    "base64",
  )
  const colourAt = async (page: Page, ox: number, oy: number) => {
    const { canvas, box } = await getMainCanvas(page)
    const point = devicePoint(box, ox, oy, ROUND_FIXTURE_SCREEN)
    return canvas.evaluate((el, [px, py]) => {
      const c = el as HTMLCanvasElement
      const rect = c.getBoundingClientRect()
      return Array.from(c.getContext("2d")!.getImageData(Math.round(((px - rect.left) / rect.width) * c.width), Math.round(((py - rect.top) / rect.height) * c.height), 1, 1).data.slice(0, 3))
    }, [point.x, point.y])
  }
  const CENTRE = { x: 40 + 100, y: 60 + 75 }
  const isRed = ([r, g, b]: number[]) => r > 200 && g < 60 && b < 60

  async function preview(page: Page, url?: string) {
    await seedRoundFixtureDdf()
    await loadProject(page, await projectWithCamera(url))
    await page.getByRole("button", { name: "Preview", exact: true }).click()
  }

  test("while designing: no picture, nothing fetched, and a hint", async ({ page }) => {
    let requests = 0
    await page.route("http://192.168.1.50/**", (route) => {
      requests++
      return route.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: RED })
    })
    await seedRoundFixtureDdf()
    await loadProject(page, await projectWithCamera())
    await page.waitForTimeout(1500)
    expect(requests).toBe(0)
    expect(isRed(await colourAt(page, CENTRE.x, CENTRE.y))).toBe(false)
  })

  test("the hint fits the narrowest Camera, and only the designer asks for it", () => {
    const drawn: { text: string; font: string }[] = []
    const ctx: Record<string, unknown> & { font: string } = {
      font: "",
      save() {},
      restore() {},
      fillRect() {},
      beginPath() {},
      arc() {},
      fill() {},
      fillText(text: string) {
        drawn.push({ text, font: ctx.font })
      },
    }
    const canvas = ctx as unknown as CanvasRenderingContext2D
    const obj = { id: "c", x: 0, y: 0, ...CAMERA_MIN, properties: {} }
    renderCamera(canvas, obj)
    expect(drawn).toEqual([])
    renderCamera(canvas, obj, undefined, CAMERA_DESIGN_HINT)
    expect(drawn.map((d) => d.text)).toEqual(CAMERA_DESIGN_HINT)
    expect(drawn[0].font).toBe(`${CAMERA_MIN.width / 8}px sans-serif`)
  })

  test("shows the camera's picture", async ({ page }) => {
    await page.route("http://192.168.1.50/**", (route) => route.fulfill({ status: 200, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" }, body: RED }))
    await preview(page)
    await expect.poll(async () => isRed(await colourAt(page, CENTRE.x, CENTRE.y)), { timeout: 15000 }).toBe(true)
    // Not enlarged: the corner of the object is still the stand-in.
    expect(isRed(await colourAt(page, 44, 64))).toBe(false)
  })

  // Reading the canvas back, as a switch's pills and a gauge do while drawing.
  test("a camera that does not allow it keeps the stand-in and the canvas readable", async ({ page }) => {
    // A real server: Playwright's route.fulfill answers a CORS request by itself.
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" })
      res.end(RED)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const { port } = server.address() as AddressInfo
      await preview(page, `http://127.0.0.1:${port}/shot.jpg`)
      await page.waitForTimeout(1500)
      expect(isRed(await colourAt(page, CENTRE.x, CENTRE.y))).toBe(false)
    } finally {
      server.close()
    }
  })

  test("keeps the stand-in when the camera does not answer", async ({ page }) => {
    await page.route("http://192.168.1.50/**", (route) => route.abort())
    await preview(page)
    await page.waitForTimeout(1500)
    expect(isRed(await colourAt(page, CENTRE.x, CENTRE.y))).toBe(false)
  })
})

test.describe("Camera in both exports", () => {
  const project = {
    name: "camera-export",
    screenWidth: 480,
    screenHeight: 480,
    fonts: [],
    assets: [],
    topics: [],
    hardwareButtons: [],
    settings: { colorDepth: "24bit", exportFormat: "esp32", gridSize: 10, snapTolerance: 5, snapGrid: "{}" },
    nextId: 20,
    screens: [
      {
        id: "s",
        name: "S",
        objects: [
          {
            id: "cam",
            type: "camera",
            zIndex: 1,
            x: 40,
            y: 60,
            width: 200,
            height: 150,
            properties: { url: "http://10.0.0.7/capture", username: "van", password: "geheim" },
          },
        ],
      },
    ],
  }

  for (const hook of ["__buildDeviceZipForTest", "__buildAndroidZipForTest"] as const) {
    test(`${hook}: the contract's fields`, async ({ page }) => {
      await page.goto("/test-render")
      await page.waitForFunction(() => (window as any).__testRenderReady === true, undefined, { timeout: 90000 })
      const built = await page.evaluate(([h, p]) => (window as any)[h as string](p), [hook, project] as const)
      const zip = await JSZip.loadAsync(Buffer.from(built as string, "base64"))
      const name = Object.keys(zip.files).find((f) => f.endsWith("project.json") || f.endsWith("bundle.json"))
      expect(name, Object.keys(zip.files).join(" ")).toBeTruthy()
      const json = JSON.parse(await zip.file(name!)!.async("string"))
      const camera = JSON.stringify(json).match(/\{[^{}]*"type":"camera"[^{}]*\{[^{}]*\}[^{}]*\}/)?.[0] ?? ""
      expect(camera).toContain('"url":"http://10.0.0.7/capture"')
      expect(camera).toContain('"username":"van"')
      expect(camera).toContain('"password":"geheim"')
    })
  }
})
