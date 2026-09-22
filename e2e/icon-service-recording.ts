import fs from "fs";
import path from "path";
import type { Page, Route } from "@playwright/test";

// Serves the icon services from recorded responses instead of the internet.
//
// Three outside calls sit behind the icon features: Iconify's search, the
// icons themselves (lib/icon-search.ts), and this app's own /api/translate
// route, which proxies Google Translate so a German screen name can be
// looked up in English (screens-panel.tsx).
//
// The icons arrive a collection at a time since 2026-09-22
// (`/{prefix}.json?icons=a,b,c`), and the app asks for a single icon's .svg
// only for the odd alias a batch cannot resolve. Both are served here, and
// both out of the SAME recordings - one .svg file per icon, which is what
// this directory has always held. A batch response is assembled from those
// files on the way out and taken apart again on the way in, so switching the
// app between the two endpoints needs nothing re-recorded.
//
// They made the suite depend on the weather. Iconify's public API is rate
// limited, and a day of repeated full runs earns a 429 on the SVG endpoint
// while search still answers 200 - so the picker finds an icon, fails to
// load it, and four specs time out on something that has nothing to do with
// the code (2026-09-11). Before that they simply failed whenever the network
// was slow, which is why one of them already carried a hand-raised 20s
// timeout and a comment about measuring the internet.
//
// What is still tested: that the app calls translate, uses its answer to
// search, renders the results, and keeps the one that was picked. What is no
// longer tested is the quality of Google's translation and Iconify's ranking,
// which were never this suite's to guarantee and which it could not have
// failed usefully anyway.
//
// Re-record with ICON_RECORD=1 when a spec starts asking for a term the
// recording has no answer for; the failure names the exact URL.

const DIR = path.join(__dirname, "fixtures", "icon-services");
const SEARCH_FILE = path.join(DIR, "search.json");
const TRANSLATE_FILE = path.join(DIR, "translate.json");
const SVG_DIR = path.join(DIR, "svg");

const recording = process.env.ICON_RECORD === "1";

// Stands in for an unrecorded preview thumbnail: a filled square, in
// currentColor so the picker's own tinting still applies to it.
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h16v16H4z"/></svg>';

type Recorded = Record<string, string>;

function readMap(file: string): Recorded {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeMap(file: string, map: Recorded): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Sorted, so re-recording one new term produces a one-line diff rather
  // than a reshuffled file.
  const sorted = Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((k) => [k, map[k]]),
  );
  fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + "\n");
}

// The query string a search URL asks for, which is the key everything is
// filed under. Lower-cased because the app sends whatever the user typed and
// two spellings of the same word are the same recording.
function searchKey(url: URL): string {
  return (url.searchParams.get("query") ?? "").trim().toLowerCase();
}

function translateKey(url: URL): string {
  return `${(url.searchParams.get("q") ?? "").trim().toLowerCase()}|${url.searchParams.get("target") ?? "en"}`;
}

