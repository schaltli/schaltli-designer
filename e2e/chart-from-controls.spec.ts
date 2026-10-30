import { test, expect } from "@playwright/test"
import { historyCharts, seriesFromControl } from "../lib/chart-from-controls"
import { SERIES_COLOURS } from "../lib/chart"

// A page's history proposed from its controls (tasks/charts-designer-plan.md
// D10, decision 10; docs/2026-10-16-charts.md «What a control gives»).

const bar = (topic: string, extra: Record<string, unknown> = {}) => ({
  type: "bar",
  properties: { topic, fillColor: "accent", calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }], ...extra },
})

test.describe("series from controls (D10)", () => {
  test("a Bar or Gauge a level, its range the axis; a Slider or Dial a stepped target", () => {
    expect(seriesFromControl(bar("van/tank#level"))).toEqual([
      { source: { kind: "topic", topic: "van/tank#level" }, name: "level", valueKind: "level", draw: "line", annotations: ["current"], color: "accent", axisRange: { min: 0, max: 100 } },
    ])
    const dial = seriesFromControl({ type: "dial", properties: { topic: "heat/now", setpointTopic: "heat/target" } })
    expect(dial[0]).toMatchObject({ source: { kind: "topic", topic: "heat/target" }, name: "Target", draw: "steps", valueKind: "level" })
  })

  test("a Switch a band, on where its states say on; one without a read topic nothing", () => {
    const sw = { type: "switch", properties: { topic: "van/pump", states: [{ readValue: "0" }, { readValue: "1", showAsOn: true }] } }
    expect(seriesFromControl(sw)[0]).toMatchObject({ valueKind: "state", draw: "band", onMeans: [{ op: "==", value: "1" }], annotations: ["runtime"] })
    expect(seriesFromControl({ type: "switch", properties: { writeTopic: "relay/1" } })).toEqual([])
    expect(seriesFromControl({ type: "button", properties: { topic: "x" } })).toEqual([])
  })

  test("a value in a Text a level with its decimals", () => {
    const text = { type: "text", properties: { liveValues: [{ id: "lv1", source: { namespace: "topic", path: "van/temp" }, format: { kind: "number", decimals: 1, grouped: false }, rules: [] }, { id: "lv2", source: { namespace: "screen", path: "name" }, rules: [] }] } }
    expect(seriesFromControl(text)).toEqual([{ source: { kind: "topic", topic: "van/temp" }, name: "temp", valueKind: "level", draw: "line", annotations: ["current"], decimals: 1 }])
  })

  test("an energy diagram one stack: sinks below, a storage giving above, «Reverse sign» turning it, the rest its balance, the bus nothing", () => {
    const diagram = {
      id: "ed",
      type: "energy-diagram",
      properties: {
        nodes: [
          { id: "bus", role: "bus", name: "12 V" },
          { id: "sun", role: "source", name: "Solar", topic: "van/solar", colorRole: "energySun" },
          { id: "fridge", role: "sink", name: "Fridge", topic: "van/fridge" },
          { id: "bat", role: "storage", name: "Battery", topic: "van/battery" },
          { id: "dc", role: "source", name: "Booster", topic: "van/dc", reverseSign: true },
          { id: "rest", role: "rest", name: "Consumers" },
        ],
      },
    }
    const s = seriesFromControl(diagram)
    expect(s.map((x) => [x.name, x.source.kind, x.draw, x.stack, !!x.invert, x.color])).toEqual([
      ["Solar", "topic", "stacked", "ed", false, "energySun"],
      ["Fridge", "topic", "stacked", "ed", true, "energyLoad"],
      ["Battery", "topic", "stacked", "ed", true, "energyLoad"],
      ["Booster", "topic", "stacked", "ed", true, "energyLoad"],
      ["Consumers", "balance", "stacked", "ed", false, "energyLoad"],
    ])
  })

  // 2026-10-30, the user: scrolled through the days, an axis from each
  // window's own values made them look alike. A fixed axis, the diagram's.
  test("an energy diagram's history has a fixed axis: its full scale above zero and below", () => {
    const diagram = (fullScale?: number) => ({
      id: "ed",
      type: "energy-diagram",
      properties: { ...(fullScale ? { fullScale } : {}), nodes: [{ id: "sun", role: "source", name: "Solar", topic: "van/solar" }, { id: "fridge", role: "sink", name: "Fridge", topic: "van/fridge" }] },
    })
    expect(historyCharts([diagram(2500)], SERIES_COLOURS)[0].left).toEqual({ scale: "fixed", min: -2500, max: 2500, unit: "W" })
    // Without one, the diagram's own default.
    expect(historyCharts([diagram()], SERIES_COLOURS)[0].left).toEqual({ scale: "fixed", min: -1000, max: 1000, unit: "W" })
  })

  test("a page of two Bars and a Switch: one chart, the axis the bars' range, colours given where the control had none", () => {
    const charts = historyCharts([bar("van/fresh"), bar("van/grey", { fillColor: undefined }), { type: "switch", properties: { topic: "van/pump", states: [] } }], SERIES_COLOURS)
    expect(charts).toHaveLength(1)
    expect(charts[0]).toMatchObject({ mode: "time", scroll: true, left: { scale: "fixed", min: 0, max: 100 } })
    expect(charts[0].series.map((s) => [s.id, s.name, s.valueKind, s.color])).toEqual([
      ["s1", "fresh", "level", "accent"],
      ["s2", "grey", "level", SERIES_COLOURS[1]],
      ["s3", "pump", "state", SERIES_COLOURS[2]],
    ])
  })

  test("controls of one colour: each series its own, a control's own colour kept where it is still free", () => {
    const charts = historyCharts([bar("van/a"), bar("van/b"), bar("van/c", { fillColor: "energyLoad" }), bar("van/d")], SERIES_COLOURS)
    expect(charts[0].series.map((s) => s.color)).toEqual(["accent", SERIES_COLOURS[1], "energyLoad", SERIES_COLOURS[2]])
  })

  test("a second unit on the right axis; nothing to tell, no chart", () => {
    const withUnit = (topic: string) => ({ type: "text", properties: { liveValues: [{ id: "a", source: { namespace: "topic", path: topic }, rules: [] }] } })
    // Units come from what a control knows: only an energy diagram's are known (W).
    const diagram = { id: "ed", type: "energy-diagram", properties: { nodes: [{ id: "s", role: "source", name: "Solar", topic: "van/solar" }] } }
    const charts = historyCharts([withUnit("van/temp"), diagram], SERIES_COLOURS)
    expect(charts).toHaveLength(1)
    expect(charts[0].series.map((s) => s.axis ?? "left")).toEqual(["left", "right"])
    // The energy diagram's fixed axis on the right (its full scale, 1000 W by default).
    expect(charts[0].right).toMatchObject({ scale: "fixed", min: -1000, max: 1000, unit: "W" })
    expect(historyCharts([{ type: "button", properties: {} }, { type: "switch", properties: { writeTopic: "relay" } }], SERIES_COLOURS)).toEqual([])
    // Nested in a group, still found.
    expect(historyCharts([{ type: "group", children: [bar("van/x")] }], SERIES_COLOURS)).toHaveLength(1)
  })
})
