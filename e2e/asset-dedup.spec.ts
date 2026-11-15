import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { dedupAssets, withMovedAssets } from "../lib/asset-dedup"

// One file per picture in a device's zip (lib/asset-dedup.ts): the starter on
// the 4" carried 278 files with 88 different contents, and the board took
// over three minutes to install them (2026-11-15).

test("identical assets go once; every path names the one kept; other files stay", async () => {
  const zip = new JSZip()
  const a = new Uint8Array([1, 2, 3, 4])
  const b = new Uint8Array([1, 2, 3, 5])
  zip.file("assets/screen-1_obj-47-on.bmp", a)
  zip.file("assets/screen-2_obj-47-on.bmp", a)
  zip.file("assets/screen-3_obj-47-on-dark.bmp", a)
  zip.file("assets/screen-1_obj-48.bmp", b)
  zip.file("fonts/x.bdf", a)

  const moved = await dedupAssets(zip)
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort()
  expect(names).toEqual(["assets/screen-1_obj-47-on.bmp", "assets/screen-1_obj-48.bmp", "fonts/x.bdf"])
  expect(moved.get("assets/screen-2_obj-47-on.bmp")).toBe("assets/screen-1_obj-47-on.bmp")
  expect(moved.get("assets/screen-3_obj-47-on-dark.bmp")).toBe("assets/screen-1_obj-47-on.bmp")

  const json = JSON.stringify({ path: "assets/screen-2_obj-47-on.bmp", pathDark: "assets/screen-3_obj-47-on-dark.bmp", other: "assets/screen-1_obj-48.bmp", text: "assets/screen-2_obj-47-on.bmp is a word" })
  const out = JSON.parse(withMovedAssets(json, moved))
  expect(out.path).toBe("assets/screen-1_obj-47-on.bmp")
  expect(out.pathDark).toBe("assets/screen-1_obj-47-on.bmp")
  expect(out.other).toBe("assets/screen-1_obj-48.bmp")
  // Only a whole quoted path is a path.
  expect(out.text).toBe("assets/screen-2_obj-47-on.bmp is a word")
})

test("a zip with nothing twice is left as it was", async () => {
  const zip = new JSZip()
  zip.file("assets/a.bmp", new Uint8Array([1]))
  zip.file("assets/b.bmp", new Uint8Array([2]))
  const moved = await dedupAssets(zip)
  expect(moved.size).toBe(0)
  expect(withMovedAssets('{"p":"assets/a.bmp"}', moved)).toBe('{"p":"assets/a.bmp"}')
})
