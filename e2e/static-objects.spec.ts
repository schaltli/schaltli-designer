import { test, expect } from "@playwright/test"
import { planDeploy, type PlanDevice } from "../lib/deploy-plan"
import { isStaticObject, staticObjectsFeature, STATIC_OBJECTS_FEATURE } from "../lib/static-objects"

// The Android app draws box, line and fixed icon itself since 2026-10-13
// (tasks/android-draws-all-plan.md): the bundle carries no baked picture of
// them, so Deploy asks an app that does not say "static-objects" to update -
// for a project that has any of them, and only then.

const obj = (id: string, type: string, properties: Record<string, unknown> = {}, children: any[] = []) =>
  ({ id, type, x: 0, y: 0, width: 10, height: 10, zIndex: 0, properties, children }) as any

test("box, line and a fixed icon are static; a live icon and everything else are not", () => {
  expect(isStaticObject(obj("b", "box"))).toBe(true)
  expect(isStaticObject(obj("l", "line"))).toBe(true)
  expect(isStaticObject(obj("i", "icon", { assetId: "a" }))).toBe(true)
  expect(isStaticObject(obj("li", "icon", { assetId: "a", liveIconId: "lv", liveValues: [{ id: "lv", source: { namespace: "topic", path: "x" }, rules: [] }] }))).toBe(false)
  expect(isStaticObject(obj("t", "text"))).toBe(false)
  expect(isStaticObject(obj("ll", "live-line"))).toBe(false)
})

test("a project asks for the feature only when it has one of them, inside a switcher's panel too", () => {
  expect(staticObjectsFeature({ screens: [{ objects: [obj("t", "text")] }] })).toBeNull()
  const nested = { screens: [{ objects: [obj("sw", "switcher", {}, [obj("p", "panel", {}, [obj("b", "box")])])] }] }
  expect(staticObjectsFeature(nested)).toEqual({ feature: STATIC_OBJECTS_FEATURE, label: "boxes" })
  const all = { screens: [{ objects: [obj("b", "box"), obj("l", "line")] }, { objects: [obj("i", "icon", { assetId: "a" })] }] }
  expect(staticObjectsFeature(all)).toEqual({ feature: STATIC_OBJECTS_FEATURE, label: "boxes, lines and icons" })
})

test("Deploy asks an app without it to update, and sends to one with it", () => {
  const phone: PlanDevice = { name: "P20 Pro", platform: "android", online: true, systemGeneration: "1.8", firmwareVersion: "0.10.0" }
  const release = { build: "fw-2026.10.13.2", systemGeneration: "1.8", available: true }
  const missing = [{ feature: STATIC_OBJECTS_FEATURE, label: "boxes and lines" }]
  // The dialog counts it among the app release's features (deploy-dialog.tsx).
  expect(planDeploy({ device: phone, release, needs: [], unsupportedFeatures: missing, releaseTypes: [], releaseFeatures: [STATIC_OBJECTS_FEATURE] })).toMatchObject({
    kind: "blocked",
    reason: 'App 0.10.0 cannot show boxes and lines. Update the app on "P20 Pro", then deploy.',
  })
  expect(planDeploy({ device: { ...phone, firmwareVersion: "0.11.0" }, release, needs: [], unsupportedFeatures: [] }).kind).toBe("deploy")
})
