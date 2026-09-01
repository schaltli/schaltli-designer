import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"

// The Android export, and the Android DDF that declares what it may contain
// (2026-08-29, bringing this target level with the Waveshare).
//
// Two halves that have to agree, and did not:
//
//   1. The DDF's supportedObjectTypes is what the designer gates its toolbar
//      and its deploy check on. It listed neither "arc-level" nor "Switch",
//      so those tools came up disabled on an Android project - the app could
//      not have rendered them anyway.
//   2. lib/android-export.ts resolved none of the things lib/project-zip.ts
//      resolves for a firmware. A project whose artwork lived on a master
//      screen exported as a set of empty screens; a Switch's state icons and
//      a SoftwareButton's icon had no path to load; a swipe bound on a master
//      reached nothing; and a label reading "{screen}" exported as the
//      literal five characters.
//
// None of it failed loudly. The zip was valid and the app loaded it, which is
// why each of these is pinned here by what the bundle actually contains
// rather than by "the export did not throw".

const ANDROID_DDF = path.join(__dirname, "..", "public", "ddf", "android-phone.ddf.zip")

const ICON_SVG =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#000000"/></svg>`,
  ).toString("base64")

/** Every object in the tree, containers included - a Switch in a panel is still a Switch. */
const flatten = (list: any[]): any[] => (list || []).flatMap((o) => [o, ...flatten(o.children)])

