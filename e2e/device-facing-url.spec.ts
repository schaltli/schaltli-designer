import { test, expect } from "@playwright/test"
import { devicePort } from "../lib/server-lan-address"

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
