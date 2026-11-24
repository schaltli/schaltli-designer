import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { readFile, writeFile } from "node:fs/promises"
import { COMBINED_TEST_PROJECT, loadProject } from "./helpers"
import { faceMemory, formatBytes } from "../lib/instrument-export"

// What styled faces cost a board, said before deploying
// (tasks/instrument-styles-todo.md I17; decision 2: a style may exceed a
// device's limits). A face is its RGB565 pixels and a mask bit each; a board
// keeps every face it has shown, identical ones once.

const gauge = (id: string, side: number, style = "fuel") => ({
  id,
  type: "gauge",
  zIndex: 1,
  x: 10,
  y: 10,
  width: side,
  height: side,
  properties: { topic: "t/v", calibrationPoints: [{ value: 0, barSizePercent: 0 }, { value: 100, barSizePercent: 100 }], style },
})

test("a face's bytes, per screen and once for the whole project", () => {
  const m = faceMemory({
    screens: [
      { name: "A", objects: [gauge("g1", 300), { ...gauge("b1", 0), type: "bar", width: 300, height: 100 }] },
      // The same gauge again on another screen: held once.
      { name: "B", objects: [gauge("g2", 300)] },
      { name: "C", objects: [{ ...gauge("flat", 200), properties: { topic: "t/v" } }] },
    ],
  })
  expect(m.screens).toEqual([
    { name: "A", bytes: 300 * 300 * 2 + 11250 + 300 * 100 * 2 + 3750 },
    { name: "B", bytes: 300 * 300 * 2 + 11250 },
  ])
  expect(m.total).toBe(300 * 300 * 2 + 11250 + 300 * 100 * 2 + 3750)
  expect(formatBytes(m.total)).toBe("249 KB")
  expect(formatBytes(3 * 1024 * 1024 + 200 * 1024)).toBe("3.2 MB")
})

test("the Deploy dialog says what the styled faces hold", async ({ page }, testInfo) => {
  const zip = await JSZip.loadAsync(await readFile(COMBINED_TEST_PROJECT))
  const project = JSON.parse(await zip.file("project.json")!.async("string"))
  project.screens[0].objects.push(gauge("e2e-styled", 240, "rally"))
  zip.file("project.json", JSON.stringify(project, null, 2))
  const file = testInfo.outputPath("styled.zip")
  await writeFile(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
  await loadProject(page, file)
  await page.getByRole("button", { name: "File" }).click()
  await page.getByRole("menuitem", { name: "Deploy to Device" }).click()
  await expect(page.getByTestId("instrument-memory")).toContainText(
    `Styled gauges and bars hold ${formatBytes(240 * 240 * 2 + 7200)} of the device's memory (${project.screens[0].name} ${formatBytes(240 * 240 * 2 + 7200)})`,
  )
})