function buildProject() {
  return {
    name: "android-export",
    screenWidth: 360,
    screenHeight: 800,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [
      { id: "asset-on", name: "on", type: "icon", data: ICON_SVG },
      { id: "asset-off", name: "off", type: "icon", data: ICON_SVG },
    ],
    topics: [
      { id: "t-level", topic: "tank/level", type: "numeric", examples: ["40"] },
      { id: "t-target", topic: "tank/target", type: "numeric", examples: ["70"] },
      { id: "t-mode", topic: "fan/mode", type: "text", examples: ["AUTO"] },
    ],
    screens: [
      {
        id: "master-1",
        name: "Master",
        isMaster: true,
        backgroundColor: "#101010",
        // Bound on the master only. A screen that inherits it must come out
        // of the export carrying it as its own, because the app resolves no
        // inheritance of its own - same contract a firmware gets.
        buttonActions: {
          "swipe-up": { type: "device-action", deviceActionId: "showScreenMenu" },
          "swipe-left": { type: "next-screen" },
        },
        objects: [
          {
            id: "master-label",
            type: "label",
            zIndex: 0,
            x: 10,
            y: 10,
            width: 200,
            height: 20,
            properties: { text: "{screen}", fontId: "font-roboto-16", color: "#ffffff" },
          },
        ],
      },
      {
        id: "s1",
        name: "Tank",
        masterScreenId: "master-1",
        objects: [
          {
            id: "arc",
            type: "arc-level",
            zIndex: 1,
            x: 0,
            y: 100,
            width: 360,
            height: 360,
            properties: {
              topic: "tank/level",
              setpointTopic: "tank/target",
              minAngle: 225,
              maxAngle: 135,
              direction: "cw",
              thickness: 22,
              trackColor: "#303030",
              fillColor: "#00aaff",
              markerColor: "#ffffff",
              displayValue: "percentage",
            },
          },
          {
            id: "btn",
            type: "SoftwareButton",
            zIndex: 2,
            x: 20,
            y: 600,
            width: 160,
            height: 48,
            properties: {
              text: "Fill",
              iconAssetId: "asset-on",
              iconColor: "#00aaff",
              action: { type: "send-mqtt", mqttTopic: "tank/fill", mqttMessage: "1" },
            },
          },
          // Deliberately inside a container: both halves of the export have
          // to reach it, and the firmware export's own version of this bug
          // (2026-08-27) was exactly a container hiding the objects from the
          // pass that writes paths back.
          {
            id: "tabs",
            type: "tab-control",
            zIndex: 3,
            x: 0,
            y: 660,
            width: 360,
            height: 120,
            properties: { topic: "fan/mode" },
            children: [
              {
                id: "panel-auto",
                type: "panel",
                zIndex: 0,
                x: 0,
                y: 0,
                width: 360,
                height: 120,
                properties: { comparisonOperator: "==", comparisonValue: "AUTO" },
                children: [
                  {
                    id: "nested-switch",
                    type: "Switch",
                    zIndex: 1,
                    x: 10,
                    y: 10,
                    width: 200,
                    height: 60,
                    properties: {
                      topic: "fan/mode",
                      writeTopic: "fan/mode/set",
                      mode: "segmented",
                      iconColor: "#ffffff",
                      states: [
                        {
                          id: "st-auto",
                          label: "Auto",
                          readValue: "AUTO",
                          writeValue: "AUTO",
                          iconAssetId: "asset-on",
                          activeIconAssetId: "asset-off",
                        },
                        // No icons at all - its path entries must be absent,
                        // not empty strings pointing at nothing.
                        { id: "st-man", label: "Manual", readValue: "MANUAL", writeValue: "MANUAL" },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "s2",
        name: "Plain",
        // No master: its own background stands, and it inherits no swipes.
        backgroundColor: "#ffffff",
        objects: [],
      },
    ],
  }
}

async function exportAndroid(page: import("@playwright/test").Page) {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zipBase64: string = await page.evaluate(
    (p) => (window as any).__buildAndroidZipForTest(p),
    buildProject(),
  )
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  return { zip, project }
}

test.describe("Android DDF", () => {
  test("declares the same controls and the screen menu the Waveshare does", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(ANDROID_DDF))
    const manifest = JSON.parse(await zip.file("device.json")!.async("string"))

    // The two types this target gained. Both are gated on this list alone -
    // the toolbar disables a tool the device does not list, and the deploy
    // dialog refuses a project placing one.
    expect(manifest.supportedObjectTypes).toContain("arc-level")
    expect(manifest.supportedObjectTypes).toContain("Switch")

    // showScreenMenu is what a swipe binds to for the "which screen am I on"
    // overlay; without it in this list the designer offers no such binding.
    expect(manifest.deviceActions).toContain("showScreenMenu")

    // Every other target declares which system generation it speaks, and the
    // deploy dialog compares majors before uploading anything.
    expect(manifest.systemGeneration).toBe("1.0")
  })
})

test.describe("Android-Export", () => {
  test("arc-level and Switch survive the export as live objects", async ({ page }) => {
    const { project } = await exportAndroid(page)
    const objects = flatten(project.screens.flatMap((s: any) => s.objects))

    const arc = objects.find((o: any) => o.id === "arc")
    expect(arc).toBeDefined()
    // The two readings the ring shows at once. Both have to arrive: the
    // second one is what the app subscribes the setpoint marker to.
    expect(arc.properties.topic).toBe("tank/level")
    expect(arc.properties.setpointTopic).toBe("tank/target")
    expect(arc.properties.minAngle).toBe(225)
    expect(arc.properties.maxAngle).toBe(135)
    expect(arc.properties.thickness).toBe(22)

    const sw = objects.find((o: any) => o.id === "nested-switch")
    expect(sw).toBeDefined()
    // Read topic and write topic are different fields on purpose - the state
    // comes home over one and the command goes out over the other.
    expect(sw.properties.topic).toBe("fan/mode")
    expect(sw.properties.writeTopic).toBe("fan/mode/set")
    expect(sw.properties.states.map((s: any) => s.writeValue)).toEqual(["AUTO", "MANUAL"])
  })

  test("every icon a live object needs is written and pointed at", async ({ page }) => {
    const { zip, project } = await exportAndroid(page)
    const objects = flatten(project.screens.flatMap((s: any) => s.objects))

    const sw = objects.find((o: any) => o.id === "nested-switch")
    const [auto, manual] = sw.properties.states

    // Nested inside a tab-control's panel: the pass that writes paths back
    // has to walk the whole tree, not just the top level.
    expect(auto.path).toBeTruthy()
    expect(auto.activePath).toBeTruthy()
    expect(auto.path).not.toBe(auto.activePath)
    // A state with no icon carries no path rather than a dangling one.
    expect(manual.path).toBeUndefined()
    expect(manual.activePath).toBeUndefined()

    const btn = objects.find((o: any) => o.id === "btn")
    expect(btn.path).toBeTruthy()

    // Every referenced file is actually in the bundle - a path pointing at
    // nothing is the failure that looks exactly like "the author set no icon".
    for (const p of [auto.path, auto.activePath, btn.path]) {
      expect(zip.file(p), `${p} missing from the bundle`).not.toBeNull()
    }

    // Tinting happens at export time, through the designer's own rules, so
    // the app never needs a second copy of them. The button asks for
    // #00aaff and the Switch for #ffffff, from the same source asset - so
    // the two must be different files, and the button's must carry its
    // colour.
    const buttonSvg = await zip.file(btn.path)!.async("string")
    const switchSvg = await zip.file(auto.path)!.async("string")
    expect(buttonSvg).not.toBe(switchSvg)
    expect(buttonSvg.toLowerCase()).toContain("#00aaff")
  })

  test("a master screen is resolved away, exactly as it is for a firmware", async ({ page }) => {
    const { project } = await exportAndroid(page)

    // A master is never a screen of its own - it only ever appears merged
    // into the screens that reference it.
    expect(project.screens.map((s: any) => s.id)).toEqual(["s1", "s2"])

    const tank = project.screens.find((s: any) => s.id === "s1")
    const plain = project.screens.find((s: any) => s.id === "s2")

    // Objects, background and swipe bindings all inherit through the same
    // resolution. Before this, a project built on a master exported as empty
    // screens with nothing to explain it.
    expect(flatten(tank.objects).map((o: any) => o.id)).toContain("master-label")
    expect(tank.backgroundColor).toBe("#101010")
    expect(tank.buttonActions["swipe-up"]).toEqual({
      type: "device-action",
      deviceActionId: "showScreenMenu",
    })
    expect(tank.buttonActions["swipe-left"]).toEqual({ type: "next-screen" })

    // The screen with no master keeps its own background and inherits none
    // of those bindings.
    expect(plain.backgroundColor).toBe("#ffffff")
    expect(plain.buttonActions).toBeUndefined()

    // A placeholder is resolved against the screen it ended up on, not the
    // master it was written on - the whole point of putting one on a master.
    const label = flatten(tank.objects).find((o: any) => o.id === "master-label")
    expect(label.properties.text).toBe("Tank")
  })
})
