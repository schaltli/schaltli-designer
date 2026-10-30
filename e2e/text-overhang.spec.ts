import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import fs from "fs"
import path from "path"
import { BDFFont } from "../lib/bdffont"

// A right-aligned text moves left by how far its last glyph's ink reaches
// past its advance (lib/bdffont.ts inkRightOverhangOf, and the firmware's
// BdfFont::inkRightOverhangOf). In the van on 2026-10-30 a chart's legend
// read «jetzt 2 %» with the «%» shaved off at the box's edge: in luRS10 it
// is 11 px of ink on an advance of 9. charts-draw holds the board's legend
// to the designer's at 0 px.

async function luRS10(): Promise<BDFFont> {
  const zip = await JSZip.loadAsync(fs.readFileSync(path.join(__dirname, "..", "public", "ddf", "waveshare-touch-lcd-4v3b.ddf.zip")))
  return new BDFFont(await zip.file("fonts/luRS10.bdf")!.async("string"))
}

test("a right-aligned text ending in «%» moves left by the ink past its advance, one ending in a digit not at all", async () => {
  const font = await luRS10()
  // Drawn from x = BBox + 1 to BBox + BBw against an advance of DWIDTH: 0 + 11 + 1 - 9.
  expect(font.inkRightOverhangOf("jetzt 2 %")).toBe(3)
  expect(font.inkRightOverhangOf("jetzt 20")).toBe(0)
  expect(font.inkRightOverhangOf("")).toBe(0)
})
