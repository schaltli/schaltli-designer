import { test, expect } from "@playwright/test"
const { restartVerdict } = require("../hil/size-scale/text-styles")

// hil/size-scale/text-styles.js upload(): did the board restart into the
// project it was sent? On its own - no device.
//
// The first version wanted the uptime under what it was before, and called a
// board up 20 s past that "not restarted". The 4.3B answers an install of the
// text-styles project after 17-28 s and restarts only then, and the HIL
// installs on boards that have just come up: test:all on 2026-11-02 failed
// text-styles and redraw-time three times on boards that had installed and
// restarted exactly as asked. Whether it ran on is now measured by the clock.

const s = 1000

test("a board installed on at 4 s, back at 8 after a 22 s install: restarted", () => {
  expect(restartVerdict({ before: 4, sent: 0, answered: 22 * s, at: 30 * s, now: 8 })).toBe("restarted")
})

test("polled between the answer and the restart, after a 22 s install: wait, not a failure", () => {
  expect(restartVerdict({ before: 9, sent: 0, answered: 22 * s, at: 22.5 * s, now: 31 })).toBe("wait")
})

test("still on the same count 20 s after it answered: not restarted", () => {
  expect(restartVerdict({ before: 9, sent: 0, answered: 22 * s, at: 42 * s, now: 51 })).toBe("not restarted")
})

test("no answer while it restarts: wait", () => {
  expect(restartVerdict({ before: 46, sent: 0, answered: 1 * s, at: 3 * s, now: null })).toBe("wait")
})

test("the uptime before not known: any answer after the install counts as back", () => {
  expect(restartVerdict({ before: null, sent: 0, answered: 1 * s, at: 5 * s, now: 3 })).toBe("restarted")
})
