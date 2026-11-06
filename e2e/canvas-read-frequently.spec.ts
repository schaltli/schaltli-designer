import { test, expect } from "@playwright/test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

// Every 2D canvas context the designer opens says it is read back often
// (`willReadFrequently: true`), so the browser keeps it in memory instead of
// on the graphics card.
//
// Why (2026-11-06, the user's Chrome on the Pekaway): a 4-bit font blends
// each glyph into what lies under it (lib/bdffont.ts drawCoverageRows), which
// reads the canvas back - 8472 times on opening «CamperUI mit Blocks». On a
// canvas the graphics card draws, each read waits for the card: 0.46 ms
// each, 3.9 s in all, the page blocked for over 5 s and, in a large window
// with every thumbnail, for a minute. Kept in memory: 0.03 ms, 0.25 s. A
// headless browser draws in memory anyway, which is why no test saw it.
//
// The first getContext on a canvas decides, so every call has to say it.

const ROOT = path.join(__dirname, "..")
const DIRS = ["lib", "components", "app", "hooks"]
const PLAIN_2D = /getContext\(\s*["']2d["']\s*\)/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return d.name === "node_modules" ? [] : sourceFiles(p)
    return /\.(ts|tsx|js|jsx)$/.test(d.name) ? [p] : []
  })
}

test("every 2D canvas context is opened with willReadFrequently", () => {
  const found = DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, i) => (PLAIN_2D.test(line) ? [`${path.relative(ROOT, file)}:${i + 1}`] : [])),
  )
  expect(found).toEqual([])
})

test("the check finds a plain 2D context", () => {
  expect(PLAIN_2D.test(`canvas.getContext("2d")`)).toBe(true)
  expect(PLAIN_2D.test(`canvas.getContext('2d')`)).toBe(true)
  expect(PLAIN_2D.test(`canvas.getContext("2d", { willReadFrequently: true })`)).toBe(false)
})
