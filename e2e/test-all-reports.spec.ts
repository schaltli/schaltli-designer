import { test, expect } from "@playwright/test"
import { readFileSync } from "fs"
import { join } from "path"

// hil/test-all.js decides a suite's PASS or FAIL from the results.json its
// orchestrator writes. A run that dies before writing one - no broker, no
// phone announcing itself - used to leave the previous run's file behind, and
// the summary reported that old result as this run's: "android-HIL PASS 12/12
// cases" twice on 2026-09-23 (issue #13).
//
// Asked of the script's text rather than by running it: it starts every suite
// the moment it is loaded, and needs boards, a phone and a broker to do so.
// What it must do is simple enough to read off - each report it reads is
// cleared before the suite that writes it runs - and a sixth suite added
// without the clear fails here.
test("every HIL report the summary reads is cleared before its suite runs", () => {
  const source = readFileSync(join(__dirname, "..", "hil", "test-all.js"), "utf8")
  const reads = [...source.matchAll(/readResults\(path\.join\(__dirname, "([^"]+)"\)\)/g)]
  expect(reads.length, "the suites that report through results.json").toBeGreaterThanOrEqual(5)

  let previous = 0
  for (const read of reads) {
    const dir = read[1]
    const clear = source.indexOf(`clearResults(path.join(__dirname, "${dir}"))`, previous)
    const run = source.lastIndexOf('await run("node"', read.index)
    expect(clear, `${dir}: cleared at all`).toBeGreaterThan(-1)
    expect(clear, `${dir}: cleared before its suite runs, not after`).toBeLessThan(run)
    previous = read.index! + read[0].length
  }
})
