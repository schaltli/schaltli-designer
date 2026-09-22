import { test, expect } from "@playwright/test"
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
            type: "text",
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
            type: "gauge",
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
          // A level indicator with a name and an icon on its header line -
          // the one part of it the app drew nothing for until 2026-09-22,
          // because the export wrote no file for it.
          {
            id: "tank",
            type: "bar",
            zIndex: 4,
            x: 20,
            y: 540,
            width: 200,
            height: 56,
            properties: {
              topic: "tank/level",
              label: "Tank",
              iconAssetId: "asset-on",
              iconColor: "#00aaff",
              displayValue: "percentage",
              fillColor: "#4CAF50",
            },
          },
          {
            id: "btn",
            type: "button",
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
            type: "switcher",
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
                    type: "button-group",
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

async function exportAndroid(page: import("@playwright/test").Page, overrides: Record<string, unknown> = {}) {
  await page.goto("/test-render")
  await page.waitForFunction(() => (window as any).__testRenderReady === true)
  const zipBase64: string = await page.evaluate(
    (p) => (window as any).__buildAndroidZipForTest(p),
    { ...buildProject(), ...overrides },
  )
  const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  return { zip, project }
}

// The Android DDF used to be checked in here as
// public/ddf/android-phone.ddf.zip, and this file used to assert what it
// declared. Since 2026-09-21 the app builds its own at runtime from the
// screen it actually has and announces it over MQTT
// (docs/2026-09-21-android-self-announce.md), so there is no file here to
// read - what it declares is asserted in that repo, against the generator,
// by ScreensmithAndroid's DdfBuilderTest.

test.describe("Android-Export", () => {
  test("says which way up the device is meant to be", async ({ page }) => {
    // The same field the firmware bundle carries (lib/project-zip.ts), and
    // for the same reason: the app turns its own activity to match, instead
    // of following the phone's sensor. A panel is mounted, not held.
    const native = await exportAndroid(page)
    expect(native.project.rotation).toBe(0)

    // screenWidth/Height alone cannot say this. A quarter turn swaps them -
    // and a half turn does not, so 0 and 180 are the same pair of numbers
    // and only this field tells them apart.
    const halfTurn = await exportAndroid(page, {
      settings: { colorDepth: "24bit", rotation: 180 },
    })
    expect(halfTurn.project.rotation).toBe(180)
    expect(halfTurn.project.screenWidth).toBe(native.project.screenWidth)
    expect(halfTurn.project.screenHeight).toBe(native.project.screenHeight)

    // A quarter turn is exported with the numbers already swapped by the
    // designer, exactly as a firmware gets them.
    const quarterTurn = await exportAndroid(page, {
      screenWidth: 800,
      screenHeight: 360,
      settings: { colorDepth: "24bit", rotation: 90 },
    })
    expect(quarterTurn.project.rotation).toBe(90)
    expect(quarterTurn.project.screenWidth).toBe(800)
    expect(quarterTurn.project.screenHeight).toBe(360)
  })

  test("a font's vertical measure travels with it", async ({ page }) => {
    // The app lays a level indicator's header line out from the font's own
    // measure and nothing else - one line of it, with the text standing on a
    // baseline that follows from the ascent (ScreensmithAndroid's
    // LevelShape.kt, fontMetricsOf). Until 2026-09-21 the export dropped
    // every one of these numbers for a BDF entry and the measured baseline
    // for a TTF, so the phone fell back to four fifths of the size and put
    // the header a row or two off what the designer draws. Nothing failed;
    // the text simply sat somewhere else.
    const TTF_BYTES = "data:font/ttf;base64," + Buffer.from("a face the export never parses").toString("base64")
    const { project } = await exportAndroid(page, {
      fonts: [
        {
          id: "font-roboto-16",
          name: "Roboto",
          displayName: "Roboto 16px",
          internalName: "Roboto",
          size: 16,
          ascent: 15,
          descent: 4,
          // What the browser measured when the font was added, which is not
          // four fifths of 16 - so a bundle that carries it and one that does
          // not lay text out differently.
          baselineOffset: 12.4,
          format: "ttf",
          data: TTF_BYTES,
        },
        { id: "font-helvR12", name: "helvR12", displayName: "helvR12", size: 12, ascent: 11, descent: 3 },
      ],
    })

    const ttf = project.fonts.find((f: any) => f.id === "font-roboto-16")
    expect(ttf.path).toBe("assets/fonts/Roboto.ttf")
    expect(ttf.baselineOffset).toBe(12.4)
    expect(ttf.ascent).toBe(15)
    expect(ttf.descent).toBe(4)

    // No file to ship - but the numbers still travel, and the absent path is
    // how the app tells the two kinds apart.
    const bdf = project.fonts.find((f: any) => f.id === "font-helvR12")
    expect(bdf.path).toBeUndefined()
    expect(bdf.ascent).toBe(11)
    expect(bdf.descent).toBe(3)
  })

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
    for (const p of [auto.path, auto.activePath, btn.path, btn.pressedPath]) {
      expect(zip.file(p), `${p} missing from the bundle`).not.toBeNull()
    }

    // A Switch's are not SVGs at all any more, and that is the point: its
    // icon is drawn in an ink that follows from the state, at a size that
    // follows from the object's font, with its own margin trimmed away so
    // the ink stands on the label's baseline. All of that is this repo's
    // rules, so the picture is baked here rather than re-derived in the app
    // (2026-09-22, when the Switch was ported to the new look).
    expect(auto.path.endsWith(".png"), `${auto.path} should be a baked bitmap`).toBe(true)
    expect(auto.activePath.endsWith(".png")).toBe(true)

    // A capital's height in the object's font - 9 for the 14px fallback this
    // project's Switch has - and square. Read out of the PNG header, because
    // a bitmap of the wrong size is a picture that gets scaled on the glass,
    // which is exactly what baking is here to avoid.
    const pngSize = async (path: string) => {
      const bytes = await zip.file(path)!.async("nodebuffer")
      return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) }
    }
    expect(await pngSize(auto.path)).toEqual({ w: 9, h: 9 })
    expect(await pngSize(auto.activePath)).toEqual({ w: 9, h: 9 })

    // A SoftwareButton goes one step further: the WHOLE button is baked, in
    // both of its states, exactly as a firmware gets it. Its pill, its
    // colours, its trimmed icon and its measured label are all rules this
    // repo owns, and the app only blits - so `path` is the button, not the
    // icon it happens to carry, and it is the size of the object.
    expect(btn.path.endsWith(".png")).toBe(true)
    expect(btn.pressedPath.endsWith(".png")).toBe(true)
    expect(btn.path).not.toBe(btn.pressedPath)
    expect(await pngSize(btn.path)).toEqual({ w: Math.round(btn.width), h: Math.round(btn.height) })
    expect(await pngSize(btn.pressedPath)).toEqual({ w: Math.round(btn.width), h: Math.round(btn.height) })

    // A level indicator's header icon is baked the same way, at a capital's
    // height in the object's own font - 9 for the 14px fallback here. The
    // object's `path` is that picture; the bar itself is still drawn by the
    // app, from rules it has a copy of.
    const tank = objects.find((o: any) => o.id === "tank")
    expect(tank.path.endsWith(".png")).toBe(true)
    expect(await pngSize(tank.path)).toEqual({ w: 9, h: 9 })

    // The two states are not the same picture: pressed, Material's shape
    // morph squares the ends off and a state layer goes over the container.
    // A port that baked one bitmap twice would pass every check above.
    const normalBytes = await zip.file(btn.path)!.async("nodebuffer")
    const pressedBytes = await zip.file(btn.pressedPath)!.async("nodebuffer")
    expect(normalBytes.equals(pressedBytes)).toBe(false)
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
