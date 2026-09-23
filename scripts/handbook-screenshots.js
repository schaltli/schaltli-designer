#!/usr/bin/env node
// Photographs the designer for the handbook: runs e2e/handbook-screenshots.spec.ts
// with HANDBOOK_SHOTS_DIR pointing at handbuch/public/bilder/, where the handbook
// looks for them. Nothing there is committed - the Pages workflow runs this for
// every publish, so the pictures always show the designer as it is.
//
// Needs what the spec needs: the dev server (Playwright starts it, or reuses a
// running one) and the local broker (npm run hil:broker).
//
//   npm run screenshots

const { spawnSync } = require("child_process")
const path = require("path")

const result = spawnSync("npx", ["playwright", "test", "e2e/handbook-screenshots.spec.ts", "--reporter=line"], {
  cwd: path.join(__dirname, ".."),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, HANDBOOK_SHOTS_DIR: "handbuch/public/bilder" },
})
process.exit(result.status ?? 1)
