import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { slimFontData, withFontData } from "../lib/project-font-data"

// A project's font data lives in its device's DDF, not beside it
// (docs/2026-11-01-4bit-fonts.md, decision 11; tasks/4bit-fonts-todo.md T4b).
// Every project carries that DDF as embeddedDdfZipBase64, fonts and all, so
// a saved, drafted or zipped project leaves out every font whose bytes the
// DDF holds at the same path, and gets them back from it when it is opened.
// With 4-bit fonts the copies made a project over 10 MB (2026-11-01).

const DEVICE_FONT = "STARTFONT 2.1\nFONT device\nENDFONT\n"
const OWN_FONT = "STARTFONT 2.1\nFONT mine\nENDFONT\n"

async function ddf(files: Record<string, string>): Promise<string> {
  const zip = new JSZip()
  zip.file("device.json", "{}")
  for (const [path, text] of Object.entries(files)) zip.file(path, text)
  return zip.generateAsync({ type: "base64" })
}

function project(embeddedDdfZipBase64: string | undefined, fonts: Record<string, unknown>[]) {
  return { name: "p", settings: {}, screens: [], fonts, ...(embeddedDdfZipBase64 ? { embeddedDdfZipBase64 } : {}) } as any
}

test("a font the embedded DDF holds is saved without its data, one of the project's own with it", async () => {
  const embedded = await ddf({ "fonts/a.bdf": DEVICE_FONT })
  const slim = await slimFontData(
    project(embedded, [
      { id: "font-a", path: "fonts/a.bdf", data: DEVICE_FONT },
      { id: "font-mine", path: "fonts/mine.bdf", data: OWN_FONT },
    ]),
  )
  expect(slim.fonts[0]).toEqual({ id: "font-a", path: "fonts/a.bdf" })
  expect(slim.fonts[1].data).toBe(OWN_FONT)
})

test("a font at a DDF path with other bytes keeps its data", async () => {
  const embedded = await ddf({ "fonts/a.bdf": DEVICE_FONT })
  const slim = await slimFontData(project(embedded, [{ id: "font-a", path: "fonts/a.bdf", data: OWN_FONT }]))
  expect(slim.fonts[0].data).toBe(OWN_FONT)
})

test("without an embedded DDF nothing is left out", async () => {
  const p = project(undefined, [{ id: "font-a", path: "fonts/a.bdf", data: DEVICE_FONT }])
  expect(await slimFontData(p)).toBe(p)
})

test("opened, a font without data gets it back from the embedded DDF", async () => {
  const embedded = await ddf({ "fonts/a.bdf": DEVICE_FONT })
  const opened = await withFontData(
    project(embedded, [
      { id: "font-a", path: "fonts/a.bdf" },
      { id: "font-mine", path: "fonts/mine.bdf", data: OWN_FONT },
      { id: "font-gone", path: "fonts/gone.bdf" },
    ]),
  )
  expect(opened.fonts[0].data).toBe(DEVICE_FONT)
  expect(opened.fonts[1].data).toBe(OWN_FONT)
  // Not in the DDF either: left as it is, drawn as a font without data is.
  expect(opened.fonts[2].data).toBeUndefined()
})

test("slimmed and opened again, a project is what it was", async () => {
  const embedded = await ddf({ "fonts/a.bdf": DEVICE_FONT })
  const original = project(embedded, [
    { id: "font-a", path: "fonts/a.bdf", data: DEVICE_FONT, size: 12 },
    { id: "font-mine", path: "fonts/mine.bdf", data: OWN_FONT },
  ])
  expect(await withFontData(await slimFontData(original))).toEqual(original)
})

test("a project that is not one passes through untouched", async () => {
  expect(await withFontData(null as any)).toBeNull()
  expect(await slimFontData({ name: "x" } as any)).toEqual({ name: "x" })
})
