import { test, expect } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import mqtt from "mqtt"
import JSZip from "jszip"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { TOPIC_PREFIX } from "../lib/topic-prefix"

// An icon is shipped to a device as a bitmap, and a bitmap carries no
// transparency. "Transparent background" therefore cannot survive to the
// device as a property - it has to be resolved at export time by compositing
// the icon onto whatever is actually behind it on that screen.
//
// Which is fine until the icon is defined on a master screen and inherited.
// Then "whatever is behind it" is a different colour on every screen that
// shows it, and one bake cannot be right for all of them. It used to be
// baked exactly once, on the master, with every inheriting screen pointing
// at that single file - so a transparent icon defined on a white master
// appeared as a white rectangle on every screen with a different
// background. Reported from real hardware, 2026-08-22.
//
// Deliberately asserted through a real deploy rather than against the
// exporter in isolation: the fault needed both halves of the pipeline to be
// wrong together (asset-export.ts baking per screen, project-zip.ts pairing
// each screen's object with its own bake), and either half alone looks
// correct in a unit test.

const BROKER_URL = process.env.HIL_MQTT_WS_URL || "ws://localhost:9001"

// A black disc on a transparent field. Real SVG bytes, because the exporter
// decodes this through a browser <img> - a placeholder string would fail the
// decode and silently export nothing, which is indistinguishable from the
// bug under test.
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#000000"/></svg>`
const ICON_FILENAME = "e2e-master-icon.svg"

const MASTER_ID = "e2e-icon-master"
const ICON_OBJECT_ID = "e2e-master-icon"

// White against black, rather than two arbitrary colours: these stay
// distinguishable at any colour depth, so the check does not quietly depend
// on the test device's being a colour one.
const SCREENS = [
  { id: "e2e-icon-on-white", name: "E2E Icon On White", backgroundColor: "#ffffff" },
  { id: "e2e-icon-on-black", name: "E2E Icon On Black", backgroundColor: "#000000" },
]

async function buildProjectWithMasterIcon(): Promise<string> {
  const zip = await JSZip.loadAsync(fs.readFileSync(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))

  // The editor reads an asset's bytes out of the zip's assets/ folder and
  // ignores any inline data, so the file has to be there and the asset has
  // to point at it by path. Found by this test getting all the way to a
  // deployed project whose icon simply had no bake, because the asset it
  // referenced had been dropped on load.
  zip.file(`assets/${ICON_FILENAME}`, ICON_SVG)
  project.assets = [
    ...(project.assets ?? []),
    {
      id: "e2e-icon-asset",
      name: "e2e-master-icon",
      type: "icon",
      path: `assets/${ICON_FILENAME}`,
      size: ICON_SVG.length,
    },
  ]

  project.screens = [
    ...project.screens,
    {
      id: MASTER_ID,
      name: "E2E Icon Master",
      isMaster: true,
      // The colour the single shared bake used to carry onto everything.
      backgroundColor: "#ffffff",
      objects: [
        {
          id: ICON_OBJECT_ID,
          type: "icon",
          x: 20,
          y: 20,
          width: 48,
          height: 48,
          zIndex: 1,
          properties: { assetId: "e2e-icon-asset", backgroundColor: "transparent" },
        },
      ],
    },
    ...SCREENS.map((screen) => ({
      ...screen,
      masterScreenId: MASTER_ID,
      objects: [],
    })),
  ]

  zip.file("project.json", JSON.stringify(project))
  const out = path.join(os.tmpdir(), `e2e-master-icon-${Date.now()}.zip`)
  fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer" }))
  return out
}

test.describe("Master-inherited icon backgrounds", () => {
  test("an icon inherited from a master is baked against each screen's own background", async ({ page }, testInfo) => {
    const deviceId = `e2e-icon-${testInfo.testId}`
    const projectPath = await buildProjectWithMasterIcon()
    const deviceClient = await new Promise<mqtt.MqttClient>((resolve, reject) => {
      const client = mqtt.connect(BROKER_URL, { clientId: `e2e-icon-fake-device-${testInfo.testId}` })
      client.on("connect", () => resolve(client))
      client.on("error", reject)
    })

    try {
      deviceClient.publish(
        `${TOPIC_PREFIX}/${deviceId}/hello`,
        JSON.stringify({ deviceId: "mqtt-epaper-display-2", name: `Icon Test ${deviceId}` }),
        { retain: true },
      )
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/status`, "online", { retain: true })

      await loadProject(page, projectPath)

      await page.getByRole("button", { name: "File" }).click()
      await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
      await expect(page.getByText(`Icon Test ${deviceId}`)).toBeVisible()
      await page.getByText(`Icon Test ${deviceId}`).click()

      const triggerPromise = new Promise<{ url: string }>((resolve) => {
        deviceClient.subscribe(`${TOPIC_PREFIX}/${deviceId}/deploy`, () => {})
        deviceClient.on("message", (topic, message) => {
          if (topic === `${TOPIC_PREFIX}/${deviceId}/deploy` && message.length > 0) {
            resolve(JSON.parse(message.toString()))
          }
        })
      })
      await page.getByRole("button", { name: "Deploy", exact: true }).click()
      const trigger = await triggerPromise

      const zipResponse = await page.request.get(trigger.url)
      expect(zipResponse.ok()).toBe(true)
      const deployed = await JSZip.loadAsync(await zipResponse.body())
      const projectJson = JSON.parse(await deployed.file("project.json")!.async("string"))

      const paths = SCREENS.map((wanted) => {
        const screen = projectJson.screens.find((s: any) => s.name === wanted.name)
        expect(screen, `screen ${wanted.name} is in the deployed project`).toBeTruthy()
        const icon = (screen.objects ?? []).find((o: any) => o.id === ICON_OBJECT_ID)
        expect(icon, `${wanted.name} inherited the master's icon`).toBeTruthy()
        expect(icon.path, `${wanted.name}'s icon was baked`).toBeTruthy()
        return icon.path as string
      })

      // The heart of it. One bake shared between the two screens is exactly
      // the bug: it can only carry one background, so one of the screens is
      // guaranteed to be wrong.
      expect(paths[0]).not.toBe(paths[1])

      const [onWhite, onBlack] = await Promise.all(
        paths.map(async (p) => {
          const file = deployed.file(p.replace(/^assets\//, "assets/"))
          expect(file, `${p} is in the deployed zip`).toBeTruthy()
          return file!.async("uint8array")
        }),
      )

      // Different paths would still be worthless if both files held the same
      // pixels - that would mean each screen got its own copy of the same
      // wrong bake.
      expect(Buffer.compare(Buffer.from(onWhite), Buffer.from(onBlack))).not.toBe(0)
    } finally {
      fs.rmSync(projectPath, { force: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/hello`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/status`, "", { retain: true })
      deviceClient.publish(`${TOPIC_PREFIX}/${deviceId}/deploy`, "", { retain: true })
      await new Promise((r) => setTimeout(r, 200))
      deviceClient.end()
    }
  })
})
