import { test, expect } from "@playwright/test"
import { APP_RELEASES, FLASHER, planDeploy, type PlanDevice, type ProjectNeed } from "../lib/deploy-plan"

// What Deploy does with a device (docs/2026-10-10-deploy-simple.md, #66):
// at once, complete, or not at all.

const board = (over: Partial<PlanDevice> = {}): PlanDevice => ({
  name: "4.3B",
  platform: "firmware",
  online: true,
  systemGeneration: "1.1",
  firmwareBuild: "fw-2026.10.04.2",
  ...over,
})
const release = { build: "fw-2026.10.09.1", systemGeneration: "1.5", available: true }
const popups: ProjectNeed = { generation: { major: 1, minor: 3 }, parts: ["popups"] }
const navigator: ProjectNeed = { generation: { major: 1, minor: 5 }, parts: ["the navigator on Master 1"] }

test("an offline device gets nothing, project or firmware", () => {
  expect(planDeploy({ device: board({ online: false }), release, needs: [] })).toEqual({ kind: "offline" })
})

test("a board behind the designer's release is updated first, whatever the project needs", () => {
  expect(planDeploy({ device: board(), release, needs: [] })).toEqual({
    kind: "update-and-deploy",
    line: "Firmware fw-2026.10.04.2 · Deploy installs fw-2026.10.09.1 first",
  })
  // And the update is what makes a project with newer parts fit.
  expect(planDeploy({ device: board(), release, needs: [popups, navigator] }).kind).toBe("update-and-deploy")
})

test("a board on the release, or ahead of it, gets the project only - never a downgrade", () => {
  expect(planDeploy({ device: board({ firmwareBuild: "fw-2026.10.09.1", systemGeneration: "1.5" }), release, needs: [navigator] })).toEqual({
    kind: "deploy",
    line: "Firmware fw-2026.10.09.1",
  })
  expect(
    planDeploy({ device: board({ firmwareBuild: "fw-2026.10.09.1-3-gabc1234", systemGeneration: "1.5" }), release, needs: [] }),
  ).toEqual({ kind: "deploy", line: "Firmware fw-2026.10.09.1-3-gabc1234 (newer than this designer's)" })
})

test("a board the designer brings no firmware for: deployed if it can show the project, else blocked with the flasher", () => {
  expect(planDeploy({ device: board(), release: undefined, needs: [] })).toEqual({ kind: "deploy", line: "Firmware fw-2026.10.04.2" })
  const blocked = planDeploy({ device: board(), release: undefined, needs: [popups] })
  expect(blocked.kind).toBe("blocked")
  if (blocked.kind !== "blocked") return
  expect(blocked.reason).toContain("cannot show popups")
  expect(blocked.reason).toContain("generation 1.3")
  expect(blocked.link?.url).toBe(FLASHER)
})

test("a release still too old for the project blocks, rather than updating to no avail", () => {
  const old = { build: "fw-2026.10.09.1", systemGeneration: "1.3", available: true }
  const plan = planDeploy({ device: board(), release: old, needs: [navigator] })
  expect(plan.kind).toBe("blocked")
  if (plan.kind === "blocked") expect(plan.reason).toContain("Even this designer's firmware fw-2026.10.09.1 cannot show the navigator on Master 1")
})

test("an app too old for the project blocks, with the way to a newer one; one new enough deploys", () => {
  const phone = board({ name: "P20 Pro", platform: "android", firmwareVersion: "0.5.0", systemGeneration: "1.3", firmwareBuild: undefined })
  const plan = planDeploy({ device: phone, release, needs: [popups, navigator] })
  expect(plan.kind).toBe("blocked")
  if (plan.kind !== "blocked") return
  expect(plan.reason).toBe(
    'App 0.5.0 cannot show all of this project: the navigator on Master 1. Update the app on "P20 Pro" to one for generation 1.5 or newer, then deploy.',
  )
  expect(plan.link?.url).toBe(APP_RELEASES)
  expect(planDeploy({ device: { ...phone, systemGeneration: "1.5", firmwareVersion: "0.7.0" }, release, needs: [navigator] })).toEqual({
    kind: "deploy",
    line: "App 0.7.0",
  })
})

test("object types the device does not declare at all block, named", () => {
  const plan = planDeploy({ device: board({ name: "Knob" }), release, needs: [], unsupportedTypes: ["navigator"] })
  expect(plan).toEqual({ kind: "blocked", reason: '"Knob" cannot show navigator. Remove it from the project, or choose another device.' })
})
