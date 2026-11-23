import { test, expect } from "@playwright/test"
import vectors from "../lib/instrument/vectors.json"
import {
  gaugeAngle,
  instrumentScale,
  normalizeInstrument,
  presetLabels,
  type CalibrationPoint,
  type InstrumentProps,
  type InstrumentStyle,
  type LabelPreset,
} from "../lib/instrument"

// lib/instrument.ts against lib/instrument/vectors.json - the cases the
// firmware and the app will run too (docs/2026-11-23-instrument-styles.md,
// tasks/instrument-styles-todo.md I1). Pure; the suite runs in a browser
// only because every suite does.

const close = (a: number[], b: number[]) => {
  expect(a.length).toBe(b.length)
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))
}

test.describe("instrument scale (shared vectors)", () => {
  test("enough cases that a truncated copy cannot pass", () => {
    expect(vectors.scale.length).toBeGreaterThanOrEqual(8)
    expect(vectors.normalize.length).toBeGreaterThanOrEqual(4)
  })

  for (const c of vectors.scale) {
    test(`scale: ${c.name}`, () => {
      const props = normalizeInstrument(c.props) as InstrumentProps
      const s = instrumentScale(c.calibration as CalibrationPoint[], props, c.lengthPx)
      const e = c.expected as Record<string, any>
      if (e.majorStep !== undefined) expect(s.majorStep).toBeCloseTo(e.majorStep, 9)
      if (e.minorPerMajor !== undefined) expect(s.minorPerMajor).toBe(e.minorPerMajor)
      if (e.tickCount !== undefined) expect(s.ticks.length).toBe(e.tickCount)
      if (e.majors) close(s.ticks.filter((t) => t.major).map((t) => t.value), e.majors)
      if (e.ticksAt) close(s.ticks.map((t) => t.at), e.ticksAt)
      if (e.labels) expect(s.labels.map((l) => l.text)).toEqual(e.labels)
      if (e.labelsAt) close(s.labels.map((l) => l.at), e.labelsAt)
      if (e.dense !== undefined) expect(s.dense).toBe(e.dense)
    })
  }

  for (const c of vectors.zones) {
    test(`zones: ${c.name}`, () => {
      const s = instrumentScale(c.calibration as CalibrationPoint[], normalizeInstrument({ style: "fuel", zones: c.zones }), 200)
      expect(s.zones.length).toBe(c.expected.length)
      s.zones.forEach((z, i) => {
        expect(z.kind).toBe(c.expected[i].kind)
        expect(z.from).toBeCloseTo(c.expected[i].from, 9)
        expect(z.to).toBeCloseTo(c.expected[i].to, 9)
      })
    })
  }

  for (const c of vectors.presets) {
    test(`preset: ${c.preset}`, () => {
      expect(presetLabels(c.preset as LabelPreset, c.min, c.max) ?? null).toEqual(c.expected)
    })
  }

  for (const c of vectors.angles) {
    test(`angle: ${c.style} at ${c.at}`, () => {
      expect(gaugeAngle(c.style as InstrumentStyle, c.at)).toBeCloseTo(c.expected, 9)
    })
  }

  for (const c of vectors.normalize) {
    test(`normalize: ${c.name}`, () => {
      expect(normalizeInstrument(c.props)).toEqual(c.expected)
    })
  }
})
