import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"

// The handbook quotes the designer's own labels - <span class="ui">Deploy to
// Device</span> - so a reader can find the button it names. A label that is
// renamed in the code and not in the handbook sends that reader looking for
// something that is not there, and nothing else would notice (CLAUDE.md,
// "Handbook"). So every quoted label has to occur, verbatim, somewhere in the
// designer's source.
//
// What this cannot tell is whether the label sits where the handbook says it
// does - only that it still exists. Labels that only a device shows (its setup
// portal, its screen) are marked <span class="ui fw"> and are not looked for
// here: they live in the firmware and app repositories.

const ROOT = path.join(__dirname, "..")
const SOURCES = ["app", "components", "hooks", "lib"]
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"])

function files(dir: string, keep: (file: string) => boolean): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...files(full, keep))
    else if (keep(full)) out.push(full)
  }
  return out
}

function decode(text: string): string {
  return text
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
}

test("every designer label the handbook quotes still exists in the designer", () => {
  const pages = files(path.join(ROOT, "handbuch"), (f) => f.endsWith(".md"))
  const quoted = new Map<string, string[]>()
  for (const page of pages) {
    const text = fs.readFileSync(page, "utf8")
    for (const match of text.matchAll(/<span class="ui">([^<]+)<\/span>/g)) {
      const label = decode(match[1].trim())
      const where = path.relative(ROOT, page)
      quoted.set(label, [...(quoted.get(label) || []), where])
    }
  }
  expect(quoted.size, "the handbook quotes no labels at all - has the markup changed?").toBeGreaterThan(0)

  const source = SOURCES.flatMap((dir) => files(path.join(ROOT, dir), (f) => EXTENSIONS.has(path.extname(f))))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n")

  const missing = [...quoted].filter(([label]) => !source.includes(label))
  expect(
    missing.map(([label, where]) => `"${label}" (${[...new Set(where)].join(", ")})`),
    "labels quoted in the handbook that the designer no longer has",
  ).toEqual([])
})
