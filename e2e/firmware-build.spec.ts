import { test, expect } from "@playwright/test"
import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { firmwareStanding, imageDeviceId, parseFirmwareBuild } from "../lib/firmware-build"
import { readFirmwareRelease, releaseImagePath } from "../lib/firmware-release"

// Pure functions and the manifest reader - no page, no server
// (docs/2026-09-15-firmware-ota.md, decisions 3, 5 and 7). The dialog decides
// from these whether to point out newer firmware and what it may offer, and
// a wrong answer would not throw anywhere: it would hide an update, or offer
// a release image nobody has fetched.

test.describe("firmware builds", () => {
  test("a release, a development build after it, and builds from before releases", () => {
    expect(parseFirmwareBuild("fw-2026.09.15.1")).toEqual({ release: [2026, 9, 15, 1], distance: 0, dirty: false })
    expect(parseFirmwareBuild("fw-2026.09.15.2-3-g1a2b3c4d5e")).toEqual({ release: [2026, 9, 15, 2], distance: 3, dirty: false })
    expect(parseFirmwareBuild("fw-2026.09.15.1-dirty")).toEqual({ release: [2026, 9, 15, 1], distance: 0, dirty: true })
    expect(parseFirmwareBuild("b560433896-dirty")).toBeNull()
    expect(parseFirmwareBuild("0.1.0")).toBeNull()
    expect(parseFirmwareBuild(undefined)).toBeNull()
  })

  test("whether the release is newer than what a device runs", () => {
    const release = "fw-2026.09.15.2"
    expect(firmwareStanding("fw-2026.09.15.2", release)).toBe("up-to-date")
    expect(firmwareStanding("fw-2026.09.15.1", release)).toBe("update-available")
    expect(firmwareStanding("fw-2026.08.30.4", release)).toBe("update-available")
    expect(firmwareStanding("fw-2026.09.15.1-12-gabcdef0123", release)).toBe("update-available")
    // Nothing placeable is older than any release: firmware from before them.
    expect(firmwareStanding("0.1.0", release)).toBe("update-available")
    expect(firmwareStanding("b560433896-dirty", release)).toBe("update-available")
    expect(firmwareStanding(undefined, release)).toBe("update-available")
    // Built after the release: a development build, not something to replace unasked.
    expect(firmwareStanding("fw-2026.09.15.2-1-gabcdef0123", release)).toBe("device-ahead")
    expect(firmwareStanding("fw-2026.09.15.2-dirty", release)).toBe("device-ahead")
    expect(firmwareStanding("fw-2026.09.16.1", release)).toBe("device-ahead")
    // Month and day compare as numbers, not text.
    expect(firmwareStanding("fw-2026.10.01.1", "fw-2026.09.30.9")).toBe("device-ahead")
    expect(firmwareStanding("fw-2026.09.15.1", undefined)).toBe("no-release")
  })

  test("the device an image names, from its marker", () => {
    const image = (...parts: (string | Buffer)[]) =>
      new Uint8Array(Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "latin1") : p))))
    expect(imageDeviceId(image(randomBytes(4000), "<<schaltli-image device=waveshare-touch-lcd-4v3b>>", randomBytes(4000))))
      .toBe("waveshare-touch-lcd-4v3b")
    expect(imageDeviceId(image(randomBytes(4000)))).toBeNull()
    // A prefix without its closing, or an image naming two devices, names none.
    expect(imageDeviceId(image("<<schaltli-image device=knob", randomBytes(100)))).toBeNull()
    expect(imageDeviceId(image("<<schaltli-image device=a-board>>", "<<schaltli-image device=b-board>>"))).toBeNull()
    // The same marker twice is still one device.
    expect(imageDeviceId(image("<<schaltli-image device=a-board>>", randomBytes(10), "<<schaltli-image device=a-board>>")))
      .toBe("a-board")
  })
})

test.describe("the firmware release manifest", () => {
  let dir = ""

  test.beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "firmware-release-"))
  })

  test.afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const image = randomBytes(10_000)
  const entry = (file: string, size = image.length) => ({
    build: "fw-2026.09.15.1",
    file,
    size,
    sha256: createHash("sha256").update(image).digest("hex"),
    systemGeneration: "1.0",
    url: `https://github.com/example/releases/download/fw-2026.09.15.1/${file}`,
  })

  test("no manifest is no release", async () => {
    expect(await readFirmwareRelease(dir)).toEqual({ release: null, commit: null, devices: {} })
  })

  test("the manifest's firmware commit is read, and only a commit-shaped one", async () => {
    // /api/version shows it beside the tag: the tag says which release, the
    // commit says which code went into it.
    const write = (manifest: Record<string, unknown>) =>
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ release: "fw-2026.09.15.1", devices: {}, ...manifest }))

    write({ commit: "cdd1d8aae5878d030134212bb3cb284c116360ea" })
    expect((await readFirmwareRelease(dir)).commit).toBe("cdd1d8aae5878d030134212bb3cb284c116360ea")

    write({ commit: "cdd1d8a" })
    expect((await readFirmwareRelease(dir)).commit).toBe("cdd1d8a")

    for (const nonsense of ["", "not a commit", "ZZZZZZZ", 12345, null]) {
      write({ commit: nonsense })
      expect((await readFirmwareRelease(dir)).commit, String(nonsense)).toBeNull()
    }
    write({})
    expect((await readFirmwareRelease(dir)).commit).toBeNull()
  })

  test("an image counts as available only once it is on disk at its size, and only named files are served", async () => {
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      release: "fw-2026.09.15.1",
      devices: {
        "board-a": entry("board-a.bin"),
        "board-b": entry("board-b.bin"),
        "board-c": entry("board-c.bin", image.length + 1),
        "board-d": entry("../escape.bin"),
      },
    }))
    fs.mkdirSync(path.join(dir, "bin"))
    fs.writeFileSync(path.join(dir, "bin", "board-a.bin"), image)
    fs.writeFileSync(path.join(dir, "bin", "board-c.bin"), image)
    fs.writeFileSync(path.join(dir, "bin", "stray.bin"), image)

    const release = await readFirmwareRelease(dir)
    expect(release.release).toBe("fw-2026.09.15.1")
    expect(release.devices["board-a"].available).toBe(true)
    expect(release.devices["board-b"].available).toBe(false)
    expect(release.devices["board-c"].available).toBe(false)
    expect(release.devices["board-d"]).toBeUndefined()
    expect(release.devices["board-a"]).not.toHaveProperty("url")

    expect(await releaseImagePath("board-a.bin", dir)).toBe(path.join(dir, "bin", "board-a.bin"))
    expect(await releaseImagePath("board-b.bin", dir)).toBeNull()
    expect(await releaseImagePath("stray.bin", dir)).toBeNull()
    expect(await releaseImagePath("../manifest.json", dir)).toBeNull()
  })
})
