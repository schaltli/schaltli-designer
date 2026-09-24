import { test, expect, type Page } from "@playwright/test"
import mqtt from "mqtt"
import { COMBINED_TEST_PROJECT, loadProject, saveProjectAs } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// Deploy saves first (docs/2026-09-23-explicit-save.md): what is on a device
// is always on the server. A project without a name asks for one before
// anything is sent; the version that went out is marked as deployed to that
// device. Runs against the local broker (npm run hil:broker) like
// deploy-dialog.spec.ts - this test's own MQTT client stands in for the
// device.
const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

function uniqueName(testInfo: { testId: string }, label: string): string {
  return `e2e deploy ${label} ${testInfo.testId.slice(0, 8)} ${Math.random().toString(36).slice(2, 8)}`
}

// A fake ePaper board on the broker, announcing itself as the combined test
// project's device, and a record of every deploy trigger it receives.
async function fakeDevice(testInfo: { testId: string }) {
  const instanceId = `e2e-deploysave-${testInfo.testId}-${Math.random().toString(36).slice(2, 6)}`
  const label = `Deploy Save ${instanceId}`
  const client = await new Promise<mqtt.MqttClient>((resolve, reject) => {
    const c = mqtt.connect(BROKER_URL, { clientId: `fake-${instanceId}` })
    c.on("connect", () => resolve(c))
    c.on("error", reject)
  })
  const triggers: string[] = []
  client.subscribe(`${TOPIC_PREFIX}/${instanceId}/deploy`)
  client.on("message", (_topic, payload) => {
    if (payload.length > 0) triggers.push(payload.toString())
  })
  client.publish(
    `${TOPIC_PREFIX}/${instanceId}/hello`,
    JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: label }),
    { retain: true },
  )
  client.publish(`${TOPIC_PREFIX}/${instanceId}/status`, "online", { retain: true })
  return {
    instanceId,
    label,
    triggers,
    async end() {
      for (const leaf of ["hello", "status", "deploy"]) client.publish(`${TOPIC_PREFIX}/${instanceId}/${leaf}`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      client.end()
    },
  }
}

async function openDeploy(page: Page, label: string) {
  await page.getByRole("button", { name: "File" }).click()
  await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
  await page.getByText(label).click()
}

const deployButton = (page: Page) => page.getByRole("button", { name: "Deploy", exact: true })

test.describe("Deploy saves first", () => {
  // A save, an upload to /api/deploy and a broker round trip in one test: under
  // a full parallel run one of these outlasted 60 s (2026-09-24).
  test.describe.configure({ timeout: 120_000 })

  test("an unnamed project asks for a name; Cancel sends nothing", async ({ page }, testInfo) => {
    const device = await fakeDevice(testInfo)
    try {
      await loadProject(page, COMBINED_TEST_PROJECT)
      const uploads: string[] = []
      page.on("request", (req) => {
        if (req.url().endsWith("/api/deploy")) uploads.push(req.url())
      })
      await openDeploy(page, device.label)
      await deployButton(page).click()

      await expect(page.getByRole("heading", { name: "Save Project" })).toBeVisible()
      await page.getByRole("button", { name: "Cancel", exact: true }).click()
      await expect(page.getByRole("heading", { name: "Save Project" })).toHaveCount(0)
      await page.waitForTimeout(1000)
      expect(uploads).toEqual([])
      expect(device.triggers).toEqual([])
      await expect(page.getByTestId("project-title")).toHaveText("• Untitled")
    } finally {
      await device.end()
    }
  })

  test("with a name it saves, deploys, and marks that version", async ({ page }, testInfo) => {
    const device = await fakeDevice(testInfo)
    const name = uniqueName(testInfo, "named")
    const url = `/api/projects/${encodeURIComponent(name)}`
    try {
      await loadProject(page, COMBINED_TEST_PROJECT)
      await openDeploy(page, device.label)
      await deployButton(page).click()
      await page.locator("#save-project-name").fill(name)
      const marked = page.waitForResponse((res) => res.url().endsWith("/deploys") && res.request().method() === "POST")
      await page.getByRole("button", { name: "Save", exact: true }).click()
      expect((await marked).ok()).toBe(true)
      await expect.poll(() => device.triggers.length).toBe(1)

      // Saved first, then sent: one version, marked for this device.
      const versions = (await (await page.request.get(`${url}/versions`)).json()).versions
      expect(versions).toHaveLength(1)
      expect(versions[0].deployedTo).toEqual([device.label])
      expect(await (await page.request.get(`/api/by-instance/${device.instanceId}`)).json()).toEqual({ name })
      // The binding the deploy records is not an unsaved change.
      await expect(page.getByTestId("project-title")).toHaveText(name)

      // Listed in Version History with where it went.
      await page.keyboard.press("Escape")
      await page.keyboard.press("Escape")
      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Version History" }).click()
      await expect(page.getByRole("list", { name: "Versions" })).toContainText(`Deployed to ${device.label}`, {
        timeout: 20_000,
      })
    } finally {
      await device.end()
      await page.request.delete(url)
    }
  })

  test("a saved, unchanged project is not saved again, only marked", async ({ page }, testInfo) => {
    const device = await fakeDevice(testInfo)
    const name = uniqueName(testInfo, "unchanged")
    const url = `/api/projects/${encodeURIComponent(name)}`
    try {
      await loadProject(page, COMBINED_TEST_PROJECT)
      await saveProjectAs(page, name)
      await openDeploy(page, device.label)
      const marked = page.waitForResponse((res) => res.url().endsWith("/deploys") && res.request().method() === "POST")
      await deployButton(page).click()
      await marked
      const versions = (await (await page.request.get(`${url}/versions`)).json()).versions
      expect(versions).toHaveLength(1)
      expect(versions[0].deployedTo).toEqual([device.label])
    } finally {
      await device.end()
      await page.request.delete(url)
    }
  })
})
