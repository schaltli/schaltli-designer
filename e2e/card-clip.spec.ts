import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import type { ScreenObject } from "../components/project-editor"
import { areaShape, clipFeature, clipsContents, insideShape, roundRectSpans } from "../lib/clip"
import { dissolveGroups } from "../lib/object-groups"
import { planDeploy } from "../lib/deploy-plan"

// Clipping to a free area's shape (docs/2026-11-03-card-clip.md).

// The cases every renderer is held to: the designer here, the firmware's
// native test (test/test_clip, against Adafruit GFX itself) and the Android
// app's unit test read the same file.
const FIXTURE = path.join(__dirname, "..", "lib", "fixtures", "clip-spans.json")
const CASES: Array<[number, number, number]> = [
  [10, 10, 0],
  [10, 10, 3],
  [20, 12, 5],
  [30, 20, 8],
  [7, 7, 10],
  [40, 25, 12],
  [16, 16, 8],
  [9, 30, 4],
  [61, 33, 15],
]

test.describe("clip: the shape", () => {
  test("record the fixture", () => {
    test.skip(!process.env.CLIP_RECORD, "only to record the fixture")
    const cases = CASES.map(([w, h, r]) => ({ width: w, height: h, radius: r, spans: roundRectSpans(w, h, r) }))
    fs.writeFileSync(FIXTURE, JSON.stringify({ about: "Row spans [start, end) of Adafruit_GFX::fillRoundRect(0, 0, width, height, radius) - lib/clip.ts", cases }, null, 1) + "\n")
  })

  test("the spans match the fixture every renderer is held to", () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"))
    expect(fixture.cases.length).toBe(CASES.length)
    for (const c of fixture.cases) expect(roundRectSpans(c.width, c.height, c.radius), `${c.width}x${c.height} r${c.radius}`).toEqual(c.spans)
  })

  test("a square has full rows; a rounded one is symmetric, inset at its corners only, its middle full", () => {
    expect(roundRectSpans(10, 4, 0)).toEqual([
      [0, 10],
      [0, 10],
      [0, 10],
      [0, 10],
    ])
    const s = roundRectSpans(30, 20, 8)
    for (let row = 0; row < 20; row++) {
      expect(s[row], `row ${row} mirrors`).toEqual(s[19 - row])
      expect(s[row][0], `row ${row} left and right inset alike`).toBe(30 - s[row][1])
    }
    expect(s[0][0]).toBeGreaterThan(0)
    expect(s[10]).toEqual([0, 30])
    // A radius larger than half the shorter side is clamped, as GFX does.
    expect(roundRectSpans(7, 7, 10)).toEqual(roundRectSpans(7, 7, 3))
  })

  test("insideShape: a corner pixel out, the middle in", () => {
    const shape = { x: 100, y: 50, width: 30, height: 20, radius: 8 }
    expect(insideShape(shape, 100, 50)).toBe(false)
    expect(insideShape(shape, 115, 60)).toBe(true)
    expect(insideShape(shape, 130, 60)).toBe(false)
  })
})

const area = (properties: Record<string, any>, children: ScreenObject[], extra: Partial<ScreenObject> = {}): ScreenObject =>
  ({ id: "karte", type: "free", x: 20, y: 30, width: 200, height: 120, zIndex: 1, properties, children, ...extra }) as ScreenObject
const label = { id: "kopf", type: "text", x: 0, y: 0, width: 200, height: 20, zIndex: 2, properties: { text: "Kopf", backgroundColor: "accent" } } as ScreenObject
const card = { look: "card", fillColor: "panel", strokeColor: "outline", strokeWidth: 1, cornerRadius: 10, padding: 0 }

test.describe("clip: what clips, and the export", () => {
  test("Clip: on for a card unless set, off for a plain free area", () => {
    expect(clipsContents(area(card, []))).toBe(true)
    expect(clipsContents(area({ ...card, clipContents: false }, []))).toBe(false)
    expect(clipsContents(area({}, []))).toBe(false)
    expect(clipsContents(area({ clipContents: true }, []))).toBe(true)
    expect(clipsContents(label)).toBe(false)
  })

  test("the shape inside the edge", () => {
    expect(areaShape(area(card, []))).toEqual({ x: 21, y: 31, width: 198, height: 118, radius: 9 })
    expect(areaShape(area({ strokeWidth: 0, cornerRadius: 6 }, []))).toEqual({ x: 20, y: 30, width: 200, height: 120, radius: 6 })
  })

  test("export: what a clipping area holds carries its shape in its own space; its box does not; a plain area adds nothing", () => {
    const out = dissolveGroups([area(card, [label])])
    const box = out.find((o) => o.type === "box")!
    expect(box.properties!.clip).toBeUndefined()
    const kopf = out.find((o) => o.id === "kopf")!
    expect(kopf).toMatchObject({ x: 20, y: 30 })
    expect(kopf.properties!.clip).toEqual([{ x: 21, y: 31, width: 198, height: 118, radius: 9 }])
    const plain = dissolveGroups([area({ fillColor: "panel" }, [label])])
    expect(plain.find((o) => o.id === "kopf")!.properties!.clip).toBeUndefined()
  })

  test("export: nested areas clip by both, outermost first; a table inside passes it on", () => {
    const inner = area({ ...card, cornerRadius: 4 }, [{ ...label, id: "tief", x: 5, y: 5 }], { id: "innen", x: 10, y: 40, width: 100, height: 50 })
    const table = {
      id: "t",
      type: "table",
      x: 10,
      y: 100,
      width: 50,
      height: 10,
      zIndex: 3,
      properties: { grid: 1, columns: [{}], rows: [{}] },
      children: [{ id: "zelle", type: "box", x: 0, y: 0, width: 50, height: 10, zIndex: 1, properties: { cell: { row: 0, column: 0 } } }],
    } as ScreenObject
    const out = dissolveGroups([area(card, [inner, table])])
    const tief = out.find((o) => o.id === "tief")!
    expect(tief).toMatchObject({ x: 20 + 10 + 5, y: 30 + 40 + 5 })
    expect(tief.properties!.clip).toEqual([
      { x: 21, y: 31, width: 198, height: 118, radius: 9 },
      { x: 31, y: 71, width: 98, height: 48, radius: 3 },
    ])
    // The inner card's own box is clipped by the outer card.
    const innerBox = out.filter((o) => o.type === "box").find((o) => o.x === 30 && o.y === 70)!
    expect(innerBox.properties!.clip).toEqual([{ x: 21, y: 31, width: 198, height: 118, radius: 9 }])
    expect(out.find((o) => o.id === "zelle")!.properties!.clip).toEqual([{ x: 21, y: 31, width: 198, height: 118, radius: 9 }])
  })

  test("the feature: a project with a clipping area needs it; a device without it is refused", () => {
    expect(clipFeature({ screens: [{ objects: [area(card, [label])] }] })).toEqual({ feature: "clip", label: "cards that clip what they hold (1)" })
    // An empty card clips nothing; a plain area neither.
    expect(clipFeature({ screens: [{ objects: [area(card, []), area({}, [label])] }] })).toBeNull()
    const plan = planDeploy({
      device: { name: "Knob", platform: "esp32", online: true, systemGeneration: 1.7, firmwareBuild: "fw-2026.11.02.1", firmwareVersion: "" },
      release: undefined,
      needs: [],
      unsupportedFeatures: [{ feature: "clip", label: "cards that clip what they hold (1)" }],
    } as any)
    expect(plan.kind).toBe("blocked")
  })
})
