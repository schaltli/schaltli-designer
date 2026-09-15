import { test, expect } from "@playwright/test"
import { createHash, randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// scripts/fetch-firmware.js - the step of an install that brings the firmware
// images a release names (docs/2026-09-15-firmware-ota.md, step 5). No page,
// no dev server: it spawns the script against a manifest and a local HTTP
// server that answers like GitHub's release downloads, with a redirect first.
//
// What it guards: an image the designer offers a device must be exactly the
// one the release built. A download that is cut short or corrupted, or a
// manifest that no longer names an image, must never leave a file behind that
// the device dialog would offer.

const SCRIPT = path.join(__dirname, "..", "scripts", "fetch-firmware.js")
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex")

function runFetch(manifest: string, out: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, "--manifest", manifest, "--out", out])
    let output = ""
    child.stdout.on("data", (c) => (output += c))
    child.stderr.on("data", (c) => (output += c))
    child.on("close", (code) => resolve({ code: code ?? 1, output }))
  })
}

test.describe("fetching firmware images", () => {
  let server: Server
  let base = ""
  let dir = ""
  const hits: Record<string, number> = {}
  const images = {
    good: randomBytes(50_000),
    other: randomBytes(30_000),
  }

  test.beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url || ""
      hits[url] = (hits[url] || 0) + 1
      // GitHub answers a release asset with a redirect to its storage.
      if (url.startsWith("/releases/download/")) {
        res.writeHead(302, { Location: `/storage/${path.basename(url)}` })
        res.end()
        return
      }
      const body =
        url === "/storage/good.bin" ? images.good :
        url === "/storage/other.bin" ? images.other :
        url === "/storage/corrupt.bin" ? Buffer.concat([images.good.subarray(0, 49_000), randomBytes(1_000)]) :
        null
      if (!body) {
        res.writeHead(404)
        res.end()
        return
      }
      res.writeHead(200, { "Content-Length": body.length })
      res.end(body)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  test.afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  test.beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "fetch-firmware-"))
  })

  test.afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const writeManifest = (devices: Record<string, { file: string; asset: string; image: Buffer; sha256?: string }>) => {
    const manifest = {
      release: "fw-2026.09.15.1",
      devices: Object.fromEntries(Object.entries(devices).map(([id, d]) => [id, {
        build: "fw-2026.09.15.1",
        file: d.file,
        size: d.image.length,
        sha256: d.sha256 ?? sha256(d.image),
        systemGeneration: "1.0",
        url: `${base}/releases/download/fw-2026.09.15.1/${d.asset}`,
      }])),
    }
    const file = path.join(dir, "manifest.json")
    fs.writeFileSync(file, JSON.stringify(manifest))
    return file
  }

  test("no manifest is nothing to do, not an error", async () => {
    const { code, output } = await runFetch(path.join(dir, "missing.json"), path.join(dir, "bin"))
    expect(code).toBe(0)
    expect(output).toContain("no manifest")
  })

  test("downloads through a redirect, verifies, and does not download a verified image twice", async () => {
    const manifest = writeManifest({
      "board-a": { file: "board-a.bin", asset: "good.bin", image: images.good },
      "board-b": { file: "board-b.bin", asset: "other.bin", image: images.other },
    })
    const out = path.join(dir, "bin")

    const first = await runFetch(manifest, out)
    expect(first.code, first.output).toBe(0)
    expect(sha256(fs.readFileSync(path.join(out, "board-a.bin")))).toBe(sha256(images.good))
    expect(sha256(fs.readFileSync(path.join(out, "board-b.bin")))).toBe(sha256(images.other))
    const downloads = hits["/storage/good.bin"]

    const second = await runFetch(manifest, out)
    expect(second.code, second.output).toBe(0)
    expect(second.output).toContain("board-a.bin: present and verified")
    expect(hits["/storage/good.bin"]).toBe(downloads)
  })

  test("an image whose bytes do not match the manifest is refused and not left behind", async () => {
    const manifest = writeManifest({
      "board-a": { file: "board-a.bin", asset: "corrupt.bin", image: images.good },
    })
    const out = path.join(dir, "bin")
    const { code, output } = await runFetch(manifest, out)
    expect(code).toBe(1)
    expect(output).toContain("the manifest says")
    expect(fs.readdirSync(out)).toEqual([])
  })

  test("a tampered image already on disk is replaced by the verified one", async () => {
    const manifest = writeManifest({
      "board-a": { file: "board-a.bin", asset: "good.bin", image: images.good },
    })
    const out = path.join(dir, "bin")
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, "board-a.bin"), randomBytes(images.good.length))

    const { code, output } = await runFetch(manifest, out)
    expect(code, output).toBe(0)
    expect(sha256(fs.readFileSync(path.join(out, "board-a.bin")))).toBe(sha256(images.good))
  })

  test("images of an earlier release are removed", async () => {
    const out = path.join(dir, "bin")
    fs.mkdirSync(out, { recursive: true })
    fs.writeFileSync(path.join(out, "board-a-fw-2026.01.01.1.bin"), randomBytes(100))
    const manifest = writeManifest({
      "board-a": { file: "board-a.bin", asset: "good.bin", image: images.good },
    })

    const { code, output } = await runFetch(manifest, out)
    expect(code, output).toBe(0)
    expect(fs.readdirSync(out).sort()).toEqual(["board-a.bin"])
  })
})
