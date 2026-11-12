import { test, expect } from "@playwright/test"
import { readCatalog } from "../lib/ha-discovery"
import { namesByTopic } from "../lib/series-names"
import { newSeries } from "../components/property-panel/chart-series-section"
import { defaultChart } from "../lib/chart"
const { createBridgeLogic } = require("../integrations/vanpi/bridge-logic")

// A series is named from discovery (docs/2026-11-11-chart-tweaks.md,
// decision 2): «Innen», not «value»; a topic nothing announces keeps its
// last segment.

function bridgeCatalog() {
  const logic = createBridgeLogic()
  const messages: Record<string, string> = {}
  const answers: Record<string, string> = {
    batt: '{"AMPS":"-0.75","SoC":"88","Voltage":"13.2"}',
    temp: '{"temp1":{"state":"15.1","name":"Innen","type":"ds18b20"}}',
  }
  for (const [kind, answer] of Object.entries(answers)) {
    for (const [topic, config] of Object.entries(logic.things(kind, answer) as Record<string, object>)) messages[topic] = JSON.stringify(config)
  }
  return readCatalog(messages)
}

test("a series reading an announced topic takes the name discovery gives it", () => {
  const catalog = bridgeCatalog()
  const names = namesByTopic(catalog.entries)
  const inner = catalog.entries.find((e) => e.label === "Innen")!
  const read = (inner.controls[0] as { read: string }).read
  expect(names[read]).toBe("Innen")
  const topics = [{ id: "t", topic: read, type: "numeric" as const, examples: ["15.1"] }]
  expect(newSeries(read, defaultChart(), topics, names).name).toBe("Innen")
  // Not announced: the topic's last segment, as before.
  expect(newSeries("van/solar/power", defaultChart(), [], names).name).toBe("power")
})