function svgFile(url: URL): string {
  // "/material-symbols/home.svg" -> "material-symbols__home.svg"
  return path.join(
    SVG_DIR,
    url.pathname.replace(/^\//, "").replace(/\//g, "__"),
  );
}

function iconFile(prefix: string, name: string): string {
  return path.join(SVG_DIR, `${prefix}__${name}.svg`);
}

/** What is inside an <svg> element, which is what a collection response carries. */
function svgBody(svg: string): string {
  return svg.replace(/^[\s\S]*?<svg[^>]*>/i, "").replace(/<\/svg>[\s\S]*$/i, "");
}

/** An icon's own grid, off its viewBox; Iconify's default when it has none. */
function svgGrid(svg: string): { width: number; height: number } {
  const box = /viewBox="0 0 ([0-9.]+) ([0-9.]+)"/i.exec(svg);
  return box ? { width: Number(box[1]), height: Number(box[2]) } : { width: 16, height: 16 };
}

async function passThroughAndRecord(
  route: Route,
  save: (body: string) => void,
): Promise<void> {
  const response = await route.fetch();
  const body = await response.text();
  if (response.ok()) save(body);
  await route.fulfill({ response, body });
}

function missing(kind: string, key: string, url: string): never {
  throw new Error(
    `No recorded ${kind} for "${key}" (${url}).\n` +
      `Re-record with:  ICON_RECORD=1 npx playwright test <spec>\n` +
      `and commit e2e/fixtures/icon-services/.`,
  );
}

export async function replayIconServices(page: Page): Promise<void> {
  const search = readMap(SEARCH_FILE);
  const translate = readMap(TRANSLATE_FILE);

  await page.route("https://api.iconify.design/search*", async (route) => {
    const url = new URL(route.request().url());
    const key = searchKey(url);

    if (recording) {
      await passThroughAndRecord(route, (body) => {
        search[key] = body;
        writeMap(SEARCH_FILE, search);
      });
      return;
    }

    const body = search[key];
    if (body === undefined) missing("icon search", key, url.href);
    await route.fulfill({ status: 200, contentType: "application/json", body });
  });

  // A whole collection at once - what the app asks for now.
  await page.route("https://api.iconify.design/*.json*", async (route) => {
    const url = new URL(route.request().url());
    const prefix = url.pathname.replace(/^\//, "").replace(/\.json$/, "");
    const names = (url.searchParams.get("icons") ?? "").split(",").filter(Boolean);

    if (recording) {
      // Recorded as the individual icons it contains, so one directory of
      // .svg files keeps serving both endpoints.
      await passThroughAndRecord(route, (body) => {
        const data = JSON.parse(body) as {
          width?: number;
          height?: number;
          icons?: Record<string, { body: string; width?: number; height?: number }>;
        };
        fs.mkdirSync(SVG_DIR, { recursive: true });
        for (const [name, icon] of Object.entries(data.icons ?? {})) {
          const width = icon.width ?? data.width ?? 16;
          const height = icon.height ?? data.height ?? 16;
          fs.writeFileSync(
            iconFile(prefix, name),
            `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 ${width} ${height}">${icon.body}</svg>`,
          );
        }
      });
      return;
    }

    // Assembled from the recordings, with the same placeholder policy as a
    // single icon below: a thumbnail nobody asserts on must not fail a run.
    const icons: Record<string, { body: string; width: number; height: number }> = {};
    for (const name of names) {
      const file = iconFile(prefix, name);
      const svg = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : PLACEHOLDER_SVG;
      icons[name] = { body: svgBody(svg), ...svgGrid(svg) };
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ prefix, width: 16, height: 16, aliases: {}, icons }),
    });
  });

  await page.route("https://api.iconify.design/*/*.svg", async (route) => {
    const url = new URL(route.request().url());
    const file = svgFile(url);

    if (recording) {
      await passThroughAndRecord(route, (body) => {
        fs.mkdirSync(SVG_DIR, { recursive: true });
        fs.writeFileSync(file, body);
      });
      return;
    }

    // A missing SVG is served as a placeholder rather than raised, and the
    // difference matters more than it looks.
    //
    // The picker renders every search hit as its own <img>, so one search for
    // "star" pulls dozens of preview SVGs that no assertion ever looks at.
    // Throwing on those took a route handler's exception straight into the
    // test result and failed it for a thumbnail - while the icon the test
    // actually clicked was recorded and fine. A search or a translation is
    // the opposite: the test's logic is built on the answer, so a gap there
    // has to stop the run.
    //
    // The placeholder is a real, valid SVG. The one place a clicked icon's
    // own bytes are asserted on is page-icon-export, which compares the baked
    // PGM's dimensions rather than its content, so a stand-in cannot make a
    // green run lie about pixels.
    if (!fs.existsSync(file)) {
      console.warn(
        `[icon-recording] no recording for ${url.pathname} - serving a placeholder`,
      );
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: PLACEHOLDER_SVG,
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: fs.readFileSync(file, "utf8"),
    });
  });

  await page.route("**/api/translate*", async (route) => {
    const url = new URL(route.request().url());
    const key = translateKey(url);

    if (recording) {
      await passThroughAndRecord(route, (body) => {
        translate[key] = body;
        writeMap(TRANSLATE_FILE, translate);
      });
      return;
    }

    const body = translate[key];
    if (body === undefined) missing("translation", key, url.href);
    await route.fulfill({ status: 200, contentType: "application/json", body });
  });
}
