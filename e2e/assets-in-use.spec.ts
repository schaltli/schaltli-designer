import { test, expect } from "@playwright/test"
import { assetIdsInUse } from "../lib/assets-in-use"

// Remove Unused Assets keeps what lib/assets-in-use.ts finds. It used to know
// only background images, Icon objects and Live Icon rules at a screen's top
// level, and deleted every other icon still on screen (issue #7). Each place
// below is one it missed.

const asset = (id: string) => ({ id, name: id, type: "icon", data: "<svg/>" })

const project = {
  name: "Van",
  assets: [
    "on-background",
    "on-icon",
    "in-live-icon-rule",
    "on-button",
    "on-switch-state",
    "on-button-group-active",
    "on-bar",
    "screen-icon",
    "inside-a-panel",
    "unused",
  ].map(asset),
  screens: [
    {
      id: "s1",
      name: "Overview",
      iconAssetId: "screen-icon",
      backgroundImageAssetId: "on-background",
      objects: [
        { id: "o1", type: "icon", properties: { assetId: "on-icon" } },
        { id: "o2", type: "live-icon", properties: { valueIconPairs: [{ operator: "==", value: "1", thenShowIcon: "in-live-icon-rule" }] } },
        { id: "o3", type: "button", properties: { iconAssetId: "on-button" } },
        { id: "o4", type: "switch", properties: { states: [{ label: "An", iconAssetId: "on-switch-state" }] } },
        { id: "o5", type: "button-group", properties: { states: [{ label: "Eco", activeIconAssetId: "on-button-group-active" }] } },
        { id: "o6", type: "bar", properties: { iconAssetId: "on-bar" } },
        {
          id: "o7",
          type: "switcher",
          properties: {},
          children: [
            { id: "p1", type: "panel", properties: {}, children: [{ id: "o8", type: "icon", properties: { assetId: "inside-a-panel" } }] },
          ],
        },
      ],
    },
  ],
}

test("every place an icon can be used keeps it", () => {
  const used = assetIdsInUse(project)
  const kept = project.assets.filter((a) => used.has(a.id)).map((a) => a.id)
  expect(kept).toEqual(project.assets.map((a) => a.id).filter((id) => id !== "unused"))
})

test("an asset nothing refers to goes", () => {
  expect(assetIdsInUse(project).has("unused")).toBe(false)
})

test("the asset library does not count as a use of itself", () => {
  // Every asset names its own id; if the library were walked too, nothing
  // would ever be unused.
  expect(assetIdsInUse({ assets: [asset("alone")], screens: [] }).has("alone")).toBe(false)
})
