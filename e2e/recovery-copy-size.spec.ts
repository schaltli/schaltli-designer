import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { readFileSync } from "node:fs"
import path from "node:path"

// A deploy to a board that has the project's own DDF carries neither that DDF
// nor its fonts' data in the recovery copy (docs/2026-11-01-4bit-fonts.md,
// decisions 11 and 12). With the colour boards' 4-bit fonts each was a
// megabyte, in every deploy and over the broker; recovered, the designer
// takes the DDF the board announces (resolveDeviceForProject) and the fonts
// from it (lib/project-font-data.ts). A font of the project's own still goes
// along. The HIL's harness builds its fixtures this way, the deploy dialog
// when the board's announced ddfHash is the project's.

const DEVICE_ID = "waveshare-touch-lcd-4v3b"
const OWN_FONT = "STARTFONT 2.1\nFONT mine\nSIZE 10 75 75\nFONTBOUNDINGBOX 1 1 0 0\nCHARS 0\nENDFONT\n"

test("the recovery copy of a deploy to its own board leaves out the DDF and the DDF's fonts", async ({ page }) => {
  const ddf = await JSZip.loadAsync(readFileSync(path.join(__dirname, "..", "public", "ddf", `${DEVICE_ID}.ddf.zip`)))
  const deviceFont = await ddf.file("fonts/roboto-c13.bdf")!.async("string")
  const project = {
    name: "recovery-copy-size",
    screenWidth: 800,
    screenHeight: 480,
    settings: { colorDepth: "24bit", deviceId: DEVICE_ID, deviceName: "Waveshare 4.3B" },
    fonts: [
      { id: "font-roboto-c13", name: "Roboto 21px", displayName: "Roboto 21px", path: "fonts/roboto-c13.bdf", size: 21, ascent: 16, descent: 5, bpp: 4, capHeight: 13, data: deviceFont },
      { id: "font-mine", name: "Mine", displayName: "Mine", path: "fonts/mine.bdf", size: 10, ascent: 8, descent: 2, data: OWN_FONT },
    ],
    assets: [],
    topics: [],
    screens: [
      {
        id: "s1",
        name: "Main",
        objects: [
          { id: "t", type: "text", zIndex: 1, x: 10, y: 10, width: 200, height: 30, properties: { text: "Kühlschrank", fontId: "font-roboto-c13", color: "#000000" } },
        ],
      },
    ],
  }
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zipBase64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), project)
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))

  // What the board draws from is unchanged: every font's metrics, no data.
  const exported = JSON.parse(await zip.file("project.json")!.async("string"))
  expect(exported.fonts.map((f: any) => f.id)).toEqual(["font-roboto-c13", "font-mine"])

  const recovery = await JSZip.loadAsync(await zip.file("_source/project.zip")!.async("uint8array"))
  expect(recovery.file("_source/ddf.zip"), "no DDF in the recovery copy").toBeNull()
  expect(recovery.file("fonts/roboto-c13.bdf"), "no device font in the recovery copy").toBeNull()
  expect(await recovery.file("fonts/mine.bdf")!.async("string")).toBe(OWN_FONT)
  // The whole deploy is the project's own size again, not the DDF's.
  expect(Buffer.from(zipBase64, "base64").length).toBeLessThan(100_000)
})
