import { test, expect } from "@playwright/test"
import { parseSvgTransform } from "../lib/svg-transform"

// lib/svg-transform.ts replaced `new DOMMatrix(string)` for reading adornment
// transforms, because DOMMatrix speaks CSS and threw on SVG's unitless
// rotate() - which left the knob's rotated arrow buttons unclickable. The
// reference here is the browser's own SVG engine (transform.baseVal,
// consolidated), not a second hand-derived matrix, so a shared
// misunderstanding of the SVG grammar can't make this pass.
//
// hardware-button-canvas-clicks.spec.ts is the end-to-end half: it clicks
// the knob's real arrows, which carry exactly such a rotate().

const CASES = [
  "rotate(-60.816086)",
  "rotate(90 270 270)",
  "rotate(45,10,20)",
  "matrix(0.98190252,0,0,0.98190251,-260.22736,181.62875)",
  "translate(10)",
  "translate(10 -5.5)",
  "scale(2)",
  "scale(-1,1)",
  "skewX(30)",
  "skewY(-15)",
  "translate(540,0) scale(-1,1)",
  "translate(100 100) rotate(30) scale(2 .5)",
  "  rotate(1e1)  ",
  "matrix(1,0,0,1,-.5,-1e-2)",
]

test.describe("SVG transform parsing", () => {
  test("matches the browser's own SVG transform for every form Inkscape can write", async ({ page }) => {
    await page.setContent("<svg xmlns='http://www.w3.org/2000/svg'><g id='g'/></svg>")
    for (const transform of CASES) {
      const native = await page.evaluate((t) => {
        const g = document.getElementById("g") as unknown as SVGGElement
        g.setAttribute("transform", t)
        const m = g.transform.baseVal.consolidate()!.matrix
        return [m.a, m.b, m.c, m.d, m.e, m.f]
      }, transform)
      const parsed = parseSvgTransform(transform)
      expect(parsed, transform).not.toBeNull()
      parsed!.forEach((v, i) => expect(v, `${transform} [${i}]`).toBeCloseTo(native[i], 4))
    }
  })

  test("rejects what it cannot read in full instead of applying part of it", () => {
    for (const bad of ["rotate(10deg)", "translate(10px, 5px)", "rotate(1 2)", "matrix(1,0,0,1)", "frobnicate(1)", "scale(2) junk", "rotate(1..2)"]) {
      expect(parseSvgTransform(bad), bad).toBeNull()
    }
  })
})
