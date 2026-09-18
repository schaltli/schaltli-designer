import { test, expect } from "@playwright/test"
import fs from "fs"
import os from "os"
import path from "path"
import {
  APP_OFFSET,
  FACTORY_PARTS,
  findDeviceMarkers,
  mergeFactoryImage,
  refuseChip,
  verifyFactoryImage,
} from "../lib/factory-image.mjs"
import { appImage, asciiInto, factoryParts, FIXTURE_DEVICE, head, REAL_HEADS } from "./factory-fixtures"

const DEVICE = FIXTURE_DEVICE
const parts = factoryParts

test.describe("factory image", () => {
  test("the four parts land at their offsets, and the gaps are erased flash", () => {
    const built = parts()
    const image = mergeFactoryImage(built)

    expect(image.length).toBe(APP_OFFSET + built.app.length)
    for (const part of FACTORY_PARTS) {
      const at = image.subarray(part.offset, part.offset + built[part.key].length)
      expect(Buffer.from(at).equals(Buffer.from(built[part.key])), `${part.label} at 0x${part.offset.toString(16)}`).toBe(true)
    }
    // Between the bootloader's end and the partition table: 0xff, what an
    // erased chip reads as, so nothing there is written twice.
    for (let i = built.bootloader.length; i < 0x8000; i += 1) {
      expect(image[i], `padding at 0x${i.toString(16)}`).toBe(0xff)
    }
    expect(verifyFactoryImage(image, { deviceId: DEVICE, app: built.app })).toEqual([])
  })

  test("what it refuses", () => {
    // A part that does not fit in the room before the next one - a bootloader
    // grown past 0x8000 would otherwise quietly overwrite the partition table.
    expect(() => mergeFactoryImage(parts({ bootloader: head(REAL_HEADS.bootloader, 0x8001) })))
      .toThrow(/bootloader is 32769 bytes[\s\S]*does not fit[\s\S]*partition table/)
    expect(() => mergeFactoryImage(parts({ app: new Uint8Array(0) }))).toThrow(/app .*missing or empty/)

    const sound = mergeFactoryImage(parts())

    // Each of these is a way the image could be wrong on someone's chip, and
    // each has to be named rather than silently accepted.
    const bootless = Uint8Array.from(sound)
    bootless[0] = 0x00
    expect(verifyFactoryImage(bootless, { deviceId: DEVICE }).join()).toMatch(/no bootloader at 0x0/)

    const tableless = Uint8Array.from(sound)
    tableless[0x8000] = 0x00
    expect(verifyFactoryImage(tableless, { deviceId: DEVICE }).join()).toMatch(/no partition table at 0x8000/)

    const wrongSlot = Uint8Array.from(sound)
    wrongSlot[0xe000] = 0x02
    expect(verifyFactoryImage(wrongSlot, { deviceId: DEVICE }).join()).toMatch(/does not select the first app slot/)

    const shifted = Uint8Array.from(sound)
    shifted[0xe000 - 1] = 0x00
    expect(verifyFactoryImage(shifted, { deviceId: DEVICE }).join()).toMatch(/gap before the OTA selector/)

    const appless = Uint8Array.from(sound)
    appless[APP_OFFSET] = 0x00
    expect(verifyFactoryImage(appless, { deviceId: DEVICE }).join()).toMatch(/no app at 0x10000/)

    const otaOnly = appImage()
    expect(verifyFactoryImage(otaOnly, { deviceId: DEVICE }).join()).toMatch(/not even past the app offset/)
  })

  test("it is the image of the device it says, and of no other", () => {
    const foreign = mergeFactoryImage(parts({ app: appImage("m5stack-papers3") }))
    expect(verifyFactoryImage(foreign, { deviceId: DEVICE }).join()).toMatch(/carries m5stack-papers3, expected waveshare-touch-lcd-4v3b/)
    expect(findDeviceMarkers(foreign)).toEqual(["m5stack-papers3"])

    const two = appImage()
    asciiInto(two, 1024, "<<screenbee-image device=waveshare-knob-1v8>>")
    const muddled = mergeFactoryImage(parts({ app: two }))
    expect(findDeviceMarkers(muddled).sort()).toEqual(["waveshare-knob-1v8", "waveshare-touch-lcd-4v3b"])
    expect(verifyFactoryImage(muddled, { deviceId: DEVICE }).join()).toMatch(/carries waveshare-knob-1v8, waveshare-touch-lcd-4v3b/)

    const unmarked = mergeFactoryImage(parts({ app: head(REAL_HEADS.app, 4096) }))
    expect(verifyFactoryImage(unmarked, {}).join()).toMatch(/no device marker/)
  })

  test("the app in it is the OTA image, byte for byte", () => {
    const built = parts()
    const image = mergeFactoryImage(built)
    expect(verifyFactoryImage(image, { app: built.app, deviceId: DEVICE })).toEqual([])

    // One byte different - a stale build in the middle of a release - is the
    // whole point of comparing: an image that boots but is not this release.
    const stale = Uint8Array.from(image)
    stale[APP_OFFSET + 4096] ^= 0xff
    expect(verifyFactoryImage(stale, { app: built.app, deviceId: DEVICE }).join()).toMatch(/differs from the OTA image, first at byte 4096/)

    const truncated = image.subarray(0, image.length - 16)
    expect(verifyFactoryImage(truncated, { app: built.app, deviceId: DEVICE }).join()).toMatch(/expected \d+ for an app of/)
  })

  test("a chip that is not an ESP32-S3 is refused", () => {
    // Which of the three boards someone holds cannot be detected, but the chip
    // family can - and all three are ESP32-S3. So the one guess the hardware
    // can settle is settled before writing, both on the page and in the HIL
    // script: strings here are what esptool actually reports.
    expect(refuseChip("ESP32-S3 (QFN56) (revision v0.2)")).toBeNull()
    expect(refuseChip("ESP32-S3")).toBeNull()
    expect(refuseChip("ESP32-D0WDQ6 (revision v1.0)")).toMatch(/ESP32-D0WDQ6.*every ScreenBee board is an ESP32-S3/)
    expect(refuseChip("ESP32-C3 (QFN32) (revision v0.4)")).toMatch(/ESP32-C3/)
    expect(refuseChip("ESP32-C6 (QFN40) (revision v0.0)")).toMatch(/ESP32-C6/)
    expect(refuseChip("")).toMatch(/did not say what it is/)
    expect(refuseChip(undefined as unknown as string)).toMatch(/did not say what it is/)
  })

  // Real artifacts when this checkout sits beside a firmware checkout that has
  // been built - the same four files the release tool merges. Skipped with a
  // warning otherwise (a designer on a Pi has no firmware repo), never
  // silently.
  test("real build artifacts merge into a sound image", () => {
    const firmware = process.env.SCREENBEE_FIRMWARE_REPO || path.join(__dirname, "..", "..", "screenbee-firmware")
    const bootApp0 = path.join(os.homedir(), ".platformio", "packages", "framework-arduinoespressif32", "tools", "partitions", "boot_app0.bin")
    const envs = ["waveshare-knob-touch-lcd-1v8", "waveshare-touch-lcd-4v3b", "m5stack-papers3"]
      .map((env) => path.join(firmware, ".pio", "build", env))
      .filter((dir) => FACTORY_PARTS.every((p) => p.key === "otaSelect" || fs.existsSync(path.join(dir, p.file))))
    if (!envs.length || !fs.existsSync(bootApp0)) {
      console.warn(`[factory-image] SKIPPED: no built firmware artifacts under ${firmware}/.pio/build`)
      test.skip(true, "no built firmware artifacts beside this checkout")
      return
    }

    for (const dir of envs) {
      const app = fs.readFileSync(path.join(dir, "firmware.bin"))
      const image = mergeFactoryImage({
        bootloader: fs.readFileSync(path.join(dir, "bootloader.bin")),
        partitions: fs.readFileSync(path.join(dir, "partitions.bin")),
        otaSelect: fs.readFileSync(bootApp0),
        app,
      })
      const markers = findDeviceMarkers(image)
      expect(markers.length, `one marker in ${dir}`).toBe(1)
      expect(verifyFactoryImage(image, { deviceId: markers[0], app }), dir).toEqual([])
      // A board here has 16 MB of flash; an image over a quarter of it means
      // the app has outgrown its slot or a part is being written twice.
      expect(image.length).toBeLessThan(4 * 1024 * 1024)
    }
  })
})
