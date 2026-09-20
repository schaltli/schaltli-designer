import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import { fontLabel } from "../components/property-panel/font-select"

// One font picker for every object (components/property-panel/font-select.tsx).
// Until 2026-09-19 there were five, and the user noticed: "die schriftauswahl
// ... ist nicht überall gleich" - three shadcn Selects labelling fonts three
// ways, and a native <select> with a "System Default" entry and a separate
// link in the Button and Switch panels.
//
// The first test reads the panels' source rather than clicking through six
// object types: what has to stay true is that no panel grows its own picker
// again, and that is a property of the code. The pickers themselves are driven
// through the UI by switch-render, software-button-render and bausteine.

const PANELS = path.join(__dirname, "..", "components", "property-panel")

test("every panel that sets a font uses the shared picker, and none has its own", () => {
  const panels = fs
    .readdirSync(PANELS)
    // property-panel.tsx only hands the callback down.
    .filter((f) => f.endsWith(".tsx") && f !== "font-select.tsx" && f !== "property-panel.tsx")
    .map((f) => ({ file: f, source: fs.readFileSync(path.join(PANELS, f), "utf8") }))
    // A panel that offers a font is one that is handed "Manage Fonts".
    .filter(({ source }) => /onManageFonts/.test(source))

  expect(panels.map((p) => p.file).sort()).toEqual([
    "arc-level-properties.tsx",
    "label-properties.tsx",
    "level-indicator-properties.tsx",
    "mqtt-data-field-properties.tsx",
    "software-button-properties.tsx",
    "switch-properties.tsx",
  ])
  for (const { file, source } of panels) {
    expect(source.match(/<FontSelect\b/g)?.length, `${file} uses the shared picker once`).toBe(1)
    expect(source, `${file} lists fonts itself`).not.toMatch(/key=\{font\.id\}/)
    expect(source, `${file} has its own "System Default"`).not.toContain("System Default")
  }
})

test("a font is shown by its display name and nothing else", () => {
  const font = { id: "font-helvR08", name: "u8g2_font_helvR08_tf", displayName: "Helvetica 8px", path: "", size: 12 }
  // Not "Helvetica 8px — 12px": `size` is the line height, not the 8 in the name.
  expect(fontLabel(font)).toBe("Helvetica 8px")
  expect(fontLabel({ ...font, displayName: "" })).toBe("u8g2_font_helvR08_tf")
})
