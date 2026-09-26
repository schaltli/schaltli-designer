// Records what the designer's reader rule for the dark variant makes of a
// device export (lib/themes.ts darkVariantOf, docs/device-contract.md §2.3):
// every XDark in place of its X, a lone XDark as X, an empty or missing one
// meaning X. The app (data/ThemeVariant.kt) and the firmware
// (src/project/ThemeVariant.h, checked by tools/theme-variant) implement the
// same rule a second and a third time, and each holds itself to this file -
// docs/2026-09-26-device-switch.md.
//
// Every case is a branch a port could miss:
//
//   - colours inside properties, the screen background, top-level paths:
//     the three places XDark appears.
//   - a switch's states and a live icon's pairs: XDark inside arrays of
//     objects, one level down.
//   - a tab-control's children: the same, recursively.
//   - "transparent" with no XDark beside it: left as it is.
//   - a lone XDark (X missing): taken as X.
//   - an empty XDark: "use X" - the firmware stores absent and empty strings
//     alike, so all three readers treat them alike.
//   - a key named just "Dark": an ordinary key, not a dark twin of "".
//
// Run with the designer's dev server up (DESIGNER_URL, default port 3000):
//   node hil/android/fixtures/build-theme-variant-golden.js

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DESIGNER_URL = process.env.DESIGNER_URL || "http://localhost:3000";
const OUT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "schaltli-android",
  "app",
  "src",
  "test",
  "resources",
  "theme-variant-golden.json",
);

const CASES = [
  {
    name: "screen background and colours in properties",
    input: {
      id: "s1",
      backgroundColor: "#f4f6f8",
      backgroundColorDark: "#15202b",
      objects: [
        {
          id: "label",
          type: "text",
          properties: { text: "Stube", color: "#1e2a36", colorDark: "#e6edf3", backgroundColor: "transparent" },
        },
      ],
    },
  },
  {
    name: "top-level paths of an icon and a button",
    input: {
      objects: [
        { id: "icon", type: "icon", path: "assets/s1_icon.bmp", pathDark: "assets/s1_icon-dark.bmp", properties: {} },
        {
          id: "btn",
          type: "button",
          pathNormal: "assets/b.bmp",
          pathNormalDark: "assets/b-dark.bmp",
          pathActive: "assets/b-a.bmp",
          pathActiveDark: "assets/b-a-dark.bmp",
          properties: {},
        },
      ],
    },
  },
  {
    name: "switch states and live-icon pairs",
    input: {
      properties: {
        switchColor: "#2f6f9f",
        switchColorDark: "#6aa8d8",
        states: [
          { id: "off", path: "assets/off.bmp" },
          { id: "on", path: "assets/on.bmp", pathDark: "assets/on-dark.bmp", pathActive: "assets/on-a.bmp", pathActiveDark: "assets/on-a-dark.bmp" },
        ],
        valueIconPairs: [{ id: "p", path: "assets/p.bmp", pathDark: "assets/p-dark.bmp" }],
      },
    },
  },
  {
    name: "children of a tab-control",
    input: {
      type: "switcher",
      children: [
        { type: "panel", children: [{ type: "box", properties: { fillColor: "#e5e5e5", fillColorDark: "#2b2b2b" } }] },
      ],
    },
  },
  {
    name: "a lone XDark",
    input: { properties: { fillColorDark: "#2b2b2b" }, pathDark: "assets/only-dark.bmp" },
  },
  {
    name: "an empty XDark",
    input: { properties: { color: "#000000", colorDark: "" } },
  },
  {
    name: "a key named Dark",
    input: { Dark: 1, properties: { Dark: "x" } },
  },
  {
    name: "nothing dark at all",
    input: { backgroundColor: "#ffffff", objects: [{ properties: { color: "#000000" } }] },
  },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${DESIGNER_URL}/test-render`);
  await page.waitForFunction(() => window.__testRenderReady === true, undefined, { timeout: 120000 });

  const golden = [];
  for (const c of CASES) {
    const output = await page.evaluate((input) => window.__darkVariantOfForTest(input), c.input);
    golden.push({ name: c.name, input: c.input, output });
    console.log(`${c.name}: ${JSON.stringify(output)}`);
  }
  await browser.close();

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(golden, null, 2));
  console.log(`\nwrote ${OUT_PATH} (${CASES.length} case(s))`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
