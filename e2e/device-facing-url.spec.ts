import { test, expect } from "@playwright/test"
import { devicePort } from "../lib/server-lan-address"
import { loadProject, COMBINED_TEST_PROJECT } from "./helpers"

// The port a device is sent to for a download is the one the designer is
// reached on from outside, not the one it listens on. On the Pekaway systemd
// listens on 3000 and hands connections to the designer on 127.0.0.1:3001,
// and the URL Next.js reports carries 3001: every firmware update and deploy
// from the van went to a port nobody outside the Pi can reach, and the knob
// answered HTTP -1 (2026-09-28).

const behindTheProxy = (host: string) =>
  new Request("http://127.0.0.1:3001/api/deploy", { method: "POST", headers: { host } })

test.describe("the port a device downloads from", () => {
  test.afterEach(() => {
    delete process.env.SCHALTLI_PUBLIC_PORT
  })

  test("is the one the installer names, whatever the request says", () => {
    process.env.SCHALTLI_PUBLIC_PORT = "3000"
    expect(devicePort(behindTheProxy("192.168.8.107:3001"))).toBe("3000")
  })

  test("is the one the browser called, not the one behind the proxy", () => {
    expect(devicePort(behindTheProxy("192.168.8.107:3000"))).toBe("3000")
  })

  test("falls back to the request's own port only when nothing else says", () => {
    expect(devicePort(new Request("http://localhost:3000/api/deploy", { method: "POST" }))).toBe("3000")
  })
})

// The address set by hand (lib/device-address.ts, #70): a designer in a VM
// behind NAT finds only its address inside the VM, and a deploy stopped at
// «Downloading». Set in the Deploy dialog, it is what the device is sent.
// @alone: while it is set, every other deploy in the suite would be sent
// there too.
test("an address set in the Deploy dialog is where devices download from @alone", async ({ page, request }) => {
  try {
    await loadProject(page, COMBINED_TEST_PROJECT)
    await page.getByRole("button", { name: "File" }).click()
    await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
    await expect(page.getByTestId("device-address")).toContainText("Devices download from ")
    await page.getByRole("button", { name: "Change address" }).click()
    await page.getByLabel("Address devices download from").fill("http://nope")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByTestId("device-address")).toContainText("An address is a host name or IP address")
    await page.getByLabel("Address devices download from").fill("203.0.113.7:8123")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByTestId("device-address")).toContainText("Devices download from 203.0.113.7:8123 (set by hand).")

    const form = { instanceId: "e2e-device-address", file: { name: "p.zip", mimeType: "application/zip", buffer: Buffer.from("PK") } }
    const sent = await (await request.post("/api/deploy", { multipart: form })).json()
    expect(sent.url).toBe("http://203.0.113.7:8123/api/deploy/e2e-device-address")

    // A host alone takes the port the designer is reached on.
    await request.put("/api/device-address", { data: { address: "203.0.113.7" } })
    const port = (await (await request.post("/api/deploy", { multipart: form })).json()).url.match(/:(\d+)\/api/)?.[1]
    expect(port).toBe(new URL(page.url()).port)
  } finally {
    await request.put("/api/device-address", { data: { address: "" } })
  }
  const back = await (await request.get("/api/device-address")).json()
  expect(back.configured).toBe("")
  expect(back.detected).toMatch(/^[\d.]+:\d+$|^localhost:\d+$/)
})
