import { test, expect } from "@playwright/test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

// The designer knows nothing of what the things on a broker are (block plan
// Task 8, docs/2026-09-30-block-discovery.md "Boundaries"): blocks come from
// what the devices announce, so a tank, a relay or a heater is a value or a
// switch like any other. This keeps the source from learning the van's
// things again, in code, comments or examples.
//
// Not van words: the van as the place the designer runs and where a bug was
// found, Pekaway and the VanPi bridge as what it runs beside, and Home
// Assistant's own `device_class` "battery", which a line saying so may name.
// The handbook, the bridge (integrations/) and the tests are about the van
// on purpose and are not read.

const ROOT = path.join(__dirname, "..")
const DIRS = ["lib", "components", "app", "hooks"]
const VAN_WORDS =
  /\b(tanks?|relays?|dimmers?|batter(?:y|ie|ies)|heaters?|heizung|maxxfan|frischwasser|abwasser\w*|wassertank|leselicht|camper)\b/i
const DEVICE_CLASS = /device[ _]class/i

/** The van words in a source text, as "line: word". */
function vanWordsIn(text: string): string[] {
  return text.split("\n").flatMap((line, i) => {
    const m = VAN_WORDS.exec(line)
    return m && !DEVICE_CLASS.test(line) ? [`${i + 1}: ${m[0]}`] : []
  })
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) return d.name === "node_modules" ? [] : sourceFiles(p)
    return /\.(ts|tsx|js|jsx|css)$/.test(d.name) ? [p] : []
  })
}

test("no source file names a thing in the van", () => {
  const found = DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).flatMap((file) =>
    vanWordsIn(readFileSync(file, "utf8")).map((hit) => `${path.relative(ROOT, file)}:${hit}`),
  )
  expect(found).toEqual([])
})

test("the check finds a van word wherever it is, and lets Home Assistant's device class be", () => {
  expect(vanWordsIn('const topic = "schaltli/state/tank/1/level"')).toEqual(["1: tank"])
  expect(vanWordsIn("// a Dimmer\nconst x = 1\n// Frischwasser")).toEqual(["1: Dimmer", "3: Frischwasser"])
  expect(vanWordsIn("label: 'MaxxFan'")).toEqual(["1: MaxxFan"])
  expect(vanWordsIn('config.device_class === "battery"')).toEqual([])
  // Words that only contain one are not one.
  expect(vanWordsIn("const tankard = relayout(batteryless)")).toEqual([])
  expect(vanWordsIn("// found on the van, Pekaway's VanPi bridge")).toEqual([])
})
