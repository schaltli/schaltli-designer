// Writes lib/screen-graph/vectors.json from the designer's own functions:
// the cases the firmware (src/project/ScreenGraph) and the app run too
// (device contract §2.10). Run after a change to lib/pull-tabs.ts or
// lib/screen-graph-device.ts, and look at the diff - e2e/screen-graph-
// vectors.spec.ts fails until the file says what the code does.
//
//   npx tsx scripts/screen-graph-vectors.ts

import fs from "node:fs"
import path from "node:path"
import { contentAreaOfStrip, pullTabColor, pullTabNudge, pullTabRect, PULL_TAB } from "../lib/pull-tabs"
import { rowStep, tabSidesOf, type DeviceGraphScreen } from "../lib/screen-graph-device"
import type { ScreenEdge } from "../lib/screen-graph"

const row = ["a", "b", "c"]
const rowStepCases = [
  { mainRow: row, current: "a", delta: 1 },
  { mainRow: row, current: "c", delta: 1 },
  { mainRow: row, current: "a", delta: -1 },
  { mainRow: row, current: "a1", page: "a", delta: 1 },
  { mainRow: row, current: "c1", page: "c", delta: -1 },
  { mainRow: row, current: "x", delta: 1 },
  { mainRow: ["a"], current: "a", delta: 1 },
  { mainRow: [], current: "a", delta: 1 },
].map((c) => ({ ...c, expect: rowStep(c.mainRow, c.current, c.page, c.delta as 1 | -1) ?? null }))

const screens: { name: string; mainRow: string[]; screen: DeviceGraphScreen }[] = [
  {
    name: "a page with the row on its right and a history below",
    mainRow: ["a", "b"],
    screen: {
      id: "a",
      neighbours: { right: "b", down: "a1" },
      buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-right": { type: "previous-screen" }, "swipe-up": { type: "goto-neighbour", side: "down" } },
    },
  },
  {
    name: "the history: back up",
    mainRow: ["a", "b"],
    screen: { id: "a1", back: "up", neighbours: { up: "a" }, buttonActions: { "swipe-down": { type: "goto-neighbour", side: "up" } } },
  },
  {
    name: "an own swipe up cuts the history off",
    mainRow: ["a", "b"],
    screen: {
      id: "a",
      neighbours: { right: "b", down: "a1" },
      buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-up": { type: "send-mqtt" } },
    },
  },
  {
    name: "the row's last page: next wraps, no tab on the right",
    mainRow: ["a", "b"],
    screen: { id: "b", neighbours: { left: "a" }, buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-right": { type: "previous-screen" } } },
  },
  {
    name: "go to a screen naming the neighbour leads there",
    mainRow: ["a", "b"],
    screen: { id: "a", neighbours: { right: "b", down: "a1" }, buttonActions: { "swipe-left": { type: "goto-screen", targetScreenId: "b" }, "swipe-up": { type: "goto-screen", targetScreenId: "z" } } },
  },
  {
    name: "next screen on a history leads to no neighbour of its own",
    mainRow: ["a", "b"],
    screen: { id: "a1", back: "up", neighbours: { up: "a" }, buttonActions: { "swipe-left": { type: "next-screen" }, "swipe-down": { type: "previous-screen" } } },
  },
  {
    name: "goto-neighbour the other way leads nowhere here",
    mainRow: ["a", "b"],
    screen: { id: "a", neighbours: { down: "a1" }, buttonActions: { "swipe-up": { type: "goto-neighbour", side: "up" } } },
  },
  {
    name: "no actions: no tabs",
    mainRow: ["a", "b"],
    screen: { id: "a", neighbours: { right: "b" } },
  },
]
const tabSides = screens.map((c) => ({ ...c, expect: tabSidesOf(c.screen, c.mainRow) }))

const contentAreaCases = [
  { width: 800, height: 480 },
  { width: 800, height: 480, edge: "left", thickness: 104 },
  { width: 800, height: 480, edge: "right", thickness: 80 },
  { width: 800, height: 480, edge: "top", thickness: 60 },
  { width: 540, height: 960, edge: "bottom", thickness: 72 },
].map((c) => ({ ...c, expect: contentAreaOfStrip(c.width, c.height, c.edge, c.thickness) }))

const edges: ScreenEdge[] = ["up", "down", "left", "right"]
const areas = [
  { x: 0, y: 0, width: 800, height: 480 },
  { x: 104, y: 0, width: 696, height: 480 },
  { x: 0, y: 0, width: 360, height: 360 },
  { x: 0, y: 60, width: 401, height: 419 },
]
const tabRect = areas.flatMap((area, i) =>
  edges.map((edge) => {
    const nudge = [0, 3, 6, 1][i]
    return { edge, area, nudge, expect: pullTabRect(edge, area, nudge) }
  }),
)

const nudge = [0, 50, 100, 200, 300, 400, 500, 700, 799, 800, 2500, 4999, 5000, 5400, 10200].map((ms) => ({ ms, expect: pullTabNudge(ms) }))

const tabColor = [
  { muted: "#49454f", background: "#ffffff", colorDepth: "24bit" },
  { muted: "#cac4d0", background: "#1c1b1f", colorDepth: "24bit" },
  { muted: "#5f6368", background: "#f8f9fa", colorDepth: "24bit" },
  { muted: "#49454f", background: "#ffffff", colorDepth: "4bit" },
  { muted: "#888888", background: "#000000", colorDepth: "4bit" },
].map((c) => ({ ...c, expect: pullTabColor(c.muted, c.background, c.colorDepth) }))

const vectors = {
  about:
    "The screen graph as a device sees it (device contract §2.10): next/previous over mainRow, the edges with a pull tab, the content area, the tab's box, the nudge, the tab's colour. Written by scripts/screen-graph-vectors.ts from lib/screen-graph-device.ts and lib/pull-tabs.ts; copy it, do not edit a copy.",
  pullTab: PULL_TAB,
  rowStep: rowStepCases,
  tabSides,
  contentArea: contentAreaCases,
  tabRect,
  nudge,
  tabColor,
}
const out = path.join(__dirname, "..", "lib", "screen-graph", "vectors.json")
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(vectors, null, 2) + "\n")
console.log(`wrote ${out}`)
