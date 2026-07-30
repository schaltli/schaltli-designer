// Shared HTML report builder for hardware-in-the-loop (HIL) test runs -
// used identically by hil/epaper/orchestrator.js and
// hil/android/orchestrator.js, so both render targets get the exact same
// report look (dark theme, collapsible per-case sections, expected/actual/
// blink-compare columns) instead of two copies that could drift apart.
// Originally built 2026-07-20 for the e-paper firmware pixel-parity work
// (see memory: project-pixel-perfect-mismatch) - that work took two test
// labels from 15177/18008 differing pixels down to 0/0 using exactly this
// report format to see *where* pixels differed, not just how many.

const fs = require("fs");
const path = require("path");

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// results: array of {
//   screenIndex, screenName, comboIndex, overrides: Record<topic,value>,
//   pass, diffPixels, totalPixels, dimensionMismatch,
//   expectedFile, actualFile (paths relative to outDir, e.g. "images/expected-0-0.png"),
//   expectedDims: "WxH", actualDims: "WxH",
// }
function buildReport(results, outDir, { title = "Hardware-in-the-loop Test Report", subtitle = "" } = {}) {
  const passCount = results.filter((r) => r.pass).length;
  const byScreen = new Map();
  for (const r of results) {
    if (!byScreen.has(r.screenIndex)) byScreen.set(r.screenIndex, { name: r.screenName, cases: [] });
    byScreen.get(r.screenIndex).cases.push(r);
  }

  const groups = [];
  for (const [, group] of byScreen) {
    const cases = group.cases.map((r) => {
      if (r.skipped) {
        return `
      <details class="case skip">
        <summary>
          <span class="chevron">&#9656;</span>
          <span class="status-icon skip" title="SKIPPED">&#8213;</span>
          <span class="case-title">${esc(group.name)}</span>
          <span class="combo">not run</span>
        </summary>
        <div class="skip-note">${esc(r.skipReason || "Skipped.")}</div>
      </details>`;
      }

      const overridesStr = Object.entries(r.overrides || {}).map(([k, v]) => `${esc(k)} = ${esc(v)}`).join(", ") || "(no MQTT values)";
      const [w, h] = r.actualDims.split("x").map(Number);
      const icon = r.pass
        ? `<span class="status-icon pass" title="PASS">&#10003;</span>`
        : `<span class="status-icon fail" title="FAIL">&#10007;</span>`;
      const diffNote = r.pass
        ? ""
        : r.dimensionMismatch
          ? " &middot; size mismatch"
          : ` &middot; ${r.diffPixels}/${r.totalPixels}px differ`;

      return `
      <details class="case ${r.pass ? "pass" : "fail"}"${r.pass ? "" : " open"}>
        <summary>
          <span class="chevron">&#9656;</span>
          ${icon}
          <span class="case-title">${esc(group.name)}</span>
          <span class="combo">${overridesStr}${diffNote}</span>
        </summary>
        <div class="images-row">
          <div class="col-expected">
            <div class="col-label">Expected (designer)</div>
            <img src="${r.expectedFile}" alt="expected" width="${w}" height="${h}" />
          </div>
          <div class="col-actual">
            <div class="col-label">Actual (device)</div>
            <img src="${r.actualFile}" alt="actual" width="${w}" height="${h}" />
          </div>
          <div class="col-blink">
            <div class="col-label">Blink compare</div>
            <div class="blink" style="width:${w}px;height:${h}px">
              <img class="blink-a" src="${r.expectedFile}" alt="blink expected" width="${w}" height="${h}" />
              <img class="blink-b" src="${r.actualFile}" alt="blink actual" width="${w}" height="${h}" />
            </div>
          </div>
        </div>
      </details>`;
    });
    groups.push(`<section class="screen-group"><h2>${esc(group.name)}</h2>${cases.join("\n")}</section>`);
  }

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; background: #14181a; color: #e9edec; margin: 0; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .summary { color: #9aa6a3; font-family: ui-monospace, monospace; font-size: 13px; margin-bottom: 24px; }
  .screen-group { margin-bottom: 8px; }
  .screen-group h2 { font-size: 15px; font-weight: 700; margin: 24px 0 8px; padding-top: 12px; border-top: 2px solid #3c4548; }
  .screen-group:first-of-type h2 { border-top: none; padding-top: 0; }

  details.case { border: 1px solid #2a3134; border-radius: 6px; margin-bottom: 6px; background: #1a1f21; overflow: hidden; }
  details.case[open] { background: #1e2528; }
  details.case > summary { list-style: none; cursor: pointer; padding: 9px 12px; display: flex; align-items: center; gap: 8px; font-family: ui-monospace, monospace; font-size: 12.5px; user-select: none; }
  details.case > summary::-webkit-details-marker { display: none; }
  details.case > summary::marker { content: ""; }

  .chevron { display: inline-block; color: #6b7578; font-size: 11px; transition: transform 0.15s ease; transform: rotate(0deg); flex-shrink: 0; }
  details.case[open] .chevron { transform: rotate(90deg); }

  .status-icon { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .status-icon.pass { background: #1c2f26; color: #6fbf94; }
  .status-icon.fail { background: #3a2417; color: #e0703f; }
  .status-icon.skip { background: #2a2d2e; color: #7a8285; }
  details.case.skip { opacity: 0.7; }
  .skip-note { padding: 4px 12px 14px; font-family: ui-monospace, monospace; font-size: 12px; color: #9aa6a3; }

  .case-title { font-weight: 600; color: #e9edec; }
  .combo { color: #9aa6a3; }
  details.case.fail .combo { color: #d9a67f; }

  .images-row { display: flex; gap: 16px; padding: 4px 12px 18px; flex-wrap: wrap; }
  .images-row > div { flex: 0 0 auto; }
  .col-label { font-family: ui-monospace, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9aa6a3; margin-bottom: 6px; }
  img { image-rendering: pixelated; background: #fff; border: 1px solid #3c4548; display: block; }
  .blink { position: relative; border: 1px solid #3c4548; }
  .blink img { border: none; position: absolute; top: 0; left: 0; }
  .blink-a { animation: blink-a 1s steps(1) infinite; }
  .blink-b { animation: blink-b 1s steps(1) infinite; position: relative; }
  @keyframes blink-a { 0%, 49.9% { opacity: 1; } 50%, 100% { opacity: 0; } }
  @keyframes blink-b { 0%, 49.9% { opacity: 0; } 50%, 100% { opacity: 1; } }
</style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <div class="summary">${passCount}/${results.length} cases passed &middot; generated ${new Date().toISOString()}${subtitle ? " &middot; " + esc(subtitle) : ""} &middot; images at 100% (native pixel size)</div>
  ${groups.join("\n")}
</body>
</html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "index.html");
  fs.writeFileSync(outPath, html);
  return outPath;
}

// Strict (any differing pixel counts) RGB comparison between two same-sized
// Jimp images. Ignores alpha - both render paths always produce opaque
// output, and some device snapshot formats (BMP) have no alpha channel at
// all, which would otherwise register as a spurious full-image mismatch.
function comparePixels(imgA, imgB) {
  if (imgA.bitmap.width !== imgB.bitmap.width || imgA.bitmap.height !== imgB.bitmap.height) {
    return { dimensionMismatch: true, diffPixels: 0, totalPixels: 0 };
  }
  const a = imgA.bitmap.data;
  const b = imgB.bitmap.data;
  let diffPixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) diffPixels++;
  }
  return { dimensionMismatch: false, diffPixels, totalPixels: imgA.bitmap.width * imgA.bitmap.height };
}

// Tolerance variant for render targets whose "actual" image can't be
// captured at the reference's exact native pixel grid (e.g. Android: a
// phone's own screen density means its screenshot has to be cropped and
// resized down to match the designer reference, and that resampling alone
// introduces a few points of per-channel noise even for a perfect visual
// match). Counts a pixel as differing only if any RGB channel differs by
// more than `channelTolerance`. Not meaningful for the e-paper target,
// which captures at the device's exact native resolution already and
// should use the strict comparePixels above instead.
function comparePixelsWithTolerance(imgA, imgB, channelTolerance = 24) {
  if (imgA.bitmap.width !== imgB.bitmap.width || imgA.bitmap.height !== imgB.bitmap.height) {
    return { dimensionMismatch: true, diffPixels: 0, totalPixels: 0 };
  }
  const a = imgA.bitmap.data;
  const b = imgB.bitmap.data;
  let diffPixels = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (
      Math.abs(a[i] - b[i]) > channelTolerance ||
      Math.abs(a[i + 1] - b[i + 1]) > channelTolerance ||
      Math.abs(a[i + 2] - b[i + 2]) > channelTolerance
    ) {
      diffPixels++;
    }
  }
  return { dimensionMismatch: false, diffPixels, totalPixels: imgA.bitmap.width * imgA.bitmap.height };
}

module.exports = { buildReport, comparePixels, comparePixelsWithTolerance, esc };
