import { test, expect } from "@playwright/test"
import { COMBINED_TEST_PROJECT, devicePoint, getMainCanvas, loadProject } from "./helpers"

// The broker address the designer remembers (hooks/use-mqtt-connection.ts).
//
// Until 2026-09-25 each component read it once, when it mounted, and every
// connect wrote that copy back. The block wizard is mounted with the editor,
// so a broker chosen afterwards - in another tab, in another dialog - was
// asked for nothing and then overwritten: placing a block asked localhost
// while the setting named the van's broker, and the setting went back to
// localhost with it. Found live on 2026-09-25 pointing a local designer at a
// van's broker.
//
// Two addresses nothing listens on, so the wizard's own wording says which
// one it asked ("No broker at ...") without a broker being involved.
const KEY = "schaltli-mqtt-connection"
const AT_LOAD = "ws://127.0.0.1:9"
const CHOSEN_LATER = "ws://127.0.0.1:7"

test("a broker chosen after the page loaded is the one a block asks, and stays chosen", async ({ page }) => {
  await page.addInitScript(
    ([key, url]) => {
      if (!window.sessionStorage.getItem("seeded")) {
        window.localStorage.setItem(key, JSON.stringify({ websocketUrl: url }))
        window.sessionStorage.setItem("seeded", "1")
      }
    },
    [KEY, AT_LOAD],
  )
  await loadProject(page, COMBINED_TEST_PROJECT)

  // What another tab or another dialog does.
  await page.evaluate(([key, url]) => window.localStorage.setItem(key, JSON.stringify({ websocketUrl: url })), [KEY, CHOSEN_LATER])

  await page.getByRole("button", { name: "Block", exact: true }).click()
  await page.getByRole("menuitem", { name: /^Tank/ }).click()
  const { box } = await getMainCanvas(page)
  const from = devicePoint(box, 40, 40)
  const to = devicePoint(box, 300, 100)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()

  await expect(page.getByTestId("baustein-source")).toContainText(`No broker at ${CHOSEN_LATER}`, { timeout: 20000 })
  // A connection made in the background remembers nothing.
  expect(await page.evaluate((key) => window.localStorage.getItem(key), KEY)).toBe(JSON.stringify({ websocketUrl: CHOSEN_LATER }))
})
